// Record coordinator browser actions on the existing Vault chain. Read-only:
// no signer, account unlocking, transactions, mining, reset or proving.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AbiCoder,Contract,Interface,JsonRpcProvider,keccak256,sha256} from 'ethers';
import {createSDK} from '../sdk/index.mjs';
import {argumentsObject} from './capture-manual-evidence.mjs';
import {readDerivedReadiness} from '../sdk/derived-readiness.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const config=read('.state/deployment.json'),abis=read('.state/abis.json');
if(config.chainId!==31373||config.rpcUrl!=='http://127.0.0.1:9547')throw Error('Existing Vault chain31373/9547 only');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),sdk=createSDK(config,abis,provider),abi=AbiCoder.defaultAbiCoder();
const parentId='0x7b048ad58d17d794cfe9da3c2740bb9047f88817e9ec00f174fd1ac79950a7a3',derivedId='0xafd09c0dbc270d6fc11dedcb31667639c747e33531e4c554305b20475d6a82b2';
const clean=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x));
const names=['goalHash','profileId','conditionId','dependency','deadline','resolvedAt','kind','expected','outcome','author','yes','no','title','manifest'];
const statementObject=s=>Object.fromEntries(names.map(n=>[n,s[n]]));
const ercAbi=['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const interfaces=Object.fromEntries(Object.entries(abis).map(([n,items])=>[n,new Interface(items)])),ercI=new Interface(ercAbi);
const labels={148:'genuine false-goal registration',149:'T approval',150:'split100T',151:'create80%NO WeightedPool',152:'funding approval',153:'funding approval',154:'initialize20T+80NO',155:'Bob trade approval',156:'Bob buy2T',157:'Bob sell approval',158:'Bob sell approval',159:'Bob sell0.5NO',160:'register ResolvedAsFalse dependent',161:'genuine CI6 false-refutation settlement',162:'dependent resolves True',163:'Bob redemption approval',164:'Bob winningNO redemption',165:'AliceBPT exit approval',166:'Alice proportional LP exit',167:'AliceYES redemption approval',168:'AliceNO redemption approval',169:'Alice redeem all positions; YESloses/NOwins'};
try{
 if((await provider.getNetwork()).chainId!==31373n)throw Error('chain');
 const head=await provider.getBlock('latest');if(head.number<169)throw Error('Final block169 missing');
 const parent=await sdk.registry.getStatement(parentId,{blockTag:169}),derived=await sdk.registry.getStatement(derivedId,{blockTag:169});
 const count=Number(await sdk.coordinator.count({blockTag:169}));let pool;
 for(let i=0;i<count;i++){const item=await sdk.coordinator.getPool(i,{blockTag:169});if(item.statementId===parentId)pool=item;}
 assert.ok(pool);assert.equal(Number(pool.side),1);assert.equal(Number(parent.outcome),2);assert.equal(Number(derived.outcome),1);assert.equal(derived.dependency,parentId);
 const addresses={...config.addresses,NOWeightedPool:pool.pool,ParentYES:parent.yes,ParentNO:parent.no};
 const known=new Map(Object.entries(addresses).map(([n,a])=>[a.toLowerCase(),n]));
 function decode(log){let name=known.get(log.address.toLowerCase());const iface=interfaces[name]||(name==='NOWeightedPool'?interfaces.WeightedPool:null)||ercI;
  try{const e=iface.parseLog(log);if(e)return{contract:name||'token',event:e.name,args:argumentsObject(e.fragment,e.args)};}catch{}
  try{const e=ercI.parseLog(log);if(e)return{contract:name||'token',event:e.name,args:argumentsObject(e.fragment,e.args)};}catch{}return null;
 }
 const blocks=[];
 for(let n=148;n<=169;n++){
  const b=await provider.getBlock(n),transactions=[];
  for(const hash of b.transactions){const tx=await provider.getTransaction(hash),r=await provider.getTransactionReceipt(hash);assert.equal(r.status,1);
   const name=tx.to&&known.get(tx.to.toLowerCase()),iface=interfaces[name]||(name==='NOWeightedPool'?interfaces.WeightedPool:null);let decoded=null;
   try{const d=iface?.parseTransaction({data:tx.data,value:tx.value});if(d)decoded={contract:name,method:d.name,args:argumentsObject(d.fragment,d.args)};}catch{}
   transactions.push({hash,from:tx.from,to:tx.to,data:tx.data,value:tx.value,nonce:tx.nonce,blockNumber:n,blockHash:r.blockHash,status:r.status,gasUsed:r.gasUsed,gasPrice:r.gasPrice,decoded,logs:r.logs.map(l=>({address:l.address,index:l.index,topics:l.topics,data:l.data,decoded:decode(l)}))});
  }blocks.push({number:n,hash:b.hash,timestamp:b.timestamp,label:labels[n],transactions});
 }
 const tokens={T:config.addresses.TrueToken,YES:parent.yes,NO:parent.no,BPT:pool.pool},accounts=config.accounts.slice(0,2),states=[];
 for(const n of [148,150,151,154,156,159,160,161,162,164,166,169]){
  const tokenState={};for(const[name,address]of Object.entries(tokens)){
   if(await provider.getCode(address,n)==='0x'){tokenState[name]={address,deployed:false};continue;}
   const token=new Contract(address,ercAbi,provider),[supply,...balances]=await Promise.all([token.totalSupply({blockTag:n}),...accounts.map(a=>token.balanceOf(a,{blockTag:n}))]);
   tokenState[name]={address,deployed:true,totalSupply:supply,balances:Object.fromEntries(accounts.map((a,i)=>[a,balances[i]]))};
  }
  const p=await sdk.registry.getStatement(parentId,{blockTag:n}),d=await sdk.registry.getStatement(derivedId,{blockTag:n});
  const vault=await sdk.vault.getPoolTokenInfo(pool.pool,{blockTag:n}).catch(()=>null);
  states.push({blockNumber:n,parentOutcome:Number(p.outcome),derivedOutcome:Number(d.outcome),tokens:tokenState,pool:vault?{tokens:[...vault[0]],rawBalances:[...vault[2]]}:null});
 }
 const ctf=new Contract(config.addresses.ConditionalTokens,abis.ConditionalTokens,provider);
 const payouts={};for(const[name,s]of Object.entries({parent,derived}))payouts[name]={conditionId:s.conditionId,numerators:[await ctf.payoutNumerators(s.conditionId,0,{blockTag:169}),await ctf.payoutNumerators(s.conditionId,1,{blockTag:169})],denominator:await ctf.payoutDenominator(s.conditionId,{blockTag:169})};
 assert.deepEqual(payouts.parent.numerators,[0n,1n]);assert.deepEqual(payouts.derived.numerators,[1n,0n]);
 const proofTx=blocks.find(b=>b.number===161).transactions.find(t=>t.decoded?.method==='submitProof'),record=read('external-proofs/perf05/false-refutation.json');
 assert.ok(proofTx);assert.equal(proofTx.decoded.args.id,parentId);assert.equal(proofTx.decoded.args.outcome,'2');assert.equal(proofTx.decoded.args.certificate,record.certificate);
 const [seal,journal]=abi.decode(['bytes','bytes'],record.certificate),words=abi.decode(['bytes32','bytes32','bytes32','uint256'],journal);
 assert.equal(words[1],parent.goalHash);assert.equal(words[2],parent.profileId);assert.equal(words[3],2n);
 const event=proofTx.logs.find(l=>l.decoded?.event==='StatementResolved');assert.equal(event.decoded.args.evidenceHash,keccak256(record.certificate));
 const bridgeAddress=(await sdk.registry.profiles(parent.profileId,{blockTag:161})).verifier,bridge=new Contract(bridgeAddress,['function verifier() view returns(address)','function imageId() view returns(bytes32)'],provider),originalAddress=await bridge.verifier({blockTag:161});
 const original=new Contract(originalAddress,['function verify(bytes,bytes32,bytes32) view'],provider);
 await original.verify.staticCall(seal,await bridge.imageId({blockTag:161}),sha256(journal),{blockTag:161});
 const pending=await readDerivedReadiness({provider:{getNetwork:()=>provider.getNetwork(),getBlock:()=>provider.getBlock(160)},registry:sdk.registry},derivedId);assert.equal(pending.status,'pending');assert.equal(pending.parentOutcome,0);
 const final=states.at(-1);for(const account of accounts){assert.equal(final.tokens.YES.balances[account],0n);assert.equal(final.tokens.NO.balances[account],0n);}
 const aggregateSwapFees=Object.fromEntries(await Promise.all(['T','NO'].map(async name=>[name,await sdk.vault.getAggregateSwapFeeAmount(pool.pool,tokens[name],{blockTag:169})])));
 const noIndex=final.pool.tokens.findIndex(t=>t.toLowerCase()===parent.no.toLowerCase());
 assert.equal(final.tokens.NO.totalSupply,final.pool.rawBalances[noIndex]+aggregateSwapFees.NO);
 const residualsAt169={aggregateSwapFees,remainingParentNOSupply:final.tokens.NO.totalSupply,parentNOMatchesPoolInventoryPlusFee:true,
  minimumBpt:await sdk.vault.getPoolMinimumTotalSupply({blockTag:169}),explanation:'Both tested wallets have zero positions. Remaining NO supply is pending fee plus minimum-pool inventory; no global zero-Vault-balance claim.'};
 const deltas={};for(const[n,previous]of [[164,162],[166,164],[169,166]]){
  const before=states.find(s=>s.blockNumber===previous),after=states.find(s=>s.blockNumber===n);
  deltas[n]=Object.fromEntries(accounts.map(account=>[account,Object.fromEntries(Object.keys(tokens).map(name=>[name,after.tokens[name].balances[account]-before.tokens[name].balances[account]]))]));
 }
 const report={scope:'read-only evidence of coordinator browser transactions148–169; no generated transactions/proofs/reset',chainId:31373,chainInstance:config.chainInstance.id,finalBlock:169,finalBlockHash:blocks.at(-1).hash,parentId,derivedId,pool:clean(pool),tokens,accounts,parent:statementObject(parent),derived:statementObject(derived),blocks,states,payouts,balanceDeltas:deltas,
  residualsAt169,originalVerifier:{address:originalAddress,bridge:bridgeAddress,transactionHash:proofTx.hash,certificateMatchesPublishedCI6:true,journal,goalHash:words[1],profileId:words[2],outcome:2,certificateHash:keccak256(record.certificate),historicalEthCallAcceptedAt161:true,event:null,eventExplanation:'Original Groth16 verifier.verify is view and emits no event. Actual registry StatementResolved records the accepted certificate hash.'},pendingAt160:pending};
 fs.mkdirSync(new URL('evidence/false-cycle/',root),{recursive:true});fs.writeFileSync(new URL('evidence/false-cycle/browser-rpc.json',root),JSON.stringify(clean(report),null,2));
 console.log(JSON.stringify(clean({blocks:blocks.length,txs:blocks.flatMap(b=>b.transactions).length,payouts,deltas,finalBlockHash:report.finalBlockHash,originalVerifier:report.originalVerifier,pendingAt160:pending.reason})));
}finally{provider.destroy();}
