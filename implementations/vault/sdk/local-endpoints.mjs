// Explicit loopback-only port offset for independent local source-copy QA.
// The chain ID and public test-account restrictions are unchanged.
export function localEndpoints(value=0){
 if(!/^(0|[1-9][0-9]*)$/.test(String(value)))throw Error('VAULT_PORT_OFFSET must be a canonical nonnegative integer');
 const offset=Number(value);if(!Number.isSafeInteger(offset)||offset>50000)throw Error('VAULT_PORT_OFFSET must be0..50000');
 const rpcPort=9547+offset,apiPort=4173+offset,webPort=5173+offset;
 return {offset,chainId:31373,rpcPort,apiPort,webPort,rpcUrl:`http://127.0.0.1:${rpcPort}`,apiUrl:`http://127.0.0.1:${apiPort}`,webUrl:`http://127.0.0.1:${webPort}`};
}
export function assertLocalConfig(config){
 if(config.publicMode)throw Error('Local development wallets and mining are disabled in public mode');
 const endpoints=localEndpoints(config.localPortOffset??0);
 if(config.chainId!==31373||![endpoints.rpcUrl,`http://localhost:${endpoints.rpcPort}`].includes(config.rpcUrl))throw Error('Vault test wallet/setup requires its explicit loopback RPC and chain31373');
 return endpoints;
}
