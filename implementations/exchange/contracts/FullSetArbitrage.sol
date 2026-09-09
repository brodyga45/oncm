// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
interface IArbRegistry {function marketFor(bytes32 id) external view returns(address);}
interface IArbMarket {function outcomeTokens(uint index) external view returns(address);}
interface ISeerSplit {function splitPosition(address collateral,address market,uint256 amount) external;}
interface IArbV2Router {function swapExactTokensForTokens(uint amount,uint minOut,address[] calldata path,address to,uint deadline) external returns(uint[] memory amounts);}
/// Atomic composition of unchanged Seer and Uniswap V2 routers. No owner or custody balances.
contract FullSetArbitrage is ReentrancyGuard {
 using SafeERC20 for IERC20;
 IERC20 public immutable collateral;IArbRegistry public immutable registry;ISeerSplit public immutable splitRouter;IArbV2Router public immutable swapRouter;
 event FullSetExecuted(address indexed trader,bytes32 indexed statementId,uint inputT,uint returnedT,uint profitT);
 constructor(address token,address registry_,address split_,address swap_){collateral=IERC20(token);registry=IArbRegistry(registry_);splitRouter=ISeerSplit(split_);swapRouter=IArbV2Router(swap_);}
 function execute(bytes32 statementId,uint amount,uint minProfit,uint deadline) external nonReentrant returns(uint output){
  require(block.timestamp<=deadline&&amount>0,'Expired / zero input');address market=registry.marketFor(statementId);require(market!=address(0),'Unknown statement');uint initial=collateral.balanceOf(address(this));
  collateral.safeTransferFrom(msg.sender,address(this),amount);collateral.forceApprove(address(splitRouter),amount);splitRouter.splitPosition(address(collateral),market,amount);
  for(uint i;i<2;i++){address outcome=IArbMarket(market).outcomeTokens(i);IERC20(outcome).forceApprove(address(swapRouter),amount);address[] memory route=new address[](2);route[0]=outcome;route[1]=address(collateral);swapRouter.swapExactTokensForTokens(amount,0,route,address(this),deadline);}
  output=collateral.balanceOf(address(this))-initial;require(output>=amount+minProfit,'Minimum profit not met');collateral.safeTransfer(msg.sender,output);emit FullSetExecuted(msg.sender,statementId,amount,output,output-amount);
 }
}
