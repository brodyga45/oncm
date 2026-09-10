import {network} from './local-network.mjs';
import {parseTokenAmount as parseEther} from './amounts.mjs';
import {defineChain,createPublicClient,createWalletClient,http,custom,parseAbi,decodeEventLog,formatEther,zeroAddress,zeroHash,keccak256,toHex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
export const chain=defineChain({id:31371,name:'Agora local research chain',nativeCurrency:{name:'Dev Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[network.rpcUrl]}}});
export const mnemonic='test test test test test test test test test test test junk';
export const devAccounts=Array.from({length:6},(_,addressIndex)=>mnemonicToAccount(mnemonic,{addressIndex}));
export const publicClient=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0]),pollingInterval:400});
export const devWallet=(index=0)=>createWalletClient({chain,account:devAccounts[index],transport:http(chain.rpcUrls.default.http[0])});
export const injectedWallet=async(provider)=>{const [account]=await provider.request({method:'eth_requestAccounts'});return createWalletClient({chain,account,transport:custom(provider)});};
export const injectedWalletForAccount=(provider,account)=>createWalletClient({chain,account,transport:custom(provider)});
export async function assertLocalChain(client=publicClient){if(await client.getChainId()!==31371)throw new Error('Agora dev wallet only supports chain 31371');}
export async function transact(wallet,address,abi,functionName,args=[],value=0n,{assertCurrent=()=>{},onSubmitted=()=>{}}={}){assertCurrent();await assertLocalChain();if(await wallet.getChainId()!==31371)throw new Error('Switch wallet to Agora chain 31371');assertCurrent();const {request}=await publicClient.simulateContract({account:wallet.account,address,abi,functionName,args,value});assertCurrent();const hash=await wallet.writeContract(request);onSubmitted(hash);const receipt=await publicClient.waitForTransactionReceipt({hash});assertCurrent();if(receipt.status!=='success')throw new Error('Transaction reverted');return receipt;}
export const erc20Abi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)','event Approval(address indexed owner,address indexed spender,uint256 value)']);
export {parseEther,formatEther,zeroAddress,zeroHash,keccak256,toHex,decodeEventLog};
export const stringify=(v)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
