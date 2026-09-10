import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWalletLifecycle, authenticateWallet } from '../web/wallet-lifecycle.mjs';
import { ExchangeSDK } from '../sdk/index.mjs';

const address = '0x0000000000000000000000000000000000000001';
const deferred = () => { let resolve; return { promise: new Promise(r => resolve = r), resolve: value => resolve(value) }; };
function auth(lifecycle, changes = {}) {
  return { lifecycle, ticket: lifecycle.ticket(), address,
    signer: { signMessage: async () => 'signature' }, nonce: async () => 'nonce',
    makeMessage: () => 'message', verify: async () => ({ address, token: 'test-token' }),
    revoke: async () => {}, ...changes };
}

test('injected account/chain/disconnect events each invalidate async work and listener disposal is exact', () => {
  const life = createWalletLifecycle(), wallet = new EventEmitter(), events = [];
  const dispose = life.listen(wallet, event => events.push(event));
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
    const ticket = life.ticket(); life.activate(ticket, 'injected');
    wallet.emit(event, []);
    assert.equal(life.current(ticket), false);
  }
  assert.deepEqual(events, ['accountsChanged', 'chainChanged', 'disconnect']);
  dispose();
  for (const name of events) assert.equal(wallet.listenerCount(name), 0);
});
test('connecting wallet chain events are checked by connect final validation, dev wallets ignore unrelated extension events', () => {
  const life = createWalletLifecycle(), wallet = new EventEmitter(); let changes = 0;
  const dispose = life.listen(wallet, () => changes++);
  wallet.emit('chainChanged', '0x7a8c');
  life.activate(life.ticket(), '0'); wallet.emit('accountsChanged', []);
  assert.equal(changes, 0); dispose();
});
test('wallet A → B → A and logout invalidate all earlier tickets and cannot reactivate stale connect', () => {
  const life = createWalletLifecycle(), a = life.invalidate(); life.activate(a, 'injected');
  life.invalidate(); const secondA = life.invalidate(); life.activate(secondA, 'injected');
  assert.equal(life.activate(a, 'injected'), false);
  assert.throws(() => life.assert(a), /changed/);
  life.invalidate(); assert.equal(life.current(secondA), false);
});
test('wallet change while awaiting nonce stops the old signature request', async () => {
  const life = createWalletLifecycle(), nonce = deferred(); let signatures = 0;
  const pending = authenticateWallet(auth(life, { nonce: () => nonce.promise,
    signer: { signMessage: async () => { signatures++; return 'signature'; } } }));
  life.invalidate(); nonce.resolve('nonce');
  await assert.rejects(pending, /changed/); assert.equal(signatures, 0);
});
test('wallet change during signature prevents authentication verification request', async () => {
  const life = createWalletLifecycle(), signed = deferred(), requested = deferred(); let verifies = 0;
  const pending = authenticateWallet(auth(life, { signer: { signMessage: () => { requested.resolve(); return signed.promise; } },
    verify: async () => { verifies++; return {address,token:'test'}; } }));
  await requested.promise; life.invalidate(); signed.resolve('signature');
  await assert.rejects(pending, /changed/); assert.equal(verifies, 0);
});
test('late server SIWE success is revoked and never accepted after logout', async () => {
  const life = createWalletLifecycle(), response = deferred(), requested = deferred(), revoked = [];
  const pending = authenticateWallet(auth(life, { verify: () => { requested.resolve(); return response.promise; }, revoke: async token => revoked.push(token) }));
  await requested.promise; life.invalidate(); response.resolve({address,token:'obsolete-token'});
  await assert.rejects(pending, /changed/); assert.deepEqual(revoked, ['obsolete-token']);
});
test('successful unchanged signer accepts its own session, mismatched server principal is revoked', async () => {
  const life = createWalletLifecycle();
  assert.equal((await authenticateWallet(auth(life))).address,address);
  const revoked = [];
  await assert.rejects(authenticateWallet(auth(life, {verify: async () => ({address:'0x02',token:'mismatch'}),revoke: async token => revoked.push(token)})),/changed/);
  assert.deepEqual(revoked,['mismatch']);
});
test('SDK invalidates an old transaction continuation after asynchronous network check', async () => {
  const life = createWalletLifecycle(), ticket = life.ticket(), network = deferred(); let broadcasts = 0;
  const sdk = new ExchangeSDK({getNetwork: () => network.promise}, {}, {}, {});
  sdk.assertCurrent = () => life.assert(ticket);
  const pending = sdk.tx('Must not send', () => { broadcasts++; throw Error('must not be called'); });
  life.invalidate(); network.resolve({chainId:31372n});
  await assert.rejects(pending,/changed/); assert.equal(broadcasts,0);
});
