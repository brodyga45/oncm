// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {StatementRegistry} from "./Protocol.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BaseHooks} from "@balancer-labs/v3-vault/contracts/BaseHooks.sol";
import {WeightedPoolFactory} from "@balancer-labs/v3-pool-weighted/contracts/WeightedPoolFactory.sol";
import {IVault} from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import {IProtocolFeeController} from "@balancer-labs/v3-interfaces/contracts/vault/IProtocolFeeController.sol";
import {TokenConfig,TokenType,PoolRoleAccounts,HookFlags,LiquidityManagement,AddLiquidityKind,PoolSwapParams} from "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";
import {IRateProvider} from "@balancer-labs/v3-interfaces/contracts/solidity-utils/helpers/IRateProvider.sol";
import {PullSplitFactory} from "../vendor/splits/packages/splits-v2/src/splitters/pull/PullSplitFactory.sol";
import {PullSplit} from "../vendor/splits/packages/splits-v2/src/splitters/pull/PullSplit.sol";
import {SplitV2Lib} from "../vendor/splits/packages/splits-v2/src/libraries/SplitV2.sol";

/// Finalized CTF outcomes cannot enter a new swap or join. Proportional exits have no hook.
/// This cannot protect against a informed trader swapping BEFORE publishing their proof.
contract FinalityHook is BaseHooks {
    StatementRegistry public immutable registry;
    address public immutable vault;
    address public immutable factory;
    bytes32 public immutable statementId;
    mapping(address=>bytes32) public statementOf;
    constructor(StatementRegistry r,address v,address f,bytes32 id){registry=r;vault=v;factory=f;statementId=id;}
    modifier onlyVault(){require(msg.sender==vault,"vault");_;}
    function getHookFlags() public pure override returns(HookFlags memory flags){flags.shouldCallBeforeInitialize=true;flags.shouldCallBeforeSwap=true;flags.shouldCallBeforeAddLiquidity=true;}
    function onRegister(address f,address pool,TokenConfig[] memory tokens,LiquidityManagement calldata) public override onlyVault returns(bool){
        if(f!=factory || tokens.length!=2)return false;address base=address(registry.token());address wrapped;
        if(address(tokens[0].token)==base)wrapped=address(tokens[1].token);else if(address(tokens[1].token)==base)wrapped=address(tokens[0].token);else return false;
        bytes32 id=registry.wrappedStatement(wrapped);if(id==bytes32(0)||id!=statementId||registry.outcomeOf(id)!=0)return false;statementOf[pool]=id;return true;
    }
    // Balancer initialization callback has no pool argument. Each hook is permanently bound to one statement.
    function onBeforeInitialize(uint256[] memory,bytes memory) public view override onlyVault returns(bool){return registry.outcomeOf(statementId)==0;}
    function onBeforeSwap(PoolSwapParams calldata,address pool) public view override onlyVault returns(bool){return statementOf[pool]!=bytes32(0)&&registry.outcomeOf(statementOf[pool])==0;}
    function onBeforeAddLiquidity(address,address pool,AddLiquidityKind,uint256[] memory,uint256,uint256[] memory,bytes memory) public view override onlyVault returns(bool){return statementOf[pool]!=bytes32(0)&&registry.outcomeOf(statementOf[pool])==0;}
}

