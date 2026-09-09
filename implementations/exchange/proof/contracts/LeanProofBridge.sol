// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {RiscZeroGroth16Verifier} from "./risc0/groth16/RiscZeroGroth16Verifier.sol";
import {ControlID} from "./risc0/groth16/ControlID.sol";

/// Pure mathematical facts are portable across markets and chains. The caller
/// supplies the immutable goal/profile stored in its statement registry.
/// There is no owner, fallback oracle, signature shortcut or mutable image ID.
contract LeanProofBridge {
    RiscZeroGroth16Verifier public immutable verifier;
    bytes32 public immutable imageId;
    bytes32 public immutable profileId;
    bytes32 public constant DOMAIN = sha256("ONCM_LEAN_CLAIM_V1");

    constructor(bytes32 image, bytes32 profile) {
        require(image != bytes32(0) && profile != bytes32(0), "empty profile");
        imageId = image;
        profileId = profile;
        verifier = new RiscZeroGroth16Verifier(ControlID.CONTROL_ROOT, ControlID.BN254_CONTROL_ID);
    }

    function verifyGoal(bytes32 goal, bytes32 profile, bytes calldata certificate) external view returns (bool) {
        return _verify(goal, profile, 0, certificate);
    }

    function verify(bytes32, bytes32 goal, bytes32 profile, uint8 outcome, bytes calldata certificate)
        external view returns (bool)
    {
        if (outcome != 1 && outcome != 2) return false;
        return _verify(goal, profile, outcome, certificate);
    }

    function _verify(bytes32 goal, bytes32 profile, uint8 kind, bytes calldata certificate)
        internal view returns (bool)
    {
        if (profile != profileId || goal == bytes32(0)) return false;
        (bytes memory seal, bytes memory journal) = abi.decode(certificate, (bytes, bytes));
        if (seal.length != 260 || journal.length != 128) return false;
        (bytes32 domain, bytes32 provenGoal, bytes32 provenProfile, uint256 provenKind) =
            abi.decode(journal, (bytes32, bytes32, bytes32, uint256));
        if (domain != DOMAIN || provenGoal != goal || provenProfile != profile || provenKind != kind) return false;
        try verifier.verify(seal, imageId, sha256(journal)) { return true; }
        catch { return false; }
    }
}
