import { z } from 'zod';
export const changeTypes = ['CANCELLATION','SUSPENSION','REOPENING','DEADLINE','DOCUMENTS','STATUS','OTHER','RELATED'] as const;
export type ChangeType = typeof changeTypes[number];
export const changeLabels: Record<ChangeType,string> = {
 CANCELLATION:'Cancelamento, anulação ou revogação', SUSPENSION:'Suspensão', REOPENING:'Reabertura informada',
 DEADLINE:'Mudança de prazo', DOCUMENTS:'Alteração na lista de anexos', STATUS:'Outra mudança de situação', OTHER:'Outras alterações do edital', RELATED:'Possível republicação relacionada',
};
export const defaultChangeSettings = {inApp:true,email:true,types:changeTypes.filter(t=>t!=='RELATED')};
export const changeSettingsSchema = z.object({inApp:z.boolean(),email:z.boolean(),types:z.array(z.enum(changeTypes)).max(8).refine(a=>new Set(a).size===a.length),revision:z.number().int().min(0)}).strict();
export function changeSettings(value:any) { return {...defaultChangeSettings,...value}; }
const normalize=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function statusKind(status:unknown) {
 const s=normalize(status);
 if(/^(cancelad[ao]|anulad[ao]|revogad[ao])(?: no pncp)?$/.test(s)) return 'cancelled';
 if(/^suspens[ao](?: no pncp)?$/.test(s)) return 'suspended';
 if(/^(divulgad[ao] no pncp|abert[ao]|recebendo propostas?|em andamento|reabert[ao]|retificad[ao])$/.test(s)) return 'open';
 return 'unknown';
}
export function classifyChanges(before:any,after:any,now=Date.now()):ChangeType[] {
 const types:ChangeType[]=[], a=statusKind(after.status), b=statusKind(before.status);
 const changed=(key:string)=>JSON.stringify(before[key])!==JSON.stringify(after[key]);
 if(changed('status')) {
  if(a==='cancelled') types.push('CANCELLATION');
  else if(a==='suspended') types.push('SUSPENSION');
  else types.push('STATUS');
 }
 if(a==='open' && new Date(after.closesAt).getTime()>now && (b==='cancelled'||b==='suspended'||(before.closesAt && new Date(before.closesAt).getTime()<=now && changed('closesAt')))) {
  types.push('REOPENING');
 }
 if(changed('opensAt')||changed('closesAt')) types.push('DEADLINE');
 if(changed('documents')) types.push('DOCUMENTS');
 if(Object.keys(after).some(k=>!['status','opensAt','closesAt','documents'].includes(k)&&changed(k))) types.push('OTHER');
 return types.length?types:['OTHER'];
}
export function relationEvidence(old:any,next:any) {
 const a=/^pncp:(\d{14})-1-/.exec(old.canonicalKey),b=/^pncp:(\d{14})-1-/.exec(next.canonicalKey);
 if(!a||!b||a[1]!==b[1]||old.canonicalKey===next.canonicalKey||!old.modality||normalize(old.modality)!==normalize(next.modality)) return null;
 const oldDate=Date.parse(old.publishedAt),newDate=Date.parse(next.publishedAt);
 if(!Number.isFinite(oldDate)||!Number.isFinite(newDate)||newDate<oldDate||newDate-oldDate>366*86400000) return null;
 const words=(s:string)=>new Set(normalize(s).split(' ').filter(w=>w.length>2));
 const x=words(old.title),y=words(next.title),union=new Set([...x,...y]);
 if(x.size<6||y.size<6)return null;
 const score=[...x].filter(w=>y.has(w)).length/union.size;
 if(score<0.8)return null;
 return {titleSimilarity:Math.round(score*100),reasons:['Mesmo CNPJ do órgão no identificador PNCP','Mesma modalidade','Objeto com termos semelhantes','Publicação posterior, dentro de um ano'],warning:'Semelhança textual não confirma republicação. Confira os números de processo e os documentos oficiais.'};
}
