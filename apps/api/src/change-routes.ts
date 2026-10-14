import type {Router} from 'express';
import {z} from 'zod';
import {one,rows,transaction} from './db.js';
import {current,requireAdmin,HttpError} from './security.js';
import {getOpportunity,addEvent} from './data.js';
import {changeLabels,changeSettings,changeSettingsSchema} from './change-rules.js';
import {sourceChangeSummary} from './source-change-message.js';
export function changeRoutes(router:Router){
 router.get('/change-alert-settings',async(req,res)=>{
  requireAdmin(req);
  const row=await one('SELECT * FROM change_alert_settings WHERE organization_id=$1',[current(req).organization.id]);
  res.json({...changeSettings(row?.settings),revision:row?.revision??0,labels:changeLabels});
 });
 router.put('/change-alert-settings',async(req,res)=>{
  requireAdmin(req);const {revision,...settings}=changeSettingsSchema.parse(req.body),org=current(req).organization.id;
  const updated=await transaction(async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`change-settings:${org}`]);
   const existing=await one('SELECT revision FROM change_alert_settings WHERE organization_id=$1 FOR UPDATE',[org],db);
   if((existing?.revision??0)!==revision)throw new HttpError(409,'As preferências foram alteradas. Recarregue antes de salvar.');
   const row=await one(`INSERT INTO change_alert_settings(organization_id,settings,revision) VALUES($1,$2,1)
    ON CONFLICT(organization_id) DO UPDATE SET settings=excluded.settings,revision=change_alert_settings.revision+1 RETURNING revision`,[org,JSON.stringify(settings)],db);
   await db.query(`UPDATE email_deliveries SET status='CANCELLED',last_error='Aviso de mudança desativado nas preferências.',updated_at=now()
    WHERE organization_id=$1 AND category LIKE 'CHANGE:%' AND status IN ('PENDING','BLOCKED')
    AND (NOT $2::boolean OR NOT (string_to_array(substring(category from 8),',') && $3::text[]))`,[org,settings.email,settings.types]);
   return row;
  });
  res.json({...settings,revision:updated.revision,labels:changeLabels});
 });
 router.get('/opportunities/:id/changes',async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id),page=z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
  await getOpportunity(current(req),id);
  const history=await one(`WITH history AS MATERIALIZED (SELECT c.*,r.reviewed_at,u.name reviewer FROM opportunity_changes c
   LEFT JOIN opportunity_change_reviews r ON r.change_id=c.id AND r.organization_id=$3 LEFT JOIN users u ON u.id=r.reviewed_by WHERE c.opportunity_id=$1)
   SELECT (SELECT count(*)::int FROM history) total,(SELECT count(*)::int FROM history WHERE reviewed_at IS NULL) pending,
   EXISTS(SELECT 1 FROM trackings WHERE opportunity_id=$1 AND organization_id=$3) "canReview",
   coalesce((SELECT jsonb_agg(p ORDER BY detected_at DESC,id DESC) FROM (SELECT * FROM history ORDER BY detected_at DESC,id DESC LIMIT 10 OFFSET $2) p),'[]') items`,[id,(page-1)*10,current(req).organization.id]);
  const relations=await rows(`SELECT r.*,a.title previous_title,b.title new_title,u.name reviewer FROM opportunity_relations r
   JOIN opportunities a ON a.id=r.previous_id JOIN opportunities b ON b.id=r.new_id LEFT JOIN users u ON u.id=r.reviewed_by
   WHERE r.organization_id=$1 AND (r.previous_id=$2 OR r.new_id=$2) ORDER BY r.detected_at DESC LIMIT 20`,[current(req).organization.id,id]);
  res.json({...history,items:history.items.map((item:any)=>({...item,summary:sourceChangeSummary(item.before_data,item.after_data)})),page,pages:Math.max(1,Math.ceil(history.total/10)),relations,labels:changeLabels});
 });
 router.post('/opportunities/:id/changes/:changeId/review',async(req,res)=>{
  const oid=z.string().uuid().parse(req.params.id),cid=z.string().uuid().parse(req.params.changeId),auth=current(req);
  z.object({}).strict().parse(req.body);await getOpportunity(auth,oid);
  const result=await transaction(async db=>{
   const tracking=await one('SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2 FOR KEY SHARE',[auth.organization.id,oid],db);
   if(!tracking)throw new HttpError(409,'Adicione a oportunidade ao radar antes de registrar a conferência.');
   const change=await one('SELECT id FROM opportunity_changes WHERE id=$1 AND opportunity_id=$2',[cid,oid],db);
   if(!change)throw new HttpError(404,'Alteração não encontrada.');
   const inserted=await one(`INSERT INTO opportunity_change_reviews(organization_id,change_id,reviewed_by) VALUES($1,$2,$3)
    ON CONFLICT(organization_id,change_id) DO NOTHING RETURNING reviewed_at`,[auth.organization.id,cid,auth.user.id],db);
   if(inserted){
    await db.query('INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)',[auth.organization.id,auth.user.id,'opportunity.change.reviewed',cid]);
    await addEvent(tracking.id,'CHANGE_REVIEWED','Alteração conferida pela equipe','Conferência registrada no histórico de mudanças. Não altera a situação oficial do edital.',auth.user.id,db);
   }
   return one(`SELECT r.reviewed_at,u.name reviewer FROM opportunity_change_reviews r LEFT JOIN users u ON u.id=r.reviewed_by WHERE r.organization_id=$1 AND r.change_id=$2`,[auth.organization.id,cid],db);
  });res.json(result);
 });
 router.patch('/opportunity-relations/:id',async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id),body=z.object({state:z.enum(['CONFIRMED','REJECTED','PENDING']),revision:z.number().int().positive()}).strict().parse(req.body),auth=current(req);
  const r=await one('SELECT * FROM opportunity_relations WHERE id=$1 AND organization_id=$2',[id,auth.organization.id]);
  if(!r)throw new HttpError(404,'Relação não encontrada.');
  await getOpportunity(auth,r.previous_id);await getOpportunity(auth,r.new_id);
  const updated=await one(`UPDATE opportunity_relations SET state=$1,reviewed_by=$2,reviewed_at=now(),revision=revision+1 WHERE id=$3 AND organization_id=$4 AND revision=$5 RETURNING *`,[body.state,auth.user.id,id,auth.organization.id,body.revision]);
  if(!updated)throw new HttpError(409,'Esta relação já foi revisada. Recarregue a lista.');
  res.json(updated);
 });
}
