import test from 'node:test';
import assert from 'node:assert/strict';
import { browserConfig, walletChain, selectWalletChain, publicWalletProvider } from '../sdk/public-transport.mjs';
import { assertLocalConfig } from '../sdk/local-endpoints.mjs';
import { verifyInjectedDeployment, keccak256 } from '../sdk/index.mjs';

const config = { publicMode: true, publicOrigin: 'https://vault.example', chainId: 31373, rpcUrl: 'https://vault.example/rpc' };

test('public browser uses exact HTTPS same origin without leaking loopback; local offset remains local', () => {
  assert.equal(browserConfig({...config, rpcUrl:'http://127.0.0.1:9547'}, config.publicOrigin).rpcUrl, config.rpcUrl);
  assert.equal(browserConfig(config, config.publicOrigin).apiUrl, config.publicOrigin+'/api');
  for (const origin of ['https://other.example','http://vault.example','https://user@vault.example','https://vault.example/a'])
    assert.throws(() => browserConfig(config, origin));
  const local={chainId:31373,rpcUrl:'http://127.0.0.1:19547',localPortOffset:10000};
  assert.equal(browserConfig(local,'http://127.0.0.1:15173'),local);
  assert.equal(walletChain(local),null);
  assert.throws(()=>assertLocalConfig({...local,publicMode:true}),/disabled/);
});

test('wallet add metadata preserves actual same-origin RPC and distinguishes native gas from T', () => {
  assert.deepEqual(walletChain(config), {chainId:'0x7a8d',chainName:'Vault V2 — hosted test chain',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:['https://vault.example/rpc']});
  assert.throws(()=>walletChain({...config,rpcUrl:'https://elsewhere.example/rpc'}));
});

test('unknown chain follows switch/add/switch with postcondition; no transaction or automatic account request', async () => {
  const calls=[];let selected='0x1',known=false;
  await selectWalletChain({request:async request=>{
    calls.push(request);
    if(request.method==='eth_chainId')return selected;
    if(request.method==='wallet_addEthereumChain'){known=true;return null;}
    if(request.method==='wallet_switchEthereumChain'){if(!known)throw Object.assign(Error('Unknown'),{code:4902});selected='0x7a8d';return null;}
    throw Error('Unexpected method');
  }},config);
  assert.deepEqual(calls.map(c=>c.method),['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
  assert.equal(calls[2].params[0].rpcUrls[0],config.rpcUrl);
});

test('rejected switch is not followed by alternate add; false success and wrong network fail closed',async()=>{
  const calls=[];const refusal=Object.assign(Error('User rejected'),{code:4001});
  await assert.rejects(selectWalletChain({request:async r=>{calls.push(r.method);if(r.method==='eth_chainId')return'0x1';throw refusal;}},config),e=>e===refusal);
  assert.deepEqual(calls,['eth_chainId','wallet_switchEthereumChain']);
  await assert.rejects(selectWalletChain({request:async r=>r.method==='eth_chainId'?'0x1':null},config),/did not select/);
});

test('read-only public signer rejects sends and financial typed signatures before forwarding, but permits SIWE',async()=>{
  const calls=[];const raw={request:async r=>{calls.push(r.method);return 'okay';}};
  const guarded=publicWalletProvider(raw,config);
  for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_signTransaction','eth_sign','eth_signTypedData_v4'])
    await assert.rejects(guarded.request({method}),/read-only/);
  assert.equal(await guarded.request({method:'personal_sign'}),'okay');
  assert.deepEqual(calls,['personal_sign']);
  const ready=publicWalletProvider(raw,{...config,publicWriteEnabled:true,capabilities:{walletTransactions:true}});
  assert.equal(await ready.request({method:'eth_sendTransaction'}),'okay');
  assert.equal(publicWalletProvider(raw,{}),raw);
});

test('same chain ID alone is insufficient: injected RPC must contain the actual pinned V2 registry and T code', async()=>{
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),code='0x60016000';
  const pinned={...config,addresses:{StatementRegistry:a,TrueToken:b},monetaryPolicy:{runtimeHashes:{[a]:keccak256(code),[b]:keccak256(code)}}};
  const reads=[];
  await verifyInjectedDeployment({getCode:async address=>{reads.push(address);return code;}},pinned);
  assert.deepEqual(reads,[a,b]);
  for(const wrong of ['0x','0x6002']) await assert.rejects(verifyInjectedDeployment({getCode:async()=>wrong},pinned),/does not match/);
  await assert.rejects(verifyInjectedDeployment({getCode:async()=>code},{...pinned,monetaryPolicy:{runtimeHashes:{}}}),/does not match/);
});
