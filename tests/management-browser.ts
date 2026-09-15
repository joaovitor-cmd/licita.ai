import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
test('portal cliente: gestão antiga aponta apenas para o console independente',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('http://localhost:5173/gestao/ambientes');
  await page.getByRole('heading',{name:'A gestão tem um acesso separado'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Abrir console de gestão'}).getAttribute('href'),'http://localhost:5174');
  assert.equal(await page.getByRole('button',{name:'Adicionar novo ambiente'}).count(),0);
 }finally{await browser.close();}
});
test('cliente: seletor de empresa depende do plano, não do papel de administrador',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const multiCompany of [false,true]){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const json=path==='/api/auth/me'?{user:{id:'qa-user',name:'QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'Cliente QA',isDemo:false},role:'ADMIN',isPlatformAdmin:false}:path==='/api/entitlements'?{multiCompany,features:[]}:path==='/api/workspaces'?[{id:'qa-org',name:'Cliente QA'}]:[];
    await route.fulfill({json});
   });
   await page.goto('http://localhost:5173/app/notificacoes');
   await page.waitForLoadState('networkidle');
   assert.equal(await page.locator('#active-company').count(),multiCompany?1:0);
   assert.equal(await page.getByRole('link',{name:'Catálogo',exact:true}).count(),0);
   await page.close();
  }
 }finally{await browser.close();}
});
