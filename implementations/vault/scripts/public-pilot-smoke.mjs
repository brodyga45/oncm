// Explicit integration check against this existing valueless local pilot.
// A fresh key stays in memory; output contains only public evidence.
import {Wallet, HDNodeWallet, JsonRpcProvider, parseEther, Contract} from 'ethers';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createSDK} from '../sdk/index.mjs';
const origin='https://sasquatch-impart-basil.ngrok-free.dev';
const output=new URL('../evidence/public-pilot/public-transport.json',import.meta.url);
const {config,abis}=await (await fetch(origin+'/api/config')).json();
assert.equal(config.chainId,31373);assert.equal(config.publicMode,true);
const local=new JsonRpcProvider('http://127.0.0.1:9547',31373,{batchMaxCount:1,cacheTimeout:-1});
const remote=new JsonRpcProvider(origin+'/rpc',31373,{batchMaxCount:1,cacheTimeout:-1});
remote.pollingInterval=2000;
try {
  assert.equal((await remote.getNetwork()).chainId,31373n);
  const owner='0x4B5D2B35F36a3AC018D5c9a9C394Fadae667Fb2f';
  const token=new Contract(config.addresses.TrueToken,abis.TrueToken,remote);
  const before={eth:String(await remote.getBalance(owner)),t:String(await token.balanceOf(owner)),supply:String(await token.totalSupply())};
  const oldHash='0xafa3c0e2a725aad5ea58974e216ee1652fba6c888243e7e3245d9e515b0dc5ad';
  const old=await remote.getTransactionReceipt(oldHash);assert.equal(old.status,1);assert.equal(old.blockNumber,584);
  const block584=await remote.getBlock(584),block668=await remote.getBlock(668),latest=await remote.getBlock('latest');
  assert.ok(block668.timestamp>=block584.timestamp&&latest.timestamp>=block668.timestamp);
  const testWallet=Wallet.createRandom().connect(remote);
  const faucet=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk').connect(local);
  const funding=await (await faucet.sendTransaction({to:testWallet.address,value:parseEther('0.002')})).wait();
  const sdk=createSDK(config,abis,testWallet);
  const receipt=await sdk.social.updateProfile('Public transport smoke','Test profile written through signed public RPC.');
  assert.equal(receipt.status,1);
  const uid=await sdk.social.resolver.latestProfile(testWallet.address);
  const attestation=await sdk.social.eas.getAttestation(uid);
  assert.equal(attestation.attester,testWallet.address);
  const after={eth:String(await remote.getBalance(owner)),t:String(await token.balanceOf(owner)),supply:String(await token.totalSupply())};
  assert.deepEqual(after,before);
  const denied=await (await fetch(origin+'/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'evm_mine',params:[]})})).json();
  assert.equal(denied.error.code,-32601);
  const evidence={format:'vault-public-transport-smoke-v1',checkedAt:new Date().toISOString(),origin,chainId:31373,
    restoredReceipt:{hash:oldHash,block:old.blockNumber,status:old.status},timestamps:{block584:block584.timestamp,block668:block668.timestamp,latest:latest.timestamp},
    testAddress:testWallet.address,funding:{hash:funding.hash,block:funding.blockNumber,amount:'0.002 local test ETH'},
    publicProfile:{hash:receipt.hash,block:receipt.blockNumber,gasUsed:String(receipt.gasUsed),uid,attester:attestation.attester},
    ownerBalancesUnchanged:after,adminMethodRejected:denied.error.code,
    browserWalletTransactionTested:false};
  await writeFile(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
} finally {local.destroy();remote.destroy();}
