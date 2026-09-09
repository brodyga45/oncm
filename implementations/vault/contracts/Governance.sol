// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract Membership is ERC20,ERC20Permit,ERC20Votes,Ownable {
    constructor(address[] memory members) ERC20("Vault Assembly Membership","MEMBER") ERC20Permit("Vault Assembly Membership") Ownable(msg.sender){for(uint i;i<members.length;i++){_mint(members[i],1e18);_delegate(members[i],members[i]);}}
    function setMember(address member,bool enabled) external onlyOwner {require(member!=address(0),"member");uint b=balanceOf(member);if(enabled && b==0){_mint(member,1e18);_delegate(member,member);}else if(!enabled && b>0)_burn(member,b);}
    function _update(address from,address to,uint amount) internal override(ERC20,ERC20Votes){require(from==address(0)||to==address(0),"membership is non-transferable");super._update(from,to,amount);}
    function nonces(address owner) public view override(ERC20Permit,Nonces) returns(uint){return super.nonces(owner);}
}
contract VaultGovernor is Governor,GovernorSettings,GovernorCountingSimple,GovernorVotes,GovernorVotesQuorumFraction,GovernorTimelockControl {
    constructor(IVotes members,TimelockController timelock) Governor("Vault Assembly") GovernorSettings(1,8,0) GovernorVotes(members) GovernorVotesQuorumFraction(50) GovernorTimelockControl(timelock){}
    function votingDelay() public view override(Governor,GovernorSettings) returns(uint256){return super.votingDelay();}
    function votingPeriod() public view override(Governor,GovernorSettings) returns(uint256){return super.votingPeriod();}
    function proposalThreshold() public view override(Governor,GovernorSettings) returns(uint256){return super.proposalThreshold();}
    function state(uint256 id) public view override(Governor,GovernorTimelockControl) returns(ProposalState){return super.state(id);}
    function proposalNeedsQueuing(uint256 id) public view override(Governor,GovernorTimelockControl) returns(bool){return super.proposalNeedsQueuing(id);}
    function _queueOperations(uint256 id,address[] memory targets,uint256[] memory values,bytes[] memory calls,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl) returns(uint48){return super._queueOperations(id,targets,values,calls,descriptionHash);}
    function _executeOperations(uint256 id,address[] memory targets,uint256[] memory values,bytes[] memory calls,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl){super._executeOperations(id,targets,values,calls,descriptionHash);}
    function _cancel(address[] memory targets,uint256[] memory values,bytes[] memory calls,bytes32 descriptionHash) internal override(Governor,GovernorTimelockControl) returns(uint256){return super._cancel(targets,values,calls,descriptionHash);}
    function _executor() internal view override(Governor,GovernorTimelockControl) returns(address){return super._executor();}
}
contract VaultAuthorizer {
    address public immutable authority;
    constructor(address timelock){authority=timelock;}
    function canPerform(bytes32,address account,address) external view returns(bool){return account==authority;}
}
