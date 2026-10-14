import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Radar filters: isolated API, individual removal, clear, keyboard, themes and mobile', async () => {
  const cache = await mkdtemp(join(tmpdir(),'licitaro-radar-vite-'));
  let server,browser;
  try {
    server=await createServer({configFile:false,envDir:false,root:fileURLToPath(new URL('../apps/web/',import.meta.url)),cacheDir:cache,server:{host:'127.0.0.1',port:0,proxy:{},open:false},plugins: [react(),{name:'block-real-api',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/')){res.statusCode=503;res.end('API disabled in isolated frontend QA');}else next();});}}]});
    await server.listen();
    const origin=server.resolvedUrls.local[0];
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const width of [1440,390]) for(const theme of ['light','dark']) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      await context.addInitScript(t=>localStorage.setItem('licita-color-theme',t),theme);
      const page=await context.newPage(),requests=[],errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const alerts=[{id:'notice-1',title:'Prazo atualizado',description:'Confira a nova data na oportunidade.',createdAt:'2026-10-14T12:00:00Z',read:false,url:'/app/radar?highlight=11111111-1111-4111-8111-111111111111'},{id:'notice-2',title:'Nova oportunidade',description:'Uma oportunidade para conferir.',createdAt:'2026-10-14T11:00:00Z',read:false,url:'/app/oportunidades/op-qa'}];
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(origin).origin){await route.abort();return;}
        if(!url.pathname.startsWith('/api/')){await route.continue();return;}
        if(url.pathname.startsWith('/api/trackings/')&&url.pathname!=='/api/trackings/page'){await route.fulfill({status:404,json:{error:'Participação simulada indisponível'}});return;}
        let json=[];
        if(url.pathname==='/api/notifications')json=alerts;
        if(url.pathname==='/api/notifications/read-all'){alerts.forEach(n=>n.read=true);json={ok:true};}
        if(url.pathname.startsWith('/api/notifications/')&&route.request().method()==='PATCH'){const n=alerts.find(n=>url.pathname.endsWith('/'+n.id));if(n)n.read=true;json={ok:true};}
        if(url.pathname==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'org',name:'Empresa QA',isDemo:true},role:'ADMIN'};
        if(url.pathname==='/api/entitlements')json={features:['radar','discovery'],multiCompany:false};
        if(url.pathname==='/api/getting-started')json={onboardingStatus:'DISMISSED',profileReady:true,radarReady:true};
        if(url.pathname==='/api/radar-settings')json={defaultOwnerId:null,defaultOwnerAvailable:true};
        if(url.pathname==='/api/members')json=[{id:'member-qa',name:'Ana QA',role:'MEMBER'}];
        if(url.pathname==='/api/trackings/page'){
          requests.push(url.searchParams);
          const card={id:'card-qa',opportunityId:'op-qa',stage:'IDENTIFIED',ownerId:null,deadline:null,expectedValue:null,notes:'',events:[],tasks:[],pendingChanges:0,opportunity:{id:'op-qa',title:'Serviço de impressão — teste',agency:'Órgão QA',city:'Porto Alegre',state:'RS',value:2000000,modality:'Pregão',sourceName:'PNCP',documents:[],match:{score:0,reasons:[],excluded:false}}};
          json={items:[card],orderRevision:'0',page:Number(url.searchParams.get('page')),pageSize:50,view:url.searchParams.get('view'),stages:[{stage:'IDENTIFIED',count:1,potential:2000000,unknownValues:0,pendingTasks:0,hasMore:false}],total:1,pageTotal:1,hasMore:false,summary:{active:1,potential:2000000,unknownValues:0,pendingTasks:0}};
        }
        await route.fulfill({json});
      });
      const waitQuery=predicate=>page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/trackings/page'&&predicate(u.searchParams);});
      await page.goto(new URL('/app/radar',origin).href);
      const search=page.getByRole('textbox',{name:'Buscar no radar'});
      await search.waitFor();
      assert.equal(await page.getByRole('navigation',{name:'Menu principal'}).getByRole('link',{name:'Simulador',exact:true}).count(),0);
      assert.equal(await page.getByRole('heading',{name:'Meu radar',exact:true}).count(),1);
      assert.equal(await page.getByText('GESTÃO DE PARTICIPAÇÕES',{exact:true}).count(),0);
      const metrics=page.locator('.radar-summary-compact');
      assert.ok((await metrics.boundingBox()).height<120,'Metrics should remain compact');
      const controls=page.locator('.radar-filter-controls');
      assert.equal(await controls.getByRole('checkbox').count(),2);
      assert.equal(await controls.getByRole('combobox',{name:'Filtrar responsável'}).count(),1);
      assert.equal(await page.getByRole('region',{name:'Filtros ativos do radar'}).count(),0);
      await page.getByRole('button',{name:'Visualização em lista'}).click();
      await search.fill('Impressão com termos muito longos para conferir quebra no celular');
      await waitQuery(p=>p.get('q').startsWith('Impressão'));
      await page.getByRole('combobox',{name:'Filtrar responsável'}).selectOption('member-qa');
      await page.getByRole('checkbox',{name:'Incluir etapas encerradas'}).check();
      const ready=waitQuery(p=>p.get('owner')==='member-qa'&&p.get('changesOnly')==='true'&&p.get('includeClosed')==='true');
      await page.getByRole('checkbox',{name:'Só alterações para conferir'}).check();await ready;
      const region=page.getByRole('region',{name:'Filtros ativos do radar'});
      assert.equal(await region.locator('li').count(),4);
      assert.match(await region.innerText(),/Responsável: Ana QA/);
      if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`radar-${width}-${theme}.png`),fullPage:true});}
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
      // Keyboard removal changes only owner and restores a stable focus target.
      const remove=region.getByRole('button',{name:'Remover filtro: Responsável: Ana QA'});
      await remove.focus();assert.equal(await remove.evaluate(el=>el===document.activeElement),true);
      const removed=waitQuery(p=>!p.has('owner')&&p.get('q').startsWith('Impressão')&&p.get('changesOnly')==='true'&&p.get('includeClosed')==='true'&&p.get('view')==='list'&&p.get('page')==='1');
      await page.keyboard.press('Enter');await removed;
      assert.equal(await search.evaluate(el=>el===document.activeElement),true);
      assert.equal(await region.locator('li').count(),3);
      const cleared=waitQuery(p=>p.get('q')===''&&!p.has('owner')&&p.get('includeClosed')==='false'&&p.get('changesOnly')==='false'&&p.get('view')==='list'&&p.get('page')==='1');
      await region.getByRole('button',{name:'Limpar filtros'}).focus();await page.keyboard.press('Enter');await cleared;
      assert.equal(await search.inputValue(),'');assert.equal(await region.count(),0);
      assert.equal(await search.evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.getByRole('button',{name:'Visualização em lista'}).getAttribute('aria-pressed'),'true');
      const settingsButton=page.getByRole('button',{name:'Responsável padrão',exact:true});
      await settingsButton.click();
      const dialog=page.getByRole('dialog',{name:'Responsável padrão do radar'});
      await dialog.getByRole('combobox').waitFor();
      const assertModalPadding=async()=>{
        const box=await dialog.boundingBox(),save=await dialog.getByRole('button',{name:'Salvar',exact:true}).boundingBox();
        assert.ok(save.y+save.height<=box.y+box.height-16,'Modal actions need bottom space');
        assert.ok(box.x>=0&&box.x+box.width<=width,'Modal width must fit');
        assert.ok(box.y>=0&&box.y+box.height<=page.viewportSize().height,'Modal must fit viewport');
      };
      await assertModalPadding();
      if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`radar-modal-${width}-${theme}.png`),fullPage:true});
      await page.setViewportSize({width,height:480});await assertModalPadding();
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(),0);
      assert.equal(await settingsButton.evaluate(el=>el===document.activeElement),true);
      await page.setViewportSize({width,height:900});
      await page.getByRole('button',{name:'Visualização em quadro'}).click();
      await page.getByRole('checkbox',{name:'Incluir etapas encerradas'}).check();
      const board=page.getByRole('region',{name:'Quadro de participações por etapa'});
      await board.waitFor();
      assert.ok(await board.evaluate(el=>el.scrollWidth>el.clientWidth),'Board should overflow internally');
      if(width>1020){
        await page.setViewportSize({width:2400,height:900});
        assert.ok(await board.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'All stages should fit a wide viewport');
        await page.setViewportSize({width,height:900});
      }
      await board.focus();await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>document.querySelector('.radar-board')?.scrollLeft>0);
      assert.equal(await board.evaluate(el=>getComputedStyle(el).scrollbarWidth),'thin');
      if(width>1020){
        const shell=page.locator('.main-shell'),expanded=await shell.boundingBox();
        await page.getByRole('button',{name:'Recolher menu lateral'}).click();
        assert.equal(await page.getByRole('button',{name:'Expandir menu lateral'}).getAttribute('aria-expanded'),'false');
        const compact=await shell.boundingBox();assert.ok(compact.width>expanded.width+100);
        const radarLink=page.getByRole('navigation',{name:'Menu principal'}).getByRole('link',{name:'Meu radar',exact:true});
        assert.equal(await radarLink.getAttribute('title'),'Meu radar');
        await radarLink.focus();assert.equal(await radarLink.evaluate(el=>el===document.activeElement),true);
        if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`radar-sidebar-${theme}.png`),fullPage:true});
        await page.reload();await page.getByRole('button',{name:'Expandir menu lateral'}).waitFor();
        await page.getByRole('button',{name:'Expandir menu lateral'}).click();
        assert.equal(await page.getByRole('button',{name:'Recolher menu lateral'}).getAttribute('aria-expanded'),'true');
      }else{
        assert.equal(await page.getByRole('button',{name:'Recolher menu lateral'}).isVisible(),false);
        await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
        assert.equal(await page.locator('.sidebar').evaluate(el=>el.inert),false);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.sidebar').evaluate(el=>el.inert),true);
      }
      const bell=page.getByRole('button',{name:'Notificações, 2 não lidas'});
      await bell.waitFor();assert.equal(await bell.locator('.notification-count').innerText(),'2');
      const beforeNotifications=page.url();await bell.click();
      const notifications=page.getByRole('dialog',{name:'Notificações',exact:true});
      await notifications.getByRole('link',{name:/Prazo atualizado/}).waitFor();
      assert.equal(page.url(),beforeNotifications,'Opening notifications must not navigate');
      if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`notifications-${width}-${theme}.png`),fullPage:true});
      const readResponse=page.waitForResponse(r=>r.url().endsWith('/api/notifications/notice-1')&&r.request().method()==='PATCH');
      await notifications.getByRole('link',{name:/Prazo atualizado/}).click();await readResponse;
      await page.waitForURL('**/app/radar/11111111-1111-4111-8111-111111111111');
      assert.equal(await notifications.count(),0);
      await page.getByRole('button',{name:'Notificações, 1 não lidas'}).waitFor();
      await page.getByRole('button',{name:'Notificações, 1 não lidas'}).click();
      await notifications.getByRole('link',{name:/Nova oportunidade/}).waitFor();
      assert.equal(await notifications.getByRole('link',{name:/Prazo atualizado/}).count(),0);
      await notifications.getByRole('button',{name:'Marcar todas como lidas'}).click();
      await page.waitForFunction(()=>!document.querySelector('.notification-count'));
      await notifications.getByText('Nenhuma notificação pendente',{exact:true}).waitFor();
      assert.equal(await notifications.getByRole('link').count(),0);
      await page.keyboard.press('Escape');
      assert.equal(errors.length,0,errors.join('\n'));
      await context.close();
    }
  } finally {
    await browser?.close();await server?.close();
    await rm(cache,{recursive:true,force:true});
  }
});