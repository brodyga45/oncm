import test from 'node:test';
import assert from 'node:assert/strict';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
test('Default local deployment endpoints remain unchanged; isolated offset preserves chain and loopback',()=>{
 const current=localEndpoints();assert.equal(current.rpc,'http://127.0.0.1:9546');assert.equal(current.apiPort,4172);assert.equal(current.webPort,5172);
 const isolated=localEndpoints('10000');assert.equal(isolated.rpcPort,19546);assert.equal(isolated.apiPort,14172);assert.equal(isolated.webPort,15172);assert.equal(isolated.chainId,31372);
 assert(isolated.browserOrigins.every(u=>['127.0.0.1','localhost'].includes(new URL(u).hostname)));
});
test('Non-numeric/negative/overflow or arbitrary URL configuration cannot redirect local dev-wallet RPC',()=>{
 for(const input of ['-1','1.5','0x100','+1','01','56000','http://example.com','0\n'])assert.throws(()=>localEndpoints(input));
});
