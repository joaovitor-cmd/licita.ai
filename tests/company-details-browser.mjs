import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
test('company registration reviews lookup fields explicitly and preserves drafts/permissions',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  let role='ADMIN',failSave=true,writes=0;
  let company={companyName:'Empresa original',taxId:'11222333000181',revision:1,details:{legalName:'Razão social original',tradeName:'Marca',legalNature:'',companySize:'',phone:'',email:'',street:'Rua preenchida pela equipe',number:'10',complement:'',district:'',city:'Porto Alegre',state:'RS',zipCode:'90000-000',stateRegistration:'ISENTO',municipalRegistration:'123'}};
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname,method=route.request().method();let json=[];
   if(path==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'org',name:company.companyName},role};
   if(path==='/api/entitlements')json={features:['discovery','radar','documents']};
   if(path==='/api/getting-started')json={onboardingStatus:'DISMISSED'};
   if(path==='/api/company-details'){
    if(method==='PUT'){writes++;if(failSave){await route.fulfill({status:409,json:{error:'Os dados foram alterados. Compare antes de salvar.'}});return;}company={...route.request().postDataJSON(),revision:2};}
    json=company;
   }
   if(path==='/api/company-details/cnpj-lookup')json={cnpj:'11222333000181',source:'BrasilAPI / Minha Receita',consultedAt:'2026-10-06T12:00:00Z',notice:'Confira antes de aplicar. Nada foi salvo.',details:{legalName:'Razão social encontrada',street:'Rua da fonte',city:'Porto Alegre',state:'RS',email:''}};
   await route.fulfill({json});
  });
  await page.goto('http://localhost:5173/app/empresa');
  await page.getByLabel('Razão social',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Logradouro',{exact:true}).inputValue(),'Rua preenchida pela equipe');
  await page.getByRole('button',{name:'Consultar cadastro pelo CNPJ',exact:true}).click();
  const preview=page.getByRole('region',{name:'Prévia da consulta CNPJ',exact:true});await preview.waitFor();
  assert.equal(await preview.getByRole('checkbox').count(),4);
  assert.equal(await preview.getByRole('checkbox').evaluateAll(nodes=>nodes.filter(n=>n.checked).length),0);
  assert.ok(await page.getByRole('button',{name:'Aplicar 0 campos ao formulário',exact:true}).isDisabled());
  assert.equal(writes,0);assert.equal(await page.getByLabel('Razão social',{exact:true}).inputValue(),'Razão social original');
  await preview.getByRole('checkbox',{name:'Razão social: Razão social encontrada',exact:true}).check();
  await page.getByRole('button',{name:'Aplicar 1 campos ao formulário',exact:true}).click();
  assert.equal(await page.getByLabel('Razão social',{exact:true}).inputValue(),'Razão social encontrada');
  assert.equal(await page.getByLabel('Logradouro',{exact:true}).inputValue(),'Rua preenchida pela equipe');
  assert.equal(await page.getByLabel('Inscrição estadual',{exact:true}).inputValue(),'ISENTO');assert.equal(writes,0);
  await page.getByLabel('Nome exibido no portal',{exact:true}).fill('Empresa revisada');
  await page.getByRole('button',{name:'Salvar dados da empresa',exact:true}).click();
  await page.getByText('Os dados foram alterados. Compare antes de salvar.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Razão social',{exact:true}).inputValue(),'Razão social encontrada');
  assert.equal(await page.getByLabel('Nome exibido no portal',{exact:true}).inputValue(),'Empresa revisada');
  failSave=false;
  await page.getByRole('button',{name:'Salvar dados da empresa',exact:true}).click();
  await page.getByText('Dados da empresa salvos. O perfil comercial e os perfis de busca foram preservados.',{exact:true}).waitFor();
  assert.equal(company.details.street,'Rua preenchida pela equipe');assert.equal(company.details.legalName,'Razão social encontrada');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  role='MEMBER';await page.reload();
  await page.getByLabel('Razão social',{exact:true}).waitFor();
  assert.ok(await page.getByLabel('Razão social',{exact:true}).isDisabled());
  assert.equal(await page.getByRole('button',{name:'Salvar dados da empresa',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Consultar cadastro pelo CNPJ',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
