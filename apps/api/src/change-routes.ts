import type {Router} from 'express';
import {z} from 'zod';
import {one,rows,transaction} from './db.js';
import {current,requireAdmin,HttpError} from './security.js';
import {getOpportunity} from './data.js';
import {changeLabels,changeSettings,changeSettingsSchema} from './change-rules.js';
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
  const history=await one(`WITH history AS MATERIALIZED (SELECT * FROM opportunity_changes WHERE opportunity_id=$1)
   SELECT (SELECT count(*)::int FROM history) total,coalesce((SELECT jsonb_agg(p ORDER BY detected_at DESC,id DESC) FROM (SELECT * FROM history ORDER BY detected_at DESC,id DESC LIMIT 10 OFFSET $2) p),'[]') items`,[id,(page-1)*10]);
  const relations=await rows(`SELECT r.*,a.title previous_title,b.title new_title,u.name reviewer FROM opportunity_relations r
   JOIN opportunities a ON a.id=r.previous_id JOIN opportunities b ON b.id=r.new_id LEFT JOIN users u ON u.id=r.reviewed_by
   WHERE r.organization_id=$1 AND (r.previous_id=$2 OR r.new_id=$2) ORDER BY r.detected_at DESC LIMIT 20`,[current(req).organization.id,id]);
  res.json({...history,page,pages:Math.max(1,Math.ceil(history.total/10)),relations,labels:changeLabels});
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
