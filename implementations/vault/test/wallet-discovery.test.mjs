import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { discoverWallets, watchWallet } from '../web/wallet-discovery.mjs';

const provider = () => Object.assign(new EventEmitter(), { request: async () => [] });
function announce(target, uuid, name, wallet) {
  target.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: { info: { uuid, name }, provider: wallet },
  }));
}

test('named wallets retain distinct providers despite a competing global injection', () => {
  const target = new EventTarget(), metamask = provider(), uniswap = provider();
  target.ethereum = uniswap;
  target.addEventListener('eip6963:requestProvider', () => {
    announce(target, 'uniswap', 'Uniswap', uniswap);
    announce(target, 'metamask', 'MetaMask', metamask);
  });
  let wallets;
  const discovery = discoverWallets(target, value => { wallets = value; });
  assert.equal(wallets.length, 2);
  assert.equal(wallets.find(w => w.name === 'MetaMask').provider, metamask);
  discovery.request();
  announce(target, 'different-id', 'Duplicate', metamask);
  assert.equal(wallets.length, 2);
  discovery.dispose();
});

test('late announcements replace ambiguous fallback and discovery cleans up', () => {
  const target = new EventTarget();
  target.ethereum = provider();
  let wallets, updates = 0;
  const discovery = discoverWallets(target, value => { wallets = value; updates++; });
  assert.equal(wallets[0].id, 'legacy');
  announce(target, 'invalid', 'Invalid', {});
  assert.equal(wallets[0].id, 'legacy');
  const metamask = provider();
  announce(target, 'mm', 'MetaMask', metamask);
  assert.deepEqual(wallets.map(w => w.name), ['MetaMask']);
  discovery.dispose();
  const before = updates;
  announce(target, 'other', 'Other', provider());
  discovery.request();
  assert.equal(updates, before);
});

test('only events from the selected wallet invalidate a connection', () => {
  const selected = provider(), other = provider();
  let changes = 0;
  const stop = watchWallet(selected, () => changes++);
  other.emit('accountsChanged', ['0x1']);
  other.emit('chainChanged', '0x1');
  assert.equal(changes, 0);
  selected.emit('accountsChanged', []);
  selected.emit('chainChanged', '0x2');
  selected.emit('disconnect');
  assert.equal(changes, 3);
  stop();
  selected.emit('chainChanged', '0x3');
  assert.equal(changes, 3);
});
