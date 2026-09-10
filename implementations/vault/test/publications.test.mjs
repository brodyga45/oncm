import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { publications, preparePackage, packageZip } from '../server/publications.mjs';
const A = '0x' + '11'.repeat(20), B = '0x' + '22'.repeat(20);
const context = { chainInstance: 'chain-a', statement: { id: '0x' + 'ab'.repeat(32), author: A, kind: 0, title: 'Example', goalHash: '0x' + '34'.repeat(32), profileId: '0x' + '56'.repeat(32) }, descriptor: { lean: '4.33.1' } };
const input = { challengeSource: 'namespace Oncm\ndef goal : Prop := True\nend Oncm\n', solutionSource: 'theorem Oncm.solution : Oncm.goal := True.intro\n', publish: true };

test('publication requires explicit source consent and actual statement author, ignores spoofing/private jobs', () => {
  const db = { jobs: [{ author: B, input: { source: 'PRIVATE SECRET' } }] };
  let stored;
  const service = publications(db, () => stored = JSON.stringify(db));
  assert.throws(() => service.publish(A, { ...input, publish: false }, context), /consent/);
  assert.throws(() => service.publish(B, { ...input, author: A }, context), /statement author/);
  const first = service.publish(A, { ...input, author: B }, context);
  assert.equal(first.author, A);
  assert.equal(JSON.stringify(first).includes('PRIVATE SECRET'), false);
  assert.equal(service.list('chain-b', context.statement.id).length, 0);
  assert.equal(publications(JSON.parse(stored)).list('chain-a', context.statement.id).length, 1);
  assert.equal(service.publish(A, input, context).id, first.id);
  const second = service.publish(A, { ...input, challengeSource: input.challengeSource + '-- revision\n' }, context);
  assert.equal(second.revision, 2);
  assert.equal(first.files[0].content, input.challengeSource);
});

test('portable ZIP preserves separate exact source files, pinned toolchain, dependency lock and safe paths', () => {
  const pkg = preparePackage({ ...input, lakeManifest: '{"version":"1.1.0","packages":[]}' }, context);
  const files = unzipSync(packageZip(pkg));
  assert.equal(strFromU8(files['Challenge.lean']), input.challengeSource);
  assert.equal(strFromU8(files['Solution.lean']), 'prelude\nimport Challenge\n\n' + input.solutionSource);
  assert.equal(strFromU8(files['lean-toolchain']), 'leanprover/lean4:v4.33.1\n');
  assert.equal(JSON.parse(strFromU8(files['runner-input.json'])).action, 'check');
  assert.equal(JSON.parse(strFromU8(files['runner-input.json'])).goalHash, context.statement.goalHash);
  for (const name of ['formalization.yaml', 'lakefile.lean', 'lake-manifest.json', 'README.md', 'package-manifest.json']) assert.ok(files[name]);
  assert.ok(Object.keys(files).every((name) => !name.includes('/') && !name.includes('..')));
  assert.match(pkg.verification, /comparison required/);
});

test('package validation rejects missing source, oversized text and malformed dependency manifests', () => {
  assert.throws(() => preparePackage({}, context), /Challenge/);
  assert.throws(() => preparePackage({ ...input, challengeSource: 'x'.repeat(250001) }, context), /250 KB/);
  assert.throws(() => preparePackage({ ...input, lakeManifest: 'broken' }, context));
  assert.throws(() => preparePackage({ ...input, solutionSource: 'import Challenge\n' }, context), /body/);
  assert.throws(() => preparePackage(input, {}), /exact Lean version/);
});
