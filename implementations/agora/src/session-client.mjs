/** Tokens are scoped to this tab and never inferred from an ambient cookie. */
export function createSessionClient({scope,getToken,fetchImpl=fetch,encode=JSON.stringify}){
 return (url,options={})=>scope.request(async signal=>{
  const token=getToken();
  const response=await fetchImpl(url,{...options,credentials:'omit',signal,
   headers:{...(options.body!==undefined?{'content-type':'application/json'}:{}),...options.headers,...(token?{Authorization:`Bearer ${token}`}:{})},
   body:options.body===undefined?undefined:encode(options.body)});
  const value=await response.json();
  if(!response.ok){const error=Error(value.error??response.statusText);error.statusCode=response.status;throw error;}
  return value;
 });
}
