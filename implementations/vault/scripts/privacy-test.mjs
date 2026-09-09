// Wallet privacy/API test. Invalid Lean source exercises only the native check path, never a zk prover.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { HDNodeWallet } from 'ethers';
import { createCommunitySDK } from '../sdk/community.mjs';
const options = { baseUrl: 'http://127.0.0.1:4173/api' };
const a = createCommunitySDK(options),
  b = createCommunitySDK(options),
  anonymous = createCommunitySDK(options);
const wallet = (n) =>
  HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk',
    undefined,
    `m/44'/60'/0'/0/${n}`,
  );
const checks = [];
await a.login(wallet(2));
await b.login(wallet(3));
const { config } = await a.request('/config');
await assert.rejects(() => anonymous.jobs(), /Sign in/);
checks.push('anonymous queue is private');
const job = await a.startJob({
  action: 'check',
  source: '-- Private invalid challenge. No theorem declared.',
  profileId: config.proof.profileId,
  outcome: 1,
  author: wallet(3).address,
});
assert.equal(job.author, wallet(2).address);
checks.push('job author derives from SIWE, not request author');
assert.equal((await a.job(job.id)).input.source, job.input.source);
checks.push('owner can read unpublished source');
await assert.rejects(() => b.job(job.id), /Unknown job/);
await assert.rejects(() => anonymous.job(job.id), /Sign in/);
checks.push('another wallet and anonymous reader cannot access job by ID');
assert(!(await b.jobs()).some((j) => j.id === job.id));
assert((await a.jobs()).every((j) => j.author.toLowerCase() === wallet(2).address.toLowerCase()));
checks.push('queue list is wallet scoped');
fs.writeFileSync(
  '.state/privacy-report.json',
  JSON.stringify({ status: 'passed', checks, date: new Date().toISOString() }, null, 2),
);
for (const check of checks) console.log('PASS', check);
