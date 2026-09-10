// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// A new collateral token, never an upgrade of a legacy StatementRegistry token.
/// Governance chooses each issuance explicitly; no unchosen permanent supply cap.
contract TrueTokenV2 is ERC20, Ownable {
    uint256 public constant monetaryVersion = 2;

    constructor(address governance, address[] memory recipients, uint256[] memory amounts)
        ERC20("True", "T") Ownable(governance)
    {
        require(governance.code.length > 0, "governance executor code");
        require(recipients.length == amounts.length, "genesis lengths");
        for (uint256 i; i < recipients.length; ++i) {
            require(recipients[i] != address(0) && amounts[i] > 0, "genesis allocation");
            for (uint256 j; j < i; ++j) require(recipients[i] != recipients[j], "duplicate genesis recipient");
            _mint(recipients[i], amounts[i]);
        }
    }

    /// msg.sender is the real governance executor, not an individual voter.
    function mint(address recipient, uint256 amount) external onlyOwner {
        require(amount > 0, "zero issuance");
        _mint(recipient, amount);
    }
}
