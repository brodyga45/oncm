// Catalogue identities are provenance, not identifiers in the runner's fixture set.
import {validateSourcePackage} from '../sdk/source-package.mjs';
export const runnerFixtureId=raw=>raw?.sourceOnly||raw?.status==='imported-source'?undefined:raw?.id;
export function sourceDraft(raw){
 raw=validateSourcePackage(raw);
 return {title:raw.metadata?.title??raw.title??'Imported Lean statement',source:raw.source??'',
  description:raw.metadata?.description??raw.description??'',
  externalRef:raw.metadata?.externalRef??raw.repositoryUrl??'',
  registration:null,package:raw,integrity:raw.integrity};
}
