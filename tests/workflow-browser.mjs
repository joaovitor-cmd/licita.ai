import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

test('busca e radar: ações rápidas, movimento, falhas, tarefa, responsável e temas', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await mkdir('test-results', { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const opportunity = { id: 'op-1', publicCode:'LC-00012345',editalNumber:'154/2026',uasg:null,capag:null,opensAt:'2026-10-10T12:00:00Z', title: 'Outsourcing de impressão e manutenção de equipamentos', agency: 'Prefeitura de Teste',
      city: 'Porto Alegre', state: 'RS', modality: 'Pregão eletrônico', sourceName: 'PNCP', sourceCode: 'pncp',
      status: 'Recebendo propostas', value: 240000, publishedAt: '2026-09-25T12:00:00Z', syncedAt: '2026-09-28T12:00:00Z',
      closesAt: '2026-10-12T12:00:00Z', url: 'https://pncp.gov.br/app/editais/exemplo', isDemo: false,
      match: { score: 85, reasons: ['Termo encontrado: impressão'], excluded: false }, documents: [], trackingId: null };
    let tracking = { id: 'track-1', pendingChanges:2, opportunity, opportunityId: opportunity.id, stage: 'IDENTIFIED', ownerId: null, deadline: null,
      expectedValue: null, outcomeReason: '', notes: '', events: [], tasks: [
        { id: 'task-1', title: 'Conferir cobertura técnica', done: false, deadline: '2026-10-01T12:00:00Z', ownerId: null },
        { id: 'task-2', title: 'Ler documentação', done: false, deadline: null, ownerId: null },
      ] };
    let exists = false, failPatch = false, adds = 0, notes = [],defaultOwner=null,failSettings=false;
    await page.route('**/api/**', async route => {
      const { pathname: path } = new URL(route.request().url());
      const method = route.request().method();
      let json = [];
      if (path === '/api/auth/me') json = { user: { id: 'qa', name: 'Operador QA', email: 'qa@example.invalid' }, organization: { id: 'qa-org', name: 'Empresa QA' }, role: 'ADMIN' };
      if (path === '/api/entitlements') json = { features: ['discovery', 'radar', 'documents'], multiCompany: false };
      if (path === '/api/getting-started') json = { profileReady: true, radarReady: true };
      if (path === '/api/members') json = [{ id: 'qa', name: 'Operador QA', email: 'qa@example.invalid', role: 'ADMIN' }];
      if(path==='/api/radar-settings'){
        if(method==='PUT'){if(failSettings){await route.fulfill({status:503,json:{error:'Falha ao salvar responsável padrão.'}});return;}defaultOwner=route.request().postDataJSON().defaultOwnerId;}
        json={defaultOwnerId:defaultOwner,defaultOwnerAvailable:defaultOwner!==null};
      }
      if (path === '/api/opportunities') json = { items: [{ ...opportunity, trackingId: exists ? tracking.id : null }], total: 1, page: 1, pages: 1, pageSize: 20 };
      if (path === '/api/trackings') {
        if (method === 'POST') { adds++; exists = true; json = tracking; }
        else json = exists ? [tracking] : [];
      }
      if(path==='/api/trackings/page'){
        const params=new URL(route.request().url()).searchParams;
        const items=exists&&(!params.get('q')||tracking.opportunity.title.toLowerCase().includes(params.get('q').toLowerCase()))?[tracking]:[];
        json={items,page:1,pageSize:25,view:params.get('view'),total:items.length,pageTotal:items.length,hasMore:false,stages:items.length?[{stage:tracking.stage,count:1,potential:240000,unknownValues:0,pendingTasks:tracking.tasks.filter(t=>!t.done).length,hasMore:false}]:[],summary:{active:items.filter(t=>!['WON','LOST','DISCARDED'].includes(t.stage)).length,potential:240000,unknownValues:0,pendingTasks:tracking.tasks.filter(t=>!t.done).length}};
      }
      if (path === '/api/trackings/track-1') {
        if (method === 'PATCH') {
          if (failPatch) { await route.fulfill({ status: 503, json: { error: 'Falha simulada. Tente novamente.' } }); return; }
          tracking = { ...tracking, ...route.request().postDataJSON() };
        }
        json = tracking;
      }
      if (path === '/api/trackings/track-1/events' && method === 'POST') { notes.push(route.request().postDataJSON().description); json = { id: 'event-1' }; }
      if (path === '/api/trackings/track-1/tasks' && method === 'POST') {
        const task = { id: 'new-task', done: false, ...route.request().postDataJSON() };
        tracking.tasks.push(task); json = task;
      }
      await route.fulfill({ json });
    });
    await page.addInitScript(()=>{window.__copiedCode='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__copiedCode=value;}}});});
    await page.goto('http://localhost:5173/app/oportunidades?terms=impressao');
    await page.getByRole('button', { name: 'Adicionar ao radar', exact: true }).waitFor();
    assert.match(await page.locator('.discovery-card').innerText(), /Encerramento/i);
    assert.match(await page.locator('.discovery-card').innerText(), /LC-00012345/);
    assert.match(await page.locator('.discovery-card').innerText(), /154\/2026/);
    assert.equal(await page.locator('.discovery-object mark').innerText(),'impressão');
    await page.getByRole('button',{name:'Copiar código Licitaro LC-00012345',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedCode),'LC-00012345');
    assert.equal(await page.getByRole('link', { name: 'Portal oficial', exact: true }).getAttribute('href'), opportunity.url);
    await page.getByText('Por que apareceu para mim?', { exact: true }).click();
    await page.getByText('Termo encontrado: impressão', { exact: true }).waitFor();
    await page.screenshot({ path: 'test-results/workflow-search-light.png', fullPage: true });
    await page.getByRole('button', { name: 'Adicionar ao radar', exact: true }).click();
    await page.waitForURL('**/app/radar?highlight=track-1');
    const card = page.locator('[data-tracking-id="track-1"]');
    await card.waitFor();
    assert.equal(adds, 1);
    assert.match(await card.innerText(), /Conferir cobertura técnica/);
    assert.match(await card.innerText(), /Sem responsável/);
    assert.equal(await card.getByRole('link',{name:'2 alterações para conferir'}).getAttribute('href'),`/app/oportunidades/${opportunity.id}?tab=mudancas`);
    await page.getByLabel('Só alterações para conferir').check();await card.waitFor();await page.getByLabel('Só alterações para conferir').uncheck();
    await page.getByRole('button',{name:'Responsável padrão',exact:true}).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('qa');failSettings=true;
    await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('Falha ao salvar responsável padrão.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('combobox').inputValue(),'qa');failSettings=false;
    await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
    assert.equal(defaultOwner,'qa');assert.equal(tracking.ownerId,null);
    await card.locator('.radar-actions > summary').click();
    await card.getByRole('button', { name: 'Definir responsável', exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('qa');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(tracking.ownerId, 'qa');
    await card.getByRole('button', { name: 'Adicionar observação', exact: true }).click();
    await page.getByLabel('Observação interna', { exact: false }).fill('Confirmar cobertura na região com o técnico.');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(notes.length, 1);
    await card.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
    await page.getByLabel('O que precisa ser feito?', { exact: false }).fill('Revisar capacidade de atendimento');
    assert.equal(await page.getByRole('dialog').getByRole('combobox').inputValue(), 'qa');
    await page.getByRole('dialog').getByRole('button', { name: 'Criar tarefa', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await card.waitFor();
    assert.equal(tracking.tasks.length, 3);
    // Pointer movement uses only the handle and persists the destination.
    await card.locator('.drag-handle').dragTo(page.getByRole('region', { name: 'Em análise', exact: true }).getByRole('heading'));
    await page.getByRole('region', { name: 'Em análise', exact: true }).locator('[data-tracking-id]').waitFor();
    assert.equal(tracking.stage, 'IN_ANALYSIS');
    await card.locator('.radar-actions > summary').click();
    await card.getByRole('button', { name: 'Mover para outra etapa' }).click();
    await page.getByLabel('Etapa comercial').selectOption('WILL_PARTICIPATE');
    failPatch = true;
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('dialog').getByText('Falha simulada. Tente novamente.').waitFor();
    assert.equal(tracking.stage, 'IN_ANALYSIS');
    failPatch = false;
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(tracking.stage, 'WILL_PARTICIPATE');
    // Reload confirms data comes back from the server, rather than only local state.
    await page.reload(); await card.waitFor();
    assert.equal(await page.getByRole('region', { name: 'Preparando proposta', exact: true }).locator('[data-tracking-id]').count(), 1);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test-results/workflow-radar-dark.png', fullPage: true });
    await card.locator('.radar-actions > summary').click();
    await card.getByRole('button', { name: 'Mover para outra etapa' }).click();
    await page.getByLabel('Etapa comercial').selectOption('WON');
    await page.getByRole('dialog').getByLabel('Motivo / resultado', { exact: false }).fill('Resultado conferido pela equipe.');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(tracking.stage, 'WON');
    assert.equal(tracking.outcomeReason, 'Resultado conferido pela equipe.');
    await page.getByRole('textbox', { name: 'Buscar no radar' }).fill('sem correspondência');
    await page.getByText('Nenhuma participação com estes filtros', { exact: true }).waitFor();
    await page.goto('http://localhost:5173/app/oportunidades');
    await page.getByRole('link', { name: 'Ver no quadro', exact: true }).waitFor();
    assert.equal(adds, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400); // Let the responsive sidebar transition finish.
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'test-results/workflow-search-mobile.png', fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test-results/workflow-search-mobile-dark.png', fullPage: true });
    await page.getByRole('link', { name: 'Ver no quadro', exact: true }).click();
    await card.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const ownerFilter = await page.getByRole('combobox', { name: 'Filtrar responsável' }).boundingBox();
    assert.ok(ownerFilter && ownerFilter.width > 250);
    await page.screenshot({ path: 'test-results/workflow-radar-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
