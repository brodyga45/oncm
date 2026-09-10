// The poll's closure may still contain the initial form state. React must pass
// the current editor state into this updater; null means never initialized,
// whereas an empty string is an intentional user edit and must be retained.
export function seedAllocationText(current,recipients,shares){
  return current===null?recipients.map((r,i)=>`${r},${Number(shares[i])/100}`).join('\n'):current;
}
export function assertAllocationReview(rows,review){
  if(!review)return;
  const key=list=>JSON.stringify(list.map(r=>[r.address.toLowerCase(),r.share]));
  if(key(rows)!==key(review.rows))throw Error('Allocation text differs from the DAO review; prepare it again');
}
