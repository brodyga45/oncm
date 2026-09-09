// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Governor} from '@openzeppelin/contracts/governance/Governor.sol';
import {GovernorSettings} from '@openzeppelin/contracts/governance/extensions/GovernorSettings.sol';
import {GovernorCountingSimple} from '@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol';
import {GovernorVotes} from '@openzeppelin/contracts/governance/extensions/GovernorVotes.sol';
import {GovernorVotesQuorumFraction} from '@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol';
import {GovernorTimelockControl} from '@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol';
import {TimelockController} from '@openzeppelin/contracts/governance/TimelockController.sol';
import {IVotes} from '@openzeppelin/contracts/governance/utils/IVotes.sol';
contract ExchangeGovernor is Governor,GovernorSettings,GovernorCountingSimple,GovernorVotes,GovernorVotesQuorumFraction,GovernorTimelockControl {
 constructor(IVotes token,TimelockController timelock) Governor('Exchange Governance') GovernorSettings(1,12,0) GovernorVotes(token) GovernorVotesQuorumFraction(4) GovernorTimelockControl(timelock) {}
 function votingDelay() public view override(Governor,GovernorSettings) returns(uint256){return super.votingDelay();}
 function votingPeriod() public view override(Governor,GovernorSettings) returns(uint256){return super.votingPeriod();}
 function quorum(uint256 n) public view override(Governor,GovernorVotesQuorumFraction) returns(uint256){return super.quorum(n);}
 function state(uint256 id) public view override(Governor,GovernorTimelockControl) returns(ProposalState){return super.state(id);}
 function proposalNeedsQueuing(uint256 id) public view override(Governor,GovernorTimelockControl) returns(bool){return super.proposalNeedsQueuing(id);}
 function proposalThreshold() public view override(Governor,GovernorSettings) returns(uint256){return super.proposalThreshold();}
 function _queueOperations(uint256 id,address[] memory targets,uint256[] memory values,bytes[] memory calldatas,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl) returns(uint48){return super._queueOperations(id,targets,values,calldatas,descriptionHash);}
 function _executeOperations(uint256 id,address[] memory targets,uint256[] memory values,bytes[] memory calldatas,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl){super._executeOperations(id,targets,values,calldatas,descriptionHash);}
 function _cancel(address[] memory targets,uint256[] memory values,bytes[] memory calldatas,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl) returns(uint256){return super._cancel(targets,values,calldatas,descriptionHash);}
 function _executor() internal view override(Governor,GovernorTimelockControl) returns(address){return super._executor();}
}
