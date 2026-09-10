/** RPC fallback read model: all answers are rebuilt from a single chain snapshot.
 * No database, API, cached score, session or event index is authoritative. */
export function createSocialReader(sdk){
 async function enrich(id,blockNumber,viewer){const post=await sdk.post(id,{blockNumber,viewer});return{...post,profile:await sdk.profile(post.author,{blockNumber})};}
 async function profile(address,{version,blockNumber}={}){blockNumber??=(await sdk.snapshot()).number;const p=await sdk.profile(address,{version,blockNumber});const all=await sdk.authorPosts(address,{limit:1,blockNumber}),blogs=await sdk.authorBlogs(address,{limit:1,blockNumber});return{...p,commentCount:all.total-blogs.total,blogCount:blogs.total,blockNumber:String(blockNumber)};}
 async function discussion(statementId,{sort='top',viewer,cursor=0,limit=10,rootId,blockNumber}={}){
  blockNumber??=(await sdk.snapshot()).number;
  // Rank root headers globally at one block before fetching any full bodies.
  // Fixed-size pages and per-read cancellation keep navigation interruptible.
  let roots;
  if(rootId)roots={ids:[String(rootId)],total:1,nextCursor:null};
  else {const headers=[];let at=0;do{const page=await sdk.statementRoots(statementId,{cursor:at,limit:50,blockNumber});for(const id of page.ids)headers.push(await sdk.read('getPost',[BigInt(id)],blockNumber));at=page.nextCursor;}while(at!==null);
   headers.sort((a,b)=>{const delta=sort==='top'?b.score-a.score:0n;return delta<0n?-1:delta>0n?1:sort==='new'?(a.id>b.id?-1:a.id<b.id?1:0):(a.id<b.id?-1:a.id>b.id?1:0);});
   const start=Number(cursor),end=start+limit;roots={ids:headers.slice(start,end).map(p=>String(p.id)),total:headers.length,nextCursor:end<headers.length?end:null};}

  const rootPosts=[];for(const id of roots.ids)rootPosts.push(await enrich(id,blockNumber,viewer));
  const items=[];let remaining=50;
  // Descendants always stay below their parent; immutable IDs give chronological ties.
  async function descend(p){items.push(p);remaining--;if(remaining<=0){p.repliesNextCursor=0;p.repliesTruncated=true;return;}
   const children=await sdk.replies(p.id,{limit:Math.min(50,remaining),blockNumber});p.replyCount=children.total;let done=0;
   for(const id of children.ids){if(remaining<=0)break;await descend(await enrich(id,blockNumber,viewer));done++;}
   p.repliesNextCursor=done<children.total?done:null;
  }
  for(const p of rootPosts)await descend(p);
  return{items,totalRoots:roots.total,nextCursor:roots.nextCursor,blockNumber:String(blockNumber),sortScope:'all root headers at snapshot',truncated:remaining<=0};
 }
 async function children(id,{cursor=0,limit=10,viewer,blockNumber}={}){blockNumber??=(await sdk.snapshot()).number;const page=await sdk.replies(id,{cursor,limit,blockNumber}),items=[];for(const child of page.ids)items.push(await enrich(child,blockNumber,viewer));return{...page,items,blockNumber:String(blockNumber)};}
 async function blogs(author,{cursor=0,limit=10,viewer,blockNumber}={}){blockNumber??=(await sdk.snapshot()).number;const page=await sdk.authorBlogs(author,{cursor,limit,blockNumber}),items=[];for(const id of page.ids)items.push(await enrich(id,blockNumber,viewer));return{...page,items,blockNumber:String(blockNumber)};}
 async function rebuild({cursor=0,limit=50,blockNumber}={}){blockNumber??=(await sdk.snapshot()).number;const headers=await sdk.headers(cursor,limit,blockNumber),total=Number(await sdk.read('postCount',[],blockNumber));return{headers:headers.map(p=>({...p,id:String(p.id),parentId:String(p.parentId),createdAt:String(p.createdAt),score:String(p.score)})),total,nextCursor:Number(cursor)+headers.length<total?Number(cursor)+headers.length:null,blockNumber:String(blockNumber)};}
 return{profile,discussion,children,blogs,rebuild};
}
