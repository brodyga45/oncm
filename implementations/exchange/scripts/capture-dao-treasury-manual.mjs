// Historical evidence only: no signer, unlocked account or sendTransaction.
import fs from 'node:fs';import assert from 'node:assert/strict';import {Contract,Interface,ZeroAddress} from 'ethers';
import {createLocalProvider} from '../sdk/local-provider.mjs';
const d=JSON.parse(fs.readFileSync('data/deployment.json')),abis=JSON.parse(fs.readFileSync('web/generated/abis.json')),p=createLocalProvider(d.rpc);
const encode=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2)+'\n';
const interfaces=Object.entries(abis).map(([name,abi])=>[name,new Interface(abi)]);
const hex=n=>'0x'+n.toString(16),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const decode=log=>{for(const [contract,iface]of interfaces){try{const e=iface.parseLog(log);if(e)return{contract,event:e.name,address:log.address,logIndex:log.logIndex,args:Object.fromEntries(e.fragment.inputs.map((a,i)=>[a.name||String(i),e.args[i]]))};}catch{}}return null;};
try{
  assert.equal((await p.getNetwork()).chainId,31372n);const head=await p.getBlockNumber();assert(head>=319);
  const registry=new Contract(d.contracts.protocol,abis.ExchangeProtocol,p),a=new Contract(d.contracts.allocation,abis.AllocationController,p),w=new Contract(d.contracts.warehouse,abis.SplitsWarehouse,p),g=new Contract(d.contracts.governor,abis.ExchangeGovernor,p);
  const id='0x6624a45383aa60c6444d0d639e4aa8f17a601fc17bfcdd6aaef4b1b2bf573d0f',s=await registry.statements(id,{blockTag:319}),m=new Contract(s.market,abis.Market,p),yes=await m.outcomeTokens(0,{blockTag:319}),no=await m.outcomeTokens(1,{blockTag:319});
  const pair='0x953E3A35cf894359778e8aB7160eD7d061F23899',lp=new Contract(pair,abis.UniswapV2Pair,p),treasury=await g.timelock({blockTag:319}),epoch3=await a.epoch(3,{blockTag:319});
  const actors={Alice:d.accounts[0],Bob:d.accounts[1],Carol:d.accounts[2],DAO:treasury,collector:d.contracts.allocation,warehouse:d.contracts.warehouse,epoch3Split:epoch3.split,ctf:d.contracts.ctf},assets={T:d.contracts.token,YES:yes,NO:no,LP:pair};
  const blocks=[];
  for(let number=266;number<=319;number++){
    const block=await p.send('eth_getBlockByNumber',[hex(number),true]),transactions=[];
    for(const transaction of block.transactions){const receipt=await p.send('eth_getTransactionReceipt',[transaction.hash]);assert.equal(receipt.status,'0x1');transactions.push({transaction,receipt,events:receipt.logs.map(decode).filter(Boolean)});}
    blocks.push({block:{number,hash:block.hash,parentHash:block.parentHash,timestamp:Number(BigInt(block.timestamp))},transactions});
  }
  const snapshots={};
  for(const number of [265,269,271,273,274,275,296,297,318,319]){
    const at={blockTag:number},currentEpoch=await a.currentEpoch(at),e=await a.epoch(currentEpoch,at),balances={},credits={};
    for(const [actor,address]of Object.entries(actors))balances[actor]=Object.fromEntries(await Promise.all(Object.entries(assets).map(async([symbol,token])=>[symbol,await new Contract(token,abis.TrueToken,p).balanceOf(address,at)])));
    for(const actor of ['Alice','Bob','Carol','DAO']){const raw=await w.balanceOf(actors[actor],BigInt(pair),at);credits[actor]={raw,withdrawable:raw>0n?raw-1n:0n};}
    snapshots[number]={epoch:String(currentEpoch),split:e.split,recipients:[...e.recipients],shares:[...e.shares],balances,credits,daoConsent3:await a.consent(3,treasury,at),lpTotalSupply:await lp.totalSupply(at),reserves:[...await lp.getReserves(at)],ctfSupply:await new Contract(d.contracts.token,abis.TrueToken,p).totalSupply(at)};
  }
  const events=n=>blocks.find(b=>b.block.number===n).transactions.flatMap(t=>t.events),mint=events(273).find(e=>same(e.address,pair)&&e.event==='Transfer'&&same(e.args.from||e.args.src,ZeroAddress)&&same(e.args.to||e.args.dst,d.contracts.allocation));assert(mint,'Actual original V2 protocol LP mint');
  const minted=BigInt(mint.args.value??mint.args.wad??mint.args.amount);
  assert.equal(snapshots[273].balances.collector.LP-snapshots[271].balances.collector.LP,minted);
  assert.equal(snapshots[274].balances.epoch3Split.LP-snapshots[273].balances.epoch3Split.LP,minted);
  assert.deepEqual(snapshots[269].shares,[2000n,4000n,4000n]);assert.deepEqual(snapshots[319].shares,[1500n,4000n,4500n]);
  assert.equal(snapshots[275].credits.DAO.withdrawable,918830339724520n);
  assert.equal(snapshots[296].balances.DAO.LP,918830339724520n);assert.equal(snapshots[296].credits.DAO.raw,1n);
  assert.equal(snapshots[297].daoConsent3,false);assert.equal(snapshots[318].daoConsent3,true);assert.equal(snapshots[319].epoch,'4');
  for(const number of Object.keys(snapshots)){assert.equal(snapshots[number].balances.ctf.T,snapshots[265].balances.ctf.T);assert.equal(snapshots[number].ctfSupply,snapshots[265].ctfSupply);}
  for(const actor of ['Alice','Bob','Carol'])assert.equal(snapshots[296].balances[actor].LP,snapshots[275].balances[actor].LP,'DAO claim cannot pay an EOA');
  assert.equal(snapshots[319].balances.DAO.LP,snapshots[296].balances.DAO.LP,'No internal payment executed');
  const claim=events(296).find(e=>e.event==='Withdraw'&&same(e.address,d.contracts.warehouse));assert(claim);assert(same(claim.args.owner,treasury));assert.equal(BigInt(claim.args.reward),0n);
  const consent=events(318).find(e=>e.event==='ConsentChanged');assert(consent);assert(same(consent.args.beneficiary,treasury));assert.equal(consent.args.approved,true);
  const governors=[];for(const number of [276,298]){const created=events(number).find(e=>e.event==='ProposalCreated');assert(created);const proposalId=created.args.proposalId;const state=await g.state(proposalId,{blockTag:319});assert.equal(state,7n);governors.push({createdAt:number,event:created,stateAt319:String(state)});}
  const payment={asset:pair,treasury,recipient:d.accounts[2],amount:'400000000000000',unit:'LP',displayAmount:'0.0004',value:'0',status:'prepared-only-no-governor-proposal',calldata:'0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc00000000000000000000000000000000000000000000000000016bcc41e90000'};
  const result={format:'exchange-dao-browser-evidence-v1',chainId:31372,fromBlock:266,throughBlock:319,capturedAtHead:head,id,market:s.market,actors,assets,mintedProtocolLP:minted,snapshots,governors,claimEvent:claim,consentEvent:consent,paymentDraft:payment,blocks,assertions:'passed',scope:'Actual browser actions. Original V2 revenue, original Split/Warehouse, Governor and Timelock; no donations/faucet/impersonation. Internal-payment proposal was never submitted. Empty local-clock blocks are preserved. No revocation, LP-to-T monetization or internal payout pass claimed.'};
  fs.mkdirSync('docs/evidence/dao-treasury',{recursive:true});fs.writeFileSync('docs/evidence/dao-treasury/through-319.json',encode(result),{flag:'wx'});
  console.log(encode({head,transactions:blocks.reduce((n,b)=>n+b.transactions.length,0),mintedProtocolLP:minted,DAO_LP:snapshots[319].balances.DAO.LP,epoch:snapshots[319].epoch,shares:snapshots[319].shares,assertions:result.assertions,payment}));
}finally{p.destroy();}
