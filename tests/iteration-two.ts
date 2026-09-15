import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {calculateViability,initialInputs} from '../apps/web/src/viability.js';
import {matchesSearch,scoreOpportunity,defaultProfile} from '../apps/api/src/scoring.js';
test('busca reconhece equivalências e plural sem substring acidental',()=>{
 assert.equal(matchesSearch('Terceirização de impressões corporativas','outsourcing de impressão'),true);
 assert.equal(matchesSearch('Aluguel de impressoras multifuncionais','locação de impressora'),true);
 assert.equal(matchesSearch('políticas de impressão','cotas'),false);
 const score=scoreOpportunity({title:'Software de bilhetagem',description:''},{...defaultProfile,keywords:['sistema de bilhetagem','software de bilhetagem']},[]);
 assert.equal(score.score,50,'sinônimos duplicados não inflam a pontuação');
});
test('simulador calcula margem sobre receita e protege denominador',()=>{
 const r=calculateViability({...initialInputs,monoPages:10000,monoPrice:0.1,monoCost:0.03,equipment:200,operations:100,taxPercent:10,targetMargin:20});
 assert.equal(r.revenue,1000);assert.equal(r.totalCost,700);assert.equal(r.profit,300);assert.equal(r.margin,30);assert.ok(Math.abs(r.targetRevenue!-600/0.7)<0.001);
 assert.equal(calculateViability({...initialInputs,taxPercent:50,targetMargin:50}).targetRevenue,null);
});
test('franquia cobra apenas excedentes mas inclui custo de todas as páginas',()=>{
 const inputs={...initialInputs,monoPages:12000,monoIncluded:10000,monoPrice:0.1,monoCost:0.03,fixedRevenue:1200,equipment:200};
 const result=calculateViability(inputs);assert.equal(result.monoBillable,2000);assert.equal(result.revenue,1400);assert.equal(result.operatingCost,560);assert.equal(result.profit,840);
 const below=calculateViability({...inputs,monoPages:8000});assert.equal(below.monoBillable,0);assert.equal(below.revenue,1200);assert.equal(below.operatingCost,440);
 const color=calculateViability({...inputs,colorPages:1000,colorIncluded:800,colorPrice:0.5,colorCost:0.2});assert.equal(color.colorBillable,200);assert.equal(color.revenue,1500);assert.equal(color.operatingCost,760);
 const {monoIncluded,colorIncluded,...legacy}=inputs;assert.equal(calculateViability(legacy as typeof inputs).revenue,2400);
});
test('preferências e cenários persistem, isolados por empresa, e simulador abre no navegador',async()=>{
 const origin='http://localhost:5173';
 async function client(){const r=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});assert.equal(r.status,201);const cookie=r.headers.getSetCookie().at(-1)!.split(';')[0];return {cookie,call:async(path:string,method='GET',body?:unknown)=>fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})};}
 const a=await client(),b=await client();
 assert.equal((await a.call('/preferences','PUT',{inApp:true,email:false,minScore:75})).status,200);
 assert.equal((await (await a.call('/preferences')).json()).minScore,75);
 assert.equal((await a.call('/preferences','PUT',{inApp:true,email:false,minScore:101})).status,400);
 const created=await a.call('/simulations','POST',{name:'Cenário QA isolado',inputs:initialInputs});assert.equal(created.status,201);const scenario=await created.json();
 assert.ok((await (await a.call('/simulations')).json()).some((s:any)=>s.id===scenario.id));
 assert.equal((await (await b.call('/simulations')).json()).some((s:any)=>s.id===scenario.id),false);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR'});const [cookieName,...cookieValue]=a.cookie.split('=');await context.addCookies([{name:cookieName,value:cookieValue.join('='),url:origin}]);const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app/simulador');await page.getByRole('heading',{name:'Simulador de viabilidade',exact:true}).waitFor();await page.getByLabel('Nome do cenário').fill('Cenário QA navegador');await page.getByLabel('Páginas P&B por mês').fill('10000');await page.getByLabel('Preço por página P&B (R$)',{exact:true}).fill('0.1');await page.getByRole('button',{name:'Salvar cenário',exact:true}).click();await page.getByRole('button',{name:'Cenário QA navegador',exact:true}).waitFor();await page.screenshot({path:'test-results/06-simulador.png',fullPage:true});await page.goto(origin+'/app/configuracoes');await page.waitForFunction(()=>Array.from(document.querySelectorAll('input[type="number"]')).some(input=>(input as HTMLInputElement).value==='75'));assert.equal(await page.getByLabel('Aderência mínima para alertas de novos editais (%)').inputValue(),'75');assert.deepEqual(errors,[]);}finally{await browser.close();}
});
