import fs from 'node:fs';
import path from 'node:path';
import {Contract,keccak256} from 'ethers';

const zeroAddress='0x'+'00'.repeat(20);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

// Explicit public examples only. Private proof jobs and uploaded sources are not read.
// A file from another registry is not evidence of this deployment's admission.
export async function externalProofCatalog(root, config, {provider,registry,contract=(address,abi)=>new Contract(address,abi,provider)}) {
  const directory = path.join(root, 'external-proofs/perf05');
  const descriptor = JSON.parse(fs.readFileSync(path.join(directory, 'descriptor.json')));
  const stateFile = path.join(root, '.state/additional-profiles/perf05.json');
  const saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : null;
  const candidate = saved?.chainInstance === config.chainInstance.id
    && same(saved?.registry,config.addresses.StatementRegistry)
    && same(saved?.profileId,descriptor.profileId) && saved?.manifest===descriptor.manifest ? saved : null;
  if((await provider.getNetwork()).chainId!==BigInt(config.chainId)
    ||!same(registry.target,config.addresses.StatementRegistry))throw Error('External profile catalog differs from the selected chain/registry');
  const block=await provider.getBlock('latest'),at={blockTag:block.number};
  const profile=await registry.profiles(descriptor.profileId,at);
  const registered=!same(profile.verifier,zeroAddress);
  const observation={registry:config.addresses.StatementRegistry,blockNumber:block.number,blockHash:block.hash,registered,enabled:registered&&Boolean(profile.enabled)};
  let deployment=candidate?{...candidate,source:'matching-local-deployment-record',registryObservation:observation}:null;
  if(registered){
    if(profile.manifest!==descriptor.manifest)throw Error('Selected registry profile manifest differs from the pinned catalog');
    const bytecode=await provider.getCode(profile.verifier,block.number);
    if(bytecode==='0x')throw Error('Selected registry bridge has no bytecode');
    const bridgeCodeHash=keccak256(bytecode);
    const pin=Object.entries(config.monetaryPolicy?.runtimeHashes??{}).find(([address])=>same(address,profile.verifier))?.[1];
    if(pin&&!same(pin,bridgeCodeHash))throw Error('Selected registry bridge runtime differs from deployment pin');
    const bridge=contract(profile.verifier,['function imageId() view returns(bytes32)','function profileId() view returns(bytes32)']);
    const [imageId,profileId]=await Promise.all([bridge.imageId(at),bridge.profileId(at)]);
    if(!same(imageId,descriptor.imageId)||!same(profileId,descriptor.profileId))throw Error('Selected registry bridge immutable image/profile differs from catalog');
    deployment={format:'oncm-vault-registered-profile-v1',chainId:config.chainId,chainInstance:config.chainInstance.id,
      registry:config.addresses.StatementRegistry,profileId,imageId,bridgeCodeHash,
      bridge:profile.verifier,manifest:profile.manifest,source:'selected-registry',registryObservation:observation,
      ...(same(candidate?.bridge,profile.verifier)&&candidate?.proposal?{proposal:candidate.proposal}:{})};
  }
  const examples = ['true-registration', 'true-proof', 'false-registration', 'false-refutation'].flatMap(key => {
    const file = path.join(directory, key + '.json');
    return fs.existsSync(file) ? [{ key, record: JSON.parse(fs.readFileSync(file)) }] : [];
  });
  // Discovery is not certificate verification: the SDK still calls the original
  // verifier and exact immutable bridge, then rereads admission before use.
  return [{ descriptor, deployment, examples }];
}
