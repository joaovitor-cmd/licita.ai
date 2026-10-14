import {randomUUID} from 'node:crypto';
import type {Router} from 'express';
import {z} from 'zod';
import {one,rows,transaction,type Database} from './db.js';
import {current,requireAdmin,HttpError} from './security.js';
import {getOpportunity,ensureOwner,iso} from './data.js';
import {priceRecordSchema,priceRecordAlert} from './price-record-rules.js';
import {entitlements} from './entitlements.js';
const columns=`SELECT r.*,o.title opportunity_title,d.name document_name,u.name owner_name FROM price_records r LEFT JOIN opportunities o ON o.id=r.opportunity_id LEFT JOIN documents d ON d.id=r.document_id AND d.organization_id=r.organization_id LEFT JOIN users u ON u.id=r.owner_id`;
const date=(v:any)=>typeof v==='string'?v.slice(0,10):`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
function view(r:any){return {id:r.id,number:r.number,title:r.title,agency:r.agency,opportunityId:r.opportunity_id,opportunityTitle:r.opportunity_title??null,documentId:r.document_id,documentName:r.document_name??null,ownerId:r.owner_id,ownerName:r.owner_name??null,startsOn:date(r.starts_on),endsOn:date(r.ends_on),notes:r.notes,items:r.items,revision:r.revision,archived:r.archived,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
async function find(org:string,id:string,db?:Database){const r=await one(columns+' WHERE r.organization_id=$1 AND r.id=$2',[org,id],db);if(!r)throw new HttpError(404,'Ata não encontrada.');return r;}
async function event(db:Database,id:string,actor:string,type:string,snapshot:any){await db.query('INSERT INTO price_record_events(id,record_id,actor_id,type,description,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,actor,type,{CREATED:'Cadastro manual da ata',UPDATED:'Dados da ata atualizados',ARCHIVED:'Ata arquivada; dados preservados',RESTORED:'Ata restaurada'}[type]??type,JSON.stringify(snapshot)]);}
export function priceRecordRoutes(router:Router){
 router.get('/price-records',async(req,res)=>{
  const q=z.object({q:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),archived:z.enum(['true','false']).default('false'),highlight:z.uuid().optional()}).strict().parse(req.query),org=current(req).organization.id;
  const where=` WHERE r.organization_id=$1 AND r.archived=$2 AND (r.number ILIKE $3 OR r.title ILIKE $3 OR r.agency ILIKE $3)${q.highlight?' AND r.id=$4':''}`,args:any[]=[org,q.archived==='true',`%${q.q}%`];if(q.highlight)args.push(q.highlight);
  const result=await transaction(async db=>{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const count=await one('SELECT count(*)::int total FROM price_records r'+where,args,db);const items=await rows(columns+where+` ORDER BY r.ends_on,r.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,q.pageSize,(q.page-1)*q.pageSize],db);return {items:items.map(view),total:count.total,page:q.page,pages:Math.max(1,Math.ceil(count.total/q.pageSize))};});res.json(result);
 });
 router.get('/price-records/:id',async(req,res)=>res.json(view(await find(current(req).organization.id,z.uuid().parse(req.params.id)))));
 router.get('/price-records/:id/events',async(req,res)=>{const record=await find(current(req).organization.id,z.uuid().parse(req.params.id));const q=z.object({page:z.coerce.number().int().min(1).default(1)}).strict().parse(req.query);res.json(await rows('SELECT e.id,e.type,e.description,e.created_at "createdAt",u.name "actorName" FROM price_record_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.record_id=$1 ORDER BY e.created_at DESC,e.id LIMIT 50 OFFSET $2',[record.id,(q.page-1)*50]));});
 async function save(req:any,res:any,update:boolean){
  requireAdmin(req);const auth=current(req),org=auth.organization.id,id=update?z.uuid().parse(req.params.id):randomUUID();
  const revision=update?z.number().int().positive().parse(req.body.revision):null;
  const {revision:ignored,...input}=req.body;const b=priceRecordSchema.parse(update?input:req.body);
  await transaction(async db=>{
   if(update){const old=await one('SELECT * FROM price_records WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org],db);if(!old)throw new HttpError(404,'Ata não encontrada.');if(old.revision!==revision)throw new HttpError(409,'A ata mudou. Recarregue e confira antes de salvar.');if(old.archived)throw new HttpError(409,'Restaure a ata antes de editar.');}
   if(b.opportunityId)await getOpportunity(auth,b.opportunityId,db);await ensureOwner(auth,b.ownerId,db);
   if(b.documentId&&!await one("SELECT id FROM documents WHERE id=$1 AND organization_id=$2 AND mime_type='application/pdf' FOR KEY SHARE",[b.documentId,org],db))throw new HttpError(400,'Selecione um PDF da biblioteca da sua empresa.');
   const args=[id,org,b.number,b.title,b.agency,b.opportunityId,b.documentId,b.ownerId,b.startsOn,b.endsOn,b.notes,JSON.stringify(b.items)];
   if(update)await db.query('UPDATE price_records SET number=$3,title=$4,agency=$5,opportunity_id=$6,document_id=$7,owner_id=$8,starts_on=$9,ends_on=$10,notes=$11,items=$12,revision=revision+1,updated_at=now() WHERE id=$1 AND organization_id=$2',args);
   else await db.query('INSERT INTO price_records(id,organization_id,number,title,agency,opportunity_id,document_id,owner_id,starts_on,ends_on,notes,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',args);
   await event(db,id,auth.user.id,update?'UPDATED':'CREATED',b);
   if(update)await db.query("UPDATE notifications SET read=true WHERE organization_id=$1 AND dedupe_key LIKE $2 AND dedupe_key NOT LIKE $3",[org,`price-record:${id}:%`,`price-record:${id}:${b.endsOn}:%`]);
  });res.status(update?200:201).json(view(await find(org,id)));
 }
 router.post('/price-records',(req,res)=>save(req,res,false));router.put('/price-records/:id',(req,res)=>save(req,res,true));
 for(const action of ['archive','restore'])router.patch(`/price-records/:id/${action}`,async(req,res)=>{
  requireAdmin(req);const auth=current(req),id=z.uuid().parse(req.params.id),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body);
  await transaction(async db=>{const r=await one('SELECT * FROM price_records WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,auth.organization.id],db);if(!r)throw new HttpError(404,'Ata não encontrada.');if(r.revision!==b.revision)throw new HttpError(409,'A ata mudou. Recarregue antes de continuar.');await db.query('UPDATE price_records SET archived=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND organization_id=$2',[id,auth.organization.id,action==='archive']);await event(db,id,auth.user.id,action==='archive'?'ARCHIVED':'RESTORED',view(r));await db.query('UPDATE notifications SET read=true WHERE organization_id=$1 AND dedupe_key LIKE $2',[auth.organization.id,`price-record:${id}:%`]);
   if(action==='restore'){
    const prefs=await one('SELECT preferences FROM organizations WHERE id=$1',[auth.organization.id],db),alert=priceRecordAlert(id,r.number,date(r.ends_on));
    if(alert)await db.query('INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,dedupe_key) DO UPDATE SET read=excluded.read,description=excluded.description',[randomUUID(),auth.organization.id,alert.title,alert.description,alert.url,alert.key,!prefs.preferences.inApp]);
   }
  });res.json(view(await find(auth.organization.id,id)));
 });
}
export async function priceRecordNotifications(){
 const candidates=await rows("SELECT r.id FROM price_records r JOIN organizations o ON o.id=r.organization_id JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) JOIN commercial_plans p ON p.code=e.plan_code WHERE o.active AND e.active AND (NOT p.enforce_features OR p.planned_features ? 'documents') AND NOT o.is_demo AND NOT r.archived AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.organization_id=r.organization_id AND n.dedupe_key='price-record:'||r.id::text||':'||r.ends_on::text||':'||CASE WHEN r.ends_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'expired' ELSE 'upcoming' END) AND r.ends_on <= (now() AT TIME ZONE 'America/Sao_Paulo')::date+30 ORDER BY r.ends_on,r.id LIMIT 200");
 for(const candidate of candidates)await transaction(async db=>{
  const r=await one('SELECT r.*,o.preferences FROM price_records r JOIN organizations o ON o.id=r.organization_id JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) WHERE r.id=$1 AND NOT r.archived AND o.active AND e.active AND NOT o.is_demo FOR UPDATE OF r,o,e',[candidate.id],db);if(!r)return;
  const plan=await entitlements(r.organization_id,db);if(!plan.features.includes('documents'))return;const alert=priceRecordAlert(r.id,r.number,date(r.ends_on));if(!alert)return;
  await db.query('INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,dedupe_key) DO NOTHING',[randomUUID(),r.organization_id,alert.title,alert.description,alert.url,alert.key,!r.preferences.inApp]);
 });
}
