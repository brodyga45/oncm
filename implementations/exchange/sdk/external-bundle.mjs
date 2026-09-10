// Generic data/binding validator. Not imported by the live UI yet.
// Passing this module never means that a Groth16 proof was accepted: the original
// EVM verifier and governed immutable bridge remain mandatory in the caller.
import {AbiCoder,decodeBase64,encodeBase64,sha256,toUtf8Bytes} from 'ethers';
const abi=AbiCoder.defaultAbiCoder();
const DOMAIN=sha256(toUtf8Bytes('ONCM_LEAN_CLAIM_V1'));
export const EXTERNAL_BUNDLE_LIMITS=Object.freeze({wrapper:2*1024*1024,goal:1024*1024,source:512*1024});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function keys(value,required,optional,label) {
  assert(object(value),label+' must be an object');
  assert(required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),label+' fields mismatch');
}
function utf8(text,label,max=EXTERNAL_BUNDLE_LIMITS.wrapper) {
  assert(typeof text==='string',label+' must be text');
  const bytes=new TextEncoder().encode(text);
  assert(bytes.length<=max&&new TextDecoder('utf-8',{fatal:true}).decode(bytes)===text,label+' exceeds byte limit or has invalid Unicode');
  return bytes;
}
function hash(value,label,prefix=false) {assert((prefix?/^0x[0-9a-f]{64}$/:/^[0-9a-f]{64}$/).test(value??''),label+' must be canonical SHA256/bytes32');return value;}
function hex(value,size,label) {assert(typeof value==='string'&&new RegExp(`^0x[0-9a-fA-F]{${size*2}}$`).test(value),label+' byte size/hex mismatch');return value;}

/** JSON.parse remains the parser; this small token walk rejects duplicate decoded
 * keys and excessive nesting before parsed values can reach the UI. */
export function parseBoundedJSON(raw,max=EXTERNAL_BUNDLE_LIMITS.wrapper) {
  utf8(raw,'JSON',max);let i=0;
  const ws=()=>{while(/\s/.test(raw[i]??'')&&i<raw.length)i++;};
  function string() {
    const start=i++;while(i<raw.length){if(raw[i]==='\\'){i+=2;continue;}if(raw[i++]==='"')return JSON.parse(raw.slice(start,i));}
    throw Error('Unterminated JSON string');
  }
  function walk(depth) {
    assert(depth<=64,'JSON nesting limit');ws();
    if(raw[i]==='{') {i++;ws();const seen=new Set();if(raw[i]==='}'){i++;return;}
      for(;;){ws();assert(raw[i]==='"','Expected object key');const key=string();utf8(key,'JSON key');assert(!seen.has(key),'Duplicate JSON key');seen.add(key);ws();assert(raw[i++]===':','Expected colon');walk(depth+1);ws();const end=raw[i++];if(end==='}')return;assert(end===',','Expected object separator');}
    }
    if(raw[i]==='['){i++;ws();if(raw[i]===']'){i++;return;}for(;;){walk(depth+1);ws();const end=raw[i++];if(end===']')return;assert(end===',','Expected array separator');}}
    if(raw[i]==='"'){utf8(string(),'JSON string');return;}
    const value=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(i));
    assert(value,'Invalid JSON value');
    if(value[0]!=='true'&&value[0]!=='false'&&value[0]!=='null')assert(Number.isFinite(Number(value[0])),'Non-finite JSON number');
    i+=value[0].length;
  }
  walk(0);ws();assert(i===raw.length,'Trailing JSON content');return JSON.parse(raw);
}

function part(value,label,max) {
  keys(value,['base64','sha256','bytes'],[],label);
  assert(Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=max,label+' byte limit');
  assert(typeof value.base64==='string'&&value.base64.length<=4*Math.ceil(max/3)&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64),label+' base64 syntax');
  const bytes=decodeBase64(value.base64);
  assert(encodeBase64(bytes)===value.base64&&bytes.length===value.bytes,label+' canonical base64/length mismatch');
  assert(sha256(bytes).slice(2)===hash(value.sha256,label+' hash'),label+' SHA256 mismatch');return bytes;
}

/** Matches the profile's structural name Oncm.goal, not a dotted display string.
 * Only locates the final declaration boundary; NanoDa type checks stay in ZK. */
export function canonicalGoalBoundary(bytes) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert(text.endsWith('\n'),'Goal export must end with a complete newline');
  const names=new Map([[0,'root']]);let offset=0,boundary=null;
  for(const line of text.slice(0,-1).split('\n')) {
    const row=parseBoundedJSON(line,EXTERNAL_BUNDLE_LIMITS.goal);assert(object(row),'NDJSON row must be object');
    offset+=utf8(line,'NDJSON row',EXTERNAL_BUNDLE_LIMITS.goal).length+1;
    if(Object.hasOwn(row,'in')) {
      assert(Number.isSafeInteger(row.in)&&row.in>0&&!names.has(row.in),'Invalid structural name index');
      assert(Object.hasOwn(row,'str')!==Object.hasOwn(row,'num'),'Invalid structural name variant');
      const value=row.str??row.num;
      assert(object(value)&&Number.isSafeInteger(value.pre)&&names.has(value.pre),'Missing structural name parent');
      let state='other';
      if(Object.hasOwn(row,'str')) {
        assert(typeof value.str==='string','Invalid structural name string');
        if(names.get(value.pre)==='root'&&value.str==='Oncm')state='namespace';
        else if(names.get(value.pre)==='namespace'&&value.str==='goal')state='goal';
      } else assert(Number.isSafeInteger(value.i)&&value.i>=0,'Invalid numeric name');
      names.set(row.in,state);
    }
    if(Object.hasOwn(row,'def')) {
      assert(object(row.def)&&Number.isSafeInteger(row.def.name),'Invalid definition record');
      if(names.get(row.def.name)==='goal'){assert(boundary===null,'Duplicate canonical goal');boundary=offset;}
    }
  }
  assert(boundary!==null,'Missing structural Oncm.goal');return boundary;
}

