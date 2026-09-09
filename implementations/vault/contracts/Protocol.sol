// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProofVerifier {
    function verifyGoal(bytes32 goalHash, bytes32 profileId, bytes calldata certificate) external view returns(bool);
    function verify(bytes32 statementId,bytes32 goalHash,bytes32 profileId,uint8 outcome,bytes calldata certificate) external view returns(bool);
}
interface IStatementOperator {
 function validate(address registry,bytes calldata params) external view returns(bool);
 function evaluate(address registry,bytes calldata params) external view returns(uint8);
}
interface ICTF {
    function prepareCondition(address oracle,bytes32 questionId,uint256 outcomes) external;
    function getConditionId(address oracle,bytes32 questionId,uint256 outcomes) external pure returns(bytes32);
    function getCollectionId(bytes32 parent,bytes32 condition,uint256 indexSet) external view returns(bytes32);
    function getPositionId(address collateral,bytes32 collection) external pure returns(uint256);
    function splitPosition(address collateral,bytes32 parent,bytes32 condition,uint256[] calldata partition,uint256 amount) external;
    function mergePositions(address collateral,bytes32 parent,bytes32 condition,uint256[] calldata partition,uint256 amount) external;
    function redeemPositions(address collateral,bytes32 parent,bytes32 condition,uint256[] calldata indexSets) external;
    function reportPayouts(bytes32 questionId,uint256[] calldata payouts) external;
    function payoutDenominator(bytes32 conditionId) external view returns(uint256);
    function safeTransferFrom(address from,address to,uint256 id,uint256 value,bytes calldata data) external;
    function setApprovalForAll(address operator,bool approved) external;
    function balanceOf(address user,uint256 id) external view returns(uint256);
}
interface IWrappedFactory {
    function requireWrapped1155(address multiToken,uint256 tokenId,bytes calldata data) external returns(address);
    function unwrap(address multiToken,uint256 tokenId,uint256 amount,address recipient,bytes calldata data) external;
}

contract TrueToken is ERC20 {
    constructor(address[] memory accounts) ERC20("True", "T") { for(uint i; i<accounts.length; i++) _mint(accounts[i],1_000_000e18); }
}

/// Fail-closed until a real profile verifier is installed. This is NOT a proof simulator.
contract UnconfiguredProofVerifier is IProofVerifier {
    function verifyGoal(bytes32,bytes32,bytes calldata) external pure returns(bool){return false;}
    function verify(bytes32,bytes32,bytes32,uint8,bytes calldata) external pure returns(bool){return false;}
}

