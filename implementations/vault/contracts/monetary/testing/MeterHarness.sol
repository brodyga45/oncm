// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;
import {StatementRegistry} from "../../Protocol.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVault} from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import {VaultSwapParams,SwapKind} from "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";

/// Isolated policy fixture: no Lean/CTF validity claim, never deployed by production scripts.
contract MeterRegistryHarness {
    IERC20 public immutable token;
    mapping(address=>bytes32) public wrappedStatement;
    mapping(bytes32=>StatementRegistry.Statement) private statements;
    constructor(IERC20 t){token=t;}
    function seed(bytes32 id,address yes,address no) external {StatementRegistry.Statement storage s=statements[id];s.author=msg.sender;s.yes=yes;s.no=no;s.title="ISOLATED METERS - NO LEAN CLAIM";wrappedStatement[yes]=id;wrappedStatement[no]=id;}
    function getStatement(bytes32 id) external view returns(StatementRegistry.Statement memory){return statements[id];}
    function outcomeOf(bytes32 id) external view returns(uint8){return statements[id].outcome;}
    function resolve(bytes32 id) external {statements[id].outcome=1;}
}
contract MeterExecutorHarness {
    address public immutable owner=msg.sender;
    function execute(address target,bytes calldata data) external returns(bytes memory){require(msg.sender==owner,"test owner");(bool ok,bytes memory result)=target.call(data);if(!ok)assembly("memory-safe"){revert(add(result,32),mload(result))}return result;}
}
/// A real alternative Vault caller. Its operations are measured but do not earn trusted-router rewards.
contract UntrustedMeterRouter {
    IVault public immutable vault;
    constructor(IVault v){vault=v;}
    function swap(address pool,IERC20 input,IERC20 output,uint256 amount,bytes calldata data) external returns(bytes memory){require(input.transferFrom(msg.sender,address(this),amount),"input");return vault.unlock(abi.encodeCall(this.callback,(pool,input,output,amount,msg.sender,data)));}
    function callback(address pool,IERC20 input,IERC20 output,uint256 amount,address recipient,bytes calldata data) external returns(uint256){require(msg.sender==address(vault),"vault");(uint256 calculated,uint256 amountIn,uint256 amountOut)=vault.swap(VaultSwapParams(SwapKind.EXACT_IN,pool,input,output,amount,0,data));require(input.transfer(address(vault),amountIn),"settle");vault.settle(input,amountIn);vault.sendTo(output,recipient,amountOut);return calculated;}
}
