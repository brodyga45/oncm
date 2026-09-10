// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;
import {IVaultSocialRegistry} from "./VaultSocialResolver.sol";
/// Isolated social tests only. Never used by live deployment.
contract TestSocialRegistry is IVaultSocialRegistry {
    function getStatement(bytes32 id) external pure returns (Statement memory s) {
        if (id == bytes32(uint256(1)) || id == bytes32(uint256(2))) s.author = address(1);
    }
}
