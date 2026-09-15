import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {pool} from '../apps/api/src/db.js';

test('histórico paginado, acesso por empresa e confirmação de resultado incerto',async()=>{
 const origin='http://localhost:5173';
 const accounts:any[]=[];let browser;
 async function create(){
  let cookie='';
  async function call(path:string,method='GET',body?:unknown,status=200){
   const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
   const set=response.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0];
   const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
  }
  const account=await call('/auth/register','POST',{name:'QA histórico',organizationName:'QA histórico isolado',email:`history-${randomUUID()}@example.invalid`,password:'SenhaQaSegura!123'},201);
  accounts.push(account);
  // No SMTP delivery is possible: the email channel stays disabled in both QA organizations.
  await pool.query('UPDATE organizations SET preferences=$2 WHERE id=$1',[account.organization.id,JSON.stringify({email:false,inApp:true})]);
  await pool.query('INSERT INTO email_settings(organization_id,settings,verified_at) VALUES($1,$2,now())',[account.organization.id,JSON.stringify({enabled:true,host:'127.0.0.1',port:11999,mode:'local',username:'',fromEmail:'qa@example.invalid',fromName:'QA'})]);
  return {account,call,cookie:()=>cookie};
 }
 try{
  const a=await create(),b=await create();let uncertain='';
  for(let i=0;i<21;i++){
   const notification=randomUUID(),delivery=randomUUID();if(i===20)uncertain=delivery;
   await pool.query("INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key) VALUES($1,$2,$3,'Teste isolado','/app',$4)",[notification,a.account.organization.id,`QA mensagem ${i}`,notification]);
   await pool.query("INSERT INTO email_deliveries(id,organization_id,notification_id,recipient,subject,body,status) VALUES($1,$2,$3,$4,$5,'Teste isolado',$6)",[delivery,a.account.organization.id,notification,a.account.user.email,`QA mensagem ${i}`,i===20?'UNKNOWN':'FAILED']);
  }
  const first=await a.call('/email-deliveries'),second=await a.call('/email-deliveries?page=2');
  assert.equal(first.total,21);assert.equal(first.items.length,20);assert.equal(second.items.length,1);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,21);
  assert.equal((await b.call('/email-deliveries')).total,0);
  await b.call(`/email-deliveries/${uncertain}/retry`,'POST',{},404);
  await a.call(`/email-deliveries/${uncertain}/retry`,'POST',{},409);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
  const [name,...value]=a.cookie().split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);
  const page=await context.newPage();await page.goto(origin+'/app/configuracoes');
  await page.getByRole('heading',{name:'Histórico de e-mails'}).waitFor();
  const row=page.getByRole('row').filter({has:page.getByText('QA mensagem 20',{exact:true})});
  await row.getByRole('button',{name:'Tentar novamente'}).click();
  await row.getByRole('button',{name:'Confirmar reenvio'}).waitFor();
  assert.equal((await pool.query('SELECT status FROM email_deliveries WHERE id=$1',[uncertain])).rows[0].status,'UNKNOWN');
  await row.getByRole('button',{name:'Confirmar reenvio'}).click();
  await page.getByText('Envio recolocado na fila.').first().waitFor();
  assert.ok(['PENDING','CANCELLED'].includes((await pool.query('SELECT status FROM email_deliveries WHERE id=$1',[uncertain])).rows[0].status));
  await page.screenshot({path:'test-results/09-email-history.png',fullPage:true});
  await pool.query("UPDATE members SET role='MEMBER' WHERE organization_id=$1",[b.account.organization.id]);
  await b.call('/email-deliveries','GET',undefined,403);
 }finally{await browser?.close();for(const a of accounts){await pool.query('DELETE FROM organizations WHERE id=$1',[a.organization.id]);await pool.query('DELETE FROM users WHERE id=$1',[a.user.id]);}await pool.end();}
});
