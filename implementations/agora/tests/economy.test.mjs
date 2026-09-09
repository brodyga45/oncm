import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther,encodeAbiParameters,encodeFunctionData,keccak256,toHex,zeroAddress,zeroHash,concatHex} from 'viem';
import {chain,mnemonic,devAccounts} from '../sdk/chain.mjs';
import {createAgoraSDK} from '../sdk/index.mjs';
import {deployStack,artifact} from '../scripts/deploy.mjs';

test('real CTF/FPMM, epochs, resolution, derived conditions and Safe/Timelock; explicit test-only proof harness',async t=>{
 const provider=ganache.provider({chain:{chainId:31371,hardfork:'shanghai'},wallet:{mnemonic,totalAccounts:6},miner:{blockGasLimit:30_000_000},logging:{quiet:true}});
 t.after(()=>provider.disconnect());
 const client=createPublicClient({chain,transport:custom(provider),pollingInterval:10});
 const wallets=devAccounts.map(account=>createWalletClient({chain,account,transport:custom(provider)}));
 const addresses=devAccounts.map(x=>x.address);const m=await deployStack(client,wallets[0],addresses,{mock:true,seed:true});
 const read=(address,name,fn,args=[])=>client.readContract({address,abi:artifact(name).abi,functionName:fn,args});
 const write=async(i,address,name,fn,args=[])=>{const {request}=await client.simulateContract({address,abi:artifact(name).abi,functionName:fn,args,account:wallets[i].account});const hash=await wallets[i].writeContract({...request,gas:15_000_000n});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;};
 const reject=async(i,address,name,fn,args=[])=>assert.rejects(()=>client.simulateContract({address,abi:artifact(name).abi,functionName:fn,args,account:wallets[i].account}));
 const balance=a=>read(m.token,'TrueToken','balanceOf',[a]);
 const id=m.seedMetadata[0].id;const s=await read(m.registry,'AgoraRegistry','getStatement',[id]);const pool=(await read(m.registry,'AgoraRegistry','getPools',[id]))[0];
 const positions=await read(m.registry,'AgoraRegistry','positionIds',[id]);
 let oldSplit,newSplit;
 await t.test('registration is canonical, requires a certificate, and cannot be duplicated',async()=>{
  await reject(2,m.registry,'AgoraRegistry','register',[keccak256(toHex('bad')),m.profileId,'x','0x']);
  await reject(2,m.registry,'AgoraRegistry','register',[s.goalHash,m.profileId,'x',encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[s.goalHash,m.profileId])]);
 });
 await t.test('second LP, buy, sell, deadline and slippage use original FPMM',async()=>{
  const abis=Object.fromEntries(['AgoraRegistry','ConditionalTokens','TrueToken','FixedProductMarketMaker','AllocationController','PaymentSplitter'].map(n=>[n,artifact(n).abi]));const sdk=await createAgoraSDK({wallet:wallets[2],client,config:{...m,abis}});
  await sdk.provideLiquidity(pool,parseEther('100'));
  await write(2,m.token,'TrueToken','approve',[pool,parseEther('1000')]);
  assert.equal(await read(pool,'FixedProductMarketMaker','balanceOf',[addresses[2]]),parseEther('100'));
  const quote=await read(pool,'FixedProductMarketMaker','calcBuyAmount',[parseEther('20'),0n]);const now=(await client.getBlock()).timestamp;
  await reject(2,pool,'FixedProductMarketMaker','buyWithDeadline',[parseEther('20'),0n,quote+1n,now+100n]);
  await reject(2,pool,'FixedProductMarketMaker','buyWithDeadline',[parseEther('20'),0n,0n,now-1n]);
  await write(2,pool,'FixedProductMarketMaker','buyWithDeadline',[parseEther('20'),0n,quote,now+100n]);
  assert.equal(await read(m.ctf,'ConditionalTokens','balanceOf',[addresses[2],positions[0]]),quote);
  oldSplit=await read(m.allocation,'AllocationController','currentSplit');assert.equal(await balance(oldSplit),parseEther('0.08'));
  await write(2,m.ctf,'ConditionalTokens','setApprovalForAll',[pool,true]);
  const sell=await read(pool,'FixedProductMarketMaker','calcSellAmount',[parseEther('5'),0n]);
  await write(2,pool,'FixedProductMarketMaker','sellWithDeadline',[parseEther('5'),0n,sell,now+100n]);
  assert((await balance(oldSplit))>parseEther('0.08'));
 });
 await t.test('all decreased shares consent; revoked consent blocks; old claims stay immutable',async()=>{
  const before=await balance(oldSplit);const claim=await read(oldSplit,'PaymentSplitter','releasable',[m.token,addresses[0]]);
  const recipients=[addresses[0],addresses[1]].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));const expiry=(await client.getBlock()).timestamp+1000n;
  await write(3,m.allocation,'AllocationController','propose',[0n,recipients,[500000n,500000n],expiry]);
  await reject(3,m.allocation,'AllocationController','execute',[0n]);
  await reject(1,m.allocation,'AllocationController','setApproval',[0n,true]);
  await write(0,m.allocation,'AllocationController','setApproval',[0n,true]);
  await write(0,m.allocation,'AllocationController','setApproval',[0n,false]);
  await reject(3,m.allocation,'AllocationController','execute',[0n]);
  await write(0,m.allocation,'AllocationController','setApproval',[0n,true]);
  await write(3,m.allocation,'AllocationController','execute',[0n]);newSplit=await read(m.allocation,'AllocationController','currentSplit');
  assert.notEqual(newSplit,oldSplit);assert.equal(await balance(oldSplit),before);assert.equal(await read(oldSplit,'PaymentSplitter','releasable',[m.token,addresses[0]]),claim);
  await reject(3,m.allocation,'AllocationController','execute',[0n]);
  await write(2,pool,'FixedProductMarketMaker','buy',[parseEther('10'),1n,0n]);assert.equal(await balance(newSplit),parseEther('0.04'));assert.equal(await balance(oldSplit),before);
  const userBefore=await balance(addresses[0]);await write(4,oldSplit,'PaymentSplitter','release',[m.token,addresses[0]]);assert.equal(await balance(addresses[0]),userBefore+claim);
 });
 await t.test('complete set collateral is conserved',async()=>{
  const start=await balance(addresses[3]);await write(3,m.token,'TrueToken','approve',[m.ctf,parseEther('12')]);
  await write(3,m.ctf,'ConditionalTokens','splitPosition',[m.token,zeroHash,s.conditionId,[1n,2n],parseEther('12')]);
  assert.equal(await read(m.ctf,'ConditionalTokens','balanceOf',[addresses[3],positions[1]]),parseEther('12'));
  await write(3,m.ctf,'ConditionalTokens','mergePositions',[m.token,zeroHash,s.conditionId,[1n,2n],parseEther('12')]);assert.equal(await balance(addresses[3]),start);
 });
 await t.test('wrong proof is rejected; payout stops trading but keeps LP exit and redemption',async()=>{
  await reject(2,m.registry,'AgoraRegistry','submitProof',[id,1,'0x']);
  const wrong=encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint8'}],[id,zeroHash,m.profileId,1]);await reject(2,m.registry,'AgoraRegistry','submitProof',[id,1,wrong]);
  const cert=encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint8'}],[id,s.goalHash,m.profileId,1]);
  await write(2,m.registry,'AgoraRegistry','submitProof',[id,1,cert]);
  assert.equal(await read(m.ctf,'ConditionalTokens','payoutDenominator',[s.conditionId]),1n);
  await reject(2,pool,'FixedProductMarketMaker','buy',[1n,0n,0n]);await reject(2,pool,'FixedProductMarketMaker','sell',[1n,0n,parseEther('100')]);await reject(2,pool,'FixedProductMarketMaker','addFunding',[1n,[]]);
  await write(2,pool,'FixedProductMarketMaker','removeFunding',[await read(pool,'FixedProductMarketMaker','balanceOf',[addresses[2]])]);
  const wins=await read(m.ctf,'ConditionalTokens','balanceOf',[addresses[2],positions[0]]);const before=await balance(addresses[2]);
  await write(2,m.ctf,'ConditionalTokens','redeemPositions',[m.token,zeroHash,s.conditionId,[1n,2n]]);assert.equal(await balance(addresses[2]),before+wins);
  assert.equal(await read(m.ctf,'ConditionalTokens','balanceOf',[addresses[2],positions[1]]),0n);await reject(2,m.registry,'AgoraRegistry','submitProof',[id,1,cert]);
 });
 await t.test('derived conditions settle from immutable chain history or elapsed deadline',async()=>{
  const resolved=await read(m.registry,'AgoraRegistry','getStatement',[id]);
  await write(3,m.registry,'AgoraRegistry','registerDerived',[1,id,0,resolved.resolvedAt,'derived']);
  const d=await read(m.registry,'AgoraRegistry','statementIds',[2n]);assert.equal(await read(m.registry,'AgoraRegistry','derivedOutcome',[d]),1);await write(3,m.registry,'AgoraRegistry','resolveDerived',[d]);
  const unresolved=m.seedMetadata[1].id;const now=(await client.getBlock()).timestamp;
  await write(3,m.registry,'AgoraRegistry','registerDerived',[3,unresolved,1,now+20n,'deadline']);const expired=await read(m.registry,'AgoraRegistry','statementIds',[3n]);await reject(3,m.registry,'AgoraRegistry','resolveDerived',[expired]);
  await provider.request({method:'evm_increaseTime',params:[21]});await provider.request({method:'evm_mine',params:[]});await write(4,m.registry,'AgoraRegistry','resolveDerived',[expired]);assert.equal((await read(m.registry,'AgoraRegistry','getStatement',[expired])).outcome,2);
 });
 await t.test('actual 2-of-2 Safe schedules registry policy through Timelock; EOA cannot bypass',async()=>{
  const profile=keccak256(toHex('NEW_PROFILE'));const manifest=keccak256(toHex('manifest'));
  await reject(0,m.registry,'AgoraRegistry','configureProfile',[profile,m.verifier,manifest]);
  const data=encodeFunctionData({abi:artifact('AgoraRegistry').abi,functionName:'configureProfile',args:[profile,m.verifier,manifest]});const salt=keccak256(toHex('test schedule'));
  const schedule=encodeFunctionData({abi:artifact('AgoraTimelock').abi,functionName:'schedule',args:[m.registry,0n,data,zeroHash,salt,5n]});const nonce=await read(m.safe,'Safe','nonce');
  const params=[m.timelock,0n,schedule,0,0n,0n,0n,zeroAddress,zeroAddress];
  const hash=await read(m.safe,'Safe','getTransactionHash',[...params,nonce]);
  const signed=await Promise.all([0,1].map(async i=>{const sig=await wallets[i].signMessage({message:{raw:hash}});return {address:addresses[i],sig:`${sig.slice(0,-2)}${(parseInt(sig.slice(-2),16)+4).toString(16)}`};}));signed.sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  await reject(0,m.safe,'Safe','execTransaction',[...params,signed[0].sig]);
  await write(0,m.safe,'Safe','execTransaction',[...params,concatHex(signed.map(x=>x.sig))]);
  await reject(3,m.timelock,'AgoraTimelock','execute',[m.registry,0n,data,zeroHash,salt]);
  await provider.request({method:'evm_increaseTime',params:[6]});await provider.request({method:'evm_mine',params:[]});await write(3,m.timelock,'AgoraTimelock','execute',[m.registry,0n,data,zeroHash,salt]);assert.equal((await read(m.registry,'AgoraRegistry','profiles',[profile]))[2],true);
 });
 await t.test('governance activates a new immutable symbol and users create custom derived markets',async()=>{
  const operatorId=keccak256(toHex('RESOLVED_AFTER_V1'));const manifestHash=keccak256(toHex('ResolvedAfterOperator uint64 deadline v1'));
  const data=encodeFunctionData({abi:artifact('AgoraRegistry').abi,functionName:'configureOperator',args:[operatorId,m.operatorCandidate,manifestHash]});const salt=keccak256(toHex('operator schedule'));const schedule=encodeFunctionData({abi:artifact('AgoraTimelock').abi,functionName:'schedule',args:[m.registry,0n,data,zeroHash,salt,5n]});const params=[m.timelock,0n,schedule,0,0n,0n,0n,zeroAddress,zeroAddress];const nonce=await read(m.safe,'Safe','nonce');const hash=await read(m.safe,'Safe','getTransactionHash',[...params,nonce]);const signatures=await Promise.all([0,1].map(async i=>{const sig=await wallets[i].signMessage({message:{raw:hash}});return{address:addresses[i],sig:`${sig.slice(0,-2)}${(parseInt(sig.slice(-2),16)+4).toString(16)}`};}));signatures.sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));await write(0,m.safe,'Safe','execTransaction',[...params,concatHex(signatures.map(s=>s.sig))]);await provider.request({method:'evm_increaseTime',params:[6]});await provider.request({method:'evm_mine',params:[]});await write(4,m.timelock,'AgoraTimelock','execute',[m.registry,0n,data,zeroHash,salt]);
  const resolved=await read(m.registry,'AgoraRegistry','getStatement',[id]);const parameters=encodeAbiParameters([{type:'uint64'}],[resolved.resolvedAt-1n]);await write(3,m.registry,'AgoraRegistry','registerCustom',[operatorId,id,parameters,'operator market']);const count=await read(m.registry,'AgoraRegistry','count');const customId=await read(m.registry,'AgoraRegistry','statementIds',[count-1n]);assert.equal(await read(m.registry,'AgoraRegistry','derivedOutcome',[customId]),1);await write(3,m.registry,'AgoraRegistry','resolveDerived',[customId]);assert.equal((await read(m.registry,'AgoraRegistry','getStatement',[customId])).outcome,1);
  await reject(0,m.registry,'AgoraRegistry','configureOperator',[operatorId,m.operatorCandidate,zeroHash]);
 });

});
