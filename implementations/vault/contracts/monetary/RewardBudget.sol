// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Finite budgets with fully onchain weights supplied by one immutable meter.
/// The meter's measurement policy is admitted explicitly by governance. This
/// contract does not pretend that event logs or an offchain table prove volume.
contract RewardBudget is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable governance;
    uint256 public constant monetaryVersion = 2;
    uint256 public programCount;
    uint256 public reserved;

    struct Program {
        address meter;
        uint64 start;
        uint64 end;
        uint64 claimDeadline;
        address remainderRecipient;
        uint256 budget;
        uint256 paid;
        uint256 reclaimed;
        uint256 totalWeight;
        bool closed;
    }
    mapping(uint256 => Program) public programs;
    mapping(uint256 => mapping(address => uint256)) public weights;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event ProgramCreated(uint256 indexed programId, address indexed meter, uint64 start, uint64 end,
        uint64 claimDeadline, uint256 budget, address remainderRecipient);
    event WeightRecorded(uint256 indexed programId, address indexed account, uint256 addedWeight, uint256 totalWeight);
    event RewardClaimed(uint256 indexed programId, address indexed account, uint256 weight, uint256 amount);
    event ProgramClosed(uint256 indexed programId, address indexed recipient, uint256 remainder);

    constructor(IERC20 token_, address governance_) {
        require(address(token_).code.length > 0 && governance_.code.length > 0, "token/executor code");
        token = token_;
        governance = governance_;
    }

    modifier onlyGovernance() { require(msg.sender == governance, "governance executor"); _; }

    /// In one Governor batch: mint(address(this), budget), then this call, then
    /// optional meter configuration. Any failed leg rolls back the entire batch.
    /// expectedId prevents two queued batches configuring the wrong program.
    function createProgram(uint256 expectedId, address meter, uint64 start, uint64 end,
        uint64 claimDeadline, uint256 budget, address remainderRecipient)
        external onlyGovernance nonReentrant returns (uint256 id)
    {
        require(expectedId == programCount, "program counter changed");
        require(meter.code.length > 0, "meter code");
        require(start > block.timestamp && end > start && claimDeadline > end, "program window");
        require(budget > 0 && remainderRecipient != address(0) && remainderRecipient != address(this), "program budget/recipient");
        uint256 balance = token.balanceOf(address(this));
        require(balance >= reserved && balance - reserved >= budget, "unfunded budget");
        id = programCount++;
        programs[id] = Program(meter, start, end, claimDeadline, remainderRecipient, budget, 0, 0, 0, false);
        reserved += budget;
        emit ProgramCreated(id, meter, start, end, claimDeadline, budget, remainderRecipient);
    }

    /// Atomic callbacks from the immutable meter; [start, end), no retroactive
    /// weighting, changing budgets, arbitrary governance weight edits or roots.
    function recordWeight(uint256 id, address account, uint256 weight) external {
        require(id < programCount, "unknown program");
        Program storage p = programs[id];
        require(msg.sender == p.meter, "program meter");
        require(block.timestamp >= p.start && block.timestamp < p.end && !p.closed, "outside earning window");
        require(account != address(0) && weight > 0, "weight/account");
        weights[id][account] += weight;
        p.totalWeight += weight;
        emit WeightRecorded(id, account, weight, p.totalWeight);
    }

    function claimable(uint256 id, address account) public view returns (uint256) {
        if (id >= programCount) return 0;
        Program storage p = programs[id];
        if (p.closed || claimed[id][account] || block.timestamp < p.end || block.timestamp >= p.claimDeadline
            || p.totalWeight == 0) return 0;
        return Math.mulDiv(p.budget, weights[id][account], p.totalWeight);
    }

    /// Earned rights are owner-bound; neither operator nor governance can redirect
    /// a participant's claim. Rounding is down, with explicit later remainder.
    function claim(uint256 id) external nonReentrant returns (uint256 amount) {
        amount = claimable(id, msg.sender);
        require(amount > 0, "nothing claimable");
        Program storage p = programs[id];
        claimed[id][msg.sender] = true;
        p.paid += amount;
        reserved -= amount;
        token.safeTransfer(msg.sender, amount);
        emit RewardClaimed(id, msg.sender, weights[id][msg.sender], amount);
    }

    /// Anyone may finalize an expired program, but the destination was fixed in
    /// its original voted configuration. Includes zero-weight and rounding dust.
    function close(uint256 id) external nonReentrant returns (uint256 remainder) {
        require(id < programCount, "unknown program");
        Program storage p = programs[id];
        require(!p.closed && block.timestamp >= p.claimDeadline, "claim window open/closed");
        p.closed = true;
        remainder = p.budget - p.paid;
        p.reclaimed = remainder;
        reserved -= remainder;
        if (remainder > 0) token.safeTransfer(p.remainderRecipient, remainder);
        emit ProgramClosed(id, p.remainderRecipient, remainder);
    }
}
