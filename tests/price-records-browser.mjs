import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('Manual price records isolated browser workflow',async()=>{
 const cache=await mkdtemp(join(tmpdir(),'licitaro-price-records-'));
 const server=await createServer({configFile:false,envDir:false,root:fileURLToPath(new URL('../apps/web/',import.meta.url)),cacheDir:cache,plugins:[react()],server:{host:'127.0.0.1',port:0,proxy:{}}});let browser;
 try{await server.listen();const origin=server.resolvedUrls.local[0];browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [390,1440])for(const theme of ['light','dark'])for(const role of ['ADMIN','MEMBER']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',timezoneId:'America/Sao_Paulo'}),page=await context.newPage(),errors=[];
  await context.addInitScript(theme=>localStorage.setItem('licita-color-theme',theme),theme);page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-15T01:00:00Z')});
  let record={archived:false,id:'11111111-1111-4111-8111-111111111111',number:'123/2026',title:'Serviços QA',agency:'Órgão QA',startsOn:'2026-10-01',endsOn:'2026-10-14',ownerId:null,ownerName:null,documentId:null,documentName:null,opportunityId:null,opportunityTitle:null,notes:'',revision:1,items:[],createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z'}, archived=false,conflict=true,created=false,filtered=false;
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(origin).origin){await route.abort();return;}if(!u.pathname.startsWith('/api/')){await route.continue();return;}let json=[];
   if(u.pathname==='/api/auth/me')json={user:{id:'qa',name:'QA'},organization:{id:'org',name:'Empresa QA'},role};
   if(u.pathname==='/api/entitlements')json={features:['documents'],multiCompany:false};
   if(u.pathname==='/api/getting-started')json={onboardingStatus:'DISMISSED'};
   if(u.pathname==='/api/members')json=[];
   if(u.pathname==='/api/documents')json=[{id:'doc',name:'Ata PDF',mimeType:'application/pdf'},{id:'word',name:'Ata Word',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}];
   if(u.pathname==='/api/opportunities'){assert.equal(u.searchParams.get('pageSize'),'12');json={items:[{id:'22222222-2222-4222-8222-222222222222',title:'Oportunidade QA',publicCode:'222/2026'}],total:1,page:1,pages:1};}
   if(u.pathname==='/api/price-records'){
    if(route.request().method()==='POST'){assert.equal(role,'ADMIN');const body=route.request().postDataJSON();assert.equal(body.opportunityId,'22222222-2222-4222-8222-222222222222');assert.equal(body.items[0].quantity,'1.000001');assert.equal(body.items[0].unitPrice,'0.000001');assert.equal(body.items[0].unit,'UN');assert.equal(body.items[0].supplierName,'Fornecedor QA');record={...record,...body};created=true;json=record;}
    else{assert.ok(!u.searchParams.has('highlight')||!!u.searchParams.get('highlight'),'Empty highlight must not be sent');filtered ||=u.searchParams.get('highlight')===record.id;assert.ok(['true','false'].includes(u.searchParams.get('archived')));const items=(archived!==(u.searchParams.get('archived')==='true'))||u.searchParams.get('q')==='sem resultado'?[]:[record];json={items,total:items.length,page:1,pages:1};}
   }
   if(u.pathname===`/api/price-records/${record.id}`){
    if(route.request().method()==='PUT'){assert.equal(role,'ADMIN');if(conflict){conflict=false;await route.fulfill({status:409,json:{error:'Ata alterada por outra pessoa. Recarregue antes de salvar.'}});return;}record={...record,...route.request().postDataJSON(),revision:2};}json=record;
   }
   if(u.pathname.endsWith('/events'))json=[{id:'event',type:'CREATED',description:'Ata cadastrada manualmente',actorName:'QA',createdAt:'2026-10-01T12:00:00Z'}];
   if(u.pathname.endsWith('/archive')){assert.equal(role,'ADMIN');archived=true;record.archived=true;json={ok:true};}
   if(u.pathname.endsWith('/restore')){assert.equal(role,'ADMIN');archived=false;record.archived=false;json={ok:true};}
   await route.fulfill({json});
  });
  await page.goto(new URL('/app/atas-precos',origin).href);
  await page.getByRole('heading',{name:'Atas de registro de preços'}).waitFor();
  await page.getByText('Vigente').waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastrar ata'}).count(),role==='ADMIN'?1:0);
  if(role==='ADMIN'){
   await page.getByRole('button',{name:'Cadastrar ata'}).focus();await page.keyboard.press('Enter');
   const form=page.getByRole('dialog',{name:'Cadastrar ata de preços'});
   await form.getByRole('textbox',{name:'Número da ata'}).fill('321/2026');await form.getByRole('textbox',{name:'Órgão'}).fill('Órgão QA');await form.getByRole('textbox',{name:'Título'}).fill('Cadastro QA');
   await form.getByLabel('Início da vigência').fill('2026-10-01');await form.getByLabel('Fim da vigência').fill('2026-10-14');
   assert.equal(await form.getByLabel('PDF da ata').locator('option').count(),2);
   await form.getByRole('searchbox',{name:'Buscar oportunidade (opcional)'}).fill('QA');await form.getByRole('combobox',{name:'Vincular oportunidade encontrada'}).selectOption('22222222-2222-4222-8222-222222222222');
   await form.getByRole('button',{name:'Adicionar item'}).click();await form.getByRole('button',{name:'Salvar ata'}).click();assert.equal(created,false);assert.equal(await form.locator('form').evaluate(form=>form.checkValidity()),false);await form.getByRole('textbox',{name:'Unidade do item 1'}).fill('UN');await form.getByRole('textbox',{name:/^Fornecedor do item 1/}).fill('Fornecedor QA');await form.getByRole('textbox',{name:'Descrição do item 1'}).fill('Item QA');await form.getByRole('textbox',{name:'Quantidade do item 1'}).fill('1.000001');await form.getByRole('textbox',{name:'Preço unitário do item 1'}).fill('0.000001');
   if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`ata-form-${width}-${theme}.png`),fullPage:true});}
   await form.getByRole('button',{name:'Salvar ata'}).click();await form.waitFor({state:'hidden'});assert.equal(created,true);
  }
  await page.getByRole('button',{name:'Ver ata'}).click();let detail=page.getByRole('dialog',{name:'Detalhes da ata de preços'});await detail.getByText('Ata cadastrada manualmente').waitFor();
  assert.equal(await detail.getByRole('button',{name:'Editar ata'}).count(),role==='ADMIN'?1:0);
  if(role==='ADMIN'){
   await detail.getByRole('button',{name:'Editar ata'}).click();const form=page.getByRole('dialog',{name:'Editar ata de preços'});await form.getByRole('textbox',{name:'Título'}).fill('Texto preservado');await form.getByRole('button',{name:'Salvar ata'}).click();await form.getByText('Ata alterada por outra pessoa. Recarregue antes de salvar.').waitFor();assert.equal(await form.getByRole('textbox',{name:'Título'}).inputValue(),'Texto preservado');await form.getByRole('button',{name:'Salvar ata'}).click();await form.waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Ver ata'}).click();detail=page.getByRole('dialog',{name:'Detalhes da ata de preços'});await detail.getByRole('button',{name:'Arquivar ata'}).click();await detail.getByRole('button',{name:'Confirmar arquivamento'}).click();await detail.waitFor({state:'hidden'});assert.equal(archived,true);await page.getByText('Sua primeira ata de preços').waitFor();await page.getByRole('button',{name:'Arquivadas',exact:true}).click();await page.getByRole('button',{name:'Ver ata'}).click();detail=page.getByRole('dialog',{name:'Detalhes da ata de preços'});await detail.getByText('Ata cadastrada manualmente').waitFor();assert.equal(await detail.getByRole('button',{name:'Editar ata',exact:true}).count(),0);await detail.getByRole('button',{name:'Restaurar ata'}).click();await detail.waitFor({state:'hidden'});assert.equal(archived,false);await page.getByRole('button',{name:'Ativas',exact:true}).click();await page.getByRole('button',{name:'Ver ata'}).waitFor();
  }
  archived=false;
  await page.goto(new URL(`/app/atas-precos?highlight=${record.id}`,origin).href);await page.getByRole('link',{name:'Mostrar todas as atas'}).waitFor();await page.getByRole('dialog',{name:'Detalhes da ata de preços'}).getByRole('button',{name:'Fechar janela'}).click();assert.equal(filtered,true);
  if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`ata-${width}-${theme}-${role}.png`),fullPage:true});}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow');assert.deepEqual(errors,[]);await context.close();
 }
 }finally{await browser?.close();await server.close();await rm(cache,{recursive:true,force:true});}
});