contract StatementRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    ICTF public immutable ctf;
    IERC20 public immutable token;
    IWrappedFactory public immutable wrappers;
    struct Profile {address verifier; bool enabled; string manifest;}
    struct Statement {
        bytes32 goalHash; bytes32 profileId; bytes32 conditionId; bytes32 dependency;
        uint64 deadline; uint64 resolvedAt; uint8 kind; uint8 expected; uint8 outcome;
        address author; address yes; address no; string title; string manifest;
    }
    mapping(bytes32=>Profile) public profiles;
    struct Operator {address implementation;bytes32 specification;bool enabled;}
    mapping(bytes32=>Operator) public operators;
    mapping(bytes32=>bytes32) public statementOperator;
    mapping(bytes32=>bytes) public operationParams;
    event OperatorRegistered(bytes32 indexed operatorId,address implementation,bytes32 specification,bool enabled);
    function setOperator(bytes32 id,address implementation,bytes32 specification,bool enabled) external onlyOwner {require(implementation.code.length>0,"operator code");Operator storage old=operators[id];require(old.implementation==address(0)||(old.implementation==implementation&&old.specification==specification),"operator immutable");operators[id]=Operator(implementation,specification,enabled);emit OperatorRegistered(id,implementation,specification,enabled);}
    function registerOperation(bytes32 operatorId,bytes calldata params,string calldata title) external nonReentrant returns(bytes32 id){Operator memory o=operators[operatorId];require(o.enabled&&params.length<=2048,"operator disabled or params");require(IStatementOperator(o.implementation).validate(address(this),params),"invalid operands");id=keccak256(abi.encode("vault.operation.v1",operatorId,params));statementOperator[id]=operatorId;operationParams[id]=params;_create(id,bytes32(0),bytes32(0),4,bytes32(0),0,0,title,"");}

    mapping(bytes32=>Statement) private statements;
    mapping(address=>bytes32) public wrappedStatement;
    bytes32[] public statementIds;
    event ProfileRegistered(bytes32 indexed profileId,address verifier,bool enabled,string manifest);
    event StatementCreated(bytes32 indexed statementId,bytes32 indexed conditionId,address indexed author,bytes32 goalHash,bytes32 profileId,uint8 kind,bytes32 dependency,uint64 deadline,uint8 expected,string title,string manifest,address yes,address no);
    event StatementResolved(bytes32 indexed statementId,uint8 outcome,uint64 resolvedAt,bytes32 evidenceHash,address indexed submitter);
    error UnknownStatement(); error InvalidProof(); error AlreadyResolved(); error NotResolvableYet(); error UnknownProfile();
    constructor(ICTF c,IERC20 t,IWrappedFactory w,address admin) Ownable(admin){ctf=c;token=t;wrappers=w;}
    function setProfile(bytes32 id,address verifier,bool enabled,string calldata manifest) external onlyOwner { require(verifier.code.length>0,"verifier code"); Profile storage old=profiles[id]; require(old.verifier==address(0)||(old.verifier==verifier&&keccak256(bytes(old.manifest))==keccak256(bytes(manifest))),"profile immutable"); profiles[id]=Profile(verifier,enabled,manifest); emit ProfileRegistered(id,verifier,enabled,manifest); }
    function count() external view returns(uint){return statementIds.length;}
    function getStatement(bytes32 id) external view returns(Statement memory){return statements[id];}
    function outcomeOf(bytes32 id) external view returns(uint8){return statements[id].outcome;}
    function register(bytes32 goalHash,bytes32 profileId,string calldata title,string calldata manifest,bytes calldata certificate) external nonReentrant returns(bytes32 id){
        Profile memory p=profiles[profileId]; if(!p.enabled) revert UnknownProfile();
        if(!IProofVerifier(p.verifier).verifyGoal(goalHash,profileId,certificate)) revert InvalidProof();
        id=keccak256(abi.encode(goalHash,profileId));
        _create(id,goalHash,profileId,0,bytes32(0),0,0,title,manifest);
    }
    function registerDerived(bytes32 dependency,uint8 kind,uint8 expected,uint64 deadline,string calldata title) external nonReentrant returns(bytes32 id){
        if(statements[dependency].author==address(0)) revert UnknownStatement();
        require(kind>=1 && kind<=3,"operator");
        require(kind==1 || expected==1 || expected==2,"expected outcome");
        require(kind==2 || deadline>0,"deadline");
        id=keccak256(abi.encode("vault.derived.v1",dependency,kind,kind==1?0:expected,kind==2?0:deadline));
        _create(id,bytes32(0),bytes32(0),kind,dependency,kind==2?0:deadline,kind==1?0:expected,title,"");
    }
    function _short(string memory value) internal pure returns(bytes32 result){ bytes memory b=bytes(value); require(b.length<32,"metadata"); assembly("memory-safe"){result:=mload(add(b,32))} result|=bytes32(b.length*2); }
    function wrapperData(uint8 side) public pure returns(bytes memory){require(side<2,"side");return abi.encodePacked(_short(side==0?"Vault YES":"Vault NO"),_short(side==0?"vYES":"vNO"),uint8(18));}
    function positionId(bytes32 id,uint8 side) public view returns(uint256){return ctf.getPositionId(address(token),ctf.getCollectionId(bytes32(0),statements[id].conditionId,uint256(1)<<side));}
    function _create(bytes32 id,bytes32 goalHash,bytes32 profileId,uint8 kind,bytes32 dep,uint64 deadline,uint8 expected,string memory title,string memory manifest) internal {
        require(statements[id].author==address(0),"statement exists");require(bytes(title).length>0 && bytes(title).length<=180,"title");require(bytes(manifest).length<=1500,"manifest");
        ctf.prepareCondition(address(this),id,2); bytes32 condition=ctf.getConditionId(address(this),id,2);
        Statement storage s=statements[id];s.goalHash=goalHash;s.profileId=profileId;s.conditionId=condition;s.author=msg.sender;s.kind=kind;s.dependency=dep;s.deadline=deadline;s.expected=expected;s.title=title;s.manifest=manifest;
        s.yes=wrappers.requireWrapped1155(address(ctf),positionId(id,0),wrapperData(0)); s.no=wrappers.requireWrapped1155(address(ctf),positionId(id,1),wrapperData(1));
        wrappedStatement[s.yes]=id;wrappedStatement[s.no]=id;statementIds.push(id);
        emit StatementCreated(id,condition,msg.sender,goalHash,profileId,kind,dep,deadline,expected,title,manifest,s.yes,s.no);
    }
    function submitProof(bytes32 id,uint8 outcome,bytes calldata certificate) external nonReentrant {
        Statement storage s=statements[id]; if(s.author==address(0))revert UnknownStatement();if(s.outcome!=0)revert AlreadyResolved();require(s.kind==0,"derived");require(outcome==1||outcome==2,"outcome");
        Profile memory p=profiles[s.profileId];if(p.verifier==address(0))revert UnknownProfile();
        if(!IProofVerifier(p.verifier).verify(id,s.goalHash,s.profileId,outcome,certificate))revert InvalidProof();
        _resolve(id,outcome,keccak256(certificate));
    }
    function resolveDerived(bytes32 id) external nonReentrant {
        Statement storage s=statements[id];if(s.author==address(0))revert UnknownStatement();if(s.outcome!=0)revert AlreadyResolved();require(s.kind!=0,"base"); Statement storage d=statements[s.dependency];uint8 result;
        if(s.kind==1){if(d.outcome!=0 && d.resolvedAt<=s.deadline) result=1;else if(block.timestamp>s.deadline)result=2;}
        if(s.kind==2 && d.outcome!=0)result=d.outcome==s.expected?1:2;
        if(s.kind==3){if(d.outcome!=0 && d.outcome!=s.expected)result=2;else if(d.outcome==s.expected && d.resolvedAt<=s.deadline)result=1;else if(block.timestamp>s.deadline)result=2;}
        if(s.kind==4){Operator memory o=operators[statementOperator[id]];result=IStatementOperator(o.implementation).evaluate(address(this),operationParams[id]);require(result<=2,"operator outcome");}
        if(result==0)revert NotResolvableYet();_resolve(id,result,keccak256(abi.encode(s.dependency,d.outcome,d.resolvedAt,s.deadline)));
    }
    function _resolve(bytes32 id,uint8 outcome,bytes32 evidence) internal {Statement storage s=statements[id];s.outcome=outcome;s.resolvedAt=uint64(block.timestamp);uint[] memory payouts=new uint[](2);payouts[outcome==1?0:1]=1;ctf.reportPayouts(id,payouts);emit StatementResolved(id,outcome,s.resolvedAt,evidence,msg.sender);}
}

