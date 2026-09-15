import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {pool} from '../apps/api/src/db.js';
test('jornada guiada: fila, evidências, revisão persistente, versão e isolamento',async()=>{
 const origin='http://localhost:5173';const accounts:any[]=[];let browser;
 async function client(){const r=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});assert.equal(r.status,201);const account=await r.json();accounts.push(account);const cookie=r.headers.getSetCookie().at(-1)!.split(';')[0];return {account,cookie,call:async(path:string,method='GET',body?:any,status=200)=>{const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}};}
 try{
 const a=await client(),b=await client();const opportunity=(await a.call('/opportunities')).items[0];
 const queued=await a.call(`/opportunities/${opportunity.id}/analysis`,'POST',{},202);
 await b.call(`/opportunities/${opportunity.id}/analysis`,'GET',undefined,404);
 let view:any;
 for(let i=0;i<30;i++){view=await a.call(`/opportunities/${opportunity.id}/analysis`);if(!['PENDING','RUNNING'].includes(view.analysis.status))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(view.analysis.status,'PARTIAL');assert.equal(view.analysis.id,queued.id);
 // Explicit synthetic fixture, only in this isolated demonstration. Real parser is checked separately.
 await pool.query('UPDATE edital_analyses SET result=$2 WHERE id=$1',[queued.id,JSON.stringify({method:'Fixture QA',warning:'Documento sintético de teste.',documents:[{name:'Anexo sintético QA',url:'https://pncp.gov.br/pncp-api/v1/orgaos/12345678000190/compras/2026/1/arquivos/1',status:'READ',message:'Fixture QA',readPages:1,totalPages:1,evidence:[{topic:'billing',page:1,quote:'Franquia mensal de 10000 páginas. Excedente conforme proposta.'}]}]})]);
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const [name,...value]=a.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);const page=await context.newPage();await page.goto(origin+`/app/oportunidades/${opportunity.id}`);
 await page.getByRole('heading',{name:'Entenda este edital',exact:true}).waitFor();
 await page.getByText('Sou novo em licitações — por onde começo?',{exact:true}).click();
 const topic=page.locator('.analysis-topic').filter({hasText:'Franquias e cobrança'});await topic.locator('summary').first().click();await topic.getByText('Ver evidências e páginas',{exact:true}).click();await topic.getByRole('link',{name:'Anexo sintético QA · página 1 do PDF',exact:true}).waitFor();
 await topic.getByLabel('Conferência: Franquias e cobrança',{exact:true}).selectOption('ATTENTION');await topic.getByLabel('Notas: Franquias e cobrança',{exact:true}).fill('Conferir se a franquia é compartilhada.');await topic.getByRole('button',{name:'Salvar conferência',exact:true}).click();await page.getByText('Conferência salva para esta versão.',{exact:true}).waitFor();
 await page.reload();await page.locator('.analysis-topic').filter({hasText:'Franquias e cobrança'}).locator('summary').first().click();await page.getByLabel('Notas: Franquias e cobrança',{exact:true}).waitFor();assert.equal(await page.getByLabel('Notas: Franquias e cobrança',{exact:true}).inputValue(),'Conferir se a franquia é compartilhada.');
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
 await page.screenshot({path:'test-results/14-guided-analysis.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const payload={topic:'billing',state:'REVIEWED',notes:'QA'};await b.call(`/opportunities/${opportunity.id}/analysis/${queued.id}/review`,'PUT',payload,404);
 await pool.query("UPDATE opportunities SET content_hash='qa-new-version' WHERE id=$1",[opportunity.id]);assert.equal((await a.call(`/opportunities/${opportunity.id}/analysis`)).analysis.stale,true);
 await a.call(`/opportunities/${opportunity.id}/analysis/${queued.id}/review`,'PUT',payload,409);
 await pool.query("UPDATE edital_analyses SET created_at=now()-interval '1 minute' WHERE id=$1",[queued.id]);
 const next=await a.call(`/opportunities/${opportunity.id}/analysis`,'POST',{},202);assert.notEqual(next.id,queued.id);
 const previous=await a.call(`/opportunities/${opportunity.id}/analysis?version=${queued.id}`);assert.equal(previous.analysis.id,queued.id);assert.equal(previous.analysis.stale,true);assert.equal(previous.analysis.reviews[0].notes,'Conferir se a franquia é compartilhada.');
 const otherOpportunity=(await b.call('/opportunities')).items[0];await b.call(`/opportunities/${otherOpportunity.id}/analysis?version=${queued.id}`,'GET',undefined,404);
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.getByLabel('Versão da leitura',{exact:true}).selectOption(queued.id);await page.getByText('Os registros abaixo são apenas para consulta',{exact:false}).waitFor();
 }finally{await browser?.close();for(const a of accounts){await pool.query('DELETE FROM organizations WHERE id=$1',[a.organization.id]);await pool.query('DELETE FROM users WHERE id=$1',[a.user.id]);}await pool.end();}
});
