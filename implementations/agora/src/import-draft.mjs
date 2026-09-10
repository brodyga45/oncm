// Catalogue identities are provenance, not identifiers in the runner's fixture set.
export const runnerFixtureId=raw=>raw?.sourceOnly||raw?.status==='imported-source'?undefined:raw?.id;
export function sourceDraft(raw){
 return {title:raw.metadata?.title??raw.title??'Imported Lean statement',source:raw.source??'',
  description:raw.metadata?.description??raw.description??'',
  externalRef:raw.metadata?.externalRef??raw.repositoryUrl??'',
  registration:raw.sourceOnly||raw.status==='imported-source'?null:raw.registrationCertificate?raw:null};
}
