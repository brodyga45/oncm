// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// Economic tests ONLY. Not deployed by scripts/deploy.mjs.
contract TestProofVerifier {
    function verifyGoal(bytes32 goal,bytes32 profile,bytes calldata cert) external pure returns(bool){return keccak256(cert)==keccak256(abi.encode(goal,profile));}
    function verify(bytes32 id,bytes32 goal,bytes32 profile,uint8 outcome,bytes calldata cert) external pure returns(bool){
        return keccak256(cert)==keccak256(abi.encode(id,goal,profile,outcome));
    }
}
