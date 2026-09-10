import {AbiCoder, Contract, Interface, ZeroAddress, ZeroHash, getAddress, isHexString} from 'ethers';
export const SOCIAL_SCHEMAS = {
  profile:'string displayName,string bio,bytes32 previousUID',
  entry:'uint8 kind,bytes32 statementId,bytes32 rootUID,bytes32 parentUID,bytes32 previousUID,string title,string body,bool deleted',
  vote:'bytes32 targetUID,bytes32 previousUID,int8 value',
};
export const SOCIAL_TYPES = {
  profile:['string','string','bytes32'],
  entry:['uint8','bytes32','bytes32','bytes32','bytes32','string','string','bool'],
  vote:['bytes32','bytes32','int8'],
};
export const EAS_ABI = [
  'function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns(bytes32)',
  'function getAttestation(bytes32 uid) view returns((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))',
  'function getSchemaRegistry() view returns(address)',
  'function version() view returns(string)',
  'event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schemaUID)',
];
export const SOCIAL_ABI = [
  'function profileSchema() view returns(bytes32)', 'function entrySchema() view returns(bytes32)', 'function voteSchema() view returns(bytes32)',
  'function statementRegistry() view returns(address)', 'function latestProfile(address) view returns(bytes32)',
  'function entries(bytes32) view returns(address author,bytes32 latestUID,bytes32 statementId,bytes32 parentUID,bytes32 context,uint8 kind,bool deleted)',
  'function votes(bytes32,address) view returns(bytes32 uid,int8 value)', 'function scores(bytes32) view returns(int256)',
  'event ProfileRevision(address indexed author,bytes32 indexed uid,bytes32 previousUID)',
  'event EntryRevision(bytes32 indexed rootUID,bytes32 indexed uid,address indexed author,uint8 kind,bytes32 statementId,bytes32 parentUID,bytes32 previousUID,bool deleted)',
  'event VoteRevision(bytes32 indexed targetUID,bytes32 indexed uid,address indexed author,bytes32 previousUID,int8 value,int256 score)',
  'error InvalidSocialData()', 'error InvalidContext()', 'error NotAuthor()', 'error StaleRevision()',
];
const abi = AbiCoder.defaultAbiCoder(), zero = x => !x || x===ZeroHash;
const bytes = text => new TextEncoder().encode(text).length;
function bounded(text,max,label,required=false) {
  if(typeof text!=='string'||bytes(text)>max||(required&&!text.trim())) throw Error(`${label}: ${required?'1–':'≤'}${max} UTF-8 bytes`);
  return text;
}
function id(x,label) {if(!isHexString(x,32)) throw Error(label+' must be bytes32');return x;}
export function encodeSocial(kind,values) {return abi.encode(SOCIAL_TYPES[kind],values);}
export function decodeSocial(kind,data) {
  const values=abi.decode(SOCIAL_TYPES[kind],data);
  if(encodeSocial(kind,values).toLowerCase()!==data.toLowerCase()) throw Error('Noncanonical social ABI');
  return values;
}
const chronological=(a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex||a.id.localeCompare(b.id);
export function socialThreads(rows,sort='top') {
  const roots=rows.filter(x=>!x.parentId), children=new Map();
  for(const x of rows) if(x.parentId) {if(!children.has(x.parentId)) children.set(x.parentId,[]);children.get(x.parentId).push(x);}
  roots.sort((a,b)=>(sort==='top'?b.score-a.score:0)||chronological(b,a));
  for(const xs of children.values()) xs.sort(chronological);
  const out=[], stack=roots.slice().reverse().map(x=>[x,0]);
  while(stack.length) {const [x,depth]=stack.pop();out.push({...x,depth});
    const replies=children.get(x.id)??[];for(let i=replies.length-1;i>=0;i--) stack.push([replies[i],depth+1]);}
  return out;
}

/** Rebuilds from original EAS storage + resolver logs; no SIWE/API database is authoritative. */
export function createOnchainSocial(config,runner) {
  const provider=runner?.provider||runner, d=config.social;
  if(!d) return null;
  const eas=new Contract(d.eas,EAS_ABI,runner), resolver=new Contract(d.resolver,SOCIAL_ABI,runner);
  const iface=new Interface(SOCIAL_ABI);
  let cache=null;
  async function network() {
    if((await provider.getNetwork()).chainId!==31373n||Number(config.chainId)!==31373) throw Error('Vault social requires chain 31373');
  }
  async function snapshot({rebuild=false}={}) {
    await network();
    const block=await provider.getBlock('latest');
    if(!rebuild&&cache?.block.hash===block.hash) return cache;
    const at={blockTag:block.number}, logs=[];
    for(let from=d.deploymentBlock;from<=block.number;from+=2000) logs.push(...await provider.getLogs({address:d.resolver,fromBlock:from,toBlock:Math.min(from+1999,block.number)}));
    logs.sort((a,b)=>a.blockNumber-b.blockNumber||(a.transactionIndex??0)-(b.transactionIndex??0)||a.index-b.index);
    const events=logs.map(l=>({log:l,event:iface.parseLog(l)})).filter(x=>x.event);
    const records=new Map();
    for(let i=0;i<events.length;i+=8) await Promise.all(events.slice(i,i+8).map(async({event})=>{
      const uid=event.args.uid;records.set(uid,await eas.getAttestation(uid,at));
    }));
    const profiles={}, entries=new Map(), votes={}, voteHistory={};
    for(const {event,log} of events) {
      const a=records.get(event.args.uid);
      if(a.attester.toLowerCase()!==event.args.author.toLowerCase()||a.uid!==event.args.uid) throw Error('EAS/resolver binding mismatch');
      const common={id:a.uid,uid:a.uid,author:a.attester,createdAt:new Date(Number(a.time)*1000).toISOString(),blockNumber:log.blockNumber,blockHash:log.blockHash,transactionHash:log.transactionHash,logIndex:log.index};
      if(event.name==='ProfileRevision') {
        if(a.schema!==d.schemas.profile) throw Error('Wrong profile schema');
        const [displayName,bio,previousUID]=decodeSocial('profile',a.data), key=a.attester.toLowerCase();
        const old=profiles[key],history=old?.history??[];
        if(old) history.push({...old,history:undefined});
        profiles[key]={...common,address:a.attester,displayName,bio,previousUID,history};
      } else if(event.name==='EntryRevision') {
        if(a.schema!==d.schemas.entry) throw Error('Wrong entry schema');
        const [kind,statementId,,parentUID,previousUID,title,body,deleted]=decodeSocial('entry',a.data),rootUID=event.args.rootUID,old=entries.get(rootUID);
        const history=old?.history??[];if(old)history.push({...old,history:undefined});
        entries.set(rootUID,{...common,id:rootUID,uid:a.uid,kind:Number(kind),statementId,parentId:zero(parentUID)?null:parentUID,
          previousUID,title,text:body,deleted,history,
          // Sorting uses creation order; an edit does not bump an old thread.
          blockNumber:old?.blockNumber??common.blockNumber,logIndex:old?.logIndex??common.logIndex,
          createdAt:old?.createdAt??common.createdAt,updatedAt:common.createdAt,revisionBlock:common.blockNumber});
      } else if(event.name==='VoteRevision') {
        if(a.schema!==d.schemas.vote) throw Error('Wrong vote schema');
        const [target,previousUID,value]=decodeSocial('vote',a.data),key=a.attester.toLowerCase();
        (votes[target]??={})[key]=Number(value);(voteHistory[target]??=[]).push({...common,previousUID,value:Number(value)});
      }
    }
    const profile=address=>profiles[address.toLowerCase()]??{address,displayName:'',bio:'',history:[],uid:ZeroHash};
    const rows=[...entries.values()].map(x=>({...x,votes:votes[x.id]??{},voteHistory:voteHistory[x.id]??[],
      score:Object.values(votes[x.id]??{}).reduce((a,b)=>a+b,0),profile:profile(x.author)}));
    for(const p of Object.values(profiles)) p.commentCount=rows.filter(x=>x.kind===2&&x.author.toLowerCase()===p.address.toLowerCase()).length;
    const result={block:{number:block.number,hash:block.hash,timestamp:block.timestamp},profiles,entries:rows,events:events.length};
    cache=result;return result;
  }
  async function profile(address) {
    const a=getAddress(address),s=await snapshot();return s.profiles[a.toLowerCase()]??{address:a,displayName:'',bio:'',history:[],uid:ZeroHash,commentCount:s.entries.filter(x=>x.kind===2&&x.author.toLowerCase()===a.toLowerCase()).length};
  }
  async function comments(statementId,sort='top') {
    const s=await snapshot();return socialThreads(s.entries.filter(x=>x.kind===2&&x.statementId===statementId),sort);
  }
  async function blog(address) {
    const s=await snapshot();return s.entries.filter(x=>x.kind===1&&x.author.toLowerCase()===address.toLowerCase()).sort((a,b)=>chronological(b,a));
  }
  async function blogThread(root,sort='top') {
    const s=await snapshot(), descendants=new Set([root]);
    // Logs are in creation order; parents must already exist onchain.
    const rows=[];for(const x of s.entries) if(x.kind===2&&descendants.has(x.parentId)){descendants.add(x.id);rows.push({...x,parentId:x.parentId===root?null:x.parentId});}
    return socialThreads(rows,sort);
  }
  async function guard(owner,options={}) {
    await network();
    if(!runner.getAddress||getAddress(await runner.getAddress())!==owner||options.isCurrent?.()===false) throw Error('Wallet or social context changed; prepare again');
  }
  async function attest(kind,data,refUID,owner,options) {
    await guard(owner,options);
    const request={schema:d.schemas[kind],data:{recipient:owner,expirationTime:0,revocable:false,refUID,data,value:0}};
    // The wallet directly calls EAS; the resolver never impersonates an attester.
    const tx=await eas.attest(request);const receipt=await tx.wait();cache=null;return receipt;
  }
  async function actor(options) {
    if(!runner.getAddress) throw Error('Connect a wallet');
    const owner=getAddress(await runner.getAddress());await guard(owner,options);return owner;
  }
  return {descriptor:d,eas,resolver,snapshot,profile,comments,blog,blogThread,
    async updateProfile(displayName,bio,options={}) {
      bounded(displayName,80,'Name');bounded(bio,2048,'Bio');
      const owner=await actor(options),previous=options.previousUID??await resolver.latestProfile(owner);
      return attest('profile',encodeSocial('profile',[displayName,bio,previous]),previous,owner,options);
    },
    async createEntry({kind=2,statementId=ZeroHash,parentId=null,title='',text},options={}) {
      bounded(title,180,'Title',kind===1);bounded(text,kind===1?16384:8192,'Text',true);
      id(statementId,'Statement');const parent=parentId??ZeroHash;id(parent,'Parent');const owner=await actor(options);
      return attest('entry',encodeSocial('entry',[kind,statementId,ZeroHash,parent,ZeroHash,title,text,false]),parent,owner,options);
    },
    async editEntry(root,{title,text,deleted=false},options={}) {
      id(root,'Entry');const owner=await actor(options),e=await resolver.entries(root);
      if(e.author.toLowerCase()!==owner.toLowerCase()) throw Error('Only author can edit');
      const a=await eas.getAttestation(e.latestUID),old=decodeSocial('entry',a.data);
      const nextTitle=title??old[5],nextText=text??old[6];bounded(nextTitle,180,'Title',Number(e.kind)===1&&!deleted);bounded(nextText,Number(e.kind)===1?16384:8192,'Text',!deleted);
      const previous=options.previousUID??e.latestUID;
      return attest('entry',encodeSocial('entry',[e.kind,e.statementId,root,e.parentUID,previous,nextTitle,nextText,deleted]),previous,owner,options);
    },
    async vote(target,value,options={}) {
      if(![-1,0,1].includes(value)) throw Error('Vote must be -1, 0 or 1');id(target,'Target');
      const owner=await actor(options),old=await resolver.votes(target,owner),previous=options.previousUID??old.uid;
      return attest('vote',encodeSocial('vote',[target,previous,value]),target,owner,options);
    },
  };
}
