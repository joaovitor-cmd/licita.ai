import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {pool} from '../apps/api/src/db.js';
import {saveOpportunity} from '../apps/api/src/jobs.js';
import {recordSourceChange,findRelatedPublications} from '../apps/api/src/source-changes.js';

test('mudanças: histórico, avisos atômicos, repetição, preferências, relações e isolamento',async()=>{
 const origin='http://localhost:5173',accounts:any[]=[],startedAt=new Date();let browser;
 async function client(){const r=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});assert.equal(r.status,201);const account=await r.json();accounts.push(account);const cookie=r.headers.getSetCookie().at(-1)!.split(';')[0];return {account,cookie,call:async(path:string,method='GET',body?:any,status=200)=>{const res=await fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;}};}
 try{
  const a=await client(),b=await client(),org=a.account.organization.id;
  const created=await pool.query('SELECT id FROM organizations WHERE id=$1 AND is_demo=true AND created_at >= $2',[org,startedAt]);
  assert.equal(created.rowCount,1,'Somente uma nova organização de demonstração desta execução pode ser alterada.');
  async function saveFixture(item:any){
   const owned=await pool.query('SELECT id FROM opportunities WHERE canonical_key=$1 AND demo_org_id=$2',[item.canonicalKey,org]);
   assert.equal(owned.rowCount,1,'Proibido alterar publicação pública ou registro fora da demonstração recém-criada.');
   return saveOpportunity(item,true);
  }
  const list=(await a.call('/opportunities')).items,old=await a.call(`/opportunities/${list[0].id}`),next=await a.call(`/opportunities/${list[1].id}`);
  await a.call('/trackings','POST',{opportunityId:old.id},201);
  let settings=await a.call('/change-alert-settings');assert.ok(!settings.types.includes('RELATED'));
  const body=({...settings,types:['CANCELLATION']});delete body.labels;
  settings=await a.call('/change-alert-settings','PUT',body);
  await a.call('/change-alert-settings','PUT',body,409);
  const source={...old,externalId:old.canonicalKey,status:'Divulgada no PNCP',sourceCode:'pncp',sourceName:'PNCP',documents:old.documents,raw:{}} as any;
  await saveFixture(source);
  const base=(await a.call(`/opportunities/${old.id}/changes`)).total;
  await saveFixture({...source,status:'Cancelada'});
  let history=await a.call(`/opportunities/${old.id}/changes`);
  assert.equal(history.total,base+1);assert.ok(history.items[0].types.includes('CANCELLATION'));
  await saveFixture({...source,status:'Cancelada'});
  assert.equal((await a.call(`/opportunities/${old.id}/changes`)).total,base+1);
  const count=async()=>Number((await pool.query("SELECT count(*) FROM notifications WHERE organization_id=$1 AND dedupe_key LIKE 'source-change:%'",[org])).rows[0].count);
  const cancelled=await count();assert.equal(cancelled,1);
  await saveFixture({...source,closesAt:'2030-01-01T12:00:00Z'});
  history=await a.call(`/opportunities/${old.id}/changes`);assert.ok(history.items[0].types.includes('REOPENING'));assert.equal(await count(),cancelled);
  await saveFixture({...source,status:'Cancelada'});assert.equal(await count(),cancelled+1,'novo ciclo não é perdido por hash repetido');
  await b.call(`/opportunities/${old.id}/changes`,'GET',undefined,404);
  // No test email can reach the worker: all real-organization/outbox changes below roll back.
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("UPDATE organizations SET is_demo=false,preferences=jsonb_set(preferences,'{email}','true') WHERE id=$1",[org]);
   await recordSourceChange(db,old.id,{...source,status:'Divulgada no PNCP'},{...source,status:'Cancelada'},'Situação alterada na fonte de teste');
   const queued=await db.query("SELECT count(*) FROM email_deliveries WHERE organization_id=$1 AND category LIKE 'CHANGE:%'",[org]);assert.equal(Number(queued.rows[0].count),1);
   const title='Contratação de serviço de impressão com equipamentos multifuncionais e suporte técnico presencial';
   // Use valid bounded identifiers; changes remain uncommitted and invisible to other sessions.
   const prior='pncp:12345678000100-1-87654321/2026',fresh='pncp:12345678000100-1-87654322/2026';
   await db.query("UPDATE opportunities SET demo_org_id=null,canonical_key=$2,title=$3,modality='Pregão eletrônico',status='Cancelada',published_at='2026-08-01',closes_at='2026-08-15' WHERE id=$1",[old.id,prior,title]);
   await db.query('UPDATE opportunities SET demo_org_id=null,canonical_key=$2 WHERE id=$1',[next.id,fresh]);
   await findRelatedPublications(db,next.id,{canonicalKey:fresh,title,modality:'Pregão eletrônico',publishedAt:'2026-09-01'});
   await findRelatedPublications(db,next.id,{canonicalKey:fresh,title,modality:'Pregão eletrônico',publishedAt:'2026-09-01'});
   assert.equal((await db.query('SELECT * FROM opportunity_relations WHERE organization_id=$1',[org])).rowCount,1);
   assert.equal((await db.query("SELECT * FROM notifications WHERE organization_id=$1 AND dedupe_key LIKE 'related:%'",[org])).rowCount,0,'relação existe mas aviso opt-in segue desativado');
  }finally{await db.query('ROLLBACK');db.release();}
  const relationId=randomUUID();
  await pool.query('INSERT INTO opportunity_relations(id,organization_id,previous_id,new_id,evidence) VALUES($1,$2,$3,$4,$5)',[relationId,org,old.id,next.id,JSON.stringify({reasons:['Mesmo órgão em cenário de teste','Objeto semelhante'],titleSimilarity:90,warning:'Confirme os documentos antes de associar.'})]);
  await b.call(`/opportunity-relations/${relationId}`,'PATCH',{state:'CONFIRMED',revision:1},404);
  await pool.query("UPDATE members SET role='MEMBER' WHERE organization_id=$1",[b.account.organization.id]);
  await b.call('/change-alert-settings','GET',undefined,403);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...value]=a.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);const page=await context.newPage();
  await page.goto(origin+`/app/oportunidades/${old.id}?tab=mudancas`);
  await page.getByRole('button',{name:'Confirmar relação',exact:true}).click();
  await page.getByText('Relação confirmada pela equipe',{exact:true}).waitFor();
  await a.call(`/opportunity-relations/${relationId}`,'PATCH',{state:'REJECTED',revision:1},409);
  await page.getByText('Ver o que mudou: antes e depois',{exact:true}).first().click();
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  await page.screenshot({path:'test-results/22-source-changes.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/22-source-changes-mobile.png',fullPage:true});
  await page.goto(origin+'/app/configuracoes');
  await page.getByLabel('Possível republicação relacionada',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar avisos de mudanças',exact:true}).click();
  await page.getByText('Avisos de mudanças atualizados.',{exact:true}).waitFor();
  assert.ok((await a.call('/change-alert-settings')).types.includes('RELATED'));
 }finally{await browser?.close();for(const a of accounts){await pool.query('DELETE FROM organizations WHERE id=$1',[a.organization.id]);await pool.query('DELETE FROM users WHERE id=$1',[a.user.id]);}await pool.end();}
});
