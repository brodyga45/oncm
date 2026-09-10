import React from 'react';
import {decodeBase64} from 'ethers';
export function ExternalBundleReview({review}){
 if(!review?.genericBundle)return null;
 function downloadGoal(){const url=URL.createObjectURL(new Blob([decodeBase64(review.goalExport.base64)],{type:'application/x-ndjson'})),a=document.createElement('a');a.href=url;a.download='Oncm-goal.ndjson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="alert"><b>Exact kernel artifact verified by original EVM + immutable bridge</b>
  <p>Title, description and optional Lean source are author-supplied. The source → goal relationship is not verified. The market commits to the exact exported goal and immutable profile below.</p>
  <dl><dt>Goal SHA256</dt><dd><code>{review.goalHash}</code></dd><dt>Profile</dt><dd><code>{review.profileId}</code></dd><dt>Original verifier</dt><dd><code>{review.originalVerifier}</code></dd><dt>Observed block</dt><dd>{review.verifiedAtBlock}</dd><dt>Bundle SHA256</dt><dd><code>{review.bundleSha256}</code></dd></dl>
  <button className="button secondary" type="button" onClick={downloadGoal}>Download exact goal export</button>
  {review.source&&<details><summary>Supplied source · correspondence not verified</summary><pre>{review.source.text}</pre>{review.source.origin&&<pre>{JSON.stringify(review.source.origin,null,2)}</pre>}</details>}
 </section>;
}
