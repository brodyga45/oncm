// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PaymentSplitter} from "@openzeppelin/contracts-v4/finance/PaymentSplitter.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

interface IProofVerifier {
    function verify(bytes32 statementId, bytes32 goalHash, bytes32 profileId, uint8 outcome, bytes calldata certificate) external view returns (bool);
    function verifyGoal(bytes32 goalHash,bytes32 profileId,bytes calldata certificate) external view returns(bool);
}
interface ICTF {
    function prepareCondition(address oracle, bytes32 questionId, uint256 slots) external;
    function getConditionId(address oracle, bytes32 questionId, uint256 slots) external pure returns(bytes32);
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;
    function getCollectionId(bytes32 parent, bytes32 condition, uint256 indexSet) external view returns(bytes32);
    function getPositionId(address collateral, bytes32 collection) external pure returns(uint256);
}
interface IFPMMFactory {
    function create(address ctf, address token, bytes32 condition, uint256 fee) external returns(address);
}
interface IStatementOperator {
    function evaluate(uint8 dependencyOutcome,uint64 resolvedAt,uint64 observedAt,bytes calldata parameters) external view returns(uint8);
}

/// Example extension: the dependency resolves strictly after a supplied timestamp.
/// A version is activated by Safe + Timelock, never by deployment alone.
contract ResolvedAfterOperator is IStatementOperator {
    function evaluate(uint8 outcome,uint64 resolvedAt,uint64,bytes calldata parameters) external pure returns(uint8){
        uint64 deadline=abi.decode(parameters,(uint64));if(outcome==0)return 0;return resolvedAt>deadline?1:2;
    }
}

contract TrueToken is ERC20 {
    constructor(address[] memory accounts) ERC20("True Agora", "T") {
        for (uint i; i < accounts.length; ++i) _mint(accounts[i], 100_000 ether);
    }
}

// Placeholder is explicitly fail-closed until coordinator supplies a real zk verifier.
// It cannot resolve any market, including via an administrator.
contract UnavailableProofVerifier is IProofVerifier {
    function verify(bytes32,bytes32,bytes32,uint8,bytes calldata) external pure returns(bool) { return false; }
    function verifyGoal(bytes32,bytes32,bytes calldata) external pure returns(bool) { return false; }
}

/// Each immutable OpenZeppelin splitter is one fee epoch. No upgrade/owner bypass.
contract AllocationController is ReentrancyGuard {
    uint256 public constant DENOMINATOR = 1_000_000;
    uint256 public constant MAX_RECIPIENTS = 32;
    struct Proposal { uint256 baseVersion; uint256 expiresAt; address proposer; bool executed; address[] payees; uint256[] shares; }
    uint256 public currentEpoch;
    address[] public splits;
    address[] private currentPayees;
    mapping(address => uint256) public currentShare;
    Proposal[] private proposals;
    mapping(uint256 => mapping(address => bool)) public approved;
    event AllocationProposed(uint256 indexed proposalId,uint256 indexed baseVersion,address indexed proposer,address[] payees,uint256[] shares,uint256 expiresAt);
    event AllocationApproval(uint256 indexed proposalId,address indexed beneficiary,bool approved);
    event AllocationApplied(uint256 indexed epoch,address indexed split,address[] payees,uint256[] shares);
    constructor(address[] memory payees,uint256[] memory shares) { _validate(payees,shares); _activate(payees,shares); }
    function currentSplit() external view returns(address) { return splits[currentEpoch]; }
    function recipients() external view returns(address[] memory payees,uint256[] memory shares) {
        payees=currentPayees; shares=new uint256[](payees.length);
        for(uint i;i<payees.length;++i) shares[i]=currentShare[payees[i]];
    }
    function proposalCount() external view returns(uint256){return proposals.length;}
    function proposal(uint256 id) external view returns(Proposal memory){return proposals[id];}
    function propose(uint256 baseVersion,address[] calldata payees,uint256[] calldata shares,uint256 expiresAt) external returns(uint256 id) {
        require(baseVersion==currentEpoch,"stale allocation"); require(expiresAt>block.timestamp,"expiry elapsed"); _validate(payees,shares);
        id=proposals.length; proposals.push(); Proposal storage p=proposals[id]; p.baseVersion=baseVersion;p.expiresAt=expiresAt;p.proposer=msg.sender;p.payees=payees;p.shares=shares;
        emit AllocationProposed(id,baseVersion,msg.sender,payees,shares,expiresAt);
    }
    function setApproval(uint256 id,bool value) external {
        Proposal storage p=proposals[id]; require(!p.executed&&p.baseVersion==currentEpoch&&block.timestamp<=p.expiresAt,"inactive proposal");
        require(_newShare(p,msg.sender)<currentShare[msg.sender],"not decreasing"); approved[id][msg.sender]=value; emit AllocationApproval(id,msg.sender,value);
    }
    function execute(uint256 id) external nonReentrant {
        Proposal storage p=proposals[id];require(!p.executed&&p.baseVersion==currentEpoch&&block.timestamp<=p.expiresAt,"inactive proposal");
        for(uint i;i<currentPayees.length;++i){address a=currentPayees[i];if(_newShare(p,a)<currentShare[a]) require(approved[id][a],"missing consent");}
        p.executed=true; ++currentEpoch; _activate(p.payees,p.shares);
    }
    function _newShare(Proposal storage p,address a) internal view returns(uint256){for(uint i;i<p.payees.length;++i) if(p.payees[i]==a)return p.shares[i];return 0;}
    function _validate(address[] memory payees,uint256[] memory shares) internal pure {
        require(payees.length>0&&payees.length<=MAX_RECIPIENTS&&payees.length==shares.length,"invalid allocation");uint sum;
        for(uint i;i<payees.length;++i){require(payees[i]!=address(0)&&shares[i]>0,"invalid recipient");if(i>0)require(payees[i]>payees[i-1],"sort unique addresses");sum+=shares[i];}
        require(sum==DENOMINATOR,"shares must total 100%");
    }
    function _activate(address[] memory payees,uint256[] memory shares) internal {
        for(uint i;i<currentPayees.length;++i)delete currentShare[currentPayees[i]];
        currentPayees=payees;for(uint i;i<payees.length;++i)currentShare[payees[i]]=shares[i];
        address split=address(new PaymentSplitter(payees,shares));splits.push(split);emit AllocationApplied(currentEpoch,split,payees,shares);
    }
}

