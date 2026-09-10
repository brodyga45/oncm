// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {RewardBudget} from "../monetary/RewardBudget.sol";

/// Isolated test fixture only. Never part of the V2 production deployment graph.
contract RewardMeterHarness {
    RewardBudget public immutable rewards;
    constructor(RewardBudget r) { rewards = r; }
    function record(uint256 id, address account, uint256 weight) external { rewards.recordWeight(id, account, weight); }
}
