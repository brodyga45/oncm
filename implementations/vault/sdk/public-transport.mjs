import { assertLocalConfig } from './local-endpoints.mjs';

export function publicOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('Public Vault requires an HTTPS origin without credentials, path or query');
  return url.origin;
}

// Browser transport is derived only from the server's explicit public deployment mode.
// Server-side SDKs keep using their separately configured loopback connection.
export function browserConfig(config, origin) {
  if (!config.publicMode) return config;
  if (config.publicMode !== true || config.chainId !== 31373) throw Error('Unsupported public Vault configuration');
  const configured = publicOrigin(config.publicOrigin);
  if (publicOrigin(origin) !== configured) throw Error('Public Vault origin does not match this page');
  return { ...config, rpcUrl: configured + '/rpc', apiUrl: configured + '/api' };
}

export function walletChain(config) {
  if (config.chainId !== 31373) throw Error('Unsupported Vault chain');
  if (!config.publicMode) { assertLocalConfig(config); return null; }
  if (config.publicMode !== true) throw Error('Invalid public mode');
  const origin = publicOrigin(config.publicOrigin);
  if (config.rpcUrl !== origin + '/rpc') throw Error('Wallet RPC must match the configured public origin');
  return {
    chainId: '0x7a8d', chainName: 'Vault V2 — hosted test chain',
    nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [origin + '/rpc'],
  };
}

// Called only from the visible wallet-connect action. Adding a network does not
// imply that the wallet selected it: explicitly switch and verify afterward.
export async function selectWalletChain(ethereum, config) {
  const chain = walletChain(config);
  if (!chain) return; // Preserve the existing manually configured local-wallet flow.
  const requestNetwork = async (method, params) => {
    try { return await ethereum.request({ method, params }); }
    catch (error) {
      // A rejected request is a user decision, even if a wallet attaches an
      // ambiguous message. Preserve it and never attempt another route.
      const code = Number(error?.code);
      if (code === 4001) throw error;
      const unsupportedMessage = /^Uniswap Wallet does not support wallet_(?:add|switch)EthereumChain\.?$/i.test(error?.message || '');
      if (code === 4200 || code === -32601 || unsupportedMessage)
        throw Object.assign(new Error('Этот кошелёк не поддерживает добавление или переключение пользовательских сетей. Для Vault нужен кошелёк с поддержкой custom RPC, например MetaMask: сеть 31373, RPC ' + chain.rpcUrls[0], { cause: error }), { code: [4200, -32601].includes(code) ? code : 4200 });
      throw error;
    }
  };
  const selected = await ethereum.request({ method: 'eth_chainId' });
  if (BigInt(selected) !== 31373n) {
    try {
      await requestNetwork('wallet_switchEthereumChain', [{ chainId: chain.chainId }]);
    } catch (error) {
      if (Number(error?.code) !== 4902) throw error;
      await requestNetwork('wallet_addEthereumChain', [chain]);
      await requestNetwork('wallet_switchEthereumChain', [{ chainId: chain.chainId }]);
    }
  }
  if (BigInt(await ethereum.request({ method: 'eth_chainId' })) !== 31373n)
    throw Error('Wallet did not select Vault chain 31373');
}

export function assertPublicWrites(config) {
  if (config.publicMode && (config.publicWriteEnabled !== true || config.capabilities?.walletTransactions !== true))
    throw Error('Public Vault is currently read-only; wallet transactions are not enabled');
}

export function publicWalletProvider(ethereum, config) {
  if (!config?.publicMode) return ethereum;
  return { request: async (request) => {
    if (['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_signTransaction', 'eth_sign',
      'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'].includes(request.method))
      assertPublicWrites(config);
    return ethereum.request(request);
  } };
}
