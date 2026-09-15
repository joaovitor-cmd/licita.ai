import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {pool} from '../apps/api/src/db.js';

test('painel: disponíveis, limiar configurável, histórico preservado e prazo automático',async()=>{
 const origin='http://localhost:5173'; let account:any,browser;
 try{
  const r=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});
  assert.equal(r.status,201); account=await r.json();
  const cookie=r.headers.getSetCookie().at(-1)!.split(';')[0];
  async function call(path:string,method='GET',body?:any){
   const res=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
   const data=await res.json(); assert.ok(res.ok,JSON.stringify(data)); return data;
  }
  const org=account.organization.id, opportunities=(await call('/opportunities?pageSize=100')).items;
  await pool.query('DELETE FROM trackings WHERE organization_id=$1',[org]);
  assert.ok(opportunities.length>=5);
  const [first,second,third,fourth,fifth]=opportunities;
  await pool.query("UPDATE opportunities SET opens_at=now()-interval '1 day',closes_at=now()-interval '1 hour',status='Divulgada no PNCP' WHERE demo_org_id=$1",[org]);
  await pool.query("UPDATE opportunities SET closes_at=now()+interval '3 days' WHERE id=$1",[first.id]);
  await pool.query("UPDATE opportunities SET closes_at=now()+interval '3 days',status='Concluída' WHERE id=$1",[second.id]);
  await pool.query("UPDATE opportunities SET closes_at=now()+interval '10 days' WHERE id=$1",[third.id]);
  await pool.query("UPDATE opportunities SET closes_at=now()+interval '3 days',opens_at=now()+interval '1 day' WHERE id=$1",[fourth.id]);
  await pool.query("UPDATE opportunities SET closes_at=null WHERE id=$1",[fifth.id]);
  await call('/preferences','PUT',{inApp:true,email:false,minScore:0});
  let dashboard=await call('/dashboard');
  assert.equal(dashboard.stats.opportunities,2); assert.equal(dashboard.stats.recommended,2);
  assert.equal(dashboard.recommendationMinScore,0);
  assert.equal(dashboard.byState.reduce((sum:number,x:any)=>sum+x.count,0),2);
  assert.equal((await call('/opportunities?status=open')).total,2);
  assert.equal((await call('/opportunities')).total,opportunities.length,'encerradas não são apagadas');
  await call('/preferences','PUT',{inApp:true,email:false,minScore:73});
  dashboard=await call('/dashboard'); assert.equal(dashboard.recommendationMinScore,73);
  assert.equal(dashboard.stats.recommended,(await call('/opportunities?status=open&minScore=73')).total);
  const tracking=await call('/trackings','POST',{opportunityId:first.id});
  assert.equal(tracking.deadline,null);
  dashboard=await call('/dashboard');
  assert.equal(dashboard.stats.urgent,1);
  const trackedCount=dashboard.stats.tracked;
  await call(`/trackings/${tracking.id}`,'PATCH',{deadline:'2020-01-01T10:00:00-03:00'});
  dashboard=await call('/dashboard'); assert.equal(dashboard.stats.urgent,0); assert.ok(dashboard.stats.overdue>=1);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const [name,...value]=cookie.split('='); await context.addCookies([{name,value:value.join('='),url:origin}]);
  const page=await context.newPage();
  await page.goto(origin+`/app/radar/${tracking.id}`);
  await page.getByLabel('Prazo interno (Brasília)',{exact:false}).fill('2030-01-01T10:30');
  await page.getByRole('button',{name:'Salvar alterações',exact:false}).click();
  await page.getByText('Participação atualizada.',{exact:true}).waitFor();
  assert.equal((await call(`/trackings/${tracking.id}`)).deadline,'2030-01-01T13:30:00.000Z');
  await page.getByLabel('Usar prazo oficial automaticamente',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar alterações',exact:false}).click();
  await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.disabled===true);
  // Wait for the save response, not just local checkbox state.
  await page.getByRole('button',{name:'Salvar alterações',exact:false}).waitFor();
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled);
  assert.equal((await call(`/trackings/${tracking.id}`)).deadline,null);
  await pool.query("UPDATE opportunities SET closes_at=now()+interval '12 days' WHERE id=$1",[first.id]);
  dashboard=await call('/dashboard'); assert.equal(dashboard.stats.urgent,0); assert.equal(dashboard.stats.tracked,trackedCount);
  await page.reload();
  const auto=page.getByLabel('Prazo acompanhado (Brasília)',{exact:false}); await auto.waitFor(); assert.ok(await auto.inputValue());
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  }
  await page.screenshot({path:'test-results/21-automatic-deadline.png',fullPage:true});
  await page.goto(origin+'/app');
  await page.getByText('Abertas · aderência a partir de 73%',{exact:true}).waitFor();
  await page.locator('a[href="/app/oportunidades?status=open&minScore=73"]').first().click();
  assert.equal(await page.getByLabel('Filtrar por compatibilidade').inputValue(),'73');
 }finally{
  await browser?.close();
  if(account){await pool.query('DELETE FROM organizations WHERE id=$1',[account.organization.id]);await pool.query('DELETE FROM users WHERE id=$1',[account.user.id]);}
  await pool.end();
 }
});
