import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Source observations: isolated responses, accessibility and safe links', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'licitaro-source-ui-'));
  const fixture = {name: 'source-observations-fixture', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== '/source-fixture') return next();
      const html = await server.transformIndexHtml('/source-fixture', `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="padding:16px"></main><script type="module">
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {SourceReliability} from '/src/SourceReliability.tsx';
        import '/src/styles.css'; import '/src/readability.css'; import '/src/dark.css';
        createRoot(document.getElementById('root')).render(React.createElement(SourceReliability,{opportunityId:'fixture'}));
      </script></body></html>`);
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    });
  }};
  const server = await createServer({configFile:false, envDir:false, root:fileURLToPath(new URL('../apps/web/',import.meta.url)), cacheDir:cache, plugins:[react(),fixture], server:{host:'127.0.0.1',port:0,proxy:{}}});
  let browser;
  try {
    await server.listen(); const origin = server.resolvedUrls.local[0];
    browser = await chromium.launch({channel:'chrome',headless:true});
    for (const width of [390,1440]) for (const theme of ['light','dark']) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      const page = await context.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
      let mode='normal';
      const base={sourceCode:'PNCP',sourceName:'Fonte <img src=x onerror=alert(1)>',sourceUrl:'https://example.org/publicacao',reportedUpdatedAt:null,consultedAt:'2026-10-14T12:00:00Z',snapshot:{}};
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(origin).origin) return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        assert.equal(url.pathname,'/api/opportunities/fixture/source-observations');
        if(mode==='error')return route.fulfill({status:503,json:{error:'Fonte indisponível nesta consulta'}});
        return route.fulfill({json:mode==='empty'?[]:[{...base,decision:'accepted',reason:'initial_snapshot'},{...base,sourceName:'Fonte anterior',sourceUrl:'javascript:alert(1)',decision:'rejected',reason:'older_source_date'},{...base,sourceName:'Fonte divergente',decision:'conflicting',reason:'freshness_unverifiable'}]});
      });
      const load=async()=>{await page.goto(`${origin}source-fixture`);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);};
      await load(); await page.getByRole('status').getByText(/Há divergências/).waitFor();
      const summary=page.locator('summary'); await summary.focus(); await page.keyboard.press('Enter');
      await page.getByText('Versão aplicada',{exact:true}).waitFor();
      assert.equal(await page.getByText('Versão anterior preservada',{exact:true}).count(),1);
      assert.equal(await page.getByText('Divergência para conferir',{exact:true}).count(),1);
      assert.equal(await page.getByText('Não informada pela fonte',{exact:true}).count(),3);
      assert.equal(await page.locator('.source-reliability img').count(),0);
      assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
      assert.equal(await page.locator('.source-reliability a').count(),2);
      assert.match(await page.locator('.source-reliability a').first().getAttribute('rel'),/noopener/);
      assert.equal(await page.locator('.source-reliability a').first().getAttribute('target'),'_blank');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`source-reliability-${width}-${theme}.png`),fullPage:true});}
      await summary.focus();await page.keyboard.press('Space');assert.equal(await page.locator('details').getAttribute('open'),null);
      mode='empty'; await load(); await summary.click();await page.getByText('Ainda não há registros de consultas por fonte para esta oportunidade.').waitFor();
      mode='error';await load();await summary.click();await page.getByRole('alert').getByText('Fonte indisponível nesta consulta').waitFor();
      mode='normal';await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByText('Versão aplicada',{exact:true}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    }
  } finally { await browser?.close();await server.close();await rm(cache,{recursive:true,force:true}); }
});
