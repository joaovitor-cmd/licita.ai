import type {Router} from 'express';
import {z} from 'zod';
import {one,rows} from './db.js';
import {current,HttpError,clearSession,issueSession,rateLimit} from './security.js';
import {entitlements} from './entitlements.js';
// Customer context only. No administrative routes are installed here.
export function workspaceRoutes(router:Router){
 router.get('/entitlements',async(req,res)=>res.json(await entitlements(current(req).organization.id)));
 router.get('/workspaces',async(req,res)=>{
  const auth=current(req),plan=await entitlements(auth.organization.id);
  res.json(await rows('SELECT o.id,o.name,m.role FROM members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active AND o.active AND coalesce(o.environment_id,o.id)=$2 AND ($3::boolean OR o.id=$4) ORDER BY o.name,o.id',[auth.user.id,plan.environment_id,plan.multiCompany,auth.organization.id]));
 });
 router.post('/workspaces/switch',rateLimit('switch-workspace',30,60000),async(req,res)=>{
  const org=z.string().uuid().parse(req.body.organizationId),auth=current(req),plan=await entitlements(auth.organization.id);
  if(!plan.multiCompany)throw new HttpError(403,'Seu plano permite somente uma empresa.');
  const allowed=await one('SELECT o.id FROM organizations o JOIN members m ON m.organization_id=o.id WHERE o.id=$1 AND m.user_id=$2 AND m.active AND o.active AND coalesce(o.environment_id,o.id)=$3',[org,auth.user.id,plan.environment_id]);
  if(!allowed)throw new HttpError(403,'Você não tem acesso ativo a esta empresa.');
  await clearSession(req,res);await issueSession(res,auth.user.id,org);res.json({ok:true});
 });
}
