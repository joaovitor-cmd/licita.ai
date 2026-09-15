import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
test('perfil CNPJ: revisão, inclusão sem substituir critérios, salvamento explícito e fallback',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  let saved:any=null,fail=false;
  const profile={organizationName:'Minha empresa',taxId:'11222333000181',segments:['Segmento atual'],keywords:['Termo atual'],states:['RS'],cities:[],excludedKeywords:['sucata'],modalities:[],minValue:100,maxValue:null};
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json:any=[];
   if(path==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'Minha empresa'},role:'ADMIN'};
   if(path==='/api/entitlements')json={multiCompany:false,features:[]};
   if(path==='/api/profile'){if(route.request().method()==='PUT')saved=route.request().postDataJSON();json=profile;}
   if(path==='/api/profile/cnpj-suggestion'){
    if(fail){await route.fulfill({status:502,json:{error:'Consulta indisponível. Continue manualmente.'}});return;}
    json={cnpj:profile.taxId,companyName:'Razão social da fonte',source:'Fonte de teste',consultedAt:new Date().toISOString(),activities:[],suggestions:[{id:'printing',segment:'Soluções de impressão',keywords:['impressão segura'],evidence:[{code:'7733100',description:'Equipamentos para escritório',primary:true}]}]};
   }
   await route.fulfill({json});
  });
  await page.goto('http://localhost:5173/app/perfil');
  await page.getByRole('switch',{name:'Sugerir interesses pelo CNPJ'}).click();
  await page.getByRole('heading',{name:'Confira se estas atividades representam seu negócio'}).waitFor();
  assert.equal(saved,null);
  await page.getByRole('checkbox',{name:'Soluções de impressão'}).uncheck();
  assert.equal(await page.getByRole('button',{name:'Adicionar ao meu perfil'}).isDisabled(),true);
  await page.getByRole('checkbox',{name:'Soluções de impressão'}).check();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'test-results/cnpj-profile-dark.png',fullPage:true});
  await page.getByRole('button',{name:'Adicionar ao meu perfil'}).click();
  assert.equal(saved,null);
  await page.getByRole('button',{name:'Salvar perfil comercial',exact:true}).click();
  await page.getByText('Perfil salvo. A compatibilidade já considera os novos critérios.').waitFor();
  assert.deepEqual(saved.segments,['Segmento atual','Soluções de impressão']);
  assert.deepEqual(saved.keywords,['Termo atual','impressão segura']);
  for(const key of ['states','excludedKeywords','minValue','organizationName','taxId'])assert.deepEqual(saved[key],(profile as any)[key]);
  fail=true;await page.getByRole('switch',{name:'Sugerir interesses pelo CNPJ'}).click();
  await page.getByText('Consulta indisponível. Continue manualmente.').waitFor();
  const toggle=page.getByRole('switch',{name:'Sugerir interesses pelo CNPJ'});
  assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await toggle.press('Space');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  assert.equal(await page.getByText('Consulta indisponível. Continue manualmente.').count(),0);
  assert.equal(await page.getByRole('button',{name:'Salvar perfil comercial',exact:true}).isEnabled(),true);
  const cnpjInput=page.getByRole('textbox',{name:'CNPJ (opcional)',exact:true});
  await cnpjInput.fill('12abc34501de35');
  assert.equal(await cnpjInput.inputValue(),'12.ABC.345/01DE-35');
  await cnpjInput.fill('11222333000181');
  assert.equal(await cnpjInput.inputValue(),'11.222.333/0001-81');
  await cnpjInput.fill('');
  await cnpjInput.pressSequentially('12abc34501de35');
  assert.equal(await cnpjInput.inputValue(),'12.ABC.345/01DE-35');
  await cnpjInput.evaluate((input:HTMLInputElement)=>input.setSelectionRange(3,3));
  await cnpjInput.press('Backspace');
  assert.equal(await cnpjInput.inputValue(),'1A.BC3.450/1DE3-5');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await browser.close();}
});
