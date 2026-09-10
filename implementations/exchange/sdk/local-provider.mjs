import {JsonRpcProvider} from 'ethers';

// ethers documents that its default250ms perform cache can break synchronous test chains.
// Do not wrap injected wallet signers or maintain an independent optimistic nonce counter.
export const localProviderOptions=Object.freeze({cacheTimeout:-1});
export function createLocalProvider(url){return new JsonRpcProvider(url,undefined,localProviderOptions);}

export function rpcErrorMessage(error){
 const outer=error?.shortMessage||error?.reason||error?.message||String(error);
 const nested=error?.error?.message||error?.info?.error?.message||error?.cause?.error?.message||error?.cause?.message;
 const message=nested&&nested!==outer?`${outer}: ${nested}`:outer;
 // Only messages, never whole payloads/transactions/signatures or serialized error objects.
 return String(message).slice(0,1600);
}
