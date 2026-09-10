import * as derived from '../src/derived-review.mjs';
import * as creation from '../src/create-flow.mjs';
import * as liquidity from '../sdk/liquidity-preview.mjs';
// Exercise the actual SFC setup handlers with Vue refs and a dummy EIP-1193
// provider. No browser, chain, signature RPC or server is involved.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {EventEmitter} from 'node:events';
import * as external from '../sdk/external-bundle.mjs';
import * as vue from 'vue';import * as chain from '../sdk/chain.mjs';import * as viem from 'viem';import * as amounts from '../sdk/amounts.mjs';
import * as packages from '../sdk/source-package.mjs';import * as drafts from '../src/import-draft.mjs';import * as selection from '../src/proof-selection.mjs';
import * as scopes from '../src/wallet-scope.mjs';import * as session from '../src/session-client.mjs';import * as markets from '../src/market-view.mjs';
const tick=()=>new Promise(r=>setImmediate(r));const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const script=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/import\s*(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*from\s*['"][^'"]+['"];?/g,'');
function setup(extra={}){
 const provider=new EventEmitter(),timers=[],requests=[];let addresses=[chain.devAccounts[0].address],chainId='0x7a8b';
 provider.request=async({method})=>method==='eth_chainId'?chainId:method==='eth_accounts'||method==='eth_requestAccounts'?addresses:null;
 const fetch=async(url,options)=>{requests.push({url,options});const custom=await extra.fetch?.(url,options);const body=custom??(url==='/api/markets'?{markets:[],observedBlock:'54'}:url.includes('/allocations')?{recipients:[],shares:[]}:url==='/api/governance'?{proposals:[]}:url==='/api/operators'||url==='/api/jobs'?[]:{});return{ok:true,json:async()=>body};};
 const bindings={...derived,...creation,...liquidity,...vue,...chain,...viem,...amounts,...packages,...drafts,...selection,...scopes,...session,...markets,...external,
  pc:extra.pc??{},fetch,window:{ethereum:provider},onMounted:()=>{},onUnmounted:()=>{},
  createWalletScope:()=>scopes.createWalletScope({setTimer:fn=>{timers.push(fn);return fn;},clearTimer:fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);}}),
 };
 const names=Object.keys(bindings).filter(k=>/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)&&k!=='default');
 const app=Function(...names,script+'\nreturn {connect,signin,clearPrivateContext,switchRole,startJob,applyPackage,wallet,account,role,sessionAddress,sessionToken,form,registration,proofSource,proofCertificate,jobs,shelf,notebook,profileDraft,error,notice,config,importedPackage,published,socialContextEpoch,importExternalCertificate,externalArtifactText,selectedId,list,page,proofOutcome,proofBinding,importExternalFile,importExternalText,packageJSON,importPackage,importPastedPackage,resolveDerivedFromState};')(...names.map(k=>bindings[k]));
 app.config.value={profileId:'0x'+'11'.repeat(32)};
 return {app,provider,timers,requests,setAccounts:a=>{addresses=a;provider.emit('accountsChanged',a);},setChain:c=>{chainId=c;provider.emit('chainChanged',c);}};
}
test('actual injected account/network handlers clear private drafts, jobs and SIWE; local switch removes listeners',async()=>{
 const h=setup(),a=h.app;await a.connect();a.form.value.source='private theorem';a.proofSource.value='private proof';a.proofCertificate.value='0xprivate';a.jobs.value=[{input:{source:'private'}}];a.shelf.value=[{notes:'private'}];a.notebook.value=[{source:'private'}];a.sessionAddress.value=a.account.value;a.sessionToken.value='old token';
 const oldSocialEpoch=a.socialContextEpoch.value;h.setAccounts([chain.devAccounts[1].address]);assert.ok(a.socialContextEpoch.value>oldSocialEpoch);assert.equal(a.sessionToken.value,'');assert.equal(a.jobs.value.length,0);assert.equal(a.shelf.value.length,0);assert.equal(a.notebook.value.length,0);assert.equal(a.proofCertificate.value,'');assert.notEqual(a.form.value.source,'private theorem');
 await tick();assert.equal(a.account.value,chain.devAccounts[1].address);assert.equal(a.sessionAddress.value,'');
 h.setChain('0x1');await tick();assert.equal(a.wallet.value,null);assert.equal(a.account.value,'');assert.match(a.error.value,/network changed/);
 a.role.value=0;await a.switchRole();assert.equal(h.provider.listenerCount('accountsChanged'),0);assert.equal(a.account.value,chain.devAccounts[0].address);
});
test('actual sign-in cannot finish verification after account context was invalidated',async()=>{
 const d=deferred();const h=setup({fetch:url=>url==='/api/auth/challenge'?{message:'test SIWE'}:undefined});
 h.app.wallet.value={signMessage:()=>d.promise};const pending=h.app.signin();await tick();h.app.clearPrivateContext();d.resolve('old signature');await assert.rejects(pending,scopes.StaleWalletContext);
 assert.equal(h.app.sessionToken.value,'');assert.equal(h.requests.some(r=>r.url==='/api/auth/verify'),false);
});
test('actual job poll handles disappearance without TypeError or automatic retry',async()=>{
 let owner;const h=setup({fetch:(url,options)=>url==='/api/jobs'&&options.method==='POST'?{id:'job',owner,input:{action:'check',source:'theorem'},status:'queued'}:undefined});owner=h.app.account.value;
 h.app.sessionAddress.value=owner;h.app.sessionToken.value='test session';await h.app.startJob('check','theorem');assert.equal(h.timers.length,1);h.timers.shift()();await tick();assert.equal(h.timers.length,0);assert.match(h.app.notice.value,/no longer available/);assert.equal(h.app.error.value,'');
});
test('actual package application never enables registration from imported artifact or caller catalog id',()=>{
 const h=setup(),p=packages.withFileHashes({id:'published-looking',source:'theorem',sourceOnly:true,files:{'Statement.lean':'theorem'},registrationCertificate:'0x1234',validation:{nativeLabel:'claimed pass'}});
 h.app.applyPackage(p);assert.equal(h.app.registration.value,null);assert.equal(h.app.importedPackage.value.catalogVerified,false);assert.equal(h.app.form.value.kind,'0');
 assert.throws(()=>h.app.applyPackage({id:'published-looking',source:'theorem'}));
});
test('website rejects certificate generation before sign-in or any job request; native checks remain usable',async()=>{
 const h=setup();for(const action of ['register','prove'])await assert.rejects(h.app.startJob(action,'source'),/Prepare certificates externally/);
 assert.equal(h.requests.length,0);assert.equal(h.timers.length,0);
 // The separate native check still reaches the existing authorized job flow,
 // as tested by the real startJob check/poll test above.
 const template=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8').split('<template>')[1];
 assert.doesNotMatch(template,/startJob\('(register|prove)'/);
 assert.match(template,/startJob\('check'/);assert.match(template,/Load published registration JSON/);assert.match(template,/Load published settlement JSON/);
 assert.match(template,/Verify & use registration/);assert.match(template,/Verify & load settlement certificate/);
});

test('generic registration import rejects source edits while verification is pending',async()=>{
 const d=deferred(),h=setup({fetch:(url)=>url==='/api/certificates/import-bundle'?d.promise:undefined}),a=h.app;
 a.page.value='create';const pending=a.importExternalCertificate({format:'oncm-external-certificate-bundle-v1'});await tick();a.form.value.source='A new source draft';
 d.resolve({generic:true,status:'verified-external',outcome:0,source:'Old source',goalHash:'oldgoal',profileId:a.config.value.profileId,metadata:{title:'Old title'},certificate:'0x11'});await pending;
 assert.equal(a.registration.value,null);assert.equal(a.form.value.source,'A new source draft');assert.match(a.error.value,/changed during verification/);
});
test('generic settlement import rejects A → B → A selection and changed JSON during read-only verification',async()=>{
 for(const change of ['selection','json']){const d=deferred(),h=setup({fetch:url=>url==='/api/certificates/import-bundle'?d.promise:undefined}),a=h.app;a.page.value='detail';a.selectedId.value='A';
  const pending=a.importExternalCertificate({format:'oncm-external-certificate-bundle-v1'},true);await tick();if(change==='selection'){a.selectedId.value='B';a.selectedId.value='A';}else a.externalArtifactText.value='different artifact';
  d.resolve({outcome:1,goalHash:'goal',profileId:a.config.value.profileId,certificate:'0x11'});await pending;assert.equal(a.proofCertificate.value,'');assert.equal(a.proofBinding.value,null);
 }
});

test('generic import keeps supplied labels separate from semantic status and never submits a transaction or job',async()=>{
 const result={generic:true,status:'verified-external',outcome:0,source:'unverified source rendering',sourceGoalRelation:'not-verified',sourceSha256:'a'.repeat(64),goalHash:'0x'+'1'.repeat(64),profileId:'0x'+'2'.repeat(64),metadata:{title:'Custom supplied title',description:'Custom supplied description'},certificate:'0x11',registrationCertificate:'0x11',enabled:true};
 const h=setup({fetch:url=>url==='/api/certificates/import-bundle'?result:url.startsWith('/api/certificate-profiles/')?{enabled:true}:undefined}),a=h.app;a.page.value='create';await a.importExternalCertificate({format:'oncm-external-certificate-bundle-v1'});
 assert.equal(a.form.value.title,'Custom supplied title');assert.equal(a.form.value.description,'Custom supplied description');assert.equal(a.registration.value.sourceGoalRelation,'not-verified');assert.equal(a.registration.value.enabled,true);assert.equal(h.requests.some(r=>r.url==='/api/jobs'||r.url==='/api/metadata'),false);
});
test('oversized external file fails before file read and clears previous import',async()=>{
 const h=setup(),a=h.app;let read=false;a.registration.value={registrationCertificate:'0xold'};await a.importExternalFile({target:{files:[{size:external.EXTERNAL_BUNDLE_LIMITS.wrapper+1,text:async()=>{read=true;return'{}';}}],value:'file'}});assert.equal(read,false);assert.equal(a.registration.value,null);assert.match(a.error.value,/2 MiB/);
});

test('actual file and paste imports preserve the exact JSON bytes through the API envelope',async()=>{
 const raw='  {\n "format": "oncm-external-certificate-bundle-v1"\n}\n';
 for(const mode of ['file','paste']){const h=setup({fetch:url=>url==='/api/certificates/import-bundle'?{outcome:0,source:'',generic:true,metadata:{},goalHash:'0x1234',profileId:'profile',status:'verified-external'}:undefined}),a=h.app;a.page.value='create';
  if(mode==='file')await a.importExternalFile({target:{files:[{size:raw.length,text:async()=>raw}],value:'file'}});else{a.externalArtifactText.value=raw;await a.importExternalText();}
  const request=h.requests.find(r=>r.url==='/api/certificates/import-bundle');assert.equal(JSON.parse(request.options.body).bundle,raw);
 }
});

test('actual pasted and file package handlers use identical strict validation and never trust certificates',async()=>{
 const p=packages.withFileHashes({source:'theorem',files:{'Statement.lean':'theorem'},profileId:'0x'+'22'.repeat(32),goalHash:'0x'+'33'.repeat(32),registrationCertificate:'0x1234'}),raw=JSON.stringify(p);
 const pasted=setup().app,file=setup().app;pasted.packageJSON.value=raw;await pasted.importPastedPackage();await file.importPackage({target:{files:[{size:raw.length,text:async()=>raw}],value:'selected'}});
 assert.deepEqual(pasted.importedPackage.value,file.importedPackage.value);assert.equal(pasted.registration.value,null);assert.equal(file.registration.value,null);assert.equal(pasted.importedPackage.value.profileId,p.profileId);
 pasted.registration.value={registrationCertificate:'previous'};pasted.packageJSON.value=JSON.stringify({...p,files:{'Statement.lean':'tampered'}});await pasted.importPastedPackage();assert.match(pasted.error.value,/file hash mismatch/);assert.equal(pasted.registration.value,null);assert.equal(pasted.form.value.source,'theorem');
 pasted.clearPrivateContext();assert.equal(pasted.packageJSON.value,'');
});

test('derived resolve preflight reports pending without write and rejects changed wallet while reading',async()=>{
 const d=deferred(),h=setup({pc:{readContract:()=>d.promise}}),a=h.app;a.selectedId.value='predicate';a.config.value.abis={AgoraRegistry:[]};const pending=a.resolveDerivedFromState();a.clearPrivateContext();d.resolve(1);await assert.rejects(pending,scopes.StaleWalletContext);assert.equal(h.requests.length,0);
 const h2=setup({pc:{readContract:async()=>0}});h2.app.selectedId.value='pending';h2.app.config.value.abis={AgoraRegistry:[]};await assert.rejects(h2.app.resolveDerivedFromState(),/Pending:.*No resolution transaction/);assert.equal(h2.requests.length,0);
});
