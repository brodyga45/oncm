import fs from 'node:fs';
import {encodeBase64,sha256,toUtf8Bytes} from 'ethers';
const root=new URL('../proof/profiles/perf05/',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
export function externalFixture(name='true-registration'){
 if(!['true-registration','true-proof','false-registration','false-refutation'].includes(name))throw Error('Unknown test artifact');
 const truth=name.startsWith('true'),goal=read(`fixtures/${truth?'true':'false'}-goal.ndjson`),source=read(`fixtures/Oncm${truth?'True':'False'}.lean`).toString('utf8');
 return{format:'oncm-external-certificate-bundle-v1',artifact:JSON.parse(read('certificates/'+name+'.json')),
  goalExport:{base64:encodeBase64(goal),sha256:sha256(goal).slice(2),bytes:goal.length},
  source:{text:source,sha256:sha256(toUtf8Bytes(source)).slice(2)},metadata:{title:truth?'External logical identity':'External universal claim',description:'Author-supplied description, separate from authenticated goal export.'}};
}
