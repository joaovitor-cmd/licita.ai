import {randomUUID} from 'node:crypto';
import {entitlements} from './entitlements.js';
import {one,rows,type Database} from './db.js';
import {addEvent} from './data.js';
import {enqueueEmail} from './email-queue.js';
import {changeSettings,changeLabels,classifyChanges,relationEvidence,statusKind,type ChangeType} from './change-rules.js';
import {sourceChangeSummary} from './source-change-message.js';

async function alert(db:Database,orgId:string,types:ChangeType[],title:string,body:string,url:string,key:string){
 const plan=await entitlements(orgId,db);if(!plan.active||!plan.features.includes('changeAlerts'))return;
 const org=await one('SELECT preferences,is_demo,active FROM organizations WHERE id=$1',[orgId],db);
 const config=changeSettings((await one('SELECT settings FROM change_alert_settings WHERE organization_id=$1',[orgId],db))?.settings);
 const selected=types.filter(t=>config.types.includes(t));
 if(!org||org.active===false||!selected.length||(!config.inApp&&!config.email))return;
 const notification=await one(`INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read) VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(organization_id,dedupe_key) DO NOTHING RETURNING id`,[randomUUID(),orgId,title,body,url,key,!(config.inApp&&org.preferences.inApp)],db);
 if(!notification||org.is_demo||!org.preferences.email||!config.email)return;
 const admins=await rows('SELECT u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role=\'ADMIN\'',[orgId],db);
 for(const admin of admins)await enqueueEmail(db,orgId,notification.id,admin.email,title,`${body}\n\n${process.env.APP_URL??'http://localhost:5173'}${url}`,'CHANGE:'+selected.join(','));
}
export async function recordSourceChange(db:Database,opportunityId:string,before:any,after:any,description:string){
 const types=classifyChanges(before,after),id=randomUUID();
 await db.query('INSERT INTO opportunity_changes(id,opportunity_id,types,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[id,opportunityId,JSON.stringify(types),JSON.stringify(before),JSON.stringify(after)]);
 const tracked=await rows('SELECT id,organization_id FROM trackings WHERE opportunity_id=$1',[opportunityId],db);
 const title=types.filter(t=>t!=='OTHER'&&t!=='STATUS').map(t=>changeLabels[t]).join(' · ')||'Alteração em edital acompanhado';
 const heading=typeof after.title==='string'?after.title.replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim().slice(0,200):'Edital acompanhado';
 const body=`${heading}\n${sourceChangeSummary(before,after)}\nConfira a publicação oficial; o aviso não é análise jurídica.`;
 for(const t of tracked){
  await addEvent(t.id,'SOURCE_UPDATED',title,description.slice(0,20000),null,db);
  await alert(db,t.organization_id,types,title,body,`/app/oportunidades/${opportunityId}?tab=mudancas`,`source-change:${id}`);
 }
}
export async function findRelatedPublications(db:Database,id:string,item:any){
 const cnpj=/^pncp:(\d{14})-1-/.exec(item.canonicalKey)?.[1];
 if(!cnpj||!item.publishedAt)return;
 // Bounded candidate search among previously tracked public records, never company-private data.
 const candidates=await rows(`SELECT o.*,t.organization_id FROM opportunities o JOIN trackings t ON t.opportunity_id=o.id
 WHERE o.demo_org_id IS NULL AND o.id<>$1 AND o.canonical_key LIKE $2 AND o.published_at BETWEEN $3::timestamptz-interval '366 days' AND $3
 AND (o.closes_at<now() OR lower(coalesce(o.status,'')) ~ 'cancel|anulad|revog|suspens')
 ORDER BY o.published_at DESC,o.id,t.organization_id LIMIT 200`,[id,`pncp:${cnpj}-1-%`,item.publishedAt],db);
 const counts=new Map<string,number>();
 for(const old of candidates){
  if((counts.get(old.organization_id)??0)>=3)continue;
  if(!['cancelled','suspended'].includes(statusKind(old.status))&&!(old.closes_at&&new Date(old.closes_at).getTime()<Date.now()))continue;
  const evidence=relationEvidence({canonicalKey:old.canonical_key,title:old.title,modality:old.modality,publishedAt:old.published_at?.toISOString()},item);
  if(!evidence)continue;
  const relation=await one(`INSERT INTO opportunity_relations(id,organization_id,previous_id,new_id,evidence) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(organization_id,previous_id,new_id) DO NOTHING RETURNING id`,[randomUUID(),old.organization_id,old.id,id,JSON.stringify(evidence)],db);
  if(!relation)continue;
  counts.set(old.organization_id,(counts.get(old.organization_id)??0)+1);
  await alert(db,old.organization_id,['RELATED'],'Possível republicação de edital acompanhado',`${item.title}\n${evidence.reasons.join('; ')}.\n${evidence.warning}`,`/app/oportunidades/${old.id}?tab=mudancas`,`related:${relation.id}`);
 }
}
