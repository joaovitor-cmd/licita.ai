import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

test('document reading shows real phases and reuses saved results without automatic enqueue',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
  let finished=false,posts=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const opportunity={id:'reading-qa',title:'Serviços de impressão',agency:'Prefeitura QA',city:'Porto Alegre',state:'RS',sourceName:'PNCP',sourceCode:'pncp',modality:'Pregão eletrônico',value:null,status:'Aberta',documents:[],url:'https://pncp.gov.br',match:{score:70,reasons:[],excluded:false}};
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json=[];
   if(path==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'org',name:'QA'},role:'ADMIN'};
   if(path==='/api/entitlements')json={features:['discovery','radar','documents']};
   if(path==='/api/getting-started')json={onboardingStatus:'DISMISSED'};
   if(path==='/api/opportunities/reading-qa')json=opportunity;
   if(path==='/api/opportunities/reading-qa/analysis'){
    if(route.request().method()==='POST')posts++;
    json={versions:[],topics:[],analysis:{id:'reading-1',status:finished?'PARTIAL':'RUNNING',stale:false,error:null,reviews:[],progress:{phase:finished?'DONE':'READING',processed:finished?2:1,total:2,currentDocument:finished?undefined:'Termo de referência.pdf'},result:finished?{method:'Busca de trechos por temas, sem IA generativa',warning:'Confira o documento original.',documents:[]}:null}};
   }
   await route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:5173/app/oportunidades/reading-qa');
  await page.getByText('Extraindo texto do documento…',{exact:false}).waitFor();
  assert.match(await page.getByRole('status').last().innerText(),/1 de 2 anexos processados \(não necessariamente lidos\)/);
  assert.equal(await page.getByRole('button',{name:'Leitura em andamento…'}).isDisabled(),true);
  finished=true;await page.getByRole('button',{name:'Atualizar resultado'}).click();
  await page.getByRole('heading',{name:'Cobertura da leitura'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Cobertura da leitura'}).waitFor();assert.equal(posts,0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
