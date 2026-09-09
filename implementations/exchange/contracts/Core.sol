// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {ERC20Permit} from '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import {ERC20Votes} from '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import {Nonces} from '@openzeppelin/contracts/utils/Nonces.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Market} from '../vendor/Market.sol';
import {IConditionalTokens, IWrapped1155Factory} from '../vendor/Interfaces.sol';

interface ILeanCertificateVerifier {
 function verify(bytes32 statementId,bytes32 goalHash,bytes32 profileId,uint8 outcome,bytes calldata certificate) external view returns(bool);
 function verifyGoal(bytes32 goalHash,bytes32 profileId,bytes calldata certificate) external view returns(bool);
}
interface IStatementOperator {function validate(address registry,bytes calldata config) external view returns(bool);function evaluate(address registry,bytes calldata config) external view returns(uint8);}
interface IResolutionReader {function resolutionRecord(bytes32 id) external view returns(bool exists,uint8 outcome,uint64 resolvedAt);}
/// Sample versioned operator: true iff the dependency has no resolution recorded by its inclusive deadline.
contract UnresolvedByOperator is IStatementOperator {
 function validate(address registry,bytes calldata config) external view returns(bool){if(config.length!=64)return false;(bytes32 dep,uint64 deadline)=abi.decode(config,(bytes32,uint64));(bool exists,,)=IResolutionReader(registry).resolutionRecord(dep);return exists&&deadline>0;}
 function evaluate(address registry,bytes calldata config) external view returns(uint8){(bytes32 dep,uint64 deadline)=abi.decode(config,(bytes32,uint64));(bool exists,uint8 outcome,uint64 at)=IResolutionReader(registry).resolutionRecord(dep);require(exists,'Unknown dependency');if(outcome!=0&&at<=deadline)return 2;return block.timestamp>deadline?1:0;}
}
interface IV2Factory {function createPair(address,address) external returns(address);function getPair(address,address) external view returns(address);}
contract TrueToken is ERC20, ERC20Permit, ERC20Votes {
 constructor(address[] memory recipients) ERC20('True','T') ERC20Permit('True') {for(uint i;i<recipients.length;i++) _mint(recipients[i],100000 ether);}
 function _update(address from,address to,uint256 value) internal override(ERC20,ERC20Votes){super._update(from,to,value);}
 function nonces(address owner) public view override(ERC20Permit,Nonces) returns(uint256){return super.nonces(owner);}
}
contract UnavailableVerifier is ILeanCertificateVerifier {
 function verify(bytes32,bytes32,bytes32,uint8,bytes calldata) external pure returns(bool){return false;}
 function verifyGoal(bytes32,bytes32,bytes calldata) external pure returns(bool){return false;}
}
contract ExchangeProtocol is Ownable {
 struct Profile {address verifier;bool newEnabled;bool resolutionEnabled;string manifest;}
 struct Statement {bytes32 goal;bytes32 profile;bytes32 dependency;uint64 deadline;uint64 resolvedAt;uint8 kind;uint8 targetOutcome;uint8 outcome;address market;address creator;string metadata;}
 IConditionalTokens public immutable conditionalTokens; IWrapped1155Factory public immutable wrapperFactory;
 address public immutable collateral; IV2Factory public immutable ammFactory;
 mapping(bytes32=>Profile) public operators;bytes32[] public operatorIds;mapping(bytes32=>bytes) public operatorArguments;
 mapping(bytes32=>Profile) public profiles; bytes32[] public profileIds;
 mapping(bytes32=>Statement) public statements; bytes32[] public statementIds;
 event OperatorAdded(bytes32 indexed operatorId,address adapter,string manifest);event AvailabilityChanged(bytes32 indexed id,bool isOperator,bool newEnabled,bool resolutionEnabled);
 event ProfileAdded(bytes32 indexed profile,address verifier,string manifest);
 event StatementCreated(bytes32 indexed id,address indexed market,address indexed creator,uint8 kind,string metadata);
 event Resolved(bytes32 indexed id,uint8 outcome,uint64 resolvedAt,bytes32 evidence);
 constructor(address ctf,address wrapper,address token,address amm) Ownable(msg.sender){conditionalTokens=IConditionalTokens(ctf);wrapperFactory=IWrapped1155Factory(wrapper);collateral=token;ammFactory=IV2Factory(amm);}
 function marketFor(bytes32 id) external view returns(address){return statements[id].market;}
 function count() external view returns(uint256){return statementIds.length;}
 function addProfile(bytes32 id,address verifier,string calldata manifest) external onlyOwner {require(profiles[id].verifier==address(0)&&verifier.code.length>0,'Profile exists / invalid');profiles[id]=Profile(verifier,true,true,manifest);profileIds.push(id);emit ProfileAdded(id,verifier,manifest);}
 function setProfileEnabled(bytes32 id,bool newEnabled,bool resolutionEnabled) external onlyOwner {require(profiles[id].verifier!=address(0),'Unknown profile');profiles[id].newEnabled=newEnabled;profiles[id].resolutionEnabled=resolutionEnabled;emit AvailabilityChanged(id,false,newEnabled,resolutionEnabled);}
 function addOperator(bytes32 id,address adapter,string calldata manifest) external onlyOwner {require(id!=bytes32(0)&&operators[id].verifier==address(0)&&adapter.code.length>0,'Operator exists / invalid');operators[id]=Profile(adapter,true,true,manifest);operatorIds.push(id);emit OperatorAdded(id,adapter,manifest);}
 function setOperatorEnabled(bytes32 id,bool newEnabled,bool resolutionEnabled) external onlyOwner {require(operators[id].verifier!=address(0),'Unknown operator');operators[id].newEnabled=newEnabled;operators[id].resolutionEnabled=resolutionEnabled;emit AvailabilityChanged(id,true,newEnabled,resolutionEnabled);}
 function resolutionRecord(bytes32 id) external view returns(bool exists,uint8 outcome,uint64 resolvedAt){Statement storage s=statements[id];return(s.market!=address(0),s.outcome,s.resolvedAt);}
 function createOperator(bytes32 op,bytes calldata config,string calldata metadata) external returns(bytes32 id){Profile storage p=operators[op];require(p.newEnabled&&config.length<=4096,'Operator unavailable / arguments too long');require(IStatementOperator(p.verifier).validate(address(this),config),'Invalid operator arguments');id=keccak256(abi.encode('ONCM_EXCHANGE_OPERATOR_V1',op,config));operatorArguments[id]=config;_create(id,op,bytes32(0),bytes32(0),0,4,0,metadata);}
 function mathId(bytes32 goal,bytes32 profile) public pure returns(bytes32){return keccak256(abi.encode('ONCM_EXCHANGE_LEAN_V1',goal,profile));}
 function createMath(bytes32 goal,bytes32 profile,string calldata metadata,bytes calldata certificate) external returns(bytes32 id){
  require(profiles[profile].newEnabled,'Profile unavailable');require(ILeanCertificateVerifier(profiles[profile].verifier).verifyGoal(goal,profile,certificate),'Invalid GoalWellFormed');
  id=mathId(goal,profile);_create(id,goal,profile,bytes32(0),0,0,0,metadata);
 }
 // kind:1 ResolvedBy,2 ResolvedAs,3 ResolvedAsBy; outcome:1 true,2 false.
 function createDerived(uint8 kind,bytes32 dep,uint64 deadline,uint8 targetOutcome,string calldata metadata) external returns(bytes32 id){
  require(kind>=1&&kind<=3&&statements[dep].market!=address(0),'Invalid dependency');
  require((kind==1&&targetOutcome==0)||((kind==2||kind==3)&&(targetOutcome==1||targetOutcome==2)),'Invalid outcome');require(kind==2?deadline==0:deadline>0,'Invalid deadline');
  id=keccak256(abi.encode('ONCM_EXCHANGE_DERIVED_V1',kind,dep,deadline,targetOutcome));_create(id,bytes32(0),bytes32(0),dep,deadline,kind,targetOutcome,metadata);
 }
 function _create(bytes32 id,bytes32 goal,bytes32 profile,bytes32 dep,uint64 deadline,uint8 kind,uint8 target,string memory metadata) internal {
  require(statements[id].market==address(0),'Statement exists');require(bytes(metadata).length<=4096,'Metadata too long');
  conditionalTokens.prepareCondition(address(this),id,2);bytes32 condition=keccak256(abi.encodePacked(address(this),id,uint256(2)));
  Market market=new Market(condition,collateral,conditionalTokens,wrapperFactory);
  statements[id]=Statement(goal,profile,dep,deadline,0,kind,target,0,address(market),msg.sender,metadata);statementIds.push(id);
  (address yes,)=market.outcomeAddress(0);(address no,)=market.outcomeAddress(1);ammFactory.createPair(collateral,yes);ammFactory.createPair(collateral,no);
  emit StatementCreated(id,address(market),msg.sender,kind,metadata);
 }
 function resolveProof(bytes32 id,uint8 outcome,bytes calldata certificate) external {Statement storage s=statements[id];require(s.market!=address(0)&&s.kind==0&&s.outcome==0,'Not unresolved Lean');require(outcome==1||outcome==2,'Invalid outcome');Profile storage p=profiles[s.profile];require(p.resolutionEnabled,'Verifier disabled');require(ILeanCertificateVerifier(p.verifier).verify(id,s.goal,s.profile,outcome,certificate),'Invalid ProofAccepted');_resolve(id,outcome,keccak256(certificate));}
 function derivedOutcome(bytes32 id) public view returns(uint8){Statement storage s=statements[id];require(s.kind!=0&&s.market!=address(0),'Not derived');if(s.kind==4){Profile storage p=operators[s.goal];require(p.resolutionEnabled,'Operator disabled');uint8 result=IStatementOperator(p.verifier).evaluate(address(this),operatorArguments[id]);require(result<=2,'Invalid operator result');return result;}Statement storage d=statements[s.dependency];if(s.kind==1){if(d.outcome!=0&&d.resolvedAt<=s.deadline)return 1;if(block.timestamp>s.deadline)return 2;return 0;}if(s.kind==2)return d.outcome==0?0:(d.outcome==s.targetOutcome?1:2);if(d.outcome!=0){return d.outcome==s.targetOutcome&&d.resolvedAt<=s.deadline?1:2;}return block.timestamp>s.deadline?2:0;}
 function resolveDerived(bytes32 id) external {require(statements[id].outcome==0,'Already resolved');uint8 outcome=derivedOutcome(id);require(outcome!=0,'Not resolvable yet');_resolve(id,outcome,bytes32(0));}
 function _resolve(bytes32 id,uint8 outcome,bytes32 evidence) internal {Statement storage s=statements[id];s.outcome=outcome;s.resolvedAt=uint64(block.timestamp);uint256[] memory payouts=new uint256[](2);payouts[outcome-1]=1;conditionalTokens.reportPayouts(id,payouts);emit Resolved(id,outcome,s.resolvedAt,evidence);}
}
