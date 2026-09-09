import crypto from 'node:crypto';
import {isAddress,keccak256,toHex} from 'viem';
export function createResearchStore(db,save){
 db.shelves??={};db.notebooks??={};
 const owner=address=>{if(!isAddress(address))throw new Error('Invalid wallet');return address.toLowerCase();};
 const rejectSpoof=(address,input)=>{if(input.owner&&owner(input.owner)!==owner(address))throw new Error('Notebook owner must match signed-in wallet');};
 return{
  shelf(address){return Object.values(db.shelves[owner(address)]??{}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.statementId.localeCompare(b.statementId));},
  saveBookmark(address,statementId,input){rejectSpoof(address,input);const notes=input.notes===undefined?(db.shelves[owner(address)]?.[statementId]?.notes??''):String(input.notes);if(notes.length>10000)throw new Error('Private notes are limited to 10000 characters');db.shelves[owner(address)]??={};const item={statementId,notes,updatedAt:new Date().toISOString()};db.shelves[owner(address)][statementId]=item;save();return item;},
  removeBookmark(address,statementId){delete db.shelves[owner(address)]?.[statementId];save();return{ok:true};},
  revisions(address){return[...(db.notebooks[owner(address)]??[])].reverse();},
  saveRevision(address,input){rejectSpoof(address,input);const source=String(input.source??''),title=String(input.title??'Untitled Lean revision').trim();if(!source||source.length>100000||!title||title.length>160)throw new Error('Revision requires a title and at most 100 KB of Lean source');const revisions=db.notebooks[owner(address)]??=[];if(revisions.length>=256)throw new Error('Notebook limit of 256 revisions reached; export your notebook');const revision={id:crypto.randomUUID(),title,source,sourceHash:keccak256(toHex(source)),profileId:input.profileId??null,createdAt:new Date().toISOString(),basedOn:input.basedOn??null};if(revision.basedOn&&!revisions.some(r=>r.id===revision.basedOn))throw new Error('Parent revision does not belong to this notebook');revisions.push(revision);save();return revision;},
 };
}
