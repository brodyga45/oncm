import fs from 'node:fs';
import path from 'node:path';
import {ExchangeSDK} from '../sdk/index.mjs';
import {ExchangeSocialSDK} from '../sdk/social.mjs';
export function socialWriteRetired(method,url,ready){return ready&&!['GET','HEAD','OPTIONS'].includes(method)&&(/^\/api\/profile\/?$/.test(url)||/^\/api\/comments\//.test(url));}
export function installOnchainSocialRoutes(app,{root,provider}){
 function descriptor(){const p=path.join(root,'data/social-deployment.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;}
 function social(){const d=descriptor();if(d?.status!=='ready')return null;const protocol=JSON.parse(fs.readFileSync(path.join(root,'data/deployment.json'))),abis=JSON.parse(fs.readFileSync(path.join(root,'web/generated/social-abis.json')));return new ExchangeSocialSDK(new ExchangeSDK(provider,null,protocol,{}),d,abis);}
 const safe=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){res.status(400).json({error:e.shortMessage||e.message});}};
 app.get('/api/social/deployment',safe(async(req,res)=>res.json(descriptor()||{status:'not-deployed'})));
 app.get('/api/social/index',safe(async(req,res)=>{const s=social();if(!s)return res.status(503).json({error:'Social not deployed'});res.json(await s.rebuildIndex({history:req.query.history==='true'}));}));
 app.get('/api/social/blog/:address',safe(async(req,res)=>{const s=social();if(!s)return res.status(503).json({error:'Social not deployed'});res.json(await s.blogs(req.params.address,{viewer:req.query.viewer}));}));
 app.get('/api/social/history/:id',safe(async(req,res)=>{const s=social();if(!s)return res.status(503).json({error:'Social not deployed'});res.json(await s.history(req.params.id));}));
 // The old files remain historical records. Never fabricate wallet-authored attestations from them.
 app.get('/api/legacy-social/profiles/:address',(req,res)=>{const p=path.join(root,'data/profiles.json');const rows=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{};res.json({source:'legacy-offchain',onchain:false,profile:rows[req.params.address.toLowerCase()]??null});});
 app.get('/api/legacy-social/comments/:id',(req,res)=>{const p=path.join(root,'data/comments.json');const rows=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):[];res.json({source:'legacy-offchain',onchain:false,comments:rows.filter(x=>x.statementId===req.params.id||x.marketId===req.params.id)});});
 app.use(safe(async(req,res,next)=>{
  const s=social();if(socialWriteRetired(req.method,req.path,!!s))return res.status(410).json({error:'Social writes are onchain. Send an ECP wallet transaction; SIWE cannot publish social state.',legacyRead:'/api/legacy-social/'});
  if(!s)return next();
  const profile=req.method==='GET'&&req.path.match(/^\/api\/profiles\/(0x[0-9a-fA-F]{40})$/);
  if(profile)return res.json({...await s.profile(profile[1]),source:'onchain-ecp'});
  const discussion=req.method==='GET'&&req.path.match(/^\/api\/comments\/(0x[0-9a-fA-F]{64})$/);
  if(discussion)return res.json(await s.comments(discussion[1],{sort:req.query.sort,viewer:req.query.viewer}));
  next();
 }));
}
