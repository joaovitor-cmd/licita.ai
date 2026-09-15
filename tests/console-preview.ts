import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';

test('console: dashboard, menus laterais, formulários e relatórios sem erros de tela',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const company={id:'qa-company',name:'Empresa de impressão QA',tax_id:'12345678000199',active:true,archived_at:null,plan_code:'complete',plan_name:'Plano completo',access_revision:1,created_at:'2026-09-01T15:00:00Z'};
  const features=['discovery','radar','catalog','documents','analysis','simulator','digest','changeAlerts','commercialHistory'];
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json:any={};
   if(path==='/api/console-auth/me')json={user:{id:'qa-owner',name:'Gestor QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'Gestão'},isPlatformAdmin:true,adminRole:'OWNER'};
   else if(path==='/api/management/overview')json={period:{from:'2026-09-01',to:'2026-09-13',timeZone:'America/Sao_Paulo'},environments_created_month:3,total_environments:12,total_participations:5,estimated_value_total:'250000.50',missing_values:1,stages:[{stage:'WON',count:2},{stage:'IN_ANALYSIS',count:3}],definition:'Participações são inclusões no radar, não propostas formalmente enviadas. Valores são estimativas dos editais, não receita.'};
   else if(path==='/api/management/plans')json={plans:['initial','professional','complete'].map((code,i)=>({code,name:['Inicial','Profissional','Completo'][i],description:'',planned_features:features,revision:1,max_companies:i+1,enforce_features:false})),features,enforced:true};
   else if(path==='/api/management/companies')json={items:[company],total:1,pages:1};
   else if(path==='/api/management/companies/qa-company')json={company,entitlements:{company_count:1,max_companies:3},companies:[company],members:[],audit:[]};
   else if(path==='/api/management/admins')json={items:[{id:'qa-owner',name:'Gestor QA',email:'qa@example.invalid',role:'OWNER',active:true,created_at:'2026-09-01T15:00:00Z'}]};
   else if(path==='/api/management/reports')json={period:{from:'2026-09-01',to:'2026-09-13'},total:0,page:1,pages:1,pageSize:25,summary:{total_participations:0,estimated_value_total:null,missing_values:0},items:[]};
   await route.fulfill({json});
  });
  await page.goto('http://localhost:5174/');
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await page.getByText('Total de ambientes',{exact:true}).waitFor();
  assert.ok(await page.locator('.sidebar').isVisible());
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   assert.deepEqual(audit.violations.map(v=>({theme,id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[]);
  }
  await page.screenshot({path:'test-results/console-dashboard-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'Ambientes',exact:true}).click();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByLabel('CNPJ',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Adicionar novo ambiente',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(()=>CSS.supports('appearance','base-select')),true);
  const modal=page.getByRole('dialog'),firstField=page.getByLabel('Nome da empresa principal');
  const bounds=await modal.boundingBox(),fieldBounds=await firstField.boundingBox();
  assert.ok(bounds&&fieldBounds&&fieldBounds.x-bounds.x>=20,'Formulário precisa de margem interna');
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.getByLabel('Plano inicial').click();
   await page.locator('select:open').waitFor();
   await page.screenshot({path:`test-results/console-modal-select-${theme}.png`,fullPage:true});
   await page.keyboard.press('Escape');
   await modal.waitFor();
  }
  await page.setViewportSize({width:390,height:650});
  await page.getByRole('button',{name:'Criar ambiente',exact:true}).scrollIntoViewIfNeeded();
  assert.ok(await page.getByRole('button',{name:'Criar ambiente',exact:true}).isVisible());
  await page.screenshot({path:'test-results/console-modal-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('link',{name:'Personalização de planos',exact:true}).click();
  await page.getByLabel('Limite de empresas por ambiente').first().waitFor();
  assert.equal(await page.getByLabel('Limite de empresas por ambiente').count(),3);
  await page.getByRole('link',{name:'Acessos à gestão',exact:true}).click();
  await page.getByRole('heading',{name:'Acessos à gestão',exact:true}).waitFor();
  await page.getByRole('button',{name:'Adicionar acesso',exact:true}).click();
  const permissionSelect=page.getByRole('dialog').getByRole('combobox',{name:'Permissão',exact:true});
  await permissionSelect.click();
  await page.locator('select:open').waitFor();
  await page.screenshot({path:'test-results/console-permission-select-dark.png',fullPage:true});
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.equal(await permissionSelect.inputValue(),'ADMIN');
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'Relatórios',exact:true}).click();
  await page.getByRole('heading',{name:/Relatórios/}).waitFor();
  await page.getByRole('link',{name:'Dashboard',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/console-dashboard-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const login=await browser.newPage();
  await login.goto('http://localhost:5174/login');
  await login.getByRole('heading',{name:'Entrar na gestão',exact:true}).waitFor();
 }finally{await browser.close();}
});
