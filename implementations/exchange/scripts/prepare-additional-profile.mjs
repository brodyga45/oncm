// Deploy only an additional immutable bridge. Never vote/install/change v3 or create a market.
import fs from "node:fs";
import path from "node:path";
import { Contract, ContractFactory, HDNodeWallet, JsonRpcProvider, NonceManager, ZeroAddress, sha256 } from "ethers";
const root = path.resolve(import.meta.dirname, "..");
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const d = read("data/deployment.json");
if (d.chainId !== 31372 || d.testHarness || !["http://127.0.0.1:9546", "http://localhost:9546"].includes(d.rpc)) throw Error("Exchange real local chain only");
const provider = new JsonRpcProvider(d.rpc, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 100;
if ((await provider.getNetwork()).chainId !== 31372n) throw Error("Wrong chain");
const wallet = HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/0").connect(provider);
if (wallet.address.toLowerCase() !== d.accounts[0].toLowerCase()) throw Error("Unexpected local deployment account");
const signer = new NonceManager(wallet);
const p = read("proof/profiles/perf05/profile.json");
const artifact = read("proof/artifacts/LeanProofBridge.json");
const protocol = new Contract(d.contracts.protocol, read("artifacts/ExchangeProtocol.json").abi, provider);
if ((await protocol.owner()).toLowerCase() !== d.contracts.timelock.toLowerCase()) throw Error("Expected Timelock governance");
const installed = await protocol.profiles(p.profileId);
const destination = path.join(root, "data/additional-proof-profiles.json");
const records = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination)) : [];
let record = records.find(x => x.profileId === p.profileId);
let address = installed.verifier !== ZeroAddress ? installed.verifier : record?.verifier;
if (!address || (await provider.getCode(address)) === "0x") {
  const bridge = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(p.imageId, p.profileId);
  const receipt = await bridge.deploymentTransaction().wait();
  await bridge.waitForDeployment();
  address = bridge.target;
  record = { id: "perf05", profileId: p.profileId, imageId: p.imageId, verifier: address,
    deployment: { hash: receipt.hash, blockNumber: receipt.blockNumber } };
}
const bridge = new Contract(address, artifact.abi, provider);
if ((await bridge.imageId()) !== p.imageId || (await bridge.profileId()) !== p.profileId) throw Error("Bridge binding mismatch");
const manifest = sha256(fs.readFileSync(path.join(root, "proof/profiles/perf05/profile.json")));
const installation = { target: d.contracts.protocol, value: "0", calldata: protocol.interface.encodeFunctionData("addProfile", [p.profileId, address, manifest]),
  description: `Add immutable Lean logic perf05 profile ${p.profileId}; verifier ${address}; manifest ${manifest}. Keep v3 and its availability unchanged.`,
  profileId: p.profileId, verifier: address, manifest, installed: installed.verifier !== ZeroAddress };
record = { ...record, id: "perf05", profileId: p.profileId, imageId: p.imageId, verifier: address, installation };
fs.writeFileSync(destination, JSON.stringify([...records.filter(x => x.profileId !== p.profileId), record], null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
