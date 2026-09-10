/** SIGINT may reach both Ganache and our wrapper; cleanup is idempotent. */
export function createShutdown({children,closeServer,onExit,onError=()=>{}}){
 let pending;
 return()=>pending??=(async()=>{
  for(const child of children)child.kill('SIGTERM');
  try{await closeServer();onExit(0);}catch(error){
   if(error?.message==='Server is already closing or closed.')onExit(0);
   else{onError(error);onExit(1);}
  }
 })();
}
