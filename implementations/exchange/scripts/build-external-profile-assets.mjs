// Reproduce trusted policy assets from this standalone app. No chain calls or proving.
import fs from 'node:fs';
import {sha256} from 'ethers';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const perf=json('proof/profiles/perf05/profile.json'),v3=json('proof/manifest.json'),deployment=json('proof/deployment.json');
if(v3.profileId!==deployment.profileId||v3.imageId!==deployment.args[0])throw Error('v3 deployment/profile mismatch');
const foundationPath='proof/profiles/perf05/fixtures/foundation.ndjson';
const perfFoundation=read('proof/profiles/perf05/fixtures/true-goal.ndjson').subarray(0,perf.foundationBytes);
if(sha256(perfFoundation).slice(2)!==perf.foundationSha256)throw Error('perf05 foundation prefix pin mismatch');
// The exact prefix is already bundled; materialize it independently for users preparing external packages.
fs.writeFileSync(new URL(foundationPath,root),perfFoundation);
const selector='0x73c457ba',verifierParameters='0x73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc';
const rows=[[perf,'perf05','Lean logic · perf05 · zero axioms',sha256(read('proof/profiles/perf05/profile.json')),foundationPath],
 [v3,'v3','Lean arithmetic · v3',deployment.manifest,'proof/lean/foundation.ndjson']];
const assets=rows.map(([p,id,label,manifest,path])=>{
 const bytes=read(path);if(sha256(bytes).slice(2)!==p.foundationSha256)throw Error('Foundation changed: '+id);
 return{descriptor:{id,label,profileId:p.profileId,imageId:p.imageId,foundationSha256:p.foundationSha256,manifest,selector,verifierParameters},foundationBase64:bytes.toString('base64')};
});
fs.writeFileSync(new URL('sdk/external-profile-assets.mjs',root),'// Generated from pinned standalone policy files; no theorem allowlist.\nexport const externalProfileAssets='+JSON.stringify(assets)+';\n');
console.log('Generated two trusted profile/foundation assets. No compilation or chain action.');
