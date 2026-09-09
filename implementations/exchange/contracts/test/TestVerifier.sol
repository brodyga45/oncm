// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// ONLY ECONOMIC TEST HARNESS. Not a Lean/zk verifier. Never deployed by default.
contract TestVerifier {
 function verifyGoal(bytes32 goal,bytes32 profile,bytes calldata proof) external pure returns(bool){return keccak256(proof)==keccak256(abi.encode('TEST_ONLY_GOAL',goal,profile));}
 function verify(bytes32 statement,bytes32 goal,bytes32 profile,uint8 outcome,bytes calldata proof) external pure returns(bool){return keccak256(proof)==keccak256(abi.encode('TEST_ONLY_RESOLVE',statement,goal,profile,outcome));}
}
