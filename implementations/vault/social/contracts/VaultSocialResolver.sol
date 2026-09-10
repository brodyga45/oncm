// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {ISchemaRegistry} from "@ethereum-attestation-service/eas-contracts/contracts/ISchemaRegistry.sol";

interface IVaultSocialRegistry {
    struct Statement {
        bytes32 goalHash; bytes32 profileId; bytes32 conditionId; bytes32 dependency;
        uint64 deadline; uint64 resolvedAt; uint8 kind; uint8 expected; uint8 outcome;
        address author; address yes; address no; string title; string manifest;
    }
    function getStatement(bytes32 id) external view returns (Statement memory);
}

/// Full text and historical versions are stored by the original EAS, not this resolver.
/// EAS calls are made by wallets directly so attestation.attester is the real signer.
contract VaultSocialResolver is SchemaResolver {
    string public constant PROFILE_SCHEMA = "string displayName,string bio,bytes32 previousUID";
    string public constant ENTRY_SCHEMA = "uint8 kind,bytes32 statementId,bytes32 rootUID,bytes32 parentUID,bytes32 previousUID,string title,string body,bool deleted";
    string public constant VOTE_SCHEMA = "bytes32 targetUID,bytes32 previousUID,int8 value";
    bytes32 public immutable profileSchema;
    bytes32 public immutable entrySchema;
    bytes32 public immutable voteSchema;
    IVaultSocialRegistry public immutable statementRegistry;

    struct EntryData {
        uint8 kind; bytes32 statementId; bytes32 rootUID; bytes32 parentUID;
        bytes32 previousUID; string title; string body; bool deleted;
    }
    struct Entry {
        address author; bytes32 latestUID; bytes32 statementId; bytes32 parentUID;
        bytes32 context; uint8 kind; bool deleted;
    }
    struct Vote {bytes32 uid; int8 value;}
    mapping(address => bytes32) public latestProfile;
    mapping(bytes32 => Entry) public entries;
    mapping(bytes32 => mapping(address => Vote)) public votes;
    mapping(bytes32 => int256) public scores;

    event ProfileRevision(address indexed author, bytes32 indexed uid, bytes32 previousUID);
    event EntryRevision(bytes32 indexed rootUID, bytes32 indexed uid, address indexed author,
        uint8 kind, bytes32 statementId, bytes32 parentUID, bytes32 previousUID, bool deleted);
    event VoteRevision(bytes32 indexed targetUID, bytes32 indexed uid, address indexed author,
        bytes32 previousUID, int8 value, int256 score);
    error InvalidSocialData();
    error InvalidContext();
    error NotAuthor();
    error StaleRevision();

    constructor(IEAS eas, IVaultSocialRegistry registry) SchemaResolver(eas) {
        require(address(registry).code.length > 0, "registry code");
        statementRegistry = registry;
        ISchemaRegistry schemas = eas.getSchemaRegistry();
        profileSchema = schemas.register(PROFILE_SCHEMA, this, false);
        entrySchema = schemas.register(ENTRY_SCHEMA, this, false);
        voteSchema = schemas.register(VOTE_SCHEMA, this, false);
    }

    function onAttest(Attestation calldata a, uint256 value) internal override returns (bool) {
        if (value != 0 || a.expirationTime != 0 || a.revocable || a.recipient != a.attester)
            revert InvalidSocialData();
        if (a.schema == profileSchema) _profile(a);
        else if (a.schema == entrySchema) _entry(a);
        else if (a.schema == voteSchema) _vote(a);
        else revert InvalidSocialData();
        return true;
    }

    function _profile(Attestation calldata a) private {
        (string memory name, string memory bio, bytes32 previous) = abi.decode(a.data, (string,string,bytes32));
        if (keccak256(a.data) != keccak256(abi.encode(name,bio,previous)) ||
            bytes(name).length > 80 || bytes(bio).length > 2048 || a.refUID != previous)
            revert InvalidSocialData();
        if (latestProfile[a.attester] != previous) revert StaleRevision();
        latestProfile[a.attester] = a.uid;
        emit ProfileRevision(a.attester, a.uid, previous);
    }

    function _entry(Attestation calldata a) private {
        // EAS schema encodes fields as an ABI tuple, without a surrounding dynamic-struct offset.
        EntryData memory d;
        (d.kind,d.statementId,d.rootUID,d.parentUID,d.previousUID,d.title,d.body,d.deleted) =
            abi.decode(a.data, (uint8,bytes32,bytes32,bytes32,bytes32,string,string,bool));
        if (keccak256(a.data) != keccak256(abi.encode(d.kind,d.statementId,d.rootUID,d.parentUID,d.previousUID,d.title,d.body,d.deleted)) ||
            (d.kind != 1 && d.kind != 2) || bytes(d.title).length > 180 ||
            bytes(d.body).length > (d.kind == 1 ? 16384 : 8192) ||
            (!d.deleted && bytes(d.body).length == 0) ||
            (d.kind == 2 && bytes(d.title).length != 0) ||
            (d.kind == 1 && !d.deleted && bytes(d.title).length == 0)) revert InvalidSocialData();
        bytes32 root = d.rootUID;
        if (root == bytes32(0)) {
            if (d.previousUID != bytes32(0) || d.deleted || a.refUID != d.parentUID) revert InvalidSocialData();
            root = a.uid;
            bytes32 context;
            if (d.kind == 1) {
                if (d.parentUID != bytes32(0) || d.statementId != bytes32(0)) revert InvalidContext();
                context = root;
            } else if (d.parentUID != bytes32(0)) {
                Entry storage parent = entries[d.parentUID];
                if (parent.author == address(0) || parent.deleted || parent.statementId != d.statementId) revert InvalidContext();
                context = parent.context;
            } else {
                if (d.statementId == bytes32(0) || statementRegistry.getStatement(d.statementId).author == address(0)) revert InvalidContext();
                context = d.statementId;
            }
            entries[root] = Entry(a.attester,a.uid,d.statementId,d.parentUID,context,d.kind,false);
        } else {
            Entry storage e = entries[root];
            if (e.author != a.attester) revert NotAuthor();
            if (e.latestUID != d.previousUID || a.refUID != d.previousUID) revert StaleRevision();
            if (e.kind != d.kind || e.statementId != d.statementId || e.parentUID != d.parentUID) revert InvalidContext();
            e.latestUID = a.uid;
            e.deleted = d.deleted;
        }
        emit EntryRevision(root,a.uid,a.attester,d.kind,d.statementId,d.parentUID,d.previousUID,d.deleted);
    }

    function _vote(Attestation calldata a) private {
        (bytes32 target, bytes32 previous, int8 value) = abi.decode(a.data, (bytes32,bytes32,int8));
        if (keccak256(a.data) != keccak256(abi.encode(target,previous,value)) ||
            a.refUID != target || value < -1 || value > 1) revert InvalidSocialData();
        Entry storage entry = entries[target];
        if (entry.author == address(0) || (entry.deleted && value != 0)) revert InvalidContext();
        if (entry.author == a.attester) revert NotAuthor();
        Vote storage old = votes[target][a.attester];
        if (old.uid != previous) revert StaleRevision();
        if (old.value == value) revert InvalidSocialData();
        scores[target] += int256(value) - int256(old.value);
        old.uid = a.uid;
        old.value = value;
        emit VoteRevision(target,a.uid,a.attester,previous,value,scores[target]);
    }

    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return false; // History is immutable; deletion/removal is another signed revision.
    }
}
