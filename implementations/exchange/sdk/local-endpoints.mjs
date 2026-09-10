// A port offset isolates standalone test instances while every endpoint remains
// loopback-only. It never changes chain ID or the dev-wallet network checks.
export function localEndpoints(offset='0'){
 const text=String(offset??'0');
 if(!/^(0|[1-9][0-9]{0,4})$/.test(text))throw Error('EXCHANGE_PORT_OFFSET must be a nonnegative integer');
 const value=Number(text),rpcPort=9546+value,apiPort=4172+value,webPort=5172+value;
 if(rpcPort>65535)throw Error('EXCHANGE_PORT_OFFSET exceeds TCP port range');
 return{chainId:31372,offset:value,rpcPort,apiPort,webPort,rpc:`http://127.0.0.1:${rpcPort}`,api:`http://127.0.0.1:${apiPort}`,web:`http://127.0.0.1:${webPort}`,
  browserOrigins:[`http://127.0.0.1:${webPort}`,`http://localhost:${webPort}`]};
}
