import test from 'node:test';
import assert from 'node:assert/strict';
import { walletConnection } from '../web/wallet-connection.mjs';

test('account prompt is dispatched synchronously and reports the exact waiting stage', async () => {
  const methods = [], phases = [];
  const connection = walletConnection({ request: request => {
    methods.push(request.method); return Promise.resolve(['0x1']);
  } }, phase => phases.push(phase));
  const result = connection.provider.request({ method: 'eth_requestAccounts' });
  assert.deepEqual(methods, ['eth_requestAccounts']);
  assert.match(phases[0], /доступ к адресу/);
  await result;
  connection.finish();
  await connection.provider.request({ method: 'eth_sendTransaction' });
  assert.equal(phases.length, 1, 'normal transactions no longer use connection timeouts/progress');
});

test('timeout releases waiting without allowing late approval to continue the handshake', async () => {
  let approve, calls = 0;
  const connection = walletConnection({ request() {
    calls++; return new Promise(resolve => { approve = resolve; });
  } }, () => {}, 10);
  await assert.rejects(connection.provider.request({ method: 'eth_requestAccounts' }), /Кошелёк не ответил/);
  approve(['0x1']);
  await assert.rejects(connection.provider.request({ method: 'wallet_switchEthereumChain' }), /без входа/);
  assert.throws(() => connection.finish(), /без входа/);
  assert.equal(calls, 1);
});

test('pending requests are actionable; user rejection and unknown-chain errors retain their codes', async () => {
  for (const code of [-32002, 4001, 4902]) {
    const error = Object.assign(Error('wallet error'), { code });
    const connection = walletConnection({ request: async () => { throw error; } }, () => {});
    await assert.rejects(connection.provider.request({ method: 'eth_requestAccounts' }), actual => {
      assert.equal(actual.code, code);
      if (code === -32002) assert.match(actual.message, /уже ожидает/);
      else assert.equal(actual, error);
      return true;
    });
    connection.close();
  }
});