/** trustedProfile and foundationBytes must come from a supported immutable
 * profile descriptor, never from the uploaded JSON itself. No goal allowlist. */
export function inspectExternalBundle(input,{trustedProfile,foundationBytes}) {
  const raw=typeof input==='string'?input:JSON.stringify(input),bundle=parseBoundedJSON(raw);
  keys(bundle,['format','artifact','goalExport'],['source','metadata'],'Bundle');
  assert(bundle.format==='oncm-external-certificate-bundle-v1','Unsupported external bundle');
  const profile=trustedProfile,r=bundle.artifact;
  assert(object(profile)&&object(r),'Trusted profile / artifact required');
  assert(r.format==='oncm-real-groth16-ci-v1'&&r.receiptKind==='Groth16','Expected Groth16 artifact');
  for(const name of ['goalHash','profileId','imageId'])hash(r[name],name,true);
  assert(same(r.profileId,profile.profileId)&&same(r.imageId,profile.imageId),'Immutable profile/image mismatch');
  assert(Number.isInteger(r.outcome)&&[0,1,2].includes(r.outcome),'Outcome must be 0, 1 or 2');
  const goal=part(bundle.goalExport,'Goal export',EXTERNAL_BUNDLE_LIMITS.goal);
  assert(r.goalHash===sha256(goal),'Goal bytes differ from claim');
  assert(foundationBytes instanceof Uint8Array,'Trusted foundation bytes required');
  let expectedFoundation=profile.foundationSha256;
  if(!expectedFoundation&&typeof profile.manifest==='string')expectedFoundation=parseBoundedJSON(profile.manifest).foundationSha256;
  assert(sha256(foundationBytes).slice(2)===hash(expectedFoundation,'Trusted foundation SHA256'),'Trusted foundation asset changed');
  assert(goal.length>=foundationBytes.length&&foundationBytes.every((byte,i)=>goal[i]===byte),'Goal foundation prefix mismatch');
  assert(canonicalGoalBoundary(goal)===goal.length,'Goal export must end exactly at Oncm.goal declaration');
  assert(same(hex(r.verifierParameters,32,'Verifier parameters'),profile.verifierParameters),'Verifier parameters mismatch');
  hex(r.rawSeal,256,'Raw seal');hex(r.evmSeal,260,'EVM seal');hex(profile.selector,4,'Trusted selector');
  assert(same(r.evmSeal,profile.selector+r.rawSeal.slice(2)),'EVM selector/raw seal mismatch');
  const journal=abi.encode(['bytes32','bytes32','bytes32','uint256'],[DOMAIN,r.goalHash,profile.profileId,r.outcome]);
  assert(same(hex(r.journal,128,'Journal'),journal),'Journal domain/goal/profile/outcome mismatch');
  const certificate=abi.encode(['bytes','bytes'],[r.evmSeal,journal]);
  assert(same(r.certificate,certificate),'Noncanonical ABI certificate');
  let source=null;
  if(Object.hasOwn(bundle,'source')) {
    keys(bundle.source,['text','sha256'],['origin'],'Source');
    const data=utf8(bundle.source.text,'Source',EXTERNAL_BUNDLE_LIMITS.source);
    assert(sha256(data).slice(2)===hash(bundle.source.sha256,'Source hash'),'Source SHA256 mismatch');
    source={text:bundle.source.text,sha256:bundle.source.sha256};
    if(bundle.source.origin!==undefined) {
      const o=bundle.source.origin;keys(o,['repository','commit','path','declaration'],[],'Source origin');
      utf8(o.repository,'Repository',2048);const url=new URL(o.repository);
      assert(url.protocol==='https:'&&!url.username&&!url.password,'Origin repository must be HTTPS without credentials');
      assert(/^[0-9a-f]{40}$/.test(o.commit),'Source origin must pin a commit');
      utf8(o.path,'Source path',1024);utf8(o.declaration,'Declaration',256);
      assert(o.path&&!o.path.startsWith('/')&&!o.path.split('/').some(x=>x==='..'||x===''||x==='.')&&o.declaration,'Invalid source origin path/declaration');
      source.origin={...o};
    }
  }
  const metadata=bundle.metadata??{};keys(metadata,[],['title','description'],'Metadata');
  if(metadata.title!==undefined)utf8(metadata.title,'Title',180);
  if(metadata.description!==undefined)utf8(metadata.description,'Description',10000);
  return {format:bundle.format,profileId:profile.profileId,imageId:profile.imageId,goalHash:r.goalHash,outcome:r.outcome,
    journal,certificate,evmSeal:r.evmSeal,goalExport:{...bundle.goalExport},source,metadata:{...metadata},
    sourceGoalRelation:'not-verified',cryptographicStatus:'not-verified',
    provenance:{profileLabel:r.profile??null,caseLabel:r.case??null,runId:r.runId??null,sourceCommit:r.sourceCommit??null},
    bundleSha256:sha256(utf8(raw,'Bundle')).slice(2)};
}
