import { AbiCoder, Contract, dataLength, keccak256, sha256, toUtf8Bytes, ZeroAddress, ZeroHash } from 'ethers';
import { inspectExternalBundle } from './external-bundle.mjs';

const abi = AbiCoder.defaultAbiCoder();
export const CLAIM_DOMAIN = sha256(toUtf8Bytes('ONCM_LEAN_CLAIM_V1'));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const BRIDGE_ABI = [
  'function verifier() view returns(address)', 'function imageId() view returns(bytes32)',
  'function profileId() view returns(bytes32)',
  'function verifyGoal(bytes32,bytes32,bytes) view returns(bool)',
  'function verify(bytes32,bytes32,bytes32,uint8,bytes) view returns(bool)',
];
const VERIFIER_ABI = [
  'function SELECTOR() view returns(bytes4)', 'function VERSION() view returns(string)',
  'function verify(bytes,bytes32,bytes32) view',
];

// Source metadata and CI's evmVerified flag are never proof authority. The caller
// supplies a separately pinned descriptor and we reconstruct every journal byte.
export function inspectExternalCertificate(record, descriptor) {
  if (record?.format !== 'oncm-real-groth16-ci-v1' || record.receiptKind !== 'Groth16')
    throw Error('Expected a real Groth16 CI verified.json record');
  if (!same(record.imageId, descriptor.imageId) || !same(record.profileId, descriptor.profileId))
    throw Error('Certificate image/profile differs from the selected immutable profile');
  const goal = descriptor.goals.find(g => same(g.goalHash, record.goalHash));
  if (!goal) throw Error('Goal hash is not one of this profile’s pinned examples');
  if (record.profile !== descriptor.tag || ![0, goal.outcome].includes(record.outcome)
    || record.case !== `${goal.key}-${record.outcome === 0 ? 'registration' : record.outcome === 2 ? 'refutation' : 'proof'}`)
    throw Error('Case/outcome does not match the exact goal');
  if (!same(record.verifierParameters, descriptor.verifierParameters)
    || dataLength(record.rawSeal) !== 256 || dataLength(record.evmSeal) !== 260
    || !same(record.evmSeal, descriptor.selector + record.rawSeal.slice(2)))
    throw Error('Expected pinned SHA2 Groth16 selector and exact 256/260-byte seals');
  const journal = abi.encode(['bytes32', 'bytes32', 'bytes32', 'uint256'],
    [CLAIM_DOMAIN, goal.goalHash, descriptor.profileId, record.outcome]);
  if (!same(record.journal, journal) || dataLength(record.journal) !== 128)
    throw Error('Journal domain/goal/profile/outcome mismatch');
  const certificate = abi.encode(['bytes', 'bytes'], [record.evmSeal, journal]);
  if (!same(record.certificate, certificate)) throw Error('Certificate is not canonical ABI(seal,journal)');
  return { profileId: descriptor.profileId, imageId: descriptor.imageId, goalHash: goal.goalHash,
    outcome: record.outcome, certificate, journal, evmSeal: record.evmSeal, goal,
    sourceCommit: record.sourceCommit, runId: record.runId };
}

export async function verifyExternalCertificate({ provider, registry, defaultBridge, record, descriptor,
  candidateBridge = ZeroAddress, contract = (address, contractAbi) => new Contract(address, contractAbi, provider) }) {
  const parsed = inspectExternalCertificate(record, descriptor);
  return verifyParsedCertificate({provider,registry,defaultBridge,parsed,descriptor,candidateBridge,contract});
}

export async function verifyExternalBundle({provider,registry,defaultBridge,bundle,descriptor,foundationBytes,
  candidateBridge=ZeroAddress,contract=(address,contractAbi)=>new Contract(address,contractAbi,provider)}) {
  const parsed=inspectExternalBundle(bundle,{trustedProfile:descriptor,foundationBytes});
  const checked=await verifyParsedCertificate({provider,registry,defaultBridge,parsed,descriptor,candidateBridge,contract});
  return {...checked,genericBundle:true,cryptographicStatus:checked.bridgeVerified?'original-and-bridge-verified':'original-verified'};
}

async function verifyParsedCertificate({provider,registry,defaultBridge,parsed,descriptor,candidateBridge,contract}) {
  if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Vault chain 31373 required');
  const block = await provider.getBlock('latest'), at = { blockTag: block.number };
  const reference = contract(defaultBridge, BRIDGE_ABI);
  const underlying = await reference.verifier(at);
  const originalCode = await provider.getCode(underlying, block.number);
  if (originalCode === '0x') throw Error('Original verifier code missing');
  const verifierCodeHash = keccak256(originalCode);
  const original = contract(underlying, VERIFIER_ABI);
  if (!same(await original.SELECTOR(at), descriptor.selector) || await original.VERSION(at) !== '3.0.0')
    throw Error('Original RISC Zero verifier version/selector mismatch');
  // eth_call invokes the ORIGINAL verifier, including pairing checks. A revert
  // propagates; external service status is never treated as verification.
  await original.verify.staticCall(parsed.evmSeal, parsed.imageId, sha256(parsed.journal), at);
  const profile = await registry.profiles(parsed.profileId, at);
  const registered = !same(profile.verifier, ZeroAddress);
  if (registered && profile.manifest !== descriptor.manifest) throw Error('Registered immutable manifest differs');
  const bridge = registered ? profile.verifier : candidateBridge;
  let bridgeVerified = false, bridgeVerifier = ZeroAddress;
  if (!same(bridge, ZeroAddress)) {
    if (await provider.getCode(bridge, block.number) === '0x') throw Error('Candidate bridge code missing');
    const adapter = contract(bridge, BRIDGE_ABI);
    if (!same(await adapter.imageId(at), parsed.imageId) || !same(await adapter.profileId(at), parsed.profileId))
      throw Error('Immutable bridge image/profile mismatch');
    bridgeVerifier = await adapter.verifier(at);
    const bridgeVerifierCode = await provider.getCode(bridgeVerifier, block.number);
    // Each immutable bridge deploys its own verifier instance, so addresses
    // differ. This importer supports identical original RISC0 runtime code and
    // immutable verification parameters, not arbitrary governance verifier APIs.
    if (bridgeVerifierCode === '0x' || keccak256(bridgeVerifierCode) !== verifierCodeHash)
      throw Error('Profile bridge verifier runtime differs from the original RISC Zero verifier');
    bridgeVerified = parsed.outcome === 0
      ? await adapter.verifyGoal(parsed.goalHash, parsed.profileId, parsed.certificate, at)
      : await adapter.verify(ZeroHash, parsed.goalHash, parsed.profileId, parsed.outcome, parsed.certificate, at);
    if (!bridgeVerified) throw Error('Exact profile bridge rejected certificate');
  }
  return { ...parsed, blockNumber: block.number, blockHash: block.hash, originalVerifier: underlying,
    originalVerified: true, verifierCodeHash, bridge, bridgeVerifier, bridgeVerified, registered, profileEnabled: registered && profile.enabled,
    readyForRegistration: registered && profile.enabled && bridgeVerified && parsed.outcome === 0,
    readyForResolution: registered && bridgeVerified && parsed.outcome !== 0 };
}
