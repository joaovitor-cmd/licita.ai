import type {Router} from 'express';
import {current,HttpError,rateLimit} from './security.js';
import {emailSettings,saveEmailSettings,testEmailSettings} from './smtp-settings.js';
import {pool} from './db.js';
export function platformEmailRoutes(router:Router){
 router.use('/management/email-settings',(req,_res,next)=>{if(current(req).adminRole!=='OWNER')throw new HttpError(403,'Somente o titular pode configurar o serviço central de e-mail.');next();});
 router.get('/management/email-settings',async(_req,res)=>res.json(await emailSettings('platform')));
 router.put('/management/email-settings',async(req,res)=>{
  const result=await saveEmailSettings('platform',req.body);
  await pool.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'platform.smtp.updated','platform')",[current(req).user.id]);
  res.json(result);
 });
 router.post('/management/email-settings/test',rateLimit('platform-smtp-test',3,900000),async(req,res)=>res.json(await testEmailSettings('platform',current(req).user.email)));
}
