import {concatHex,hexToBytes,keccak256,decodeEventLog} from 'viem';
import {assertLocalChain,zeroHash} from './chain.mjs';
const integer=(v,name)=>{try{const n=BigInt(v);if(n<0n)throw Error();return n;}catch{throw Error(`Invalid ${name}`);}};
const page=(cursor=0,limit=50)=>{if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Page size must be 1–50');return[integer(cursor,'cursor'),BigInt(limit)];};
const decode=bytes=>{try{return{text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),invalidUtf8:false};}catch{return{text:new TextDecoder().decode(bytes),invalidUtf8:true};}};
const date=seconds=>new Date(Number(seconds)*1000).toISOString();
/** Independent chain-only adapter. No SIWE, API or social database is consulted. */
export function createSocialSDK({client,wallet,address,abi,assertCurrent=()=>{}}){
 const read=async(functionName,args=[],blockNumber)=>{assertCurrent();const value=await client.readContract({address,abi,functionName,args,...(blockNumber===undefined?{}:{blockNumber})});assertCurrent();return value;};
 const write=async(functionName,args)=>{if(!wallet)throw Error('Connect a signing wallet');assertCurrent();await assertLocalChain(client);await assertLocalChain(wallet);assertCurrent();
  const {request}=await client.simulateContract({address,abi,functionName,args,account:wallet.account});assertCurrent();const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});assertCurrent();if(receipt.status!=='success')throw Error('Social transaction reverted');return receipt;};
 async function revision(id,version,blockNumber){const [title,contentHash,length,createdAt,count]=await read('getRevision',[integer(id,'post'),integer(version,'version')],blockNumber);
  const chunks=[];for(let i=0n;i<count;i++)chunks.push(await read('getRevisionChunk',[BigInt(id),BigInt(version),i],blockNumber));
  const bytes=concatHex(chunks);if(hexToBytes(bytes).length!==Number(length)||keccak256(bytes)!==contentHash)throw Error('Onchain content integrity mismatch');
  return{version:Number(version),title,...decode(hexToBytes(bytes)),contentHash,byteLength:Number(length),chunkCount:Number(count),createdAt:date(createdAt)};
 }
 async function profile(author,{version,blockNumber}={}){const count=await read('profileVersionCount',[author],blockNumber);
  if(count===0n)return{address:author,displayName:`${author.slice(0,6)}…${author.slice(-4)}`,bio:'',version:null,versionCount:0,onchain:true,published:false};
  const v=version===undefined?count-1n:integer(version,'profile version');const [displayName,bio,at,pointer]=await read('getProfile',[author,v],blockNumber);
  return{address:author,displayName,bio,version:Number(v),versionCount:Number(count),updatedAt:date(at),pointer,onchain:true,published:true};
 }
 async function post(id,{viewer,blockNumber,withHistory=false}={}){const header=await read('getPost',[integer(id,'post')],blockNumber),body=await revision(id,header.version,blockNumber);
  const result={...header,...body,id:header.id.toString(),parentId:header.parentId===0n?null:header.parentId.toString(),createdAt:date(header.createdAt),editedAt:header.version?body.createdAt:undefined,score:Number(header.score),depth:Number(header.depth),kind:Number(header.kind),history:[],historyCount:Number(header.version),onchain:true};
  if(viewer)result.myVote=Number(await read('votes',[BigInt(id),viewer],blockNumber));
  if(withHistory){const h=await revisionHistory(id,{limit:5,blockNumber,total:Number(header.version)});result.history=h.items;result.historyNextCursor=h.nextCursor;}
  return result;
 }
 async function revisionHistory(id,{cursor=0,limit=5,blockNumber,total}={}){page(cursor,limit);if(total===undefined)total=Number((await read('getPost',[integer(id,'post')],blockNumber)).version)+1;const end=Math.min(Number(cursor)+limit,total),items=[];if(Number(cursor)>total)throw Error('History cursor out of range');for(let i=Number(cursor);i<end;i++){const r=await revision(id,i,blockNumber);items.push({...r,at:r.createdAt});}return{items,total,nextCursor:end<total?end:null};}
 async function ids(fn,args,cursor=0,limit=50,blockNumber){const [items,total]=await read(fn,[...args,...page(cursor,limit)],blockNumber);const next=BigInt(cursor)+BigInt(items.length);return{ids:items.map(String),total:Number(total),cursor:Number(cursor),nextCursor:next<total?Number(next):null};}
 return{address,abi,read,revision,revisionHistory,profile,post,
  snapshot:()=>client.getBlock(),
  headers:(cursor=0,limit=50,blockNumber)=>read('getPosts',page(cursor,limit),blockNumber),
  authorPosts:(author,options={})=>ids('getAuthorPosts',[author],options.cursor,options.limit,options.blockNumber),
  statementPosts:(id,options={})=>ids('getStatementPosts',[id],options.cursor,options.limit,options.blockNumber),
  statementRoots:(id,options={})=>ids('getStatementRoots',[id],options.cursor,options.limit,options.blockNumber),
  authorBlogs:(author,options={})=>ids('getAuthorBlogs',[author],options.cursor,options.limit,options.blockNumber),
  replies:(id,options={})=>ids('getReplies',[integer(id,'post')],options.cursor,options.limit,options.blockNumber),
  async voteHistory(id,{cursor=0,limit=50,blockNumber}={}){const [items,total]=await read('getVoteHistory',[integer(id,'post'),...page(cursor,limit)],blockNumber);return{items:items.map(r=>({...r,createdAt:date(r.createdAt)})),total:Number(total),nextCursor:BigInt(cursor)+BigInt(items.length)<total?Number(cursor)+items.length:null};},
  setTombstone:(id,value)=>{if(typeof value!=='boolean')throw Error('Visibility must be boolean');return write('setTombstone',[integer(id,'post'),value]);},
  visibilityHistory:async(id,{cursor=0,limit=50,blockNumber}={})=>{const [items,total]=await read('getVisibilityHistory',[integer(id,'post'),...page(cursor,limit)],blockNumber);return{items:items.map(r=>({...r,createdAt:date(r.createdAt)})),total:Number(total),nextCursor:BigInt(cursor)+BigInt(items.length)<total?Number(cursor)+items.length:null};},
  publishProfile:({displayName,bio,expectedVersionCount})=>write('publishProfile',[integer(expectedVersionCount,'profile version count'),displayName,bio]),
  publishComment:(statementId,text,parentId=null)=>write('publishComment',[statementId??zeroHash,integer(parentId??0,'parent'),text]),
  publishBlog:({title,text})=>write('publishBlog',[title,text]),
  revisePost:(id,expectedVersion,{title='',text})=>write('revisePost',[integer(id,'post'),Number(expectedVersion),title,text]),
  vote:(id,value)=>{if(![-1,0,1].includes(value))throw Error('Vote must be -1, 0 or 1');return write('vote',[integer(id,'post'),value]);},
  events:receipt=>receipt.logs.flatMap(l=>{if(l.address.toLowerCase()!==address.toLowerCase())return[];try{return[decodeEventLog({abi,data:l.data,topics:l.topics})];}catch{return[];}}),
 };
}
