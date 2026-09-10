import ganache from "ganache";
import path from "node:path";
import {localEndpoints} from '../sdk/local-endpoints.mjs';
const endpoints=localEndpoints(process.env.EXCHANGE_PORT_OFFSET||'0');
const root = path.resolve(import.meta.dirname, "..");
const server = ganache.server({
  chain: { chainId: 31372, hardfork: "shanghai" },
  wallet: {
    mnemonic: "test test test test test test test test test test test junk",
    totalAccounts: 10,
    defaultBalance: 10000,
  },
  miner: { blockGasLimit: 30000000 },
  database: { dbPath: path.join(root, "data", "chain") },
  logging: { quiet: true },
});
await server.listen(endpoints.rpcPort, "127.0.0.1");
console.log("Exchange local-only chain31372: "+endpoints.rpc);
