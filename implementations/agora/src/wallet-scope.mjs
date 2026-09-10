export class StaleWalletContext extends Error {constructor(){super('Wallet context changed; previous operation discarded');this.name='StaleWalletContext';}}
export const isStaleWalletError=e=>e instanceof StaleWalletContext||e?.name==='AbortError';
/** Abort network reads, invalidate unabortable wallet/file promises, stop polls. */
export function createWalletScope({setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let epoch=0;const requests=new Set(),timers=new Set();
 const current=ticket=>ticket===epoch;
 const assert=ticket=>{if(!current(ticket))throw new StaleWalletContext();};
 return {capture:()=>epoch,current,assert,
  invalidate(){epoch++;for(const c of requests)c.abort();requests.clear();for(const t of timers)clearTimer(t);timers.clear();},
  async wait(promise,ticket=epoch){const result=await promise;assert(ticket);return result;},
  async request(fn){const ticket=epoch,controller=new AbortController();requests.add(controller);try{const result=await fn(controller.signal);assert(ticket);return result;}finally{requests.delete(controller);}},
  schedule(fn,ms,ticket=epoch){if(!current(ticket))return;const timer=setTimer(()=>{timers.delete(timer);if(current(ticket))fn();},ms);timers.add(timer);},
 };
}
export function visibleOwnerJobs(jobs,owner){
 if(!Array.isArray(jobs))throw Error('Invalid job-list response');
 return jobs.filter(j=>typeof j?.owner==='string'&&j.owner.toLowerCase()===owner.toLowerCase()&&j.input&&typeof j.input==='object');
}
export function polledJobState(jobs,id){
 const job=jobs.find(j=>j.id===id);
 return {job,state:!job?'missing':['queued','running'].includes(job.status)?'pending':job.status==='succeeded'?'succeeded':'terminal'};
}
export function bindInjectedEvents(provider,handlers){
 for(const [event,handler] of Object.entries(handlers))provider.on?.(event,handler);
 return()=>{for(const [event,handler] of Object.entries(handlers))provider.removeListener?.(event,handler);};
}
