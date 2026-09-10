// EIP-6963 discovery: keep provider identity instead of competing for window.ethereum.
export function discoverWallets(target, publish) {
  const announced = [];
  let stopped = false;
  function refresh() {
    if (stopped) return;
    const wallets = [...announced];
    const legacy = target.ethereum;
    // Only use the ambiguous legacy provider when no named providers announced.
    if (!wallets.length && typeof legacy?.request === 'function') {
      wallets.push({ id: 'legacy', name: 'Кошелёк браузера (без имени)', provider: legacy });
    }
    publish(wallets);
  }
  function onAnnounce(event) {
    const { info, provider } = event.detail || {};
    if (typeof provider?.request !== 'function' || typeof info?.uuid !== 'string'
      || !info.uuid || typeof info.name !== 'string' || !info.name.trim()) return;
    if (announced.some(wallet => wallet.id === info.uuid || wallet.provider === provider)) return;
    // Metadata is self-reported. Render plain text only; don't execute SVG icons.
    announced.push({ id: info.uuid, name: info.name.slice(0, 80), provider });
    refresh();
  }
  target.addEventListener('eip6963:announceProvider', onAnnounce);
  function request() {
    if (stopped) return;
    target.dispatchEvent(new Event('eip6963:requestProvider'));
    refresh();
  }
  request();
  return { request, dispose() {
    stopped = true;
    target.removeEventListener('eip6963:announceProvider', onAnnounce);
  } };
}

export function watchWallet(provider, changed) {
  provider?.on?.('accountsChanged', changed);
  provider?.on?.('chainChanged', changed);
  provider?.on?.('disconnect', changed);
  return () => {
    provider?.removeListener?.('accountsChanged', changed);
    provider?.removeListener?.('chainChanged', changed);
    provider?.removeListener?.('disconnect', changed);
  };
}
