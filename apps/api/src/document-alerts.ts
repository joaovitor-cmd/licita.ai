import {randomUUID} from 'node:crypto';
import {rows,one,transaction} from './db.js';
import {documentAlert} from './document-alert-rules.js';
export async function documentNotifications(){
 const candidates=await rows(`SELECT d.id FROM documents d JOIN organizations o ON o.id=d.organization_id WHERE NOT o.is_demo AND o.active AND d.expires_at IS NOT NULL AND (d.expires_at AT TIME ZONE 'UTC')::date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 15`);
 for(const candidate of candidates)await transaction(async db=>{
  // Revalidate after acquiring the same document lock used by date changes/deletion.
  const d=await one(`SELECT d.id,d.organization_id,d.name,d.expires_at,o.preferences FROM documents d JOIN organizations o ON o.id=d.organization_id JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) WHERE d.id=$1 AND NOT o.is_demo AND o.active AND e.active AND d.expires_at IS NOT NULL FOR UPDATE OF d,o,e`,[candidate.id],db);
  if(!d)return;
  const alert=documentAlert(d.id,d.name,new Date(d.expires_at).toISOString());
  if(!alert)return;
  await db.query(`INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,dedupe_key) DO NOTHING`,[randomUUID(),d.organization_id,alert.title,alert.description,alert.url,alert.key,!d.preferences.inApp]);
  // No email enqueueing: document alerts are in-app only in this version.
 });
}