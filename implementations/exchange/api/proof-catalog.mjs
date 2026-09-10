import fs from "node:fs";
import path from "node:path";
import { sha256, toUtf8Bytes, ZeroAddress } from "ethers";

export function readProofCatalog(root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const current = read("proof/manifest.json");
  const minimal = read("proof/profiles/perf05/profile.json");
  const profiles = [
    { ...current, id: "v3", label: "Lean arithmetic · v3", localRunner: true },
    { ...minimal, id: "perf05", label: "Lean logic · perf05 · zero axioms", localRunner: false },
  ];
  let prepared = [];
  try { prepared = read("data/additional-proof-profiles.json"); } catch { /* No new bridge deployed. */ }
  for (const profile of profiles) {
    const deployment = prepared.find(p => p.profileId === profile.profileId);
    if (deployment) Object.assign(profile, { preparedVerifier: deployment.verifier, installation: deployment.installation });
  }
  const fixtures = [...read("proof/fixtures.json"), ...read("proof/profiles/perf05/fixtures.json")];
  for (const f of fixtures) if (f.goalExport && sha256(toUtf8Bytes(f.goalExport)) !== f.goalHash)
    throw Error("Bundled canonical goal export was modified");
  return { profiles, fixtures };
}

export async function catalogWithChain(root, sdk) {
  const catalog = readProofCatalog(root);
  for (const p of catalog.profiles) {
    const onchain = await sdk.contract("protocol").profiles(p.profileId);
    Object.assign(p, { installed: onchain.verifier !== ZeroAddress, verifier: onchain.verifier,
      newEnabled: onchain.newEnabled, resolutionEnabled: onchain.resolutionEnabled, manifest: onchain.manifest });
  }
  return { ...catalog, observedBlock: await sdk.provider.getBlockNumber() };
}
