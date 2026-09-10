// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {StatementRegistry} from "../Protocol.sol";
import {BaseHooks} from "@balancer-labs/v3-vault/contracts/BaseHooks.sol";
import {IVault} from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import {ISenderGuard} from "@balancer-labs/v3-interfaces/contracts/vault/ISenderGuard.sol";
import {TokenConfig,TokenType,HookFlags,LiquidityManagement,AddLiquidityKind,PoolSwapParams,AfterSwapParams,SwapKind,PoolRoleAccounts} from "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IRewardBudgetMeter {
    struct Program {address meter;uint64 start;uint64 end;uint64 claimDeadline;address remainderRecipient;uint256 budget;uint256 paid;uint256 reclaimed;uint256 totalWeight;bool closed;}
    function programs(uint256 id) external view returns(Program memory);
    function recordWeight(uint256 id,address account,uint256 weight) external;
}
interface IOfficialPools {function officialPool(address pool) external view returns(bool);}

/// V2 only: original Balancer math/fees are untouched. Finality and metering execute in the Vault callback.
contract IncentiveFinalityHook is BaseHooks {
    StatementRegistry public immutable registry;
    IVault public immutable vault;
    address public immutable factory;
    bytes32 public immutable statementId;
    address public immutable governance;
    address public immutable feeSink;
    address public immutable trustedRouter;
    bytes32 public immutable trustedRouterCodeHash;
    IRewardBudgetMeter public immutable rewards;
    mapping(address=>bool) public registeredPool;
    mapping(address=>uint256) public totalTVolume;
    mapping(address=>uint256) public totalExactInTFees;
    struct Binding {address pool;uint8 metric;bool configured;}
    mapping(uint256=>Binding) public programBinding;
    // At most eight simultaneous programs per pool. Expired slots can be reused; history remains in RewardBudget.
    mapping(address=>uint256[8]) private poolProgramSlots; // programId + 1; zero means empty
    event ProgramBound(uint256 indexed programId,address indexed pool,uint8 metric);
    event SwapMeasured(address indexed pool,address indexed account,address indexed router,uint256 tVolume,uint256 exactInTFee,bool rewardEligible);
    constructor(StatementRegistry r,IVault v,address f,bytes32 id,address g,address sink,address router,IRewardBudgetMeter budget) {
        require(router.code.length>0&&g!=address(0)&&address(budget).code.length>0,"configuration");
        require(sink.code.length>0,"fee sink");registry=r;vault=v;factory=f;statementId=id;governance=g;feeSink=sink;trustedRouter=router;trustedRouterCodeHash=router.codehash;rewards=budget;
    }
    modifier onlyVault(){require(msg.sender==address(vault),"vault");_;}
    function getHookFlags() public pure override returns(HookFlags memory f){f.shouldCallBeforeInitialize=true;f.shouldCallBeforeSwap=true;f.shouldCallBeforeAddLiquidity=true;f.shouldCallAfterSwap=true;}
    function onRegister(address f,address pool,TokenConfig[] memory tokens,LiquidityManagement calldata) public override onlyVault returns(bool){
        if(f!=factory||tokens.length!=2||registry.outcomeOf(statementId)!=0)return false;
        address base=address(registry.token());address wrapped;
        for(uint256 i;i<2;i++)if(tokens[i].tokenType!=TokenType.STANDARD||address(tokens[i].rateProvider)!=address(0)||tokens[i].paysYieldFees)return false;
        if(address(tokens[0].token)==base)wrapped=address(tokens[1].token);else if(address(tokens[1].token)==base)wrapped=address(tokens[0].token);else return false;
        if(statementId==bytes32(0)||registry.wrappedStatement(wrapped)!=statementId)return false;
        registeredPool[pool]=true;return true;
    }
    function onBeforeInitialize(uint256[] memory,bytes memory) public view override onlyVault returns(bool){return registry.outcomeOf(statementId)==0;}
    function onBeforeSwap(PoolSwapParams calldata,address pool) public view override onlyVault returns(bool){return registeredPool[pool]&&registry.outcomeOf(statementId)==0;}
    function onBeforeAddLiquidity(address,address pool,AddLiquidityKind,uint256[] memory,uint256,uint256[] memory,bytes memory) public view override onlyVault returns(bool){return registeredPool[pool]&&registry.outcomeOf(statementId)==0;}
    /// metric0: actual gross T leg; metric1: exact-in swaps whose input is T, charged fee in T.
    /// No claim that outcome-denominated fees can be converted to T without an oracle.
    function configureProgram(uint256 id,address pool,uint8 metric) external {
        require(msg.sender==governance,"governance");require(registeredPool[pool]&&metric<=1&&!programBinding[id].configured,"binding");
        // Vault's public role getter requires the registered bit, which is only stored AFTER onRegister.
        PoolRoleAccounts memory roles=vault.getPoolRoleAccounts(pool);require(IOfficialPools(feeSink).officialPool(pool)&&roles.poolCreator==feeSink&&roles.swapFeeManager==feeSink,"official fee roles");
        IRewardBudgetMeter.Program memory p=rewards.programs(id);require(p.meter==address(this)&&block.timestamp<p.start&&!p.closed,"program");
        uint256[8] storage slots=poolProgramSlots[pool];bool assigned;
        for(uint256 i;i<8;i++)if(slots[i]==0||rewards.programs(slots[i]-1).end<=block.timestamp){slots[i]=id+1;assigned=true;break;}
        require(assigned,"eight active programs");programBinding[id]=Binding(pool,metric,true);emit ProgramBound(id,pool,metric);
    }
    function poolPrograms(address pool) external view returns(uint256[8] memory){return poolProgramSlots[pool];}
    function onAfterSwap(AfterSwapParams calldata p) public override onlyVault returns(bool,uint256){
        require(registeredPool[p.pool],"pool");
        // Same convention as pinned Balancer EVMCallModeHelpers: eth_call queries use zero tx.origin.
        // Router query sender is arbitrary. Never meter it, even within a transient query result.
        if(tx.origin==address(0))return(true,p.amountCalculatedRaw);
        address base=address(registry.token());bool inputT=address(p.tokenIn)==base;
        require(inputT||address(p.tokenOut)==base,"T leg");
        uint256 volume=inputT?p.amountInScaled18:p.amountOutScaled18;
        uint256 fee;
        // STANDARD, 18-decimal T: this is the original Vault EXACT_IN mulUp fee, including LP+creator+protocol.
        if(inputT&&p.kind==SwapKind.EXACT_IN)fee=Math.mulDiv(p.amountInScaled18,vault.getStaticSwapFeePercentage(p.pool),1e18,Math.Rounding.Ceil);
        totalTVolume[p.pool]+=volume;totalExactInTFees[p.pool]+=fee;
        address account;bool eligible=p.router==trustedRouter&&p.router.codehash==trustedRouterCodeHash;
        if(eligible){account=ISenderGuard(p.router).getSender();eligible=account!=address(0);}
        if(eligible){uint256[8] storage slots=poolProgramSlots[p.pool];for(uint256 i;i<8;i++){if(slots[i]==0)continue;uint256 id=slots[i]-1;IRewardBudgetMeter.Program memory program=rewards.programs(id);if(block.timestamp<program.start||block.timestamp>=program.end||program.closed)continue;uint256 weight=programBinding[id].metric==0?volume:fee;if(weight>0)rewards.recordWeight(id,account,weight);}}
        emit SwapMeasured(p.pool,account,p.router,volume,fee,eligible);
        return(true,p.amountCalculatedRaw);
    }
}

