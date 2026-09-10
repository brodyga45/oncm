import fs from "node:fs";
import path from "node:path";
import {ensureProofBootstrap} from './proof-bootstrap.mjs';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
const endpoints=localEndpoints(process.env.EXCHANGE_PORT_OFFSET||'0');
import {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  HDNodeWallet,
  NonceManager,
  ZeroAddress,
  keccak256,
  toUtf8Bytes,
  parseEther,
} from "ethers";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
export const MNEMONIC =
  "test test test test test test test test test test test junk";
export function artifact(n) {
  return JSON.parse(fs.readFileSync("artifacts/" + n + ".json"));
}
export async function deploy(
  provider,
  { test = false, output = "data/deployment.json" } = {},
) {
  if (Number((await provider.getNetwork()).chainId) !== 31372)
    throw Error("Exchange deploy only on local chain 31372");
  if(!test)ensureProofBootstrap(root);
  const wallets = [0, 1, 2].map((i) =>
    HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).connect(
      provider,
    ),
  );
  const signer = new NonceManager(wallets[0]);
  const deployOne = async (n, args = []) => {
    const a = artifact(n),
      c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
    await c.waitForDeployment();
    console.log(n, await c.getAddress());
    return c;
  };
  const ctf = await deployOne("ConditionalTokens"),
    wrapper = await deployOne("Wrapped1155Factory"),
    token = await deployOne("TrueToken", [wallets.map((w) => w.address)]),
    factory = await deployOne("UniswapV2Factory", [wallets[0].address]),
    weth = await deployOne("WETH9"),
    v2router = await deployOne("UniswapV2Router02", [
      factory.target,
      weth.target,
    ]),
    router = await deployOne("Router", [ctf.target, wrapper.target]);
  const warehouse = await deployOne("SplitsWarehouse", [
      "Exchange Warehouse",
      "EXW",
    ]),
    splitFactory = await deployOne("PullSplitFactory", [warehouse.target]);
  const allocations = wallets
    .slice(0, 2)
    .map((w, i) => [w.address, i === 0 ? 6000 : 4000])
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
  const allocation = await deployOne("AllocationController", [
    splitFactory.target,
    allocations.map((a) => a[0]),
    allocations.map((a) => a[1]),
  ]);
  await (await factory.setFeeTo(allocation.target)).wait();
  const protocol = await deployOne("ExchangeProtocol", [
    ctf.target,
    wrapper.target,
    token.target,
    factory.target,
  ]);
  const operatorSample = await deployOne("UnresolvedByOperator");
  const arbitrage = await deployOne("FullSetArbitrage", [
    token.target,
    protocol.target,
    router.target,
    v2router.target,
  ]);
  let verifier, profile;
  let proofConfig = {};
  if (fs.existsSync("data/proof-deployment.json"))
    proofConfig = JSON.parse(fs.readFileSync("data/proof-deployment.json"));
  if (test) verifier = await deployOne("TestVerifier");
  else if (fs.existsSync("proof/deployment.json")) {
    proofConfig = JSON.parse(fs.readFileSync("proof/deployment.json"));
    const a = JSON.parse(
      fs.readFileSync(path.join(root, "proof", proofConfig.artifact)),
    );
    verifier = await new ContractFactory(a.abi, a.bytecode, signer).deploy(
      ...proofConfig.args,
    );
    await verifier.waitForDeployment();
    proofConfig.verifier = verifier.target;
    console.log("Real LeanProofBridge", verifier.target);
  } else if (proofConfig.verifier) verifier = { target: proofConfig.verifier };
  else verifier = await deployOne("UnavailableVerifier");
  profile = test
    ? keccak256(toUtf8Bytes("TEST_ONLY_PROFILE"))
    : proofConfig.profileId || keccak256(toUtf8Bytes("LEAN_PROFILE_PENDING"));
  if (test || proofConfig.verifier)
    await (
      await protocol.addProfile(
        profile,
        verifier.target,
        proofConfig.manifest ||
          (test
            ? "Local economic harness — NOT zk"
            : "Immutable real Lean kernel profile"),
      )
    ).wait();
  const timelock = await deployOne("TimelockController", [
    10,
    [],
    [],
    wallets[0].address,
  ]);
  const governor = await deployOne("ExchangeGovernor", [
    token.target,
    timelock.target,
  ]);
  await (
    await timelock.grantRole(await timelock.PROPOSER_ROLE(), governor.target)
  ).wait();
  await (
    await timelock.grantRole(await timelock.CANCELLER_ROLE(), governor.target)
  ).wait();
  await (
    await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ZeroAddress)
  ).wait();
  await (
    await timelock.renounceRole(
      await timelock.DEFAULT_ADMIN_ROLE(),
      wallets[0].address,
    )
  ).wait();
  await (await protocol.transferOwnership(timelock.target)).wait();
  await (await factory.setFeeToSetter(timelock.target)).wait();
  const pairInitHash = keccak256(artifact("UniswapV2Pair").bytecode);
  if (
    pairInitHash !==
    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
  )
    throw Error("V2 INIT_CODE_HASH mismatch: " + pairInitHash);
  const result = {
    chainId: 31372,
    rpc: endpoints.rpc,
    testHarness: test,
    proofReady: !test && !!proofConfig.verifier,
    profile,
    verifier: verifier.target,
    deployedAt: new Date().toISOString(),
    deploymentBlock: Number(await provider.send("eth_blockNumber", [])),
    accounts: wallets.map((w) => w.address),
    contracts: Object.fromEntries(
      Object.entries({
        ctf,
        wrapper,
        token,
        factory,
        weth,
        v2router,
        router,
        warehouse,
        splitFactory,
        allocation,
        protocol,
        timelock,
        governor,
        operatorSample,
        arbitrage,
      }).map(([k, c]) => [k, c.target]),
    ),
    pairInitHash,
  };
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  await deploy(new JsonRpcProvider(endpoints.rpc,undefined,{cacheTimeout:-1}));
