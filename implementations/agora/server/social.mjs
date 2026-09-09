import crypto from 'node:crypto';
import {isAddress} from 'viem';

// The caller passes the verified SIWE principal. Request bodies never select it.
export function createSocialStore(db,save){
 db.profiles??={};db.comments??=[];db.votes??={};
 const key=address=>{if(!isAddress(address))throw new Error('Invalid wallet address');return address.toLowerCase();};
 const denySpoof=(address,input)=>{if(input.author&&key(input.author)!==key(address))throw new Error('Author must match the signed-in wallet');if(input.address&&key(input.address)!==key(address))throw new Error('Profile must match the signed-in wallet');};
 const profile=address=>({address,...db.profiles[key(address)],displayName:db.profiles[key(address)]?.displayName??`${address.slice(0,6)}…${address.slice(-4)}`,bio:db.profiles[key(address)]?.bio??'',commentCount:db.comments.filter(c=>key(c.author)===key(address)).length});
 const enrich=(c,viewer)=>{const votes=Object.values(db.votes[c.id]??{});return{...c,parentId:c.parentId??null,depth:c.depth??0,profile:profile(c.author),score:votes.reduce((a,b)=>a+b,0),voteCount:votes.length,myVote:viewer?(db.votes[c.id]?.[key(viewer)]??0):0};};
 return{
  profile,
  updateProfile(address,input){denySpoof(address,input);const displayName=String(input.displayName??'').trim(),bio=String(input.bio??'').trim();if(displayName.length<1||displayName.length>48||bio.length>1000)throw new Error('Display name must have 1–48 characters; bio at most 1000');db.profiles[key(address)]={address,displayName,bio,updatedAt:new Date().toISOString()};save();return profile(address);},
  comments(statementId,{sort='top',viewer}={}){if(!['top','new'].includes(sort))throw new Error('Sort must be top or new');const comments=db.comments.filter(c=>c.statementId===statementId).map(c=>enrich(c,viewer));const compare=(a,b)=>(sort==='top'?b.score-a.score:0)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id);const result=[];const visit=parentId=>{for(const c of comments.filter(c=>c.parentId===parentId).sort(compare)){result.push(c);visit(c.id);}};visit(null);return result;},
  addComment(address,statementId,input){denySpoof(address,input);const text=String(input.text??'').trim();if(!text||text.length>10000)throw new Error('Comment must contain 1–10000 characters');const parent=input.parentId?db.comments.find(c=>c.id===input.parentId):null;if(input.parentId&&(!parent||parent.statementId!==statementId))throw new Error('Reply must belong to the same statement');if(parent&&(parent.depth??0)>=6)throw new Error('Reply nesting limit reached');const c={id:crypto.randomUUID(),statementId,author:address,text,parentId:parent?.id??null,depth:parent?(parent.depth??0)+1:0,createdAt:new Date().toISOString(),history:[],hidden:false};db.comments.push(c);save();return enrich(c,address);},
  vote(address,id,input){denySpoof(address,input);const c=db.comments.find(c=>c.id===id);if(!c)throw new Error('Unknown comment');if(key(c.author)===key(address))throw new Error('You cannot vote on your own comment');const value=input.value;if(value!==-1&&value!==0&&value!==1)throw new Error('Vote must be -1, 0 or 1');db.votes[id]??={};if(value===0)delete db.votes[id][key(address)];else db.votes[id][key(address)]=value;save();return enrich(c,address);},
 };
}
