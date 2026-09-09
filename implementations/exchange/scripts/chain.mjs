import ganache from "ganache";
import path from "node:path";
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
await server.listen(9546, "127.0.0.1");
console.log("Exchange local-only chain 31372: http://127.0.0.1:9546");
