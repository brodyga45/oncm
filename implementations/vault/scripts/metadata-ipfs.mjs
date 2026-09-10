import crypto from 'node:crypto';
// Standard single-block UnixFS File inside DAG-PB, CIDv0 SHA-256 payload.
// Solidity v0.8.28 uses this encoding for metadata, not raw SHA256(file).
// https://github.com/ethereum/solidity/blob/v0.8.28/libsolutil/IpfsHash.cpp#L144-L182
// https://specs.ipfs.tech/unixfs/
export function metadataIpfsDigest(text){
 const data=Buffer.from(text,'utf8');if(data.length>262144)throw Error('Metadata exceeds single-block verification bound');
 const uint=n=>{const out=[];do{const byte=n&127;n=Math.floor(n/128);out.push(byte|(n?128:0));}while(n);return Buffer.from(out);};
 const body=Buffer.concat([Buffer.from([8,2]),...(data.length?[Buffer.from([18]),uint(data.length),data]:[]),Buffer.from([24]),uint(data.length)]);
 return crypto.createHash('sha256').update(Buffer.concat([Buffer.from([10]),uint(body.length),body])).digest('hex');
}
