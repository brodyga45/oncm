import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
const sources={};
function collect(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())collect(p);else if(p.endsWith('.sol'))sources[p]={content:fs.readFileSync(p,'utf8')};}}
collect('contracts');
const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}}),{import:p=>{try{return{contents:fs.readFileSync(path.join('node_modules',p.replace(/^openzeppelin\//,'@openzeppelin/')),'utf8')}}catch{return{error:`Import not found: ${p}`}}}}));
for(const e of result.errors??[])if(e.severity==='error')throw Error(e.formattedMessage);
const c=result.contracts['contracts/LeanProofBridge.sol'].LeanProofBridge;
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/LeanProofBridge.json',JSON.stringify({contractName:'LeanProofBridge',compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object},null,2)+'\n');
console.log('Compiled immutable LeanProofBridge with upstream RISC Zero Groth16 verifier');
