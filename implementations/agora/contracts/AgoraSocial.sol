// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {SSTORE2} from "./vendor/solady/SSTORE2.sol";

interface IAgoraStatementRegistry {
    struct Statement {
        bytes32 id; bytes32 goalHash; bytes32 profileId; bytes32 conditionId;
        bytes32 dependency; uint64 deadline; uint64 resolvedAt; uint8 kind; uint8 expectedOutcome; uint8 outcome;
        address creator; string metadataURI;
    }
    function getStatement(bytes32 id) external view returns (Statement memory);
}

/// @notice Full-content, append-only research forum. No admin, NFT, token or relayer authority.
contract AgoraSocial {
    uint256 public constant CHUNK_BYTES = 16384;
    uint256 public constant MAX_BLOG_BYTES = 65536;
    uint256 public constant MAX_COMMENT_BYTES = 10000;
    uint256 public constant MAX_PAGE = 50;
    IAgoraStatementRegistry public immutable registry;
    struct Post {
        uint256 id; address author; bytes32 statementId; uint256 parentId;
        uint64 createdAt; uint8 kind; uint8 depth; uint32 version; int256 score; bool tombstoned;
    }
    struct Revision { string title; address[] chunks; bytes32 contentHash; uint32 byteLength; uint64 createdAt; }
    struct ProfileRevision { address pointer; uint64 createdAt; }
    struct VisibilityChange { bool tombstoned; uint64 createdAt; }
    struct VoteChange { address voter; int8 previous; int8 value; uint64 createdAt; }
    uint256 public postCount;
    mapping(uint256 => Post) private posts;
    mapping(uint256 => Revision[]) private revisions;
    mapping(address => ProfileRevision[]) private profiles;
    mapping(uint256 => mapping(address => int8)) public votes;
    mapping(uint256 => VoteChange[]) private voteChanges;
    mapping(uint256 => VisibilityChange[]) private visibilityChanges;
    mapping(address => uint256[]) private authorPosts;
    mapping(bytes32 => uint256[]) private statementPosts;
    mapping(uint256 => uint256[]) private replies;
    mapping(bytes32 => uint256[]) private statementRoots;
    mapping(address => uint256[]) private authorBlogs;

    event ProfilePublished(address indexed author, uint256 indexed version, address content, uint64 createdAt);
    event PostPublished(uint256 indexed postId, address indexed author, bytes32 indexed statementId, uint256 parentId, uint8 kind, uint32 version);
    event PostRevised(uint256 indexed postId, address indexed author, uint32 indexed version, bytes32 contentHash);
    event VisibilityChanged(uint256 indexed postId, address indexed author, bool tombstoned, uint256 historyIndex);
    event VoteChanged(uint256 indexed postId, address indexed voter, int8 previous, int8 value, int256 score, uint256 historyIndex);

    constructor(address registry_) { require(registry_.code.length > 0, "registry required"); registry = IAgoraStatementRegistry(registry_); }
    function publishProfile(uint256 expectedVersionCount, string calldata displayName, string calldata bio) external {
        require(profiles[msg.sender].length == expectedVersionCount, "stale profile version");
        require(bytes(displayName).length > 0 && bytes(displayName).length <= 192 && bytes(bio).length <= 4000, "profile length");
        address pointer = SSTORE2.write(abi.encode(displayName, bio));
        profiles[msg.sender].push(ProfileRevision(pointer, uint64(block.timestamp)));
        emit ProfilePublished(msg.sender, profiles[msg.sender].length - 1, pointer, uint64(block.timestamp));
    }
    function profileVersionCount(address author) external view returns (uint256) { return profiles[author].length; }
    function getProfile(address author, uint256 version) external view returns (string memory displayName, string memory bio, uint64 createdAt, address pointer) {
        ProfileRevision storage r = profiles[author][version];
        (displayName, bio) = abi.decode(SSTORE2.read(r.pointer), (string, string));
        return (displayName, bio, r.createdAt, r.pointer);
    }
    function publishComment(bytes32 statementId, uint256 parentId, string calldata body) external returns (uint256) {
        uint8 depth;
        if (parentId == 0) {
            require(statementId != bytes32(0) && registry.getStatement(statementId).creator != address(0), "unknown statement");
        } else {
            Post storage parent = _post(parentId);
            require(parent.statementId == statementId && parent.depth < 6, "reply context/depth");
            depth = parent.depth + 1;
        }
        return _publish(statementId, parentId, 0, depth, "", body);
    }
    function publishBlog(string calldata title, string calldata body) external returns (uint256) {
        return _publish(bytes32(0), 0, 1, 0, title, body);
    }
    function _publish(bytes32 statementId, uint256 parentId, uint8 kind, uint8 depth, string memory title, string calldata body) private returns (uint256 id) {
        id = ++postCount;
        posts[id] = Post(id, msg.sender, statementId, parentId, uint64(block.timestamp), kind, depth, 0, 0, false);
        _revision(id, kind, title, body);
        authorPosts[msg.sender].push(id);
        if (statementId != bytes32(0)) statementPosts[statementId].push(id);
        if (parentId != 0) replies[parentId].push(id);
        else if (kind == 1) authorBlogs[msg.sender].push(id);
        else statementRoots[statementId].push(id);
        emit PostPublished(id, msg.sender, statementId, parentId, kind, 0);
    }
    function revisePost(uint256 id, uint32 expectedVersion, string calldata title, string calldata body) external {
        Post storage p = _post(id);
        require(p.author == msg.sender, "author only");
        require(p.version == expectedVersion, "stale version");
        _revision(id, p.kind, title, body); p.version++;
        emit PostRevised(id, msg.sender, p.version, revisions[id][p.version].contentHash);
    }
    function _revision(uint256 id, uint8 kind, string memory title, string calldata body) private {
        bytes calldata data = bytes(body);
        require(data.length > 0 && data.length <= (kind == 1 ? MAX_BLOG_BYTES : MAX_COMMENT_BYTES), "body length");
        require(kind == 1 ? bytes(title).length > 0 && bytes(title).length <= 640 : bytes(title).length == 0, "title length");
        revisions[id].push(); Revision storage r = revisions[id][revisions[id].length - 1];
        r.title = title; r.contentHash = keccak256(data); r.byteLength = uint32(data.length); r.createdAt = uint64(block.timestamp);
        for (uint256 start; start < data.length; start += CHUNK_BYTES) {
            uint256 end = start + CHUNK_BYTES; if (end > data.length) end = data.length;
            r.chunks.push(SSTORE2.write(data[start:end]));
        }
    }
    /// @notice Display tombstone only: content, revision pointers and descendants remain readable.
    function setTombstone(uint256 id, bool value) external {
        Post storage p = _post(id); require(p.author == msg.sender, "author only");
        if (p.tombstoned == value) return;
        p.tombstoned = value; visibilityChanges[id].push(VisibilityChange(value, uint64(block.timestamp)));
        emit VisibilityChanged(id, msg.sender, value, visibilityChanges[id].length - 1);
    }
    function getVisibilityHistory(uint256 id, uint256 offset, uint256 limit) external view returns (VisibilityChange[] memory page, uint256 total) {
        total=visibilityChanges[id].length; uint256 end=_end(total,offset,limit);page=new VisibilityChange[](end-offset);
        for(uint256 i=offset;i<end;i++)page[i-offset]=visibilityChanges[id][i];
    }
    function vote(uint256 id, int8 value) external {
        Post storage p = _post(id);
        require(p.author != msg.sender, "self vote");require(value >= -1 && value <= 1, "vote range");
        int8 previous = votes[id][msg.sender];if (previous == value) return;
        votes[id][msg.sender] = value;p.score += int256(value) - int256(previous);
        voteChanges[id].push(VoteChange(msg.sender, previous, value, uint64(block.timestamp)));
        emit VoteChanged(id, msg.sender, previous, value, p.score, voteChanges[id].length - 1);
    }
    function getPost(uint256 id) external view returns (Post memory) { return _post(id); }
    function _post(uint256 id) private view returns (Post storage p) { p = posts[id];require(p.author != address(0), "unknown post"); }
    function getRevision(uint256 id, uint256 version) external view returns (string memory title, bytes32 contentHash, uint32 byteLength, uint64 createdAt, uint256 chunkCount) {
        Revision storage r = revisions[id][version];return (r.title, r.contentHash, r.byteLength, r.createdAt, r.chunks.length);
    }
    function getRevisionChunk(uint256 id, uint256 version, uint256 chunk) external view returns (bytes memory) { return SSTORE2.read(revisions[id][version].chunks[chunk]); }
    function revisionPointer(uint256 id, uint256 version, uint256 chunk) external view returns (address) { return revisions[id][version].chunks[chunk]; }
    function getPosts(uint256 offset, uint256 limit) external view returns (Post[] memory page) {
        uint256 end = _end(postCount, offset, limit);page = new Post[](end-offset);
        for (uint256 i=offset; i<end; i++) page[i-offset] = posts[i+1];
    }
    function getAuthorPosts(address author, uint256 offset, uint256 limit) external view returns (uint256[] memory page, uint256 total) { return _ids(authorPosts[author], offset, limit); }
    function getStatementPosts(bytes32 id, uint256 offset, uint256 limit) external view returns (uint256[] memory page, uint256 total) { return _ids(statementPosts[id], offset, limit); }
    function getStatementRoots(bytes32 id, uint256 offset, uint256 limit) external view returns (uint256[] memory page, uint256 total) { return _ids(statementRoots[id], offset, limit); }
    function getAuthorBlogs(address author, uint256 offset, uint256 limit) external view returns (uint256[] memory page, uint256 total) { return _ids(authorBlogs[author], offset, limit); }
    function getReplies(uint256 id, uint256 offset, uint256 limit) external view returns (uint256[] memory page, uint256 total) { return _ids(replies[id], offset, limit); }
    function getVoteHistory(uint256 id, uint256 offset, uint256 limit) external view returns (VoteChange[] memory page, uint256 total) {
        total=voteChanges[id].length;uint256 end=_end(total, offset, limit);page=new VoteChange[](end-offset);
        for(uint256 i=offset;i<end;i++)page[i-offset]=voteChanges[id][i];
    }
    function _ids(uint256[] storage source, uint256 offset, uint256 limit) private view returns (uint256[] memory page, uint256 total) {
        total=source.length;uint256 end=_end(total,offset,limit);page=new uint256[](end-offset);
        for(uint256 i=offset;i<end;i++)page[i-offset]=source[i];
    }
    function _end(uint256 total,uint256 offset,uint256 limit) private pure returns(uint256) {
        require(limit>0 && limit<=MAX_PAGE && offset<=total,"page bounds");
        return limit>total-offset?total:offset+limit;
    }
}
