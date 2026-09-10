import {sha256,toUtf8Bytes} from 'ethers';
// Same generation/context pattern as PackageEditor: a new imported source is
// provenance, never inherited proof readiness. No compiler runs in this module.
export function snapshotDraftReset(){return {source:'',goalHash:'',profileId:'',registrationCertificate:'',registrationImport:null,certificate:'',fixtureId:'',declaration:'',title:'',manifest:'',latestJob:undefined};}
export function snapshotDraft(record,localLean){
 if(typeof record?.source!=='string'||!record.sourceUrl&&(!record.repository||!record.commit||!record.challengePath))throw Error('Snapshot source/provenance is incomplete');
 const toolchain=record.files?.find(f=>f.path==='lean-toolchain'||f.path.endsWith('/lean-toolchain'))?.content?.trim()||null;
 const version=toolchain?.match(/^leanprover\/lean4:v(.+)$/)?.[1]||null;
 const compatibility=version&&version!==localLean?'incompatible':version?'version-matches-only':'unknown';
 const provenance={repository:record.repository,commit:record.commit,challengePath:record.challengePath,sourceUrl:record.sourceUrl||`https://raw.githubusercontent.com/${record.repository.replace(/^https:\/\/github\.com\//,'')}/${record.commit}/${record.challengePath}`,sourceSha256:sha256(toUtf8Bytes(record.source)).slice(2),externalRef:record.externalRef||null,sourceGoalRelation:'not-verified'};
 return {...snapshotDraftReset(),source:record.source,title:record.title||'',declaration:record.targetDeclaration||'',manifest:JSON.stringify(provenance),snapshotInfo:{...provenance,toolchain,version,compatibility,localLean,dependenciesChecked:false,certificateChecked:false}};
}
const key=c=>JSON.stringify([c.account,c.chainId,c.chainInstance,c.registry,c.statementId]);
export function createSnapshotImport({reset,accept}){
 let context,contextKey='',generation=0,disposed=false;
 return {
  setContext(next){const k=key(next);if(k!==contextKey||context?.client!==next.client){context={...next};contextKey=k;generation++;}},
  invalidate(){generation++;},
  async load(fetchRecord,localLean){const ticket=++generation;reset(snapshotDraftReset());try{const record=await fetchRecord();if(disposed||ticket!==generation)return false;accept(snapshotDraft(record,localLean));return true;}catch(error){if(disposed||ticket!==generation)return false;throw error;}},
  dispose(){disposed=true;generation++;},
 };
}
