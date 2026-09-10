// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {StatementRegistry} from "../Protocol.sol";
import {IncentiveFinalityHook,IRewardBudgetMeter} from "./RewardMeters.sol";
import {AllocationControllerV2} from "./FeeRouting.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WeightedPoolFactory} from "@balancer-labs/v3-pool-weighted/contracts/WeightedPoolFactory.sol";
import {TokenConfig,TokenType,PoolRoleAccounts} from "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";
import {IRateProvider} from "@balancer-labs/v3-interfaces/contracts/solidity-utils/helpers/IRateProvider.sol";

/// Additive V2 coordinator: same original factory, weights and CTF assets; new immutable hook and fee sink.
contract PoolCoordinatorV2 {
    StatementRegistry public immutable registry;
    WeightedPoolFactory public immutable factory;
    AllocationControllerV2 public immutable allocation;
    address public immutable governance;
    address public immutable trustedRouter;
    IRewardBudgetMeter public immutable rewards;
    mapping(bytes32=>IncentiveFinalityHook) public hooks;
    mapping(address=>bytes32) public statementOfPool;
    struct Pool {address pool;bytes32 statementId;uint8 side;uint256 outcomeWeight;address creator;}
    Pool[] private pools;
    event MarketPoolCreated(address indexed pool,bytes32 indexed statementId,uint8 side,uint256 outcomeWeight,uint256 swapFee,uint256 creatorFee,address indexed creator);
    constructor(StatementRegistry r,WeightedPoolFactory f,AllocationControllerV2 a,address g,address router,IRewardBudgetMeter budget){registry=r;factory=f;allocation=a;governance=g;trustedRouter=router;rewards=budget;}
    function count() external view returns(uint256){return pools.length;}
    function getPool(uint256 i) external view returns(Pool memory){return pools[i];}
    function create(bytes32 id,uint8 side,uint256 outcomeWeight,uint256 swapFee,bytes32 salt) external returns(address pool){
        StatementRegistry.Statement memory s=registry.getStatement(id);require(s.author!=address(0)&&s.outcome==0&&side<2,"statement");
        require(outcomeWeight>=5e16&&outcomeWeight<=95e16,"weight");require(swapFee>=1e14&&swapFee<=1e17,"swap fee");
        IERC20 base=registry.token();IERC20 wrapped=IERC20(side==0?s.yes:s.no);TokenConfig[] memory tokens=new TokenConfig[](2);uint256[] memory weights=new uint256[](2);bool baseFirst=address(base)<address(wrapped);
        tokens[0]=TokenConfig(baseFirst?base:wrapped,TokenType.STANDARD,IRateProvider(address(0)),false);tokens[1]=TokenConfig(baseFirst?wrapped:base,TokenType.STANDARD,IRateProvider(address(0)),false);
        weights[0]=baseFirst?1e18-outcomeWeight:outcomeWeight;weights[1]=1e18-weights[0];
        IncentiveFinalityHook hook=hooks[id];if(address(hook)==address(0)){hook=new IncentiveFinalityHook(registry,factory.getVault(),address(factory),id,governance,address(allocation),trustedRouter,rewards);hooks[id]=hook;}
        // The AllocationController is both creator and exclusive swap-fee manager; neither role can choose a DAO sink.
        pool=factory.create(string.concat("Vault V2 / ",s.title),"v2BPT",tokens,weights,PoolRoleAccounts(governance,address(allocation),address(allocation)),swapFee,address(hook),false,true,keccak256(abi.encode(msg.sender,salt,pools.length)));
        allocation.configurePool(pool,2e17);statementOfPool[pool]=id;pools.push(Pool(pool,id,side,outcomeWeight,msg.sender));emit MarketPoolCreated(pool,id,side,outcomeWeight,swapFee,2e17,msg.sender);
    }
}