contract AgoraRegistry is Ownable, ReentrancyGuard {
    struct Profile { address verifier; bytes32 manifestHash; bool enabled; }
    struct Operator { address evaluator; bytes32 manifestHash; }
    struct CustomStatement { bytes32 operatorId; bytes parameters; }
    struct Statement {
        bytes32 id; bytes32 goalHash; bytes32 profileId; bytes32 conditionId;
        bytes32 dependency; uint64 deadline; uint64 resolvedAt; uint8 kind; uint8 expectedOutcome; uint8 outcome;
        address creator; string metadataURI;
    }
    ICTF public immutable ctf; address public immutable token; IFPMMFactory public immutable factory;
    mapping(bytes32=>Profile) public profiles;
    mapping(bytes32=>Operator) public operators;
    bytes32[] public operatorIds;
    mapping(bytes32=>CustomStatement) public customStatements;
    mapping(bytes32=>Statement) public statements;
    bytes32[] public statementIds;
    mapping(bytes32=>address[]) private pools;
    event ProfileConfigured(bytes32 indexed profileId,address verifier,bytes32 manifestHash,bool enabled);
    event OperatorConfigured(bytes32 indexed operatorId,address evaluator,bytes32 manifestHash);
    event StatementRegistered(bytes32 indexed statementId,bytes32 indexed conditionId,address indexed creator,uint8 kind,string metadataURI);
    event MarketCreated(bytes32 indexed statementId,address indexed pool,address indexed creator,uint256 fee);
    event StatementResolved(bytes32 indexed statementId,uint8 outcome,uint64 resolvedAt,bytes32 evidenceHash);
    constructor(address ctf_,address token_,address factory_,address governance,bytes32 initialProfile,address verifier,bytes32 initialManifest) Ownable(governance){
        ctf=ICTF(ctf_);token=token_;factory=IFPMMFactory(factory_);
        profiles[initialProfile]=Profile(verifier,initialManifest,true);
        emit ProfileConfigured(initialProfile,verifier,profiles[initialProfile].manifestHash,true);
    }
    function configureProfile(bytes32 id,address verifier,bytes32 manifestHash) external onlyOwner {
        require(id!=bytes32(0)&&verifier.code.length>0&&profiles[id].verifier==address(0),"new profile required");
        profiles[id]=Profile(verifier,manifestHash,true);emit ProfileConfigured(id,verifier,manifestHash,true);
    }
    function setProfileEnabled(bytes32 id,bool enabled) external onlyOwner{require(profiles[id].verifier!=address(0),"unknown profile");profiles[id].enabled=enabled;emit ProfileConfigured(id,profiles[id].verifier,profiles[id].manifestHash,enabled);}
    function configureOperator(bytes32 id,address evaluator,bytes32 manifestHash) external onlyOwner {
        require(id!=bytes32(0)&&evaluator.code.length>0&&operators[id].evaluator==address(0),"new operator required");
        operators[id]=Operator(evaluator,manifestHash);operatorIds.push(id);emit OperatorConfigured(id,evaluator,manifestHash);
    }
    function operatorCount() external view returns(uint256){return operatorIds.length;}
    function registerCustom(bytes32 operatorId,bytes32 dependency,bytes calldata parameters,string calldata metadataURI) external returns(bytes32 id){
        require(operators[operatorId].evaluator!=address(0)&&statements[dependency].creator!=address(0)&&parameters.length<=4096,"invalid operator statement");
        id=keccak256(abi.encode("AGORA_OPERATOR_V1",operatorId,dependency,parameters));require(statements[id].creator==address(0),"already registered");
        customStatements[id]=CustomStatement(operatorId,parameters);Statement memory s;s.id=id;s.kind=4;s.dependency=dependency;s.creator=msg.sender;s.metadataURI=metadataURI;_register(s);
    }
    function count() external view returns(uint256){return statementIds.length;}
    function getStatement(bytes32 id) external view returns(Statement memory){require(statements[id].creator!=address(0),"unknown statement");return statements[id];}
    function getPools(bytes32 id) external view returns(address[] memory){return pools[id];}
    function register(bytes32 goalHash,bytes32 profileId,string calldata metadataURI,bytes calldata registrationCertificate) external returns(bytes32 id){
        require(goalHash!=bytes32(0)&&profiles[profileId].enabled,"unsupported profile");
        require(IProofVerifier(profiles[profileId].verifier).verifyGoal(goalHash,profileId,registrationCertificate),"invalid registration certificate");
        id=keccak256(abi.encode("AGORA_GOAL_V1",goalHash,profileId));
        require(statements[id].creator==address(0),"already registered");
        Statement memory s; s.id=id;s.goalHash=goalHash;s.profileId=profileId;s.creator=msg.sender;s.metadataURI=metadataURI;_register(s);
    }
    function registerDerived(uint8 kind,bytes32 dependency,uint8 expected,uint64 deadline,string calldata metadataURI) external returns(bytes32 id){
        require(kind>=1&&kind<=3&&statements[dependency].creator!=address(0),"invalid derived");
        require(kind==1||(expected==1||expected==2),"invalid outcome");require(kind==2||deadline>0,"deadline required");
        if(kind==1)expected=0;if(kind==2)deadline=0;
        id=keccak256(abi.encode("AGORA_DERIVED_V1",kind,dependency,expected,deadline)); require(statements[id].creator==address(0),"already registered");
        Statement memory s;s.id=id;s.kind=kind;s.dependency=dependency;s.expectedOutcome=expected;s.deadline=deadline;s.creator=msg.sender;s.metadataURI=metadataURI;_register(s);
    }
    function _register(Statement memory s) internal {ctf.prepareCondition(address(this),s.id,2);s.conditionId=ctf.getConditionId(address(this),s.id,2);statements[s.id]=s;statementIds.push(s.id);emit StatementRegistered(s.id,s.conditionId,s.creator,s.kind,s.metadataURI);}
    function createPool(bytes32 id,uint256 fee) external returns(address pool){require(statements[id].creator!=address(0)&&statements[id].outcome==0,"inactive statement");require(fee<=0.1 ether,"fee too high");pool=factory.create(address(ctf),token,statements[id].conditionId,fee);pools[id].push(pool);emit MarketCreated(id,pool,msg.sender,fee);}
    function positionIds(bytes32 id) external view returns(uint256 yes,uint256 no){bytes32 condition=statements[id].conditionId;yes=ctf.getPositionId(token,ctf.getCollectionId(bytes32(0),condition,1));no=ctf.getPositionId(token,ctf.getCollectionId(bytes32(0),condition,2));}
    function submitProof(bytes32 id,uint8 outcome,bytes calldata certificate) external nonReentrant {
        Statement storage s=statements[id];require(s.creator!=address(0)&&s.kind==0&&s.outcome==0,"inactive goal");require(outcome==1||outcome==2,"invalid outcome");
        require(IProofVerifier(profiles[s.profileId].verifier).verify(id,s.goalHash,s.profileId,outcome,certificate),"invalid certificate");_resolve(s,outcome,keccak256(certificate));
    }
    function derivedOutcome(bytes32 id) public view returns(uint8){
        Statement storage s=statements[id];require(s.kind>0,"not derived");Statement storage d=statements[s.dependency];
        if(s.kind==4){CustomStatement storage c=customStatements[id];uint8 result=IStatementOperator(operators[c.operatorId].evaluator).evaluate(d.outcome,d.resolvedAt,uint64(block.timestamp),c.parameters);require(result<=2,"invalid operator result");return result;}
        if(s.kind==1){if(d.outcome!=0)return d.resolvedAt<=s.deadline?1:2;return block.timestamp>s.deadline?2:0;}
        if(s.kind==2){if(d.outcome==0)return 0;return d.outcome==s.expectedOutcome?1:2;}
        if(d.outcome!=0)return d.outcome==s.expectedOutcome&&d.resolvedAt<=s.deadline?1:2;
        return block.timestamp>s.deadline?2:0;
    }
    function resolveDerived(bytes32 id) external nonReentrant{Statement storage s=statements[id];require(s.outcome==0,"already resolved");uint8 outcome=derivedOutcome(id);require(outcome!=0,"not resolvable yet");_resolve(s,outcome,keccak256(abi.encode(s.dependency,s.deadline)));}
    function _resolve(Statement storage s,uint8 outcome,bytes32 evidence) internal{s.outcome=outcome;s.resolvedAt=uint64(block.timestamp);uint256[] memory payouts=new uint256[](2);payouts[outcome-1]=1;ctf.reportPayouts(s.id,payouts);emit StatementResolved(s.id,outcome,s.resolvedAt,evidence);}
}

// Included in compilation to produce ABI for reused contracts, without replacing their logic.
contract AgoraTimelock is TimelockController { constructor(uint256 delay,address[] memory proposers,address[] memory executors) TimelockController(delay,proposers,executors,address(0)) {} }
