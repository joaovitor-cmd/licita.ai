/** Pure reconciliation of public snapshots; retrieval time is not source freshness. */
export type SourceDecision='accepted'|'rejected'|'conflicting';
export type PublicSnapshot={title:string;description:string|null;agency:string;state:string|null;city:string|null;modality:string|null;sphere:string|null;value:number|null;publishedAt:string|null;opensAt:string|null;closesAt:string|null;status:string|null;url:string|null;documents:Array<{name:string;url:string}>};
function time(value:string|null){const number=value?Date.parse(value):NaN;return Number.isFinite(number)?number:null;}
export function reconcileSource(previous:PublicSnapshot|null,incoming:PublicSnapshot,previousDate:string|null,incomingDate:string|null,includeDocuments:boolean){
 const merged:PublicSnapshot={...incoming};
 if(previous){
  for(const key of Object.keys(merged) as Array<keyof PublicSnapshot>){
   const value=merged[key];
   if(key==='documents')continue;
   if(value===null||value===undefined||value==='')(merged as any)[key]=previous[key];
  }
  // An empty list does not prove removal: adapters may omit attachments.
  if(!includeDocuments||!incoming.documents.length)merged.documents=previous.documents;
 }
 const oldTime=time(previousDate),newTime=time(incomingDate);
 const different=!!previous&&JSON.stringify(previous)!==JSON.stringify(merged);
 if(!previous)return {decision:'accepted' as SourceDecision,reason:'initial_snapshot',snapshot:merged};
 if(oldTime!==null&&newTime!==null&&newTime<oldTime)return {decision:'rejected' as SourceDecision,reason:'older_source_date',snapshot:previous};
 if(!different)return {decision:'accepted' as SourceDecision,reason:'same_known_fields',snapshot:merged};
 if(oldTime!==null&&newTime!==null&&newTime>oldTime)return {decision:'accepted' as SourceDecision,reason:'newer_source_date',snapshot:merged};
 return {decision:'conflicting' as SourceDecision,reason:oldTime!==null&&newTime===oldTime?'equal_source_date_divergence':'freshness_unverifiable',snapshot:previous};
}
