import fs from 'node:fs';
const root=new URL('../',import.meta.url);
let s=fs.readFileSync(new URL('vendor/gnosis/FixedProductMarketMaker.sol',root),'utf8').split('// for proxying purposes')[0];
s='// SPDX-License-Identifier: LGPL-3.0\n// Upstream 6814c0247c745680bb13298d4f0dd7f5b574d0db; generated bounded Agora diff.\n'+s;
s=s.replace('contract FixedProductMarketMaker is', 'interface IAllocationEpoch { function currentSplit() external view returns(address); function currentEpoch() external view returns(uint); }\n\ncontract FixedProductMarketMaker is');
s=s.replace('uint[] positionIds;', 'uint[] public positionIds;');
s=s.replace('function getPoolBalances() private view', 'function getPoolBalances() public view');
s=s.replace('uint internal totalWithdrawnFees;',`uint internal totalWithdrawnFees;
    IAllocationEpoch public allocation;
    event ProtocolFeePaid(uint indexed epoch,address indexed split,uint amount);
    constructor(address ctf,address token,bytes32 condition,uint tradeFee,address allocation_) public {
        conditionalTokens=ConditionalTokens(ctf);collateralToken=IERC20(token);allocation=IAllocationEpoch(allocation_);
        require(conditionalTokens.getOutcomeSlotCount(condition)==2,"binary condition required");require(tradeFee<=ONE/10,"fee too high");
        fee=tradeFee;conditionIds.push(condition);outcomeSlotCounts.push(2);collectionIds=new bytes32[][](1);collectionIds[0].push(bytes32(0));
        positionIds.push(CTHelpers.getPositionId(collateralToken,CTHelpers.getCollectionId(bytes32(0),condition,1)));
        positionIds.push(CTHelpers.getPositionId(collateralToken,CTHelpers.getCollectionId(bytes32(0),condition,2)));
    }
    function _requireTrading() private view {require(conditionalTokens.payoutDenominator(conditionIds[0])==0,"market resolved");}
    function _sendProtocolFee(uint amount) private {uint protocolFee=amount/5;if(protocolFee>0){address recipient=allocation.currentSplit();uint epoch=allocation.currentEpoch();require(collateralToken.transfer(recipient,protocolFee),"protocol fee transfer failed");emit ProtocolFeePaid(epoch,recipient,protocolFee);}}
    function buyWithDeadline(uint amount,uint side,uint minOut,uint deadline) external {require(block.timestamp<=deadline,"expired deadline");buy(amount,side,minOut);}
    function sellWithDeadline(uint amount,uint side,uint maxIn,uint deadline) external {require(block.timestamp<=deadline,"expired deadline");sell(amount,side,maxIn);}
`);
s=s.replace('require(addedFunds > 0,','_requireTrading();\n        require(addedFunds > 0,');
s=s.replace('function buy(uint investmentAmount, uint outcomeIndex, uint minOutcomeTokensToBuy) external {','function buy(uint investmentAmount, uint outcomeIndex, uint minOutcomeTokensToBuy) public {\n        _requireTrading();');
s=s.replace('function sell(uint returnAmount, uint outcomeIndex, uint maxOutcomeTokensToSell) external {','function sell(uint returnAmount, uint outcomeIndex, uint maxOutcomeTokensToSell) public {\n        _requireTrading();');
s=s.replaceAll('feePoolWeight = feePoolWeight.add(feeAmount);','feePoolWeight = feePoolWeight.add(feeAmount.sub(feeAmount / 5));');
s=s.replace('splitPositionThroughAllConditions(investmentAmountMinusFees);','splitPositionThroughAllConditions(investmentAmountMinusFees);\n        _sendProtocolFee(feeAmount);');
s=s.replace('mergePositionsThroughAllConditions(returnAmountPlusFees);','mergePositionsThroughAllConditions(returnAmountPlusFees);\n        _sendProtocolFee(feeAmount);');
fs.mkdirSync(new URL('contracts/legacy/',root),{recursive:true});
fs.writeFileSync(new URL('contracts/legacy/FixedProductMarketMaker.sol',root),s);
fs.copyFileSync(new URL('vendor/gnosis/ERC20.sol',root),new URL('contracts/legacy/ERC20.sol',root));
fs.writeFileSync(new URL('contracts/legacy/AgoraFPMMFactory.sol',root),`// SPDX-License-Identifier: MIT
pragma solidity ^0.5.17;
import "./FixedProductMarketMaker.sol";
contract AgoraFPMMFactory { address public allocation; event PoolCreated(address indexed creator,address indexed pool,bytes32 indexed condition);
constructor(address allocation_) public {allocation=allocation_;}
function create(address ctf,address token,bytes32 condition,uint fee) external returns(address){FixedProductMarketMaker pool=new FixedProductMarketMaker(ctf,token,condition,fee,allocation);emit PoolCreated(msg.sender,address(pool),condition);return address(pool);}}
`);
