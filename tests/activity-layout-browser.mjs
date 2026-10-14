import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

test('últimos movimentos mostra resumo compacto e detalhes completos sob demanda',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  const description='Abertura: "2026-09-02T11:00:00.000Z" → "2026-09-10T11:00:00.000Z"\nAnexos: [] → '+JSON.stringify([{name:'Termo de referência',url:'https://pncp.gov.br/'+'arquivo-sem-espacos'.repeat(350)}]);
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let json=[];
   if(path==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'QA'},role:'ADMIN'};
   if(path==='/api/entitlements')json={features:['discovery','radar'],multiCompany:false};
   if(path==='/api/getting-started')json={onboardingStatus:'DISMISSED',profileReady:true,radarReady:true};
   if(path==='/api/dashboard')json={stats:{opportunities:10,recommended:2,tracked:1,urgent:0,overdue:0,potentialValue:100},recommendationMinScore:60,recommended:[],deadlines:[],byState:[],byModality:[],activity:[{id:'event',title:'Mudança de prazo · Alteração na lista de anexos',description,createdAt:'2026-09-28T22:18:00Z'}],lastSync:'2026-09-29T09:25:00Z'};
   await route.fulfill({json});
  });
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.goto('http://localhost:5173/app/visao-geral');
   const paragraph=page.locator('.activity-panel .activity-item p');await paragraph.waitFor();
   assert.match(await paragraph.textContent(),/Edital atualizado: data de abertura, documentos do edital/);
   assert.ok((await paragraph.textContent()).length<160);
   const bounds=await paragraph.evaluate(el=>{const card=el.closest('.activity-panel').getBoundingClientRect(),box=el.getBoundingClientRect();return {inside:box.right<=card.right&&box.left>=card.left,wrapped:el.scrollWidth<=el.clientWidth,unclipped:el.scrollHeight<=el.clientHeight,pageFits:document.documentElement.scrollWidth<=innerWidth};});
   assert.deepEqual(bounds,{inside:true,wrapped:true,unclipped:true,pageFits:true},'width='+width);
   assert.ok((await page.locator('.activity-panel').boundingBox()).height<350);
   await page.getByRole('button',{name:'Entenda o que mudou',exact:true}).click();
   const details=page.locator('.activity-detail-content');
   assert.match(await details.textContent(),/Adicionado: Termo de referência/);
   assert.match(await details.textContent(),/02 de set\. de 2026, 08:00/);
   assert.match(await details.textContent(),/10 de set\. de 2026, 08:00/);
   assert.doesNotMatch(await details.textContent(),/https?:\/\/|arquivo-sem-espacos|"url"/);
   assert.ok(await details.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  }
 }finally{await browser.close();}
});
