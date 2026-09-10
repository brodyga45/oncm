import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Fastify from 'fastify';import {parseBoundedJSON} from '../sdk/external-bundle.mjs';
test('actual handler is installed before encapsulated routes, giving clear validation and parser failures',async()=>{
 const source=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8'),line=source.split('\n').find(l=>l.startsWith('app.setErrorHandler'));
 assert.ok(source.indexOf(line)<source.indexOf('await app.register'));const app=Fastify({logger:false});Function('app',line)(app);
 await app.register(async route=>{route.removeContentTypeParser('application/json');route.addContentTypeParser('application/json',{parseAs:'string'},(_req,raw,done)=>{try{done(null,parseBoundedJSON(raw));}catch(e){done(e);}});route.post('/import',async()=>{throw Error('Goal bytes differ from claim');});});
 try{const r=await app.inject({method:'POST',url:'/import',payload:{bundle:{}}});assert.equal(r.statusCode,400);assert.equal(r.json().error,'Goal bytes differ from claim');const dup=await app.inject({method:'POST',url:'/import',headers:{'content-type':'application/json'},payload:'{"bundle":{},"bundle":{}}'});assert.equal(dup.statusCode,400);assert.match(dup.json().error,/duplicate/i);assert.doesNotMatch(dup.body,/stack|Internal Server Error/);}finally{await app.close();}
});
