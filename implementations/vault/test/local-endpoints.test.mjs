import test from 'node:test';import assert from 'node:assert/strict';
import {localEndpoints,assertLocalConfig} from '../sdk/local-endpoints.mjs';
test('default and explicit offset keep three services together on loopback with unchanged chain identity',()=>{
 assert.deepEqual(localEndpoints(),{offset:0,chainId:31373,rpcPort:9547,apiPort:4173,webPort:5173,rpcUrl:'http://127.0.0.1:9547',apiUrl:'http://127.0.0.1:4173',webUrl:'http://127.0.0.1:5173'});
 const e=localEndpoints('10000');assert.equal(e.rpcPort,19547);assert.equal(e.apiPort,14173);assert.equal(e.webPort,15173);
 assert.equal(assertLocalConfig({chainId:31373,rpcUrl:e.rpcUrl,localPortOffset:10000}).offset,10000);
});
test('offset cannot relax public RPC, wrong chain, mismatched port, numeric or credential constraints',()=>{
 for(const value of [-1,1.5,'01','1e3',50001,'10000/anything',''])assert.throws(()=>localEndpoints(value));
 for(const config of [{chainId:1,rpcUrl:'http://127.0.0.1:9547'},
  {chainId:31373,rpcUrl:'https://example.com'},
  {chainId:31373,rpcUrl:'http://127.0.0.1:19547'},
  {chainId:31373,rpcUrl:'http://user@localhost:9547'},
  {chainId:31373,rpcUrl:'http://127.0.0.1:9547',localPortOffset:10000}])assert.throws(()=>assertLocalConfig(config));
});
