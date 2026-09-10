import fs from 'node:fs';
// Synchronous bounded writes apply backpressure to the child pipes. No growing
// in-memory queue, and no open descriptor continues writing to a rotated file.
export function rotatingLog(file,{maxBytes=2*1024*1024,copies=2}={}) {
  let size=fs.existsSync(file)?fs.statSync(file).size:0;
  function rotate(){
    for(let i=copies;i>=1;i--){const from=i===1?file:file+'.'+(i-1),to=file+'.'+i;if(fs.existsSync(from))fs.renameSync(from,to);}
    size=0;
  }
  return chunk=>{
    let buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));
    while(buffer.length){if(size>=maxBytes)rotate();const length=Math.min(buffer.length,maxBytes-size);fs.appendFileSync(file,buffer.subarray(0,length),{mode:0o600});size+=length;buffer=buffer.subarray(length);}
  };
}
