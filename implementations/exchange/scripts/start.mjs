import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider } from "ethers";
import { ensureProofBootstrap } from "./proof-bootstrap.mjs";
import { localEndpoints } from "../sdk/local-endpoints.mjs";
process.chdir(path.resolve(import.meta.dirname, ".."));
fs.mkdirSync("data", { recursive: true });
const children = new Set();
let provider, stopping;
const alive = p => p.exitCode === null && p.signalCode === null;
function track(p) {
  children.add(p);
  p.once("exit", () => children.delete(p));
  return p;
}
function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    const owned = [...children].filter(alive);
    const waits = owned.map(p => new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      p.once("exit", () => { clearTimeout(timer); resolve(); });
    }));
    for (const p of owned) p.kill("SIGTERM");
    await Promise.all(waits);
    for (const p of owned) if (alive(p)) p.kill("SIGKILL");
    provider?.destroy();
  })();
  return stopping;
}
// Register cleanup before compilation or any owned node can be started.
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { void stop().then(() => process.exit(0)); });
function start(label, args) {
  const log = fs.openSync("data/" + label + ".log", "a");
  let p;
  try {
    p = track(spawn(process.execPath, args, {stdio: ["ignore", log, log], env: process.env}));
  } finally { fs.closeSync(log); }
  p.on("error", error => { console.error(label + ": " + error.message); void stop().then(() => process.exit(1)); });
  p.on("exit", code => {
    if (code) console.error(label + " exited " + code + "; inspect data/" + label + ".log");
  });
  return p;
}
function once(args) {
  return new Promise((resolve, reject) => {
    const p = track(spawn(process.execPath, args, {stdio: "inherit"}));
    p.once("error", reject);
    p.once("exit", (code, signal) => code === 0 ? resolve() : reject(Error(args[0] + " failed: " + (signal || code))));
  });
}
async function main() {
  const endpoints=localEndpoints(process.env.EXCHANGE_PORT_OFFSET||'0');
  process.env.VITE_EXCHANGE_PORT_OFFSET=String(endpoints.offset);
  ensureProofBootstrap(path.resolve(import.meta.dirname, ".."));
  if (!fs.existsSync("artifacts/ExchangeProtocol.json") || !fs.existsSync("web/generated/abis.json"))
    await once(["scripts/compile.mjs"]);
  provider = new JsonRpcProvider(endpoints.rpc, undefined, {cacheTimeout: -1});
  let chainId;
  try { chainId = Number((await provider.getNetwork()).chainId); } catch {}
  if (chainId !== undefined && chainId !== 31372) throw Error(endpoints.rpc+" belongs to another chain; no process or deployment will replace it");
  if (chainId === undefined) {
    start("chain", ["scripts/chain.mjs"]);
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      try { chainId = Number((await provider.getNetwork()).chainId); } catch {}
      if (chainId !== undefined) break;
    }
  }
  if (chainId !== 31372) throw Error("Local chain failed to start; inspect data/chain.log");
  if (fs.existsSync("data/deployment.json")) {
    const saved = JSON.parse(fs.readFileSync("data/deployment.json"));
    if (saved.chainId !== 31372 || !saved.contracts?.protocol || await provider.getCode(saved.contracts.protocol) === "0x")
      throw Error("Saved protocol deployment is absent from this chain; inspect persistence before any new deployment");
  } else {
    if (fs.existsSync("data/social-deployment.json")) throw Error("Saved social deployment without protocol record; restore the matching state before startup");
    await once(["scripts/deploy.mjs"]);
  }
  const deployment = JSON.parse(fs.readFileSync("data/deployment.json"));
  if (!fs.existsSync("artifacts/social/ExchangeSocialHook.json") || !fs.existsSync("web/generated/social-abis.json"))
    await once(["scripts/compile-social.mjs"]);
  if (!fs.existsSync("data/social-deployment.json")) await once(["scripts/deploy-social.mjs"]);
  const social = JSON.parse(fs.readFileSync("data/social-deployment.json"));
  if (social.chainId !== 31372 || social.registry?.toLowerCase() !== deployment.contracts.protocol.toLowerCase())
    throw Error("Saved social deployment belongs to a different registry or chain");
  for (const field of ["hook", "comments", "channels"])
    if (!social[field] || await provider.getCode(social[field]) === "0x")
      throw Error("Saved social " + field + " is missing from chain; inspect persistence, do not silently replace it");
  fs.writeFileSync("web/generated/social-deployment.json", JSON.stringify(social, null, 2));
  start("api", ["api/server.mjs"]);
  start("web", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(endpoints.webPort), "--strictPort"]);
  console.log("Exchange: "+endpoints.web+" | API "+endpoints.api+" | chain31372 RPC "+endpoints.rpc+". Logs data/*.log. Ctrl+C stops only owned processes.");
}
try { await main(); } catch (error) { await stop(); throw error; }
