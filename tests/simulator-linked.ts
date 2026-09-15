import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pool} from '../apps/api/src/db.js';
import {initialInputs} from '../apps/web/src/viability.js';

test('simulação ligada ao edital, comparação visual e isolamento entre empresas',async()=>{
 const origin='http://localhost:5173';const accounts:any[]=[];let browser;
 async function client(){
  const response=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});assert.equal(response.status,201);
  const account=await response.json();accounts.push(account);const cookie=response.headers.getSetCookie().at(-1)!.split(';')[0];
  return {account,cookie,call:async(path:string,method='GET',body?:unknown,status=200)=>{const r=await fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}};
 }
 try{
  const a=await client(),b=await client();const opportunity=(await a.call('/opportunities')).items[0];
  assert.equal((await a.call('/simulation-context/'+opportunity.id)).id,opportunity.id);
  await b.call('/simulation-context/'+opportunity.id,'GET',undefined,404);
  await b.call('/simulations','POST',{name:'Acesso indevido QA',inputs:initialInputs,opportunityId:opportunity.id},404);
  for(const [name,monoPages] of [['Conservador QA',8000],['Base QA',10000],['Otimista QA',12000]] as const){
   const saved=await a.call('/simulations','POST',{name,inputs:{...initialInputs,monoPages,monoPrice:0.1,monoCost:0.03,equipment:200},opportunityId:opportunity.id},201);assert.equal(saved.opportunity_id,opportunity.id);
  }
  const saved=await a.call('/simulations');assert.equal(saved.length,3);assert.ok(saved.every((s:any)=>s.opportunity_title===opportunity.title));assert.equal((await b.call('/simulations')).length,0);
  await a.call('/simulations','POST',{name:'Franquia inválida',inputs:{...initialInputs,monoIncluded:-1}},400);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const [name,...value]=a.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);const page=await context.newPage();
  await page.goto(origin+`/app/oportunidades/${opportunity.id}`);await page.getByRole('link',{name:'Simular viabilidade',exact:true}).click();
  await page.getByRole('heading',{name:'Edital vinculado',exact:true}).waitFor();
  await page.getByLabel('Páginas P&B incluídas na franquia mensal',{exact:true}).fill('10000');
  for(const label of ['Conservador QA','Base QA','Otimista QA'])await page.getByRole('checkbox',{name:`Comparar ${label}`,exact:true}).check();
  await page.getByRole('heading',{name:'Comparação de cenários',exact:true}).waitFor();assert.equal(await page.getByRole('table').getByRole('row').count(),4);
  await page.screenshot({path:'test-results/10-simulator-linked.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await browser?.close();for(const a of accounts){await pool.query('DELETE FROM organizations WHERE id=$1',[a.organization.id]);await pool.query('DELETE FROM users WHERE id=$1',[a.user.id]);}await pool.end();}
});
