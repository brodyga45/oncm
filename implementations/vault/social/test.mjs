import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {ContractFactory,JsonRpcProvider,HDNodeWallet,NonceManager,ZeroHash,solidityPackedKeccak256,toBeHex} from 'ethers';
import {createOnchainSocial,encodeSocial} from '../sdk/social.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(path.join(root,'.toolchain/anvil'),['--host','127.0.0.1','--port','19547','--chain-id','31373','--threads','1','--silent'],{stdio:'ignore',env:{...process.env,RAYON_NUM_THREADS:'1',TOKIO_WORKER_THREADS:'1'}});
const provider=new JsonRpcProvider('http://127.0.0.1:19547',undefined,{cacheTimeout:-1});provider.pollingInterval=30;
const artifact=n=>JSON.parse(fs.readFileSync(path.join(root,'social/artifacts',n+'.json')));
const results=[];
try {
  for(let i=0;;i++) {try{await provider.getBlockNumber();break;}catch(e){if(i>30)throw e;await new Promise(r=>setTimeout(r,50));}}
  const wallets=[0,1,2].map(i=>new NonceManager(HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,`m/44'/60'/0'/0/${i}`).connect(provider)));
  const [owner,voter,other]=await Promise.all(wallets.map(w=>w.getAddress()));
  async function deploy(n,args=[]) {const a=artifact(n),c=await new ContractFactory(a.abi,a.bytecode,wallets[0]).deploy(...args);await c.waitForDeployment();return c;}
  const registry=await deploy('TestSocialRegistry'),schemaRegistry=await deploy('SchemaRegistry'),eas=await deploy('EAS',[await schemaRegistry.getAddress()]);
  const resolver=await deploy('VaultSocialResolver',[await eas.getAddress(),await registry.getAddress()]);
  const config={chainId:31373,social:{eas:await eas.getAddress(),schemaRegistry:await schemaRegistry.getAddress(),resolver:await resolver.getAddress(),deploymentBlock:1,
    schemas:{profile:await resolver.profileSchema(),entry:await resolver.entrySchema(),vote:await resolver.voteSchema()}}};
  const [s,v,o]=wallets.map(w=>createOnchainSocial(config,w));
  const pass=(name)=>{results.push({name,passed:true});console.log('PASS '+name);};
  async function reject(name,fn) {await assert.rejects(fn);pass(name);}
  const sid=toBeHex(1,32),sid2=toBeHex(2,32);
  await s.updateProfile('Исследователь','Полная биография αβ');
  const first=await resolver.latestProfile(owner),stored=await eas.getAttestation(first);
  assert.equal(stored.attester,owner);assert.ok(stored.data.length>100);assert.equal((await s.profile(owner)).bio,'Полная биография αβ');pass('real EAS stores full Unicode profile and direct wallet author');
  await s.updateProfile('Имя 2','Правка');assert.equal((await eas.getAttestation(first)).data,stored.data);assert.equal((await s.profile(owner)).history.length,1);pass('profile revisions retain exact original storage');
  await reject('stale profile revision rejected',()=>s.updateProfile('Fork','bio',{previousUID:first}));wallets[0].reset();
  const request=(schema,data,refUID=ZeroHash,recipient=owner)=>({schema,data:{recipient,expirationTime:0,revocable:false,refUID,data,value:0}});
  for(const kind of ['profile','entry','vote']) {
    const originalSchema=await schemaRegistry.getSchema(config.social.schemas[kind]);
    assert.equal(originalSchema.resolver,await resolver.getAddress());assert.equal(originalSchema.revocable,false);
  }pass('constructor registers exact immutable schemas in original SchemaRegistry');
  await reject('recipient cannot spoof another profile author',()=>eas.attest.staticCall(request(config.social.schemas.profile,encodeSocial('profile',['Fake','',ZeroHash]),ZeroHash,voter)));
  await reject('noncanonical ABI cannot bypass schema policy',()=>eas.attest.staticCall(request(config.social.schemas.profile,encodeSocial('profile',['A','',ZeroHash])+'00')));
  await reject('byte limit is enforced onchain, not only SDK',()=>eas.attest.staticCall(request(config.social.schemas.profile,encodeSocial('profile',['A','a'.repeat(2049),ZeroHash]))));
  await s.createEntry({statementId:sid,text:'Исходный комментарий'});const firstComment=(await s.comments(sid))[0],cid=firstComment.id;
  await s.editEntry(cid,{text:'Новая редакция'});const edited=(await s.comments(sid))[0];assert.equal(edited.history[0].text,'Исходный комментарий');assert.equal(edited.id,cid);pass('comment revisions preserve root and full history');
  await reject('foreign author cannot edit',()=>v.editEntry(cid,{text:'hijack'}));
  await reject('stale entry edit rejected',()=>s.editEntry(cid,{text:'fork'},{previousUID:firstComment.uid}));wallets[0].reset();
  await reject('context cannot move on revision',()=>eas.attest.staticCall(request(config.social.schemas.entry,encodeSocial('entry',[2,sid2,cid,ZeroHash,edited.uid,'','move',false]),edited.uid)));
  await reject('reply cannot cross statement context',()=>s.createEntry({statementId:sid2,parentId:cid,text:'wrong context'}));wallets[0].reset();
  await reject('unknown statement rejected',()=>s.createEntry({statementId:toBeHex(3,32),text:'unknown'}));wallets[0].reset();
  await v.createEntry({statementId:sid,parentId:cid,text:'Ответ'});const reply=(await s.comments(sid)).find(x=>x.parentId===cid);
  await o.createEntry({statementId:sid,parentId:reply.id,text:'Вложенный ответ'});assert.deepEqual((await s.comments(sid)).map(x=>x.depth),[0,1,2]);pass('threaded replies rebuild from chain after parent edit');
  await reject('self-vote rejected by resolver',()=>s.vote(cid,1));wallets[0].reset();
  await v.vote(cid,1);const voteUID=(await resolver.votes(cid,voter)).uid;assert.equal(await resolver.scores(cid),1n);
  await v.vote(cid,-1);assert.equal(await resolver.scores(cid),-1n);
  await reject('stale vote fork rejected',()=>v.vote(cid,0,{previousUID:voteUID}));wallets[1].reset();
  await v.vote(cid,0);assert.equal(await resolver.scores(cid),0n);assert.equal((await s.comments(sid))[0].voteHistory.length,3);pass('one current vote with +1 to -1 to 0 and immutable history');
  await reject('direct invalid vote value rejected',()=>eas.connect(wallets[1]).attest.staticCall(request(config.social.schemas.vote,encodeSocial('vote',[cid,ZeroHash,2]),cid,voter)));
  await s.createEntry({kind:1,title:'Личный журнал',text:'Полный текст публикации'});const post=(await s.blog(owner))[0];
  await v.createEntry({parentId:post.id,text:'Обсуждение записи'});assert.equal((await s.blogThread(post.id)).length,1);pass('personal blog and its separate reply context stored onchain');
  await s.editEntry(post.id,{title:'Редакция журнала',text:'Новый полный текст'});assert.equal((await s.blog(owner))[0].history[0].text,'Полный текст публикации');
  await s.editEntry(post.id,{deleted:true});
  const freshBlogReader=createOnchainSocial(config,provider);
  assert.equal((await freshBlogReader.blog(owner))[0].deleted,true);
  assert.equal((await freshBlogReader.blogThread(post.id))[0].text,'Обсуждение записи');
  pass('hidden blog remains selectable and its existing reply is readable after fresh RPC rebuild');
  await reject('hidden blog cannot receive a new direct reply',()=>o.createEntry({parentId:post.id,text:'late blog reply'}));wallets[2].reset();
  await s.editEntry(post.id,{deleted:false});assert.equal((await s.blog(owner))[0].text,'Новый полный текст');
  await v.vote(cid,1);await s.editEntry(cid,{deleted:true});await v.vote(cid,0);assert.equal(await resolver.scores(cid),0n);
  await reject('cannot reply to tombstone',()=>o.createEntry({statementId:sid,parentId:cid,text:'late reply'}));wallets[2].reset();
  const rebuilt=await createOnchainSocial(config,provider).snapshot({rebuild:true});
  assert.equal(rebuilt.entries.find(x=>x.id===cid).history.length,2);assert.equal(rebuilt.entries.find(x=>x.id===post.id).text,'Новый полный текст');pass('fresh RPC-only index rebuild retains tombstones, all text, profiles and votes');
  await reject('wallet fence cancels before sending',()=>s.createEntry({statementId:sid,text:'no send'},{isCurrent:()=>false}));
  const time=(await provider.getBlock('latest')).timestamp+100;
  const uid=(data,ref=ZeroHash)=>solidityPackedKeccak256(['bytes32','address','address','uint64','uint64','bool','bytes32','bytes','uint32'],
    [config.social.schemas.entry,owner,owner,time,0,false,ref,data,0]);
  const create=encodeSocial('entry',[2,sid,ZeroHash,ZeroHash,ZeroHash,'','Batch create',false]);
  const batchRoot=uid(create),revision=encodeSocial('entry',[2,sid,batchRoot,ZeroHash,batchRoot,'','Batch revision',false]);
  const response=encodeSocial('entry',[2,sid,ZeroHash,batchRoot,ZeroHash,'','Batch reply',false]);
  await provider.send('evm_setNextBlockTimestamp',[time]);
  await (await eas.multiAttest([{schema:config.social.schemas.entry,data:[request('',create).data,request('',revision,batchRoot).data,request('',response,batchRoot).data]}],{gasLimit:4_000_000})).wait();
  assert.equal((await resolver.entries(batchRoot)).latestUID,uid(revision,batchRoot));
  assert.equal((await eas.getAttestation(batchRoot)).data,create);pass('multiAttest create then revision and reply is atomic and preserves originals');
  const latest=(await resolver.entries(batchRoot)).latestUID, badEdit=encodeSocial('entry',[2,sid,batchRoot,ZeroHash,latest,'','Batch fork',false]);
  await reject('conflicting edits in one batch revert together',()=>eas.multiAttest.staticCall([{schema:config.social.schemas.entry,data:[request('',badEdit,latest).data,request('',badEdit,latest).data]}]));
  assert.equal((await resolver.entries(batchRoot)).latestUID,latest);
  fs.writeFileSync(path.join(root,'.state/social-test-report.json'),JSON.stringify({scope:'isolated temporary Anvil 19547; no existing chain or markets touched',passed:results.length,results,config,block:await provider.getBlockNumber()},null,2));
} finally {
  provider.destroy();child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const t=setTimeout(()=>{child.kill('SIGKILL');resolve();},1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
}
