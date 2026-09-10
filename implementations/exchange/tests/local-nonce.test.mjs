import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {JsonRpcProvider,HDNodeWallet} from 'ethers';
import {createLocalProvider,rpcErrorMessage} from '../sdk/local-provider.mjs';

const report={scope:'Isolated ephemeral Ganache, never RPC9546. Zero-value self-transactions only.',cases:[]};
test('Fresh local nonce reads permit immediate receipt-to-next-transaction sequencing',async()=>{
 const server=ganache.server({chain:{chainId:31372,hardfork:'shanghai'},logging:{quiet:true},wallet:{mnemonic:'test test test test test test test test test test test junk',totalAccounts:2}});
 await server.listen(0,'127.0.0.1');
 try{
  for(const disabled of [false,true]){
   const url='http://127.0.0.1:'+server.address().port;
   const provider=disabled?createLocalProvider(url):new JsonRpcProvider(url);
   const signer=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,`m/44'/60'/0'/0/${disabled?1:0}`).connect(provider);
   const item={cacheTimeout:disabled?-1:'default250',receipts:[],error:null};
   // Seed a nonzero nonce, like the already-used wallets in the running application.
   await provider.send('eth_sendTransaction',[{from:signer.address,to:signer.address,value:'0x0'}]);
   try{
    for(let i=0;i<3;i++){const tx=await signer.sendTransaction({to:signer.address,value:0,data:'0x0'+(i+1)});const receipt=await tx.wait();item.receipts.push({nonce:tx.nonce,hash:tx.hash,block:receipt.blockNumber,status:receipt.status});}
   }catch(e){item.error={code:e.code,shortMessage:e.shortMessage,message:e.error?.message||e.info?.error?.message||e.reason||e.message};}
   finally{await provider.destroy();}
   report.cases.push(item);
   if(disabled){assert.equal(item.error,null);assert.deepEqual(item.receipts.map(r=>r.nonce),[1,2,3]);}
  }
 }finally{await server.close();fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/local-nonce-diagnostic.json',JSON.stringify(report,null,2)+'\n');}
});

test('RPC errors expose the underlying reason without serializing raw transaction fields',()=>{
 assert.equal(rpcErrorMessage({shortMessage:'could not coalesce error',error:{message:'account nonce2, tx nonce1'},payload:{params:['private raw transaction']}}),'could not coalesce error: account nonce2, tx nonce1');
 assert.equal(rpcErrorMessage({shortMessage:'execution reverted',info:{error:{message:'Insufficient allowance'}}}),'execution reverted: Insufficient allowance');
 assert.equal(rpcErrorMessage({message:'Wallet changed'}),'Wallet changed');
 assert.equal(rpcErrorMessage({error:{message:'x'.repeat(2000)}}).length,1600);
});
