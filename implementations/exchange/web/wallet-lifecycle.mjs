// One generation spans signer, SIWE, private forms, proof tickets and SDK calls.
// Returning to the same address never revives work from an earlier generation.
export function createWalletLifecycle() {
  let epoch = 0, mode = "";
  const current = ticket => ticket === epoch;
  return {
    ticket: () => epoch,
    current,
    assert(ticket) { if (!current(ticket)) throw Error("Wallet or session changed; start this action again"); },
    invalidate() { mode = ""; return ++epoch; },
    activate(ticket, nextMode) { if (!current(ticket)) return false; mode = nextMode; return true; },
    listen(ethereum, onChange) {
      if (!ethereum?.on) return () => {};
      const handlers = Object.fromEntries(["accountsChanged", "chainChanged", "disconnect"].map(event => [event, () => {
        // A wallet_switchEthereumChain while explicitly connecting is expected.
        // connect() validates the final chain/account before activating injected mode.
        if (mode !== "injected") return;
        this.invalidate(); onChange(event);
      }]));
      for (const [event, handler] of Object.entries(handlers)) ethereum.on(event, handler);
      return () => { for (const [event, handler] of Object.entries(handlers)) ethereum.removeListener?.(event, handler); };
    },
  };
}

export async function authenticateWallet({ lifecycle, ticket, signer, address, nonce, verify, revoke, makeMessage }) {
  lifecycle.assert(ticket);
  const challenge = await nonce();
  lifecycle.assert(ticket);
  const message = makeMessage(challenge, address);
  const signature = await signer.signMessage(message);
  lifecycle.assert(ticket);
  const session = await verify(message, signature);
  if (!lifecycle.current(ticket) || session.address?.toLowerCase() !== address.toLowerCase()) {
    if (session.token) await revoke(session.token).catch(() => {});
    throw Error("Wallet or session changed during sign-in; sign in again");
  }
  return session;
}
