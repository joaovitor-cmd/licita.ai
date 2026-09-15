import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import express from 'express';
import nodemailer from 'nodemailer';
import {pool} from '../apps/api/src/db.js';
import {saveEmailSettings,emailSettings,companyEmailConfigured} from '../apps/api/src/smtp-settings.js';
import {sendEmail} from '../apps/api/src/mailer.js';
import {platformEmailRoutes} from '../apps/api/src/platform-email-routes.js';

test('SMTP único: segredo protegido, ambientes compartilham transporte, desativação global e acesso restrito',async()=>{
 const originalQuery=pool.query,originalTransport=nodemailer.createTransport;
 const previousKey=process.env.SMTP_ENCRYPTION_KEY;process.env.SMTP_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 let record:any=null;const deliveries:any[]=[];
 (pool as any).query=async(sql:string,values:any[]=[])=>{
  if(sql.includes('platform_email_settings'))assert.equal(values[0],'platform');
  if(sql.startsWith('INSERT INTO platform_email_settings'))record={settings:JSON.parse(values[1]),password_ciphertext:values[2],verified_at:null,revision:1};
  return {rows:sql.startsWith('SELECT')&&record?[record]:[],rowCount:1};
 };
 (nodemailer as any).createTransport=(options:any)=>({sendMail:async(message:any)=>{deliveries.push({options,message});return{accepted:[message.to]};},close(){}});
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.auth={adminRole:req.get('x-role'),user:{id:'qa',email:'owner@example.invalid'}} as any;next();});
 const router=express.Router();platformEmailRoutes(router);app.use(router);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as any).port}/management/email-settings`;
 try{
  await saveEmailSettings('ignored-company',{enabled:true,host:'127.0.0.1',port:1025,mode:'local',username:'qa',password:'qa-secret-only',fromEmail:'platform@example.invalid',fromName:'Licitaro'});
  const settings=await emailSettings('another-company');
  assert.equal(settings.hasPassword,true);assert.equal(JSON.stringify(settings).includes('qa-secret-only'),false);assert.equal('password_ciphertext' in settings,false);
  assert.equal(await companyEmailConfigured('company-a'),false);
  record.verified_at=new Date();
  assert.equal(await companyEmailConfigured('company-b'),true);
  await sendEmail('a@example.invalid','A','Tenant A','company-a');
  await sendEmail('b@example.invalid','B','Tenant B','company-b');
  await sendEmail('reset@example.invalid','Reset','Recuperação');
  assert.deepEqual(deliveries.map(d=>d.message.to),['a@example.invalid','b@example.invalid','reset@example.invalid']);
  assert.ok(deliveries.every(d=>d.message.from.address==='platform@example.invalid'&&d.options.auth.pass==='qa-secret-only'));
  record.settings.enabled=false;assert.equal(await sendEmail('no@example.invalid','No','No','company-a'),false);assert.equal(deliveries.length,3);
  for(const role of ['MEMBER','ADMIN','VIEWER'])for(const method of ['GET','PUT','POST']){
   const response=await fetch(url+(method==='POST'?'/test':''),{method,headers:{'x-role':role}});assert.equal(response.status,403);
  }
  assert.equal((await fetch(url,{headers:{'x-role':'OWNER'}})).status,200);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));pool.query=originalQuery;nodemailer.createTransport=originalTransport;if(previousKey===undefined)delete process.env.SMTP_ENCRYPTION_KEY;else process.env.SMTP_ENCRYPTION_KEY=previousKey;await pool.end();}
});
