// Services start independently; API readiness does not imply the web is ready.
export async function waitForHttp(urls, {fetchImpl=fetch, sleep=ms=>new Promise(r=>setTimeout(r,ms)), attempts=40, isStopped=()=>false}={}) {
  for(let attempt=0;attempt<attempts;attempt++) {
    if(isStopped()) throw Error('Startup stopped before HTTP readiness');
    let ready=true;
    for(const url of urls) {
      try {const response=await fetchImpl(url,{signal:AbortSignal.timeout(1000)});if(!response.ok)ready=false;await response.body?.cancel();}
      catch {ready=false;}
    }
    if(ready)return;
    await sleep(250);
  }
  throw Error('HTTP services did not become ready: '+urls.join(', '));
}
