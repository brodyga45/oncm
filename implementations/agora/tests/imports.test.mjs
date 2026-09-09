import test from 'node:test';import assert from 'node:assert/strict';
import {parseSnapshot} from '../server/imports.mjs';
test('snapshot importer accepts only immutable public GitHub Lean files',()=>{
 const commit='a'.repeat(40);assert.equal(parseSnapshot(`https://github.com/leanprover/lean4/blob/${commit}/src/Init/Data/Nat/Basic.lean`).commit,commit);
 for(const url of ['file:///etc/passwd','http://127.0.0.1/secret',`https://evil.example/lean/blob/${commit}/x.lean`,`https://github.com/leanprover/lean4/blob/main/Init.lean`,`https://github.com/x/y/blob/${commit}/%2e%2e/secrets.lean`])assert.throws(()=>parseSnapshot(url));
});
