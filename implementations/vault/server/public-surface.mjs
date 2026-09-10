// Exact, opt-in public surface. The internal SDK always keeps its loopback RPC.
import {getAddress, isAddress} from 'ethers';
import {createWindowLimiter} from './rpc-gateway.mjs';
import {isIP} from 'node:net';

const readPaths=[/^\/api\/(health|config|snapshot|fixtures|external-proofs|governance|activity)$/,
  /^\/api\/auth\/(nonce|me)$/,/^\/api\/profiles\/0x[0-9a-fA-F]{40}$/,
  /^\/api\/blog\/0x[0-9a-fA-F]{40}$/,/^\/api\/(comments|social\/snapshot)$/];
const postPaths=new Set(['/api/auth/verify','/api/auth/logout','/rpc']);
export function publicRouteAllowed(method,path){
  return method==='GET'&&readPaths.some(p=>p.test(path))||method==='POST'&&postPaths.has(path);
}
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,x[k]]));
export function createPublicPolicy(env={}, {writeReadiness=async()=>false}={}){
  const origin=env.VAULT_PUBLIC_ORIGIN;
  if(!origin)return {enabled:false,writeEnabled:async()=>false};
  let url;try{url=new URL(origin);}catch{throw Error('VAULT_PUBLIC_ORIGIN must be an exact HTTPS origin');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||url.hostname==='localhost'||isIP(url.hostname))throw Error('VAULT_PUBLIC_ORIGIN must be an exact public HTTPS origin without a path');
  const owner=env.VAULT_PUBLIC_OWNER;
  if(owner&&!isAddress(owner.toLowerCase()))throw Error('Invalid VAULT_PUBLIC_OWNER');
  const policy={enabled:true,origin,host:url.host,owner:owner?getAddress(owner.toLowerCase()):null,
    async writeEnabled(){
      if(env.VAULT_PUBLIC_WRITES!=='1'||!owner)return false;
      try{return (await writeReadiness())===true;}catch{return false;}
    }};
  return policy;
}

export async function browserConfig(config,policy){
  if(!policy.enabled)return config;
  if(config.protocolVersion!=='2'||config.chainId!==31373)throw Error('Public mode requires the explicitly selected Vault V2 deployment');
  const write=await policy.writeEnabled();
  const exposed=pick(config,['name','chainId','protocolVersion','deploymentBlock','addresses','proof','exampleOperator','monetaryPolicy']);
  exposed.chainInstance=pick(config.chainInstance,['id','kind','chainId','createdAt','genesisTimestamp']);
  if(config.social)exposed.social=pick(config.social,['format','chainId','chainInstance','statementRegistry','schemaRegistry','eas','resolver','schemas','deploymentBlock','easPackage','contractVersion','releaseCommit','codeHashes']);
  return {...exposed,publicMode:true,publicOrigin:policy.origin,publicOwnerAddress:policy.owner,
    rpcUrl:policy.origin+'/rpc',apiUrl:policy.origin+'/api',webUrl:policy.origin,publicWriteEnabled:write,
    capabilities:{devWallet:false,mining:false,proofJobs:false,nativeLean:false,sourceImport:false,
      sourcePublication:false,packageDownload:false,walletTransactions:write,externalCertificates:true}};
}

// Nginx MUST replace X-Vault-Client-IP with its trusted client identity (never
// append/pass a client-provided header). Global quotas remain independent of it.
export function publicMiddleware(policy){
  const global=createWindowLimiter({limit:300,keys:1}),clients=createWindowLimiter({limit:120});
  return (req,res,next)=>{
    if(!policy.enabled)return next();
    res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
    const host=req.headers.host,origin=req.headers.origin;
    if(host!==policy.host)return res.status(403).json({error:'Public Host mismatch'});
    const rpc=req.path==='/rpc';
    // Wallet extensions and mobile wallets contact RPC outside the page origin.
    // RPC never uses cookies/session authority; only cryptographic raw signing.
    if(rpc)res.set('Access-Control-Allow-Origin','*');
    else if(origin!==undefined&&origin!==policy.origin)return res.status(403).json({error:'Origin denied'});
    const requested=req.method==='OPTIONS'?req.headers['access-control-request-method']:req.method;
    if(!publicRouteAllowed(requested,req.path))return res.status(404).json({error:'Route is unavailable in public mode'});
    if(req.path.startsWith('/api/auth/')&&req.method==='POST'&&origin!==policy.origin)return res.status(403).json({error:'Same-origin wallet authentication required'});
    const supplied=req.headers['x-vault-client-ip'];
    const client=typeof supplied==='string'&&isIP(supplied)?supplied:'shared-proxy';
    if(!global('all')||!clients(client))return res.status(429).json({error:'Public API rate limit; retry later'});
    if(req.method==='OPTIONS'){
      if(!rpc&&origin!==policy.origin)return res.status(403).json({error:'Origin required'});
      if(!rpc){res.set('Access-Control-Allow-Origin',policy.origin);res.set('Access-Control-Allow-Credentials','true');}
      res.set('Access-Control-Allow-Headers','Content-Type');res.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      return res.sendStatus(204);
    }
    if(req.query.rebuild==='true')return res.status(400).json({error:'Public API serves the chain cache; rebuild via bounded read-only RPC'});
    next();
  };
}

// A timed-out handler retains its admission slot until its underlying reads
// finish: repeated timeouts cannot accumulate unbounded outstanding SDK work.
export function publicRouteWrapper(policy,{timeout=15_000,maxInflight=2,responseBytes=3*1024*1024}={}){
  let active=0;
  return fn=>(req,res,next)=>{
    if(!policy.enabled)return Promise.resolve(fn(req,res)).catch(next);
    if(active>=maxInflight)return res.status(429).json({error:'Public API is busy; retry later'});
    active++;
    const json=res.json.bind(res);
    res.json=value=>{
      if(res.headersSent)return res;
      if(Buffer.byteLength(JSON.stringify(value))>responseBytes){res.status(503);return json({error:'Public response exceeds byte limit'});}
      return json(value);
    };
    const timer=setTimeout(()=>{if(!res.headersSent)res.status(504).json({error:'Public read timed out'});},timeout);
    return Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(!res.headersSent)next(e);}).finally(()=>{clearTimeout(timer);active--;});
  };
}

export function validSiweBinding(siwe,policy,allowed){
  let uri;try{uri=new URL(siwe.uri);}catch{return false;}
  if(siwe.chainId!==31373)return false;
  if(policy.enabled)return siwe.domain===policy.host&&uri.origin===policy.origin&&uri.protocol==='https:';
  return allowed.has(uri.origin)&&new URL(uri.origin).host===siwe.domain;
}