/// Each epoch owns a real, immutable Splits V2 pull wallet. Consent can only affect FUTURE collections.
contract AllocationController is Ownable,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IProtocolFeeController public immutable controller;
    PullSplitFactory public immutable splitFactory;
    address public coordinator;
    uint256 public epoch;
    struct Allocation {address split;address[] recipients;uint256[] weights;}
    struct Proposal {uint256 baseEpoch;address proposer;address[] recipients;uint256[] weights;bool applied;}
    mapping(uint256=>Allocation) private allocations;
    Proposal[] private proposals;
    mapping(uint256=>mapping(address=>bool)) public consent;
    mapping(address=>bool) public officialPool;
    event AllocationProposed(uint256 indexed proposalId,uint256 indexed baseEpoch,address indexed proposer,address[] recipients,uint256[] weights);
    event ConsentChanged(uint256 indexed proposalId,address indexed beneficiary,bool approved);
    event EpochActivated(uint256 indexed epoch,address indexed split,address[] recipients,uint256[] weights);
    event RevenueCollected(address indexed pool,uint256 indexed epoch,address indexed split,address caller);
    constructor(IProtocolFeeController c,PullSplitFactory f,address[] memory recipients,uint256[] memory weights,address admin) Ownable(admin){controller=c;splitFactory=f;_validate(recipients,weights);_activate(recipients,weights);}
    function setCoordinator(address c) external onlyOwner {require(coordinator==address(0)&&c.code.length>0,"coordinator set");coordinator=c;}
    function configurePool(address pool,uint256 fee) external {require(msg.sender==coordinator,"coordinator");officialPool[pool]=true;controller.setPoolCreatorSwapFeePercentage(pool,fee);}
    function allocation(uint256 e) external view returns(Allocation memory){return allocations[e];}
    function proposalCount() external view returns(uint){return proposals.length;}
    function proposal(uint id) external view returns(Proposal memory){return proposals[id];}
    function _validate(address[] memory recipients,uint[] memory weights) internal pure {require(recipients.length>0&&recipients.length<=32&&recipients.length==weights.length,"allocation length");uint total;for(uint i;i<recipients.length;i++){require(recipients[i]!=address(0)&&weights[i]>0,"allocation");if(i>0)require(recipients[i]>recipients[i-1],"sort recipients");total+=weights[i];}require(total==10000,"sum must be 10000");}
    function propose(address[] calldata recipients,uint[] calldata weights) external returns(uint id){_validate(recipients,weights);id=proposals.length;proposals.push(Proposal(epoch,msg.sender,recipients,weights,false));emit AllocationProposed(id,epoch,msg.sender,recipients,weights);}
    function setConsent(uint id,bool approved) external {Proposal storage p=proposals[id];require(!p.applied&&p.baseEpoch==epoch,"stale proposal");require(_weight(allocations[epoch].recipients,allocations[epoch].weights,msg.sender)>_weight(p.recipients,p.weights,msg.sender),"not decreasing");consent[id][msg.sender]=approved;emit ConsentChanged(id,msg.sender,approved);}
    function _weight(address[] storage recipients,uint[] storage weights,address who) internal view returns(uint){for(uint i;i<recipients.length;i++)if(recipients[i]==who)return weights[i];return 0;}
    function applyAllocation(uint id) external nonReentrant {Proposal storage p=proposals[id];require(!p.applied&&p.baseEpoch==epoch,"stale proposal");Allocation storage old=allocations[epoch];for(uint i;i<old.recipients.length;i++){address who=old.recipients[i];if(old.weights[i]>_weight(p.recipients,p.weights,who))require(consent[id][who],"missing consent");}p.applied=true;_activate(p.recipients,p.weights);}
    function _activate(address[] memory recipients,uint[] memory weights) internal {SplitV2Lib.Split memory s=SplitV2Lib.Split(recipients,weights,10000,0);address split=splitFactory.createSplit(s,address(0),address(this));epoch++;allocations[epoch]=Allocation(split,recipients,weights);emit EpochActivated(epoch,split,recipients,weights);}
    function collect(address pool) external nonReentrant {require(officialPool[pool],"pool");address split=allocations[epoch].split;controller.collectAggregateFees(pool);controller.withdrawPoolCreatorFees(pool,split);emit RevenueCollected(pool,epoch,split,msg.sender);}
    /// Public Balancer withdrawal can push assets to the creator. Sweep those at the CURRENT collection epoch.
    function sweep(address token) external nonReentrant {uint amount=IERC20(token).balanceOf(address(this));require(amount>0,"empty");IERC20(token).safeTransfer(allocations[epoch].split,amount);}
    function distribute(uint e,address token) external {Allocation storage a=allocations[e];require(a.split!=address(0),"epoch");PullSplit(payable(a.split)).distribute(SplitV2Lib.Split(a.recipients,a.weights,10000,0),token,msg.sender);}
}

/// The coordinator only composes the official factory and creator-fee controller; pricing remains Balancer code.
contract PoolCoordinator {
    StatementRegistry public immutable registry;
    WeightedPoolFactory public immutable factory;
    mapping(bytes32=>FinalityHook) public hooks;
    mapping(address=>bytes32) public statementOfPool;
    AllocationController public immutable allocation;
    address public immutable governance;
    struct Pool {address pool;bytes32 statementId;uint8 side;uint256 outcomeWeight;address creator;}
    Pool[] private pools;
    event MarketPoolCreated(address indexed pool,bytes32 indexed statementId,uint8 side,uint256 outcomeWeight,uint256 swapFee,uint256 creatorFee,address indexed creator);
    constructor(StatementRegistry r,WeightedPoolFactory f,AllocationController a,address g){registry=r;factory=f;allocation=a;governance=g;}
    function count() external view returns(uint){return pools.length;}
    function getPool(uint i) external view returns(Pool memory){return pools[i];}
    function create(bytes32 id,uint8 side,uint256 outcomeWeight,uint256 swapFee,bytes32 salt) external returns(address pool){
        StatementRegistry.Statement memory s=registry.getStatement(id);require(s.author!=address(0)&&s.outcome==0&&side<2,"statement");require(outcomeWeight>=5e16&&outcomeWeight<=95e16,"weight");require(swapFee>=1e14&&swapFee<=1e17,"swap fee");
        IERC20 base=registry.token();IERC20 wrapped=IERC20(side==0?s.yes:s.no);TokenConfig[] memory tokens=new TokenConfig[](2);uint[] memory weights=new uint[](2);bool baseFirst=address(base)<address(wrapped);
        tokens[0]=TokenConfig(baseFirst?base:wrapped,TokenType.STANDARD,IRateProvider(address(0)),false);tokens[1]=TokenConfig(baseFirst?wrapped:base,TokenType.STANDARD,IRateProvider(address(0)),false);
        weights[0]=baseFirst?1e18-outcomeWeight:outcomeWeight;weights[1]=1e18-weights[0];
        FinalityHook hook=hooks[id];if(address(hook)==address(0)){hook=new FinalityHook(registry,address(factory.getVault()),address(factory),id);hooks[id]=hook;}
        pool=factory.create(string.concat("Vault / ",s.title),"vBPT",tokens,weights,PoolRoleAccounts(governance,governance,address(allocation)),swapFee,address(hook),false,true,keccak256(abi.encode(msg.sender,salt,pools.length)));
        allocation.configurePool(pool,2e17);statementOfPool[pool]=id;pools.push(Pool(pool,id,side,outcomeWeight,msg.sender));emit MarketPoolCreated(pool,id,side,outcomeWeight,swapFee,2e17,msg.sender);
    }
}
