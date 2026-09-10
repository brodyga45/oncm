import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {verifiedMetadataText,validateMonetaryArtifact,monetaryNames,matchesRuntime} from '../scripts/monetary-bootstrap.mjs';
const base=fs.existsSync('production-v2/artifacts/TrueTokenV2.json')?'production-v2/artifacts':'.state/monetary-artifacts';
const a=()=>JSON.parse(fs.readFileSync(base+'/TrueTokenV2.json'));
test('Actual solc Unicode metadata is recovered only with its exact embedded CID',()=>{
 const artifact=a(),found=verifiedMetadataText(artifact);assert.deepEqual(JSON.parse(found.text),artifact.metadata);
 assert.ok(found.text.includes('\\u2019'));assert.equal(found.digest,'cf7bb3616d0337b2a56fe98af73c7f03be32b17f5714207fbe8f56e6632a99b2');
 const changed=structuredClone(artifact);changed.metadata.settings.optimizer.runs=2;
 assert.throws(()=>verifiedMetadataText(changed),/metadata mismatch/);
});
test('Raw metadata, when present, is binding and cannot be replaced by another serialization',()=>{
 const artifact=a(),text=verifiedMetadataText(artifact).text;artifact.metadataText=text;
 assert.equal(verifiedMetadataText(artifact).text,text);artifact.metadataText=text+'\n';
 assert.throws(()=>verifiedMetadataText(artifact),/metadata mismatch/);
});
test('All seven genuine production artifacts bind current sources and immutable runtime masks',()=>{
 for(const name of monetaryNames){const artifact=JSON.parse(fs.readFileSync(base+'/'+name+'.json'));
  assert.ok(validateMonetaryArtifact(process.cwd(),artifact).pins.length>0);
  assert.equal(matchesRuntime(artifact.deployedBytecode,artifact),true);
  const changed='0x00'+artifact.deployedBytecode.slice(4);assert.equal(matchesRuntime(changed,artifact),false);
 }
 assert.equal(monetaryNames.some(n=>n.includes('Harness')),false);
});
