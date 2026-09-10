import {Contract,AbiCoder,ZeroHash,ZeroAddress,keccak256,toUtf8Bytes,hexlify,randomBytes,toUtf8String,Utf8ErrorFuncs} from 'ethers';
const coder=AbiCoder.defaultAbiCoder();
export const SocialKind=Object.freeze({PROFILE:1,BLOG:2,MARKET:3,REPLY:4,REACTION:5});
const keys=['oncm.kind','oncm.context','oncm.title','oncm.nonce'].map(x=>keccak256(toUtf8Bytes(x)));
export function socialMetadata(kind,context,title='') { return [
 {key:keys[0],value:hexlify(Uint8Array.of(kind))},{key:keys[1],value:context},
 {key:keys[2],value:hexlify(toUtf8Bytes(title))},{key:keys[3],value:hexlify(randomBytes(32))}]; }
export function decodeSocialRevision(bytes) {
 const [version,kind,author,parentId,context,titleBytes,textBytes,timestamp,deleted]=coder.decode(['uint8','uint8','address','bytes32','bytes32','bytes','bytes','uint64','bool'],bytes);
 const title=toUtf8String(titleBytes,Utf8ErrorFuncs.replace),text=toUtf8String(textBytes,Utf8ErrorFuncs.replace);
 if(version!==1n)throw Error('Unsupported social revision');
 return {version:Number(version),kind:Number(kind),address:author,parentId:parentId===ZeroHash?null:parentId,context,title,text,titleBytes,textBytes,utf8Valid:hexlify(toUtf8Bytes(title))===titleBytes&&hexlify(toUtf8Bytes(text))===textBytes,timestamp:Number(timestamp),deleted};
}
export function rankSocial(items,sort='top') {
 return [...items].sort((a,b)=>{
  if(sort==='top'&&BigInt(a.score)!==BigInt(b.score))return BigInt(a.score)>BigInt(b.score)?-1:1;
  return b.timestamp-a.timestamp || a.id.localeCompare(b.id);
 });
}
/// Direct ECP wallet writes and canonical, rebuildable RPC reads. SIWE is not social authority.
export class ExchangeSocialSDK {
 constructor(client,deployment,abis){
  if(!client?.provider)throw Error('ExchangeSocialSDK requires the wallet-aware ExchangeSDK, social deployment and ABIs');
  Object.assign(this,{client,deployment,abis});
 }
 async ready(){
  this.client.assertCurrent?.();
  if(Number((await this.client.provider.getNetwork()).chainId)!==31372)throw Error('Social requires Exchange chain 31372');
  this.client.assertCurrent?.();
  if(this.deployment?.status!=='ready'||Number(this.deployment.chainId)!==31372||this.deployment.registry.toLowerCase()!==this.client.deployment.contracts.protocol.toLowerCase())throw Error('Onchain social is not deployed for this registry');
 }
 contract(name,write=false){return new Contract(this.deployment[name],this.abis[name==='hook'?'ExchangeSocialHook':name==='comments'?'CommentManager':'ChannelManager'],write?this.client.signer:this.client.provider);}
 async block(){
  await this.ready();
  // Bypass ethers' short-lived "latest" cache after a fast devnet receipt.
  const number=Number(BigInt(await this.client.provider.send('eth_blockNumber',[])));
  const block=await this.client.provider.getBlock(number);
  this.client.assertCurrent?.();
  if(!block||block.number!==number)throw Error('Latest social block is unavailable');
  return block;
 }
 async entry(id,{blockTag,viewer}={}){
  await this.ready();if(blockTag===undefined)blockTag=(await this.block()).number;
  const hook=this.contract('hook'),e=await hook.entries(id,{blockTag});
  if(e.author===ZeroAddress)throw Error('Unknown social entry');
  const latest=decodeSocialRevision(await hook.revision(id,e.revisionCount-1n,{blockTag}));
  const myVote=viewer?Number(await hook.voteOf(id,viewer,{blockTag})):0;
  return {...latest,id,rootId:e.rootId,score:String(e.score),createdAt:Number(e.createdAt)*1000,timestamp:Number(e.createdAt),updatedAt:Number(e.updatedAt)*1000,revisionCount:Number(e.revisionCount),myVote,observedBlock:blockTag};
 }
 async profile(address,{blockTag}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const id=await this.contract('hook').profileOf(address,{blockTag});
  if(id===ZeroHash)return{address,displayName:'',bio:'',id:null,observedBlock:blockTag};
  const e=await this.entry(id,{blockTag});return{...e,displayName:e.deleted?'':e.title,bio:e.deleted?'':e.text};
 }
 async ids(method,arg,{blockTag,limit=1000}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const found=[];let total=0;
  do{const args=arg===undefined?[]:[arg];const r=await this.contract('hook')[method](...args,found.length,100,{blockTag});total=Number(r[1]);found.push(...r[0]);
   if(found.length>limit)throw Error('Social read limit exceeded; use paged hook getters');
  }while(found.length<total);
  return found;
 }
 async comments(context,{viewer,sort='top',blockTag}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const ids=await this.ids('discussion',context,{blockTag});return this.decorate(await Promise.all(ids.map(id=>this.entry(id,{blockTag,viewer}))),sort,blockTag);
 }
 async decorate(items,sort,blockTag){
  const authors=[...new Set(items.map(e=>e.address.toLowerCase()))];const profiles=new Map(await Promise.all(authors.map(async a=>[a,await this.profile(a,{blockTag})])));
  return rankSocial(items.map(e=>({...e,profile:profiles.get(e.address.toLowerCase())})),sort);
 }
 async blogs(author,{viewer,sort='new',blockTag}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const ids=await this.ids('blog',author,{blockTag});return this.decorate(await Promise.all(ids.map(id=>this.entry(id,{blockTag,viewer}))),sort,blockTag);
 }
 async thread(root,{viewer,sort='top',blockTag}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const found=[];const pending=[root];while(pending.length){const parent=pending.shift();const ids=await this.ids('replies',parent,{blockTag});found.push(...ids);pending.push(...ids);if(found.length>1000)throw Error('Thread read limit; use paged hook getters');}
  return this.decorate(await Promise.all(found.map(id=>this.entry(id,{blockTag,viewer}))),sort,blockTag);
 }
 async history(id,{blockTag}={}){
  if(blockTag===undefined)blockTag=(await this.block()).number;
  const e=await this.contract('hook').entries(id,{blockTag});if(e.revisionCount>200n)throw Error('History page limit; use revision getter');
  const result=[];for(let i=0;i<Number(e.revisionCount);i++)result.push({...decodeSocialRevision(await this.contract('hook').revision(id,i,{blockTag})),revision:i+1,pointer:await this.contract('hook').revisionPointer(id,i,{blockTag})});return result;
 }
 async send(label,method,args){
  return this.client.tx(label,async()=>{
   const fn=this.contract('comments',true)[method];const estimate=await fn.estimateGas(...args);
   await this.client.guard();
   // Ganache may estimate with the previous timestamp; a mined revision updates another storage slot.
   return fn(...args,{gasLimit:estimate+estimate/4n+30000n});
  });
 }
 async createData(kind,context,text,title='',parentId=ZeroHash){
  await this.client.guard();const b=await this.block(),author=await this.client.signer.getAddress();
  const targetUri=parentId===ZeroHash?await this.contract('hook').targetUri(kind,author,context):'';
  const data={author,app:author,channelId:this.deployment.channelId,deadline:b.timestamp+3600,parentId,commentType:kind===5?1:0,content:text,metadata:socialMetadata(kind,context,title),targetUri};
  return data;
 }
 async create(kind,context,text,title='',parentId=ZeroHash){
  const data=await this.createData(kind,context,text,title,parentId);
  return this.send('Publish social entry onchain','postComment',[data,'0x']);
 }
 async edit(id,text,title){
  await this.client.guard();const b=await this.block(),e=await this.entry(id,{blockTag:b.number}),author=await this.client.signer.getAddress();
  if(e.address.toLowerCase()!==author.toLowerCase()||e.deleted)throw Error('Only the live entry author can edit');
  if(e.kind===5)throw Error('Use atomic vote replacement; ECP reactions cannot be edited');
  const nonce=await this.contract('comments').getNonce(author,author);
  return this.send('Publish social revision onchain','editComment',[id,{app:author,nonce,deadline:b.timestamp+3600,content:text,metadata:socialMetadata(e.kind,e.context,title??e.title)},'0x']);
 }
 async saveProfile(displayName,bio){const address=await this.client.signer.getAddress(),p=await this.profile(address);return p.id&&!p.deleted?this.edit(p.id,bio,displayName):this.create(1,ZeroHash,bio,displayName);}
 publishBlog(title,text){return this.create(2,ZeroHash,text,title);}
 async postComment(context,text,parentId=null){return parentId?this.reply(parentId,text):this.create(3,context,text);}
 async reply(parentId,text){const parent=await this.entry(parentId);return this.create(4,parent.context,text,'',parentId);}
 async vote(id,value){
  if(![-1,0,1].includes(value))throw Error('Vote must be -1, 0 or 1');
  await this.client.guard();const b=await this.block(),e=await this.entry(id,{blockTag:b.number}),author=await this.client.signer.getAddress();
  if(e.address.toLowerCase()===author.toLowerCase()||(e.deleted&&value!==0)||[1,5].includes(e.kind))throw Error('Cannot vote on this entry');
  const reaction=await this.contract('hook').reactionOf(id,author,{blockTag:b.number});
  if(reaction===ZeroHash){if(value===0)return null;return this.create(5,e.context,String(value),'',id);}
  if(value===0)return this.remove(reaction);
  const data=await this.createData(5,e.context,String(value),'',id);
  const tuple=this.contract('comments').interface.getFunction('postComment').inputs[0];
  const operations=[{operationType:4,value:0,data:coder.encode(['bytes32'],[reaction]),signatures:[]},
   {operationType:0,value:0,data:coder.encode([tuple],[data]),signatures:['0x']}];
  return this.send('Replace vote atomically onchain','batchOperations',[operations]);
 }
 async remove(id){await this.client.guard();await this.ready();return this.send('Tombstone social entry onchain','deleteComment',[id]);}
 async rebuildIndex({history=true}={}){
  const b=await this.block(),ids=await this.ids('all',undefined,{blockTag:b.number});const entries=[];let totalBytes=0;
  for(const id of ids){const entry=await this.entry(id,{blockTag:b.number});if(history)entry.history=await this.history(id,{blockTag:b.number});totalBytes+=toUtf8Bytes(JSON.stringify(entry)).length;if(totalBytes>4*1024*1024)throw Error('Export exceeds4MiB; use paged onchain entry/revision getters');entries.push(entry);}
  return {format:'oncm-exchange-ecp-index-v1',chainId:31372,registry:this.deployment.registry,comments:this.deployment.comments,hook:this.deployment.hook,channelId:this.deployment.channelId,block:{number:b.number,hash:b.hash,timestamp:b.timestamp},entries};
 }
}
