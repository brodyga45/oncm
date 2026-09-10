/** Port relocation only: host and dev-wallet chainId remain fixed. */
export function localNetwork(offset='0'){
 if(!/^(0|[1-9][0-9]*)$/.test(String(offset)))throw Error('AGORA_PORT_OFFSET must be a nonnegative integer');
 const delta=Number(offset);if(!Number.isSafeInteger(delta)||9545+delta>65535)throw Error('Agora offset exceeds TCP port range');
 const rpcPort=9545+delta,apiPort=4171+delta,webPort=5171+delta;
 return{rpcPort,apiPort,webPort,rpcUrl:`http://127.0.0.1:${rpcPort}`,apiUrl:`http://127.0.0.1:${apiPort}`,webOrigin:`http://127.0.0.1:${webPort}`,webDomain:`127.0.0.1:${webPort}`};
}
export const network=localNetwork(typeof process!=='undefined'?process.env.AGORA_PORT_OFFSET??'0':import.meta.env?.VITE_AGORA_PORT_OFFSET??'0');
