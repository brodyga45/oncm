import {Contract,ZeroAddress,ZeroHash,sha256,keccak256} from 'ethers';
import {inspectExternalBundle} from './external-bundle.mjs';
import {selectExternalBundleProfile} from './external-profile-catalog.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const BRIDGE=['function verifier() view returns(address)','function imageId() view returns(bytes32)','function profileId() view returns(bytes32)',
 'function verifyGoal(bytes32,bytes32,bytes) view returns(bool)','function verify(bytes32,bytes32,bytes32,uint8,bytes) view returns(bool)'];
const ORIGINAL=['function SELECTOR() view returns(bytes4)','function VERSION() view returns(string)','function verify(bytes,bytes32,bytes32) view'];

export async function verifyExternalBundle(sdk,input,expected={},contract=(address,abi)=>new Contract(address,abi,sdk.provider)){
 sdk.assertCurrent?.();requireThat(Number((await sdk.provider.getNetwork()).chainId)===31372,'Exchange chain31372 required');
 const selected=selectExternalBundleProfile(input,expected.profileId),parsed=inspectExternalBundle(selected.bundle,{trustedProfile:selected.descriptor,foundationBytes:selected.foundationBytes});
 if(expected.goalHash)requireThat(same(parsed.goalHash,expected.goalHash),'Bundle goal differs from selected market');
 if(expected.outcome!==undefined)requireThat(parsed.outcome===expected.outcome,'Bundle purpose/outcome differs from selected action');
 const number=Number(BigInt(await sdk.provider.send('eth_blockNumber',[]))),block=await sdk.provider.getBlock(number),at={blockTag:number};
 requireThat(block?.number===number,'Verification block unavailable');
 const reference=contract(sdk.deployment.verifier,BRIDGE),originalAddress=await reference.verifier(at);
 const code=await sdk.provider.getCode(originalAddress,number);requireThat(code!=='0x','Original verifier missing');
 const original=contract(originalAddress,ORIGINAL),descriptor=selected.descriptor;
 requireThat(same(await original.SELECTOR(at),descriptor.selector)&&await original.VERSION(at)==='3.0.0','Original verifier selector/version mismatch');
 await original.verify.staticCall(parsed.evmSeal,parsed.imageId,sha256(parsed.journal),at);
 const installed=await sdk.contract('protocol').profiles(parsed.profileId,at);
 requireThat(!same(installed.verifier,ZeroAddress),'Governance has not admitted this proof profile');
 requireThat(installed.manifest===descriptor.manifest,'Registered profile manifest differs from pinned policy');
 const bridge=contract(installed.verifier,BRIDGE),underlying=await bridge.verifier(at);
 requireThat(same(await bridge.imageId(at),parsed.imageId)&&same(await bridge.profileId(at),parsed.profileId),'Bridge image/profile mismatch');
 const candidateCode=await sdk.provider.getCode(underlying,number);
 requireThat(candidateCode!=='0x'&&keccak256(candidateCode)===keccak256(code),'Bridge underlying verifier differs from original runtime');
 const accepted=parsed.outcome===0?await bridge.verifyGoal(parsed.goalHash,parsed.profileId,parsed.certificate,at):await bridge.verify(expected.statementId||ZeroHash,parsed.goalHash,parsed.profileId,parsed.outcome,parsed.certificate,at);
 requireThat(accepted,'Immutable bridge rejected external certificate');sdk.assertCurrent?.();
 return{...parsed,genericBundle:true,originalVerified:true,originalVerifier:originalAddress,verifier:installed.verifier,
  verifierCodeHash:keccak256(code),cryptographicStatus:'original-and-bridge-verified',installed:true,
  available:parsed.outcome===0?installed.newEnabled:installed.resolutionEnabled,verifiedAtBlock:number,verifiedAtBlockHash:block.hash};
}
