import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
const root=path.resolve(import.meta.dirname,'..');
const sources=Object.fromEntries(['contracts/social/ExchangeSocialHook.sol','ecp/src/CommentManager.sol'].map(name=>[name,{content:fs.readFileSync(path.join(root,name.startsWith('ecp/')?'vendor/social/'+name:name),'utf8')}]));
const input={language:'Solidity',sources,settings:{evmVersion:'shanghai',viaIR:true,optimizer:{enabled:true,runs:100},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.bytecode.linkReferences','evm.deployedBytecode.object']}}}};
const result=JSON.parse(solc.compile(JSON.stringify(input),{import(name){
 let relative=name.startsWith('@openzeppelin/contracts/')?'oz/'+name.slice('@openzeppelin/contracts/'.length):name;
 try{return{contents:fs.readFileSync(path.join(root,'vendor/social',relative),'utf8')}}catch{return{error:'Missing isolated social dependency '+relative}}
}}));
for(const error of result.errors||[]) if(error.severity==='error') console.error(error.formattedMessage);
if(result.errors?.some(e=>e.severity==='error'))process.exit(1);
const output=path.join(root,'artifacts/social');fs.mkdirSync(output,{recursive:true});const abis={};const sizes={};
for(const [file,contracts] of Object.entries(result.contracts))for(const [name,a] of Object.entries(contracts)){
 if(!a.evm.bytecode.object)continue;
 const size=a.evm.deployedBytecode.object.length/2;if(size>24576)throw Error(name+' exceeds EIP170: '+size);
 const artifact={contractName:name,sourceName:file,compiler:solc.version(),evmVersion:'shanghai',abi:a.abi,bytecode:'0x'+a.evm.bytecode.object,linkReferences:a.evm.bytecode.linkReferences,deployedBytecode:'0x'+a.evm.deployedBytecode.object};
 fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(artifact,null,2));abis[name]=a.abi;sizes[name]=size;
}
fs.writeFileSync(path.join(root,'web/generated/social-abis.json'),JSON.stringify(abis));fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({compiler:solc.version(),evmVersion:'shanghai',sizes},null,2));console.log(JSON.stringify({status:'compiled',target:'shanghai',sizes}));
