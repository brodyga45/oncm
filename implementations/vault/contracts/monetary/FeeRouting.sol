// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {AllocationController} from "../VaultIntegration.sol";
import {IVault} from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import {IProtocolFeeController} from "@balancer-labs/v3-interfaces/contracts/vault/IProtocolFeeController.sol";
import {PullSplitFactory} from "../../vendor/splits/packages/splits-v2/src/splitters/pull/PullSplitFactory.sol";

/// Reuses the original allocation consent/epoch/Splits logic. Both revenue streams go to the same epoch.
contract AllocationControllerV2 is AllocationController {
    IVault public immutable balancerVault;
    event FeePolicyChanged(address indexed pool,uint256 swapFee,uint256 creatorShare);
    constructor(IProtocolFeeController c,PullSplitFactory f,address[] memory recipients,uint256[] memory weights,address admin)
        AllocationController(c,f,recipients,weights,admin){balancerVault=c.vault();}
    function setPoolSwapFee(address pool,uint256 fee) external onlyOwner {
        require(officialPool[pool],"pool");require(fee>=1e14&&fee<=1e17,"swap fee bounds");
        balancerVault.setStaticSwapFeePercentage(pool,fee);
        emit FeePolicyChanged(pool,fee,controller.getPoolCreatorSwapFeePercentage(pool));
    }
    function setCreatorFee(address pool,uint256 fee) external onlyOwner {
        require(officialPool[pool],"pool");controller.setPoolCreatorSwapFeePercentage(pool,fee);
        emit FeePolicyChanged(pool,balancerVault.getStaticSwapFeePercentage(pool),fee);
    }
    function collectAll(address pool) external nonReentrant {
        require(officialPool[pool],"pool");address split=this.allocation(epoch).split;
        controller.collectAggregateFees(pool);controller.withdrawPoolCreatorFees(pool,split);controller.withdrawProtocolFees(pool,split);
        emit RevenueCollected(pool,epoch,split,msg.sender);
    }
}

/// Immutable, narrowly scoped Balancer permissions. No mutable grants or upgrade escape hatch.
/// A new protocol version remains possible; it cannot redirect this version's accrued fee rights.
contract FeeRoutingAuthorizer {
    address public immutable authority;
    address public immutable vault;
    address public immutable controller;
    address public immutable allocation;
    constructor(address g,address v,address c,address a){require(g!=address(0)&&v!=address(0)&&c!=address(0)&&a!=address(0),"configuration");authority=g;vault=v;controller=c;allocation=a;}
    function _id(address target,bytes4 selector) internal pure returns(bytes32){return keccak256(abi.encodePacked(bytes32(uint256(uint160(target))),selector));}
    function canPerform(bytes32 actionId,address account,address where) external view returns(bool){
        if(where==controller){
            if(account==allocation && actionId==_id(controller,IProtocolFeeController.withdrawProtocolFees.selector))return true;
            if(account!=authority)return false;
            return actionId==_id(controller,IProtocolFeeController.setGlobalProtocolSwapFeePercentage.selector)
                ||actionId==_id(controller,IProtocolFeeController.setGlobalProtocolYieldFeePercentage.selector)
                ||actionId==_id(controller,IProtocolFeeController.setProtocolSwapFeePercentage.selector)
                ||actionId==_id(controller,IProtocolFeeController.setProtocolYieldFeePercentage.selector);
        }
        // Pool pause/recovery management is a safety operation, not an asset recipient choice.
        // The Vault authenticates some operations against a pool address rather than itself.
        if(account==authority){
            return actionId==_id(vault,bytes4(keccak256("pauseVault()")))
                ||actionId==_id(vault,bytes4(keccak256("unpauseVault()")))
                ||actionId==_id(vault,bytes4(keccak256("pausePool(address)")))
                ||actionId==_id(vault,bytes4(keccak256("unpausePool(address)")))
                ||actionId==_id(vault,bytes4(keccak256("enableRecoveryMode(address)")))
                ||actionId==_id(vault,bytes4(keccak256("disableRecoveryMode(address)")));
        }
        return false;
    }
}