/// ERC-20 presentation of CTF actions, adapted from the MIT Seer Router flow.
/// Original: github.com/seer-pm/demo/contracts/src/Router.sol. No AMM/pricing implementation here.
contract PositionRouter is ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;
    StatementRegistry public immutable registry; ICTF public immutable ctf; IERC20 public immutable token; IWrappedFactory public immutable wrappers;
    event CompleteSet(address indexed user,bytes32 indexed statementId,bool split,uint256 amount);
    event Redeemed(address indexed user,bytes32 indexed statementId,uint256 yesAmount,uint256 noAmount,uint256 collateral);
    constructor(StatementRegistry r){registry=r;ctf=r.ctf();token=r.token();wrappers=r.wrappers();}
    function _partition() internal pure returns(uint[] memory p){p=new uint[](2);p[0]=1;p[1]=2;}
    function split(bytes32 id,uint256 amount) external nonReentrant {require(amount>0,"amount");StatementRegistry.Statement memory s=registry.getStatement(id);require(s.author!=address(0),"statement");token.safeTransferFrom(msg.sender,address(this),amount);token.forceApprove(address(ctf),amount);ctf.splitPosition(address(token),bytes32(0),s.conditionId,_partition(),amount);for(uint8 j;j<2;j++){ctf.safeTransferFrom(address(this),address(wrappers),registry.positionId(id,j),amount,registry.wrapperData(j));IERC20(j==0?s.yes:s.no).safeTransfer(msg.sender,amount);}emit CompleteSet(msg.sender,id,true,amount);}
    function merge(bytes32 id,uint256 amount) external nonReentrant {require(amount>0,"amount");StatementRegistry.Statement memory s=registry.getStatement(id);_take(id,s.yes,0,amount);_take(id,s.no,1,amount);ctf.mergePositions(address(token),bytes32(0),s.conditionId,_partition(),amount);token.safeTransfer(msg.sender,amount);emit CompleteSet(msg.sender,id,false,amount);}
    function redeem(bytes32 id,uint256 yesAmount,uint256 noAmount) external nonReentrant {require(yesAmount+noAmount>0,"amount");StatementRegistry.Statement memory s=registry.getStatement(id);require(s.outcome!=0,"unresolved");uint beforeBalance=token.balanceOf(address(this));if(yesAmount>0)_take(id,s.yes,0,yesAmount);if(noAmount>0)_take(id,s.no,1,noAmount);ctf.redeemPositions(address(token),bytes32(0),s.conditionId,_partition());uint payout=token.balanceOf(address(this))-beforeBalance;if(payout>0)token.safeTransfer(msg.sender,payout);emit Redeemed(msg.sender,id,yesAmount,noAmount,payout);}
    function _take(bytes32 id,address wrapped,uint8 side,uint amount) internal {IERC20(wrapped).safeTransferFrom(msg.sender,address(this),amount);wrappers.unwrap(address(ctf),registry.positionId(id,side),amount,address(this),registry.wrapperData(side));}
}

/// Example governance-installed symbol: resolve as the specified outcome during an inclusive time interval.
contract ResolvedWithinWindowOperator is IStatementOperator {
 function validate(address registry,bytes calldata params) external view returns(bool){(bytes32 dependency,uint64 start,uint64 end,uint8 expected)=abi.decode(params,(bytes32,uint64,uint64,uint8));StatementRegistry.Statement memory s=StatementRegistry(registry).getStatement(dependency);return s.author!=address(0)&&start<=end&&(expected==1||expected==2)&&keccak256(params)==keccak256(abi.encode(dependency,start,end,expected));}
 function evaluate(address registry,bytes calldata params) external view returns(uint8){(bytes32 dependency,uint64 start,uint64 end,uint8 expected)=abi.decode(params,(bytes32,uint64,uint64,uint8));StatementRegistry.Statement memory s=StatementRegistry(registry).getStatement(dependency);if(s.outcome!=0)return s.outcome==expected&&s.resolvedAt>=start&&s.resolvedAt<=end?1:2;return block.timestamp>end?2:0;}
}
