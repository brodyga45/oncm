import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import solc from 'solc';
export const root=fileURLToPath(new URL('..',import.meta.url));
export function compileSocial(extra={}){
 const source='contracts/AgoraSocial.sol',vendor='contracts/vendor/solady/SSTORE2.sol';
 const sources=Object.fromEntries([source,vendor].map(p=>[p,{content:fs.readFileSync(path.join(root,p),'utf8')}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{...sources,...extra},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
 for(const e of output.errors??[])if(e.severity==='error')throw Error(e.formattedMessage);
 return Object.fromEntries(Object.entries(output.contracts).flatMap(([file,items])=>Object.entries(items).filter(([,c])=>c.evm.bytecode.object).map(([name,c])=>[name,{contractName:name,source:file,compiler:solc.version(),evmVersion:'shanghai',abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object}])));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const artifact=compileSocial().AgoraSocial;fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/AgoraSocial.json'),JSON.stringify(artifact,null,2)+'\n');console.log(JSON.stringify({contract:'AgoraSocial',runtimeBytes:(artifact.deployedBytecode.length-2)/2,compiler:artifact.compiler}));}
