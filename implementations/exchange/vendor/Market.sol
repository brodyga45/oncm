// SPDX-License-Identifier: MIT
// Minimal proof-only market descriptor exposing the interface consumed by Seer Router.
pragma solidity ^0.8.20;
import {IConditionalTokens,IWrapped1155Factory,IERC20} from './Interfaces.sol';
contract Market {
 // Original factory writes name/symbol into OZ3 short-string slots; low byte is length * 2.
 bytes32 public immutable conditionId;bytes32 public constant parentCollectionId=bytes32(0);
 address[2] public outcomeTokens;bytes[2] private metadata;
 constructor(bytes32 condition,address collateral,IConditionalTokens ctf,IWrapped1155Factory factory){conditionId=condition;for(uint i;i<2;i++){metadata[i]=abi.encodePacked(i==0?bytes32('Exchange YES')|bytes32(uint256(24)):bytes32('Exchange NO')|bytes32(uint256(22)),i==0?bytes32('YES')|bytes32(uint256(6)):bytes32('NO')|bytes32(uint256(4)),uint8(18));uint id=ctf.getPositionId(collateral,ctf.getCollectionId(bytes32(0),condition,1<<i));outcomeTokens[i]=address(factory.requireWrapped1155(address(ctf),id,metadata[i]));}}
 function wrappedOutcome(uint256 i) external view returns(IERC20,bytes memory){return(IERC20(outcomeTokens[i]),metadata[i]);}
 function outcomeAddress(uint256 i) external view returns(address,bytes memory){return(outcomeTokens[i],metadata[i]);}
 function parentWrappedOutcome() external pure returns(IERC20,bytes memory){return(IERC20(address(0)),bytes(''));}
}
