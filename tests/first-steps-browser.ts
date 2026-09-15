import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
test('primeiros passos: configuração real, pausa, retomada, radar e isolamento do aprendizado',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  let profileReady=false,radarReady=false,role='ADMIN',user='qa-one';
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json:any=[];
   if(path==='/api/auth/me')json={user:{id:user,name:'QA',email:'qa@example.invalid'},organization:{id:'qa-org',name:'Empresa QA'},role};
   if(path==='/api/entitlements')json={features:['discovery','radar','documents'],multiCompany:false};
   if(path==='/api/getting-started')json={profileReady,radarReady};
   if(path==='/api/profile'){
    if(route.request().method()==='PUT')profileReady=true;
    json={organizationName:'Empresa QA',taxId:null,segments:[],keywords:[],states:[],cities:[],excludedKeywords:[],modalities:[],minValue:null,maxValue:null};
   }
   if(path==='/api/opportunities')json={items:[],total:0,pages:1,page:1,pageSize:20};
   await route.fulfill({json});
  });
  await page.goto('http://localhost:5173/app/primeiros-passos');
  await page.getByRole('button',{name:'Iniciar ou retomar orientação'}).click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'test-results/first-steps-intro-dark.png',fullPage:true});
  await page.getByRole('button',{name:'Vamos começar'}).click();
  await page.locator('[data-tour="cnpj"].tour-target').waitFor();
  const target=await page.locator('[data-tour="cnpj"]').boundingBox(),bubble=await page.locator('.tour-bubble').boundingBox();
  assert.ok(target&&bubble&&(bubble.y+bubble.height<=target.y||bubble.y>=target.y+target.height));
  await page.screenshot({path:'test-results/first-steps-balloon-dark.png',fullPage:true});
  await page.getByRole('textbox',{name:/Segmentos de atuação/}).fill('Impressão');
  await page.getByRole('button',{name:'Salvar perfil comercial'}).click();
  await page.getByRole('heading',{name:'Abra uma oportunidade'}).waitFor();
  await page.getByRole('button',{name:'Fazer depois'}).click();
  assert.equal(await page.getByRole('region',{name:'Primeiros passos'}).count(),0);
  await page.getByRole('link',{name:'Primeiros passos',exact:true}).click();
  await page.getByRole('button',{name:'Iniciar ou retomar orientação'}).click();
  await page.getByRole('button',{name:'Vamos começar'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('opportunity-viewed')));
  await page.getByRole('heading',{name:'Abra uma oportunidade'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Sua empresa já tem uma oportunidade no radar'}).count(),0);
  radarReady=true;await page.getByRole('link',{name:'Primeiros passos',exact:true}).click();
  await page.getByRole('heading',{name:'Sua empresa já tem uma oportunidade no radar'}).waitFor();
  await page.getByRole('heading',{name:'Próximos passos, no seu ritmo'}).waitFor();
  await page.screenshot({path:'test-results/first-steps-complete.png',fullPage:true});
  await page.getByRole('button',{name:'Encerrar orientação'}).click();
  await page.reload();assert.equal(await page.getByRole('button',{name:'Fazer depois'}).count(),0);
  radarReady=false;profileReady=false;role='MEMBER';user='qa-two';await page.reload();
  await page.getByRole('heading',{name:'Encontre uma oportunidade'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Configurar meu perfil',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Iniciar ou retomar orientação'}).count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
