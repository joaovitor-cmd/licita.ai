import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Portal and console use available width and avoid page overflow across routes',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const features=['discovery','radar','catalog','documents','analysis','simulator','digest','changeAlerts','commercialHistory'];
 const fallback=new Set();
 try{
  for(const app of ['web','console']){
   const cache=await mkdtemp(join(tmpdir(),'licitaro-responsive-'));
   const server=await createServer({configFile:false,envDir:false,root:fileURLToPath(new URL(`../apps/${app}/`,import.meta.url)),cacheDir:cache,plugins:[react()],server:{host:'127.0.0.1',port:0,proxy:{}}});
   try{
    await server.listen();const origin=server.resolvedUrls.local[0];
    let routes=app==='web'?['/app/visao-geral','/app/oportunidades','/app/oportunidades/qa','/app/radar','/app/radar/qa','/app/simulador','/app/catalogo','/app/documentos','/app/perfil','/app/empresa','/app/monitoramentos','/app/fontes','/app/notificacoes','/app/configuracoes','/app/boletins/qa','/app/comercial']:['/','/relatorios','/ambientes','/planos','/acessos','/email'];
    if(process.env.QA_RESPONSIVE_FOCUS)routes=app==='web'?['/app/perfil','/app/fontes','/app/configuracoes','/app/comercial']:['/email'];
    for(const width of (process.env.QA_RESPONSIVE_FOCUS?[390,2400]:[390,768,2400]))for(const theme of ['light','dark']){
     const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
     await context.addInitScript(t=>localStorage.setItem('licita-color-theme',t),theme);
     page.on('pageerror',e=>errors.push(e.message));
     await page.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.origin!==new URL(origin).origin){await route.abort();return;}
      if(!u.pathname.startsWith('/api/')){await route.continue();return;}
      const p=u.pathname;let json;
      if(p==='/api/auth/me'||p==='/api/console-auth/me')json={user:{id:'qa',name:'Operador QA',email:'qa@example.invalid'},organization:{id:'org',name:'Empresa QA',isDemo:false},role:'ADMIN',isPlatformAdmin:app==='console',adminRole:'OWNER'};
      else if(p==='/api/entitlements')json={features,multiCompany:false};
      else if(p==='/api/getting-started')json={onboardingStatus:'DISMISSED',profileReady:true,radarReady:true};
      else if(['/api/members','/api/notifications','/api/catalog','/api/documents','/api/workspaces','/api/simulations','/api/agency-watches','/api/search-profiles'].includes(p))json=[];
      else if(p==='/api/profile')json={companyRevision:1,organizationName:'Empresa QA',taxId:'',segments:[],states:[],cities:[],keywords:[],excludedKeywords:[],modalities:[],minValue:null,maxValue:null};
      else if(p==='/api/sources')json={sources:[],runs:[],scheduler:{enabled:false,intervalMinutes:60,emailConfigured:false}};
      else if(p==='/api/commercial-report')json={summary:{total:0,won:0,lost:0,discarded:0,active:0,without_owner:0,unclassified:0,active_value_missing:0,active_value:'0',won_value_missing:0,won_value:'0',pending_tasks:0,win_rate:null},reasonLabels:{},reasons:[],stages:[],months:[],items:[],total:0,pages:1};
      else if(p==='/api/management/email-settings')json={enabled:false,host:'',port:587,mode:'starttls',username:'',fromEmail:'',fromName:'Licitaro',hasPassword:false,verifiedAt:null,serverConfigured:false};
      else if(p==='/api/preferences')json={inApp:true,email:false,minScore:60};
      else if(p==='/api/dashboard')json={recommendationMinScore:60,stats:{opportunities:0,recommended:0,tracked:0,urgent:0,overdue:0,potentialValue:0},recommended:[],deadlines:[],byState:[],byModality:[],activity:[],lastSync:null};
      else if(p==='/api/opportunities')json={items:[],total:0,page:1,pages:1,pageSize:20};
      else if(p==='/api/trackings/page')json={items:[],orderRevision:'0',page:1,pageSize:50,view:u.searchParams.get('view'),stages:[],total:0,pageTotal:0,hasMore:false,summary:{active:0,potential:null,unknownValues:0,pendingTasks:0}};
      else if(p==='/api/company-details')json={companyName:'Empresa QA',taxId:'',revision:1,details:Object.fromEntries(['legalName','tradeName','legalNature','companySize','phone','email','street','number','complement','district','city','state','zipCode','stateRegistration','municipalRegistration'].map(k=>[k,'']))};
      else if(p==='/api/management/overview')json={period:{from:'2026-10-01',to:'2026-10-14',timeZone:'America/Sao_Paulo'},environments_created_month:3,total_environments:12,total_participations:5,estimated_value_total:'250000.50',missing_values:1,stages:[{stage:'WON',count:2}],definition:'Estimativas de teste.'};
      else if(p==='/api/management/plans')json={plans:['initial','professional','complete'].map((code,i)=>({code,name:['Inicial','Profissional','Completo'][i],description:'',planned_features:features,revision:1,max_companies:i+1,enforce_features:false})),features,enforced:true};
      else if(p==='/api/management/companies'||p==='/api/management/admins')json={items:[],total:0,pages:1};
      else if(p==='/api/management/reports')json={period:{from:'2026-10-01',to:'2026-10-14'},total:0,page:1,pages:1,pageSize:25,summary:{total_participations:0,estimated_value_total:null,missing_values:0},items:[]};
      if(json===undefined){fallback.add(p);await route.fulfill({status:503,json:{error:'Dados indisponíveis na simulação de layout.'}});}else await route.fulfill({json});
     });
     for(const path of routes){
      await page.goto(new URL(path,origin).href,{waitUntil:'networkidle'});
      assert.equal(errors.length,0,`${app} ${path}: ${errors.join('; ')}`);
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('main')?.getBoundingClientRect().width,shell:document.querySelector('.main-shell')?.getBoundingClientRect().width}));
      assert.ok(geometry.scroll<=geometry.width+1,`${app} ${path} ${width} ${theme}: overflow ${geometry.scroll}`);
      assert.ok(geometry.main>0,`${app} ${path}: no main`);
      if(process.env.QA_RESPONSIVE_SCREENSHOTS){await mkdir(process.env.QA_RESPONSIVE_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.QA_RESPONSIVE_SCREENSHOTS,`${app}-${path.split('/').pop()||'dashboard'}-${width}-${theme}.png`),fullPage:true});}
      if(width===2400)assert.ok(geometry.main>2100,`${app} ${path}: capped at ${geometry.main}`);
     }
     console.log(`PASS ${app} ${width}px ${theme}: ${routes.length} routes`);
     await context.close();
    }
   }finally{await server.close();await rm(cache,{recursive:true,force:true});}
  }
  console.log('Error-state fixtures only for: '+[...fallback].sort().join(', '));
 }finally{await browser.close();}
});