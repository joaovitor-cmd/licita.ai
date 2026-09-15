import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
 const page=await context.newPage();
 const isolated=process.env.THEME_QA_MOCK==='1';
 if(isolated)await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path==='/api/auth/me'?{user:{id:'qa',name:'Teste visual',email:'qa@example.invalid'},organization:{id:'qa',name:'QA isolado',isDemo:true},role:'ADMIN'}:[];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://localhost:5173/'+(isolated?'app/simulador':'login'));
 if(!isolated)await page.getByRole('button',{name:'Explorar demonstração'}).click();
 await page.getByRole('button',{name:'Ativar tema escuro'}).click();
 await page.reload();
 await page.getByRole('button',{name:'Ativar tema claro'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 let violations=0;
 for(const route of (isolated?['app/simulador']:['app','app/oportunidades','app/radar','app/catalogo','app/perfil','app/documentos','app/fontes','app/configuracoes','app/simulador'])){
  await page.goto('http://localhost:5173/'+route);
  await page.locator('main h1').waitFor();
  await page.locator('.loading-state').first().waitFor({state:'hidden'}).catch(()=>{});
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  console.log(route,JSON.stringify(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));
  violations+=result.violations.length;
  await page.screenshot({path:isolated?'test-results/11-dark-simulator.png':'test-results/11-dark-dashboard.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Ativar tema claro'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
 await page.getByRole('button',{name:'Ativar tema escuro'}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
 await page.screenshot({path:'test-results/12-dark-mobile.png',fullPage:true});
 assert.equal(violations,0);
} finally {await browser.close();}
