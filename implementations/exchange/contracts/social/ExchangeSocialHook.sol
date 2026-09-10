// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseHook} from "ecp/src/hooks/BaseHook.sol";
import {Comments} from "ecp/src/types/Comments.sol";
import {Channels} from "ecp/src/types/Channels.sol";
import {Metadata} from "ecp/src/types/Metadata.sol";
import {FeeEstimatable} from "ecp/src/types/FeeEstimatable.sol";
import {Hooks} from "ecp/src/types/Hooks.sol";
import {ChannelManager} from "ecp/src/ChannelManager.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface ISocialRegistry {
    function statements(bytes32 id) external view returns (bytes32,bytes32,bytes32,uint64,uint64,uint8,uint8,uint8,address,address,string memory);
}

/// @notice ONCM policy over unchanged ECP. Full revisions remain readable from current chain state.
contract ExchangeSocialHook is BaseHook {
    uint8 public constant PROFILE = 1;
    uint8 public constant BLOG = 2;
    uint8 public constant MARKET = 3;
    uint8 public constant REPLY = 4;
    uint8 public constant REACTION = 5;
    bytes32 public constant KIND_KEY = keccak256("oncm.kind");
    bytes32 public constant CONTEXT_KEY = keccak256("oncm.context");
    bytes32 public constant TITLE_KEY = keccak256("oncm.title");
    bytes32 public constant NONCE_KEY = keccak256("oncm.nonce");
    address public immutable commentManager;
    ChannelManager public immutable channels;
    address public immutable registry;
    address private immutable initializer;
    uint256 public channelId;
    bool public initialized;

    struct Entry {
        address author; uint64 createdAt; uint8 kind; bool deleted;
        uint64 updatedAt; bytes32 parentId; bytes32 context; bytes32 rootId;
        int256 score; uint256 revisionCount;
    }
    mapping(bytes32 => Entry) public entries;
    mapping(bytes32 => address[]) private revisionPointers;
    mapping(address => bytes32) public profileOf;
    mapping(address => bytes32[]) private blogIds;
    mapping(bytes32 => bytes32[]) private marketIds;
    mapping(bytes32 => bytes32[]) private childIds;
    mapping(bytes32 => mapping(address => bytes32)) public reactionOf;
    mapping(bytes32 => mapping(address => int8)) public voteOf;
    bytes32[] private allIds;
    event EntryRecorded(bytes32 indexed id, address indexed author, uint8 indexed kind, bytes32 parentId, bytes32 context, uint256 revision, address pointer, bool deleted);
    event VoteChanged(bytes32 indexed target, address indexed voter, int8 previousValue, int8 value, int256 score, bytes32 reactionId);

    constructor(address manager, address channelManager, address protocol) {
        require(manager.code.length > 0 && channelManager.code.length > 0 && protocol.code.length > 0, "Missing dependency");
        commentManager = manager; channels = ChannelManager(payable(channelManager)); registry = protocol; initializer = msg.sender;
    }
    function initialize() external {
        require(msg.sender == initializer && !initialized, "Already initialized or unauthorized");
        channels.createChannel("ONCM Exchange", "Onchain profiles, blogs and mathematical discussion", new Metadata.MetadataEntry[](0), address(this));
        require(initialized, "Hook not initialized");
    }
    function onERC721Received(address,address,uint256,bytes calldata) external view returns (bytes4) {
        require(msg.sender == address(channels), "Unexpected NFT");
        return 0x150b7a02;
    }
    function estimateAddCommentFee(Comments.Comment calldata, Metadata.MetadataEntry[] calldata, address) external pure override returns (FeeEstimatable.FeeEstimation memory) {
        return FeeEstimatable.FeeEstimation(0,FeeEstimatable.NATIVE_TOKEN_ADDRESS,"No social protocol fee; network gas applies",new Metadata.MetadataEntry[](0));
    }
    function estimateEditCommentFee(Comments.Comment calldata, Metadata.MetadataEntry[] calldata, address) external pure override returns (FeeEstimatable.FeeEstimation memory) {
        return FeeEstimatable.FeeEstimation(0,FeeEstimatable.NATIVE_TOKEN_ADDRESS,"No social protocol fee; network gas applies",new Metadata.MetadataEntry[](0));
    }
    function _getHookPermissions() internal pure override returns (Hooks.Permissions memory p) {
        p.onInitialize = true; p.onCommentAdd = true; p.onCommentEdit = true; p.onCommentDelete = true;
    }
    function _onInitialize(address manager, Channels.Channel memory, uint256 id, Metadata.MetadataEntry[] calldata) internal override returns (bool) {
        require(msg.sender == address(channels) && manager == address(channels) && !initialized && channels.ownerOf(id) == address(this), "Invalid initialization");
        channelId = id; initialized = true; return true;
    }
    function _authorize(Comments.Comment calldata c, address sender) private view {
        require(msg.sender == commentManager && initialized && c.channelId == channelId, "Wrong manager or channel");
        require(sender == c.author && c.app == c.author, "Direct author wallet required");
    }
    function _fields(Comments.Comment calldata c, Metadata.MetadataEntry[] calldata m) private pure returns (uint8 kind, bytes32 context, string memory title) {
        require(m.length == 4 && m[0].key == KIND_KEY && m[0].value.length == 1 && m[1].key == CONTEXT_KEY && m[1].value.length == 32 && m[2].key == TITLE_KEY && m[3].key == NONCE_KEY && m[3].value.length == 32, "Canonical metadata required");
        kind = uint8(m[0].value[0]); context = bytes32(m[1].value); title = string(m[2].value);
        require(kind >= PROFILE && kind <= REACTION && m[2].value.length <= 160, "Invalid kind or title");
        uint256 size = bytes(c.content).length;
        require((size > 0 || kind == PROFILE) && size <= (kind == BLOG ? 8192 : kind == PROFILE ? 2048 : 4096), "Text size");
        if (kind == PROFILE) require(m[2].value.length <= 80, "Name size");
        if (kind == BLOG) require(m[2].value.length > 0, "Title required");
        if (kind == REPLY || kind == REACTION || kind == MARKET) require(m[2].value.length == 0, "Unexpected title");
        require(c.commentType == (kind == REACTION ? 1 : 0), "Wrong comment type");
    }
    function targetUri(uint8 kind, address author, bytes32 context) public view returns (string memory) {
        string memory prefix = string.concat("oncm://", Strings.toString(block.chainid));
        if (kind == PROFILE || kind == BLOG) return string.concat(prefix, "/wallet/", Strings.toHexString(author), kind == PROFILE ? "/profile" : "/blog");
        if (kind == MARKET) return string.concat(prefix, "/registry/", Strings.toHexString(registry), "/statement/", Strings.toHexString(uint256(context),32));
        return "";
    }
    function _archive(bytes32 id, string memory title, string memory content) private {
        Entry storage e = entries[id];
        address pointer = SSTORE2.write(abi.encode(uint8(1), e.kind, e.author, e.parentId, e.context, title, content, uint64(block.timestamp), e.deleted));
        revisionPointers[id].push(pointer); e.revisionCount++; e.updatedAt = uint64(block.timestamp);
        emit EntryRecorded(id, e.author, e.kind, e.parentId, e.context, e.revisionCount, pointer, e.deleted);
    }
    function _value(string calldata content) private pure returns (int8) {
        bytes32 h = keccak256(bytes(content));
        if (h == keccak256("1")) return 1;
        if (h == keccak256("-1")) return -1;
        require(h == keccak256("0"), "Vote must be -1, 0 or 1"); return 0;
    }
    function _vote(bytes32 id, bytes32 parent, address voter, int8 value) private {
        int8 old = voteOf[parent][voter]; voteOf[parent][voter] = value;
        entries[parent].score += int256(value) - int256(old);
        emit VoteChanged(parent, voter, old, value, entries[parent].score, id);
    }
    function _onCommentAdd(Comments.Comment calldata c, Metadata.MetadataEntry[] calldata m, address sender, bytes32 id) internal override returns (Metadata.MetadataEntry[] memory) {
        _authorize(c, sender); (uint8 kind, bytes32 context, string memory title) = _fields(c,m);
        require(entries[id].author == address(0), "Entry already recorded");
        bytes32 root = id;
        if (kind == REPLY || kind == REACTION) {
            Entry storage parent = entries[c.parentId];
            require(parent.author != address(0) && !parent.deleted && parent.kind != PROFILE && parent.kind != REACTION && context == parent.context && bytes(c.targetUri).length == 0, "Invalid parent or context");
            root = parent.rootId;
            if (kind == REACTION) {
                require(c.author != parent.author && reactionOf[c.parentId][c.author] == bytes32(0), "Self or duplicate vote");
                require(_value(c.content) != 0, "Empty initial vote");
                reactionOf[c.parentId][c.author] = id;
            } else childIds[c.parentId].push(id);
        } else {
            require(c.parentId == bytes32(0) && keccak256(bytes(c.targetUri)) == keccak256(bytes(targetUri(kind,c.author,context))), "Invalid topic");
            if (kind == MARKET) {
                (,,,,,,,,address market,,) = ISocialRegistry(registry).statements(context);
                require(market != address(0), "Unknown statement");
            } else require(context == bytes32(0), "Unexpected context");
            if (kind == PROFILE) {
                bytes32 previous = profileOf[c.author];
                require(previous == bytes32(0) || entries[previous].deleted, "Profile exists"); profileOf[c.author] = id;
            } else if (kind == BLOG) blogIds[c.author].push(id);
        }
        entries[id] = Entry(c.author,uint64(block.timestamp),kind,false,uint64(block.timestamp),c.parentId,context,root,0,0);
        allIds.push(id);
        if (kind != REACTION && (kind == MARKET || entries[root].kind == MARKET)) marketIds[context].push(id);
        if (kind == REACTION) _vote(id,c.parentId,c.author,_value(c.content));
        _archive(id,title,c.content);
        return new Metadata.MetadataEntry[](0);
    }
    function _onCommentEdit(Comments.Comment calldata c, Metadata.MetadataEntry[] calldata m, address sender, bytes32 id) internal override returns (Metadata.MetadataEntry[] memory) {
        _authorize(c,sender); (uint8 kind,bytes32 context,string memory title) = _fields(c,m);
        Entry storage e = entries[id];
        require(e.author == c.author && !e.deleted && e.kind == kind && e.context == context && e.parentId == c.parentId, "Immutable entry binding");
        // Original ECP forbids editing reactions; switches use its atomic delete+post batch.
        require(kind != REACTION, "Replace reaction atomically");
        _archive(id,title,c.content); return new Metadata.MetadataEntry[](0);
    }
    function _onCommentDelete(Comments.Comment calldata c, Metadata.MetadataEntry[] calldata m, Metadata.MetadataEntry[] calldata, address sender, bytes32 id) internal override returns (bool) {
        _authorize(c,sender); (,,string memory title) = _fields(c,m);
        Entry storage e = entries[id]; require(e.author == c.author && !e.deleted, "Invalid entry");
        e.deleted = true;
        if (e.kind == REACTION) { _vote(id,c.parentId,c.author,0); delete reactionOf[c.parentId][c.author]; }
        _archive(id,title,c.content); return true;
    }
    function revision(bytes32 id,uint256 index) external view returns (bytes memory) { return SSTORE2.read(revisionPointers[id][index]); }
    function revisionPointer(bytes32 id,uint256 index) external view returns (address) { return revisionPointers[id][index]; }
    function _page(bytes32[] storage ids,uint256 offset,uint256 limit) private view returns (bytes32[] memory result,uint256 total) {
        require(limit > 0 && limit <= 100,"Page limit"); total = ids.length;
        uint256 end = offset > total ? total : offset + (limit > total-offset ? total-offset : limit);
        if(offset >= total) return(new bytes32[](0),total);
        result = new bytes32[](end-offset); for(uint256 i=offset;i<end;i++) result[i-offset]=ids[i];
    }
    function all(uint256 offset,uint256 limit) external view returns(bytes32[] memory,uint256) { return _page(allIds,offset,limit); }
    function blog(address author,uint256 offset,uint256 limit) external view returns(bytes32[] memory,uint256) { return _page(blogIds[author],offset,limit); }
    function discussion(bytes32 context,uint256 offset,uint256 limit) external view returns(bytes32[] memory,uint256) { return _page(marketIds[context],offset,limit); }
    function replies(bytes32 parent,uint256 offset,uint256 limit) external view returns(bytes32[] memory,uint256) { return _page(childIds[parent],offset,limit); }
}
