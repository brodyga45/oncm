// SPDX-License-Identifier: MIT
pragma solidity ^0.5.17;
import "./FixedProductMarketMaker.sol";
contract AgoraFPMMFactory { address public allocation; event PoolCreated(address indexed creator,address indexed pool,bytes32 indexed condition);
constructor(address allocation_) public {allocation=allocation_;}
function create(address ctf,address token,bytes32 condition,uint fee) external returns(address){FixedProductMarketMaker pool=new FixedProductMarketMaker(ctf,token,condition,fee,allocation);emit PoolCreated(msg.sender,address(pool),condition);return address(pool);}}
