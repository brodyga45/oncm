import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runtimeFiles,readRuntimeDeployment,assertSameRuntime} from '../server/runtime-version.mjs';

const address=n=>'0x'+n.toString(16).padStart(40,'0');
function config(version='legacy') {
  return {chainId:31373,chainInstance:{id:'same-persistent-chain'},rpcUrl:'http://127.0.0.1:9547',
    ...(version==='2'?{protocolVersion:'2',monetaryPolicy:{version:'vault-monetary-v1',status:'deployed'}}:{}),
    addresses:{StatementRegistry:address(1),TrueToken:address(2),PoolCoordinator:address(3),Vault:address(4)}};
}
function temporary(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-versions-'));
  fs.mkdirSync(path.join(root,'.state'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}

test('requesting V2 never falls back to or overwrites a populated legacy deployment',t=>{
  const root=temporary(t),legacy=runtimeFiles(root),v2=runtimeFiles(root,'2');
  const original=JSON.stringify(config());fs.writeFileSync(legacy.deployment,original);
  assert.equal(readRuntimeDeployment(legacy).addresses.TrueToken,address(2));
  assert.throws(()=>readRuntimeDeployment(v2),/deploy the selected protocol version explicitly/);
  assert.equal(fs.readFileSync(legacy.deployment,'utf8'),original);
  assert.equal(fs.existsSync(v2.deployment),false);
});

test('V2 config and all persisted public/private stores are distinct from legacy',t=>{
  const root=temporary(t),legacy=runtimeFiles(root),v2=runtimeFiles(root,'2');
  for(const key of ['deployment','abis','social','community','publications'])assert.notEqual(v2[key],legacy[key]);
  fs.writeFileSync(v2.deployment,JSON.stringify(config()));
  assert.throws(()=>readRuntimeDeployment(v2),/version does not match/);
  const next=config('2');delete next.monetaryPolicy;fs.writeFileSync(v2.deployment,JSON.stringify(next));
  assert.throws(()=>readRuntimeDeployment(v2),/lacks deployed monetary policy/);
  next.monetaryPolicy={version:'vault-monetary-v1',status:'planned'};fs.writeFileSync(v2.deployment,JSON.stringify(next));
  assert.throws(()=>readRuntimeDeployment(v2),/lacks deployed monetary policy/);
  fs.writeFileSync(v2.deployment,JSON.stringify(config('2')));
  assert.equal(readRuntimeDeployment(v2).protocolVersion,'2');
});

test('same chain and same governance do not let startup accept the wrong API graph',()=>{
  const expected=config('2');
  assert.doesNotThrow(()=>assertSameRuntime(structuredClone(expected),expected));
  assert.throws(()=>assertSameRuntime(config(),expected),/another protocol deployment/);
  for(const key of ['TrueToken','StatementRegistry','PoolCoordinator','Vault']){
    const actual=structuredClone(expected);actual.addresses[key]=address(9);
    assert.throws(()=>assertSameRuntime(actual,expected),new RegExp(key));
  }
  const foreign=structuredClone(expected);foreign.chainInstance.id='other-chain';
  assert.throws(()=>assertSameRuntime(foreign,expected),/another protocol deployment/);
});

test('invalid version names cannot select arbitrary files',()=>{
  for(const value of ['','v2','../deployment','../../x',2])assert.throws(()=>runtimeFiles('/tmp',value),/must be legacy or 2/);
});
