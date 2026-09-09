import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import solc06 from "solc06";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
fs.mkdirSync("artifacts", { recursive: true });
function compile(compiler, sources, legacy = false) {
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      ...(legacy ? {} : { evmVersion: "shanghai", viaIR: true }),
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const out = JSON.parse(
    compiler.compile(JSON.stringify(input), {
      import: (file) => {
        const p =
          file.startsWith("@openzeppelin/") && legacy
            ? "node_modules/oz3/" + file.replace("@openzeppelin/contracts/", "")
            : file.startsWith("@")
              ? "node_modules/" + file
              : file;
        try {
          return { contents: fs.readFileSync(p, "utf8") };
        } catch {
          return { error: "Missing " + p };
        }
      },
    }),
  );
  for (const e of out.errors || [])
    if (e.severity === "error") console.error(e.formattedMessage);
  if (out.errors?.some((e) => e.severity === "error"))
    throw new Error("Solidity compile failed");
  for (const [file, cs] of Object.entries(out.contracts))
    for (const [name, a] of Object.entries(cs))
      if (a.evm.bytecode.object)
        fs.writeFileSync(
          "artifacts/" + name + ".json",
          JSON.stringify(
            {
              contractName: name,
              sourceName: file,
              abi: a.abi,
              bytecode: "0x" + a.evm.bytecode.object,
              deployedBytecode: "0x" + a.evm.deployedBytecode.object,
            },
            null,
            2,
          ),
        );
}
compile(
  solc06,
  {
    "vendor/Wrapped1155Factory.sol": {
      content: fs.readFileSync("vendor/Wrapped1155Factory.sol", "utf8"),
    },
  },
  true,
);
const files = [
  "contracts/Core.sol",
  "contracts/Governance.sol",
  "contracts/Allocation.sol",
  "contracts/FullSetArbitrage.sol",
  "contracts/test/TestVerifier.sol",
  "vendor/Router.sol",
  "vendor/splits/packages/splits-v2/src/SplitsWarehouse.sol",
];
compile(
  solc,
  Object.fromEntries(
    files.map((p) => [p, { content: fs.readFileSync(p, "utf8") }]),
  ),
);
for (const [n, p] of Object.entries({
  ConditionalTokens:
    "@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json",
  UniswapV2Factory: "@uniswap/v2-core/build/UniswapV2Factory.json",
  UniswapV2Pair: "@uniswap/v2-core/build/UniswapV2Pair.json",
  UniswapV2Router02: "@uniswap/v2-periphery/build/UniswapV2Router02.json",
  WETH9: "@uniswap/v2-periphery/build/WETH9.json",
})) {
  const a = JSON.parse(fs.readFileSync("node_modules/" + p));
  fs.writeFileSync(
    "artifacts/" + n + ".json",
    JSON.stringify(
      {
        ...a,
        bytecode: a.bytecode.startsWith("0x") ? a.bytecode : "0x" + a.bytecode,
      },
      null,
      2,
    ),
  );
}
fs.mkdirSync("web/generated", { recursive: true });
const abi = Object.fromEntries(
  fs
    .readdirSync("artifacts")
    .filter((n) => n.endsWith(".json"))
    .map((n) => [
      n.slice(0, -5),
      JSON.parse(fs.readFileSync("artifacts/" + n)).abi,
    ]),
);
fs.writeFileSync("web/generated/abis.json", JSON.stringify(abi));
console.log(
  "Compiled Exchange, original CTF/V2 artifacts, Gnosis wrapper and Splits V2.",
);
