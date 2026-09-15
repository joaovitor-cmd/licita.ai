import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../apps/api/src/db.js';
import {authRouter} from '../apps/api/src/auth.js';
import {router} from '../apps/api/src/routes.js';
import {createConsoleApp} from '../apps/api/src/console-server.js';
import {session,requireSession,hashPassword} from '../apps/api/src/security.js';

test('gestão isolada: provisionamento, múltiplas empresas, suspensão e proteção de escopo',async()=>{
 const org=randomUUID(),user=randomUUID(),suffix=randomUUID(),mail=`qa-management-${suffix}@example.invalid`,secret=`Qa!-${randomUUID()}`,companies=[org],users=[user],previous=process.env.PLATFORM_ADMIN_USER_ID;
 let server:any,consoleServer:any;
 try{
  // Platform privilege exists only in this separate test process, never in the running preview.
  process.env.PLATFORM_ADMIN_USER_ID=user;
  await migrate();
  const planCode='qa-'+suffix.slice(0,20);
  await pool.query("INSERT INTO commercial_plans(code,name,max_companies) VALUES($1,'Plano QA',1)",[planCode]);
  await pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,'QA isolada gestão '+suffix]);
  await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Gestor QA',mail,await hashPassword(secret)]);
  await pool.query("INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",[org,user]);
  await pool.query("INSERT INTO console_admins(id,organization_id,name,email,password_hash,role) VALUES($1,$2,'QA Console',$3,$4,'OWNER')",[user,org,mail,await hashPassword(secret)]);
  const app=express();app.use(express.json(),cookieParser(),session);app.use('/api/auth',authRouter);app.use('/api',requireSession,router);app.use((_req,res)=>res.status(404).json({error:'Não encontrado.'}));app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||400).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
  consoleServer=createConsoleApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>consoleServer.once('listening',resolve));const consoleBase=`http://127.0.0.1:${consoleServer.address().port}/api`;
  async function client(target=base){let cookie='';return {call:async(path:string,method='GET',body?:any,status=200,workspace?:string)=>{const response=await fetch(target+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'http://localhost:5174',...(workspace?{'X-Workspace-Id':workspace}:{})},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0];const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}};}
  const admin=await client(consoleBase);assert.equal((await admin.call('/console-auth/login','POST',{email:mail,password:secret})).isPlatformAdmin,true);
  const customerEmail=`qa-customer-${suffix}@example.invalid`;
  const created=await admin.call('/management/companies','POST',{name:'QA Cliente '+suffix,taxId:'',planCode:'initial',ownerName:'Cliente QA',ownerEmail:customerEmail},201);companies.push(created.id);users.push(created.userId);assert.ok(created.activationUrl);
  const token=new URL(created.activationUrl).searchParams.get('token');const customer=await client();await customer.call('/auth/reset-password','POST',{token,password:secret});await customer.call('/auth/login','POST',{email:customerEmail,password:secret});
  await customer.call('/management/companies','GET',undefined,404);
  assert.equal((await customer.call('/entitlements')).multiCompany,false);
  assert.equal((await customer.call('/workspaces')).length,1);
  await customer.call('/workspaces/switch','POST',{organizationId:created.id},403);
  await admin.call(`/management/companies/${created.id}`,'PATCH',{name:'QA Cliente '+suffix,active:true,planCode,revision:1});
  const plan=await admin.call(`/management/plans/${planCode}`,'PUT',{name:'Plano QA',description:'',plannedFeatures:['discovery','radar'],maxCompanies:2,enforceFeatures:true,revision:1});
  await customer.call('/catalog','GET',undefined,403);
  await admin.call(`/management/plans/${planCode}`,'PUT',{name:'Plano QA',description:'',plannedFeatures:['discovery','radar'],maxCompanies:2,enforceFeatures:false,revision:plan.revision});
  const company2=await admin.call(`/management/environments/${created.id}/companies`,'POST',{name:'QA Segunda '+suffix},201);companies.push(company2.id);
  await admin.call(`/management/environments/${created.id}/companies`,'POST',{name:'Acima do limite'},403);
  await admin.call(`/management/plans/${planCode}`,'PUT',{name:'Plano QA',description:'',plannedFeatures:[],maxCompanies:1,enforceFeatures:false,revision:plan.revision+1},409);
  assert.equal((await customer.call('/workspaces')).length,2);
  await customer.call('/workspaces/switch','POST',{organizationId:org},403);
  await customer.call('/workspaces/switch','POST',{organizationId:company2.id});
  assert.equal((await customer.call('/auth/me')).organization.id,company2.id);
  await customer.call('/profile','GET',undefined,409,created.id);
  const catalog=await customer.call('/catalog','POST',{type:'SERVICE',name:'Exclusivo da segunda',description:'',category:'',keywords:[],active:true},201,company2.id);
  await customer.call('/workspaces/switch','POST',{organizationId:created.id});assert.ok(!(await customer.call('/catalog')).some((x:any)=>x.id===catalog.id));
  const detail=await admin.call(`/management/companies/${created.id}`);
  await admin.call(`/management/companies/${created.id}`,'PATCH',{name:detail.company.name,active:false,planCode,revision:detail.company.access_revision});
  await customer.call('/auth/me','GET',undefined,401);
  await customer.call('/auth/login','POST',{email:customerEmail,password:secret},401);
  await admin.call(`/management/companies/${created.id}`,'PATCH',{name:detail.company.name,active:true,planCode,revision:detail.company.access_revision+1});
  await customer.call('/auth/login','POST',{email:customerEmail,password:secret});
  await customer.call('/workspaces/switch','POST',{organizationId:company2.id});
  assert.ok((await customer.call('/catalog')).some((x:any)=>x.id===catalog.id),'suspensão preserva dados');
  assert.equal((await admin.call('/management/plans')).enforced,true);
  assert.ok((await admin.call('/management/metrics')).environments>=1);
  await admin.call(`/management/environments/${created.id}/companies/${company2.id}`,'PATCH',{active:false});
  await customer.call('/auth/me','GET',undefined,401);
  await admin.call(`/management/environments/${created.id}/companies/${company2.id}`,'PATCH',{active:true});
  await customer.call('/auth/login','POST',{email:customerEmail,password:secret});
  await admin.call(`/management/companies/${created.id}/members/${created.userId}`,'PATCH',{active:false,role:'ADMIN'});
  await customer.call('/auth/me','GET',undefined,401);
  await customer.call('/auth/login','POST',{email:customerEmail,password:secret},401);
  assert.ok((await admin.call(`/management/companies/${created.id}`)).audit.length>=2);
  await admin.call(`/management/companies/${org}`,'PATCH',{name:'QA',active:false,planCode:'complete',revision:1},400);
 }finally{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(consoleServer)await new Promise<void>(resolve=>consoleServer.close(()=>resolve()));
  await pool.query('DELETE FROM console_admins WHERE id=$1',[user]);
  if(previous===undefined)delete process.env.PLATFORM_ADMIN_USER_ID;else process.env.PLATFORM_ADMIN_USER_ID=previous;
  for(const id of [...companies].reverse()){await pool.query('DELETE FROM audit_logs WHERE organization_id=$1',[id]);await pool.query('DELETE FROM organizations WHERE id=$1',[id]);}
  await pool.query('DELETE FROM commercial_plans WHERE code=$1',['qa-'+suffix.slice(0,20)]);
  for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end();
 }
});