/// Optional, explicit BPT lock; normal Balancer liquidity exits are unaffected.
/// Weight is committed BPT-seconds. No early exit; principal is withdrawable after end even after pool resolution.
contract BptLockMeter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable governance;
    IRewardBudgetMeter public immutable rewards;
    IOfficialPools public immutable pools;
    mapping(uint256=>address) public programPool;
    mapping(uint256=>mapping(address=>uint256)) public deposits;
    event ProgramBound(uint256 indexed programId,address indexed pool);
    event Staked(uint256 indexed programId,address indexed account,uint256 bptAmount,uint256 weight,uint64 unlockAt);
    event Withdrawn(uint256 indexed programId,address indexed account,uint256 bptAmount);
    constructor(address g,IRewardBudgetMeter r,IOfficialPools p){require(g!=address(0),"governance");governance=g;rewards=r;pools=p;}
    function configureProgram(uint256 id,address pool) external {require(msg.sender==governance,"governance");require(pools.officialPool(pool)&&programPool[id]==address(0),"pool or bound");IRewardBudgetMeter.Program memory p=rewards.programs(id);require(p.meter==address(this)&&block.timestamp<p.start&&!p.closed,"program");programPool[id]=pool;emit ProgramBound(id,pool);}
    function stake(uint256 id,uint256 amount) external nonReentrant {
        address pool=programPool[id];require(pool!=address(0)&&amount>0,"stake");IRewardBudgetMeter.Program memory p=rewards.programs(id);require(block.timestamp>=p.start&&block.timestamp<p.end&&!p.closed,"period");
        uint256 beforeBalance=IERC20(pool).balanceOf(address(this));IERC20(pool).safeTransferFrom(msg.sender,address(this),amount);require(IERC20(pool).balanceOf(address(this))-beforeBalance==amount,"received");
        deposits[id][msg.sender]+=amount;uint256 weight=amount*(p.end-block.timestamp);rewards.recordWeight(id,msg.sender,weight);emit Staked(id,msg.sender,amount,weight,p.end);
    }
    function withdraw(uint256 id) external nonReentrant {IRewardBudgetMeter.Program memory p=rewards.programs(id);require(block.timestamp>=p.end,"locked until end");uint256 amount=deposits[id][msg.sender];require(amount>0,"empty");deposits[id][msg.sender]=0;IERC20(programPool[id]).safeTransfer(msg.sender,amount);emit Withdrawn(id,msg.sender,amount);}
}
