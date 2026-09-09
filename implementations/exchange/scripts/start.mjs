import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider } from "ethers";
process.chdir(path.resolve(import.meta.dirname, ".."));
fs.mkdirSync("data", { recursive: true });
const children = [];
function start(label, args) {
  const log = fs.openSync("data/" + label + ".log", "a"),
    p = spawn(process.execPath, args, {
      stdio: ["ignore", log, log],
      env: process.env,
    });
  children.push(p);
  p.on("exit", (code) => {
    if (code)
      console.error(
        label + " exited " + code + "; inspect data/" + label + ".log",
      );
  });
  return p;
}
function once(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { stdio: "inherit" });
    p.on("exit", (c) => (c ? reject(Error(args[0] + " failed")) : resolve()));
  });
}
if (!fs.existsSync("artifacts/ExchangeProtocol.json"))
  await once(["scripts/compile.mjs"]);
const provider = new JsonRpcProvider("http://127.0.0.1:9546", undefined, {
  cacheTimeout: -1,
});
let up = false;
try {
  up = Number((await provider.getNetwork()).chainId) === 31372;
} catch {}
if (!up) {
  start("chain", ["scripts/chain.mjs"]);
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      if (Number((await provider.getNetwork()).chainId) === 31372) {
        up = true;
        break;
      }
    } catch {}
  }
}
if (!up) throw Error("Local chain failed to start; inspect data/chain.log");
let deployed = false;
if (fs.existsSync("data/deployment.json")) {
  const d = JSON.parse(fs.readFileSync("data/deployment.json"));
  deployed = (await provider.getCode(d.contracts.protocol)) !== "0x";
}
if (!deployed) await once(["scripts/deploy.mjs"]);
start("api", ["api/server.mjs"]);
start("web", [
  "node_modules/vite/bin/vite.js",
  "--host",
  "127.0.0.1",
  "--port",
  "5172",
  "--strictPort",
]);
console.log(
  "Exchange: http://127.0.0.1:5172 | API :4172 | chain 31372 RPC :9546. Logs data/*.log. Ctrl+C stops owned processes.",
);
function stop() {
  for (const p of children) p.kill("SIGTERM");
  provider.destroy();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
