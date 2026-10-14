import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

test('guia único por usuário e perfis de busca salvos',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  await mkdir('test-results',{recursive:true});
  let status='DISMISSED',user='legacy',profileReady=false,radarReady=false,claims=0,profiles:any[]=[],failSave=false;
  const errors:string[]=[];
  async function pageFor(){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method();let json:any=[];
    if(path==='/api/auth/me')json={user:{id:user,name:'QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'Empresa QA'},role:'ADMIN'};
    if(path==='/api/entitlements')json={features:['discovery','radar','documents'],multiCompany:false};
    if(path==='/api/getting-started'){
     if(method==='PUT')status=route.request().postDataJSON().status;
     json={profileReady,radarReady,onboardingStatus:status};
    }
    if(path==='/api/getting-started/claim'){const claimed=status==='PENDING';if(claimed){status='SEEN';claims++;}json={claimed};}
    if(path==='/api/opportunities')json={items:[],total:0,pages:0,page:1,pageSize:12};
    if(path==='/api/search-profiles'){
     if(method==='POST'){if(failSave){await route.fulfill({status:503,json:{error:'Falha simulada ao salvar.'}});return;}const p={...route.request().postDataJSON(),id:'profile-'+(profiles.length+1),revision:1,active:true};profiles.push(p);json=p;}
     else json=profiles;
    }
    if(path==='/api/search-profiles/profile-1'){
     if(method==='PUT'){profiles[0]={...route.request().postDataJSON(),id:'profile-1',revision:profiles[0].revision+1};json=profiles[0];}
     if(method==='DELETE'){profiles=[];json={ok:true};}
    }
    if(path==='/api/search-profiles/profile-2'){
     if(method==='DELETE'){profiles=profiles.filter(p=>p.id!=='profile-2');json={ok:true};}
    }
    if(path.endsWith('/active')){
     const id=path.split('/').at(-2),i=profiles.findIndex(p=>p.id===id);
     profiles[i]={...profiles[i],active:route.request().postDataJSON().active,revision:profiles[i].revision+1};json=profiles[i];
    }
    await route.fulfill({json});
   });return page;
  }
  const page=await pageFor();await page.goto('http://localhost:5173/app/oportunidades');
  await page.getByRole('heading',{name:'Oportunidades',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Primeiros passos',exact:true}).count(),0);
  assert.equal(await page.locator('.first-steps').count(),0);assert.equal(await page.locator('.tour-bubble').count(),0);
  user='new-user';status='PENDING';await page.reload();await page.getByRole('heading',{name:'Comece pelo perfil comercial'}).waitFor();
  assert.equal(claims,1);await page.getByRole('button',{name:'Explorar primeiro'}).click();
  await page.getByRole('heading',{name:'Abra uma oportunidade'}).waitFor();
  const another=await pageFor();await another.goto('http://localhost:5173/app/oportunidades');await another.getByRole('heading',{name:'Oportunidades',exact:true}).waitFor();
  assert.equal(await another.locator('.tour-bubble').count(),0);await another.close();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/getting-started')&&r.request().method()==='PUT'),page.getByRole('button',{name:'Encerrar orientação'}).click()]);
  await page.reload();await page.getByRole('heading',{name:'Oportunidades',exact:true}).waitFor();assert.equal(await page.locator('.tour-bubble').count(),0);
  status='PENDING';user='new-two';profileReady=true;await page.reload();await page.getByRole('heading',{name:'Abra uma oportunidade'}).waitFor();
  radarReady=true;await Promise.all([page.waitForResponse(r=>r.url().endsWith('/getting-started')&&r.request().method()==='PUT'),page.evaluate(()=>window.dispatchEvent(new Event('radar-added')))]);
  await page.locator('.tour-bubble').waitFor({state:'detached'});assert.equal(status,'COMPLETED');
  await page.getByRole('button',{name:'Perfis de busca',exact:true}).click();
  await page.getByRole('button',{name:'Criar perfil de busca',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:/Nome do perfil/}).fill('Impressão Sul');
  await dialog.getByRole('textbox',{name:/Termos de interesse/}).fill('impressora, outsourcing');
  await dialog.getByRole('textbox',{name:/Excluir termos/}).fill('remanufaturado');
  await dialog.getByLabel('RS',{exact:true}).check();await dialog.getByLabel('SC',{exact:true}).check();
  await dialog.locator('.saved-search-more > summary').click();
  await dialog.getByLabel('PNCP',{exact:true}).check();await dialog.getByLabel('Compras.gov.br',{exact:true}).check();
  await dialog.getByLabel('Pregão eletrônico',{exact:true}).check();await dialog.getByLabel('Concorrência',{exact:true}).check();
  await page.screenshot({path:'test-results/search-profiles-light.png',fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/search-profiles-mobile-dark.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  failSave=true;await dialog.getByRole('button',{name:'Salvar e aplicar'}).click();await page.getByText('Falha simulada ao salvar.').waitFor();
  assert.equal(await dialog.getByRole('textbox',{name:/Nome do perfil/}).inputValue(),'Impressão Sul');
  failSave=false;await dialog.getByRole('button',{name:'Salvar e aplicar'}).click();await dialog.waitFor({state:'detached'});
  assert.equal(new URL(page.url()).searchParams.get('states'),'RS,SC');assert.equal(new URL(page.url()).searchParams.get('exclude'),'remanufaturado');
  assert.equal(new URL(page.url()).searchParams.get('sources'),'pncp,comprasgov');assert.equal(new URL(page.url()).searchParams.get('modalities'),'Pregão eletrônico,Concorrência');
  await page.reload();await page.getByRole('button',{name:'Impressão Sul',exact:true}).waitFor();
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('textbox',{name:'Buscar oportunidades',exact:true}).fill('laser');
  await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:'Impressão Sul',exact:true}).click();await page.getByText('Filtros alterados nesta busca; o perfil salvo não foi modificado.').waitFor();
  assert.equal(profiles[0].filters.q,undefined);
  await page.locator('.saved-profile-row').getByText('Mais ações',{exact:true}).click();
  await page.getByRole('button',{name:'Duplicar perfil',exact:true}).click();await page.getByRole('button',{name:'Salvar e aplicar'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(profiles.length,2);assert.equal(profiles[1].name,'Impressão Sul (cópia)');assert.deepEqual(profiles[1].filters,profiles[0].filters);
  await page.getByRole('button',{name:'Impressão Sul (cópia)',exact:true}).click();
  const copy=page.getByRole('article',{name:'Perfil Impressão Sul (cópia)',exact:true});await copy.getByText('Mais ações',{exact:true}).click();
  await copy.getByRole('button',{name:'Pausar perfil'}).click();await copy.getByText('Pausado',{exact:true}).waitFor();assert.equal(await copy.getByRole('button',{name:'Aplicar',exact:true}).isDisabled(),true);
  assert.equal(new URL(page.url()).searchParams.get('searchProfile'),null);assert.equal(new URL(page.url()).searchParams.get('terms'),'impressora, outsourcing');
  await copy.getByRole('button',{name:'Retomar perfil'}).click();await copy.getByText('Disponível',{exact:true}).waitFor();
  await copy.getByRole('button',{name:'Excluir perfil'}).click();await page.getByRole('button',{name:'Confirmar exclusão'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Perfis de busca',exact:true}).click();await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.getByRole('button',{name:'Impressão Sul',exact:true}).click();await page.locator('.saved-profile-row').getByText('Mais ações',{exact:true}).click();
  await page.getByRole('button',{name:'Editar perfil',exact:true}).click();await page.getByRole('dialog').getByRole('textbox',{name:/Nome do perfil/}).fill('Sul atualizado');
  await page.getByRole('button',{name:'Salvar e aplicar'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(profiles[0].name,'Sul atualizado');
  await page.getByRole('button',{name:'Sul atualizado',exact:true}).click();await page.locator('.saved-profile-row').getByText('Mais ações',{exact:true}).click();
  await page.getByRole('button',{name:'Excluir perfil',exact:true}).click();await page.getByRole('button',{name:'Confirmar exclusão'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(profiles.length,0);
  assert.equal(new URL(page.url()).searchParams.get('terms'),'impressora, outsourcing');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
