// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {PullSplitFactory} from '../vendor/splits/packages/splits-v2/src/splitters/pull/PullSplitFactory.sol';
import {PullSplit} from '../vendor/splits/packages/splits-v2/src/splitters/pull/PullSplit.sol';
import {SplitV2Lib} from '../vendor/splits/packages/splits-v2/src/libraries/SplitV2.sol';
contract AllocationController {
 using SafeERC20 for IERC20;
 uint256 public constant DENOMINATOR=10000;uint256 public currentEpoch;uint256 public proposalCount;
 PullSplitFactory public immutable factory;
 struct Epoch {address split;address[] recipients;uint256[] shares;}
 struct Proposal {uint256 base;address[] recipients;uint256[] shares;bool applied;}
 mapping(uint256=>Epoch) private epochs;mapping(uint256=>Proposal) private proposals;
 mapping(uint256=>mapping(address=>bool)) public consent;
 event AllocationProposed(uint256 indexed id,uint256 base,address[] recipients,uint256[] shares);
 event ConsentChanged(uint256 indexed proposal,address indexed beneficiary,bool approved);
 event EpochActivated(uint256 indexed epoch,address split);event FeesCollected(uint256 indexed epoch,address indexed asset,uint256 amount);
 constructor(PullSplitFactory f,address[] memory r,uint256[] memory s){factory=f;_validate(r,s);_epoch(r,s);}
 function epoch(uint256 id) external view returns(Epoch memory){return epochs[id];}
 function proposal(uint256 id) external view returns(Proposal memory){return proposals[id];}
 function _validate(address[] memory r,uint256[] memory s) internal pure {require(r.length>0&&r.length<=32&&r.length==s.length,'Invalid table');uint sum;for(uint i;i<r.length;i++){require(r[i]!=address(0)&&s[i]>0,'Invalid entry');if(i>0)require(uint160(r[i-1])<uint160(r[i]),'Sort / duplicate');sum+=s[i];}require(sum==DENOMINATOR,'Sum != 10000');}
 function propose(address[] calldata r,uint256[] calldata s) external returns(uint id){_validate(r,s);id=++proposalCount;proposals[id]=Proposal(currentEpoch,r,s,false);emit AllocationProposed(id,currentEpoch,r,s);}
 function setConsent(uint id,bool approved) external {require(id>0&&id<=proposalCount&&!proposals[id].applied&&proposals[id].base==currentEpoch,'Stale proposal');require(isLosing(id,msg.sender),'Not losing');consent[id][msg.sender]=approved;emit ConsentChanged(id,msg.sender,approved);}
 function isLosing(uint id,address who) public view returns(bool){Proposal storage p=proposals[id];Epoch storage e=epochs[p.base];uint oldShare;uint newShare;for(uint i;i<e.recipients.length;i++)if(e.recipients[i]==who)oldShare=e.shares[i];for(uint i;i<p.recipients.length;i++)if(p.recipients[i]==who)newShare=p.shares[i];return newShare<oldShare;}
 function applyAllocation(uint id) external {Proposal storage p=proposals[id];require(id>0&&id<=proposalCount&&p.base==currentEpoch&&!p.applied,'Stale proposal');Epoch storage e=epochs[currentEpoch];for(uint i;i<e.recipients.length;i++)require(!isLosing(id,e.recipients[i])||consent[id][e.recipients[i]],'Missing consent');p.applied=true;_epoch(p.recipients,p.shares);}
 function _epoch(address[] memory r,uint256[] memory s) internal {SplitV2Lib.Split memory config=SplitV2Lib.Split(r,s,DENOMINATOR,0);address split=factory.createSplit(config,address(0),address(this));currentEpoch++;epochs[currentEpoch]=Epoch(split,r,s);emit EpochActivated(currentEpoch,split);}
 // Receipt-time policy: assets still in this collector belong to no beneficiary yet.
 function collect(address asset) external {uint amount=IERC20(asset).balanceOf(address(this));require(amount>0,'No received fees');IERC20(asset).safeTransfer(epochs[currentEpoch].split,amount);emit FeesCollected(currentEpoch,asset,amount);}
 function distribute(uint id,address asset) external {Epoch storage e=epochs[id];require(e.split!=address(0),'Unknown epoch');PullSplit(e.split).distribute(SplitV2Lib.Split(e.recipients,e.shares,DENOMINATOR,0),asset,msg.sender);}
}
