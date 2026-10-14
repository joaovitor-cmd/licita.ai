import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {readStoredZip} from './document-archive.test.mjs';
test('Document templates, registration and dates with isolated API',async()=>{
 const cache=await mkdtemp(join(tmpdir(),'licitaro-documents-'));
 const server=await createServer({configFile:false,envDir:false,root:fileURLToPath(new URL('../apps/web/',import.meta.url)),cacheDir:cache,plugins:[react()],server:{host:'127.0.0.1',port:0,proxy:{}}});let browser;
 try{await server.listen();const origin=server.resolvedUrls.local[0];browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [390,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await context.addInitScript(t=>localStorage.setItem('licita-color-theme',t),theme);page.on('pageerror',e=>errors.push(e.message));
 const document={id:'document-qa',name:'Certidão QA',category:'Certidão',expiresAt:'2026-10-13T00:00:00Z',fileName:'qa.pdf',mimeType:'application/pdf',size:5,createdAt:'2026-10-01T00:00:00Z'};
 let failDownload=false;
 const documentB={...document,id:'document-b',name:'Certidão B'};
 const payloads=[Buffer.from('%PDF-A'),Buffer.from('%PDF-B')];
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(origin).origin){await route.abort();return;}if(!u.pathname.startsWith('/api/')){await route.continue();return;}
 if(u.pathname.endsWith('/download')){
  assert.equal(route.request().headers()['x-workspace-id'],'org');
  if(failDownload&&u.pathname.includes('document-b')){await route.fulfill({status:403,json:{error:'Não autorizado'}});return;}
  await route.fulfill({contentType:'application/pdf',body:payloads[u.pathname.includes('document-b')?1:0]});return;
 }
 let json=[];
 if(u.pathname==='/api/auth/me')json={user:{id:'qa',name:'QA'},organization:{id:'org',name:'Empresa QA'},role:'ADMIN'};
 if(u.pathname==='/api/entitlements')json={features:['documents'],multiCompany:false};
 if(u.pathname==='/api/getting-started')json={onboardingStatus:'DISMISSED'};
 if(u.pathname==='/api/company-details')json={companyName:'Empresa QA',taxId:'11222333000181'};
 if(u.pathname==='/api/documents')json=[document,documentB];
 if(u.pathname==='/api/documents/document-qa'){const b=route.request().postDataJSON();document.expiresAt=b.expiresAt;json=document;}
 await route.fulfill({json});});
 await page.goto(new URL('/app/documentos',origin).href);
 await page.getByRole('button',{name:'Modelos de declarações'}).click();
 const dialog=page.getByRole('dialog',{name:'Modelos de declarações'});
 assert.equal(await dialog.locator('.declaration-model-grid input[type=checkbox]').count(),16);
 const model=dialog.getByRole('checkbox',{name:'Enquadramento como ME ou EPP',exact:true});
 await model.check();
 const wordEvent=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'Baixar Word',exact:true}).click();
 const word=await wordEvent;
 assert.match(word.suggestedFilename(),/\.docx$/);
 const actualWord=await readFile(await word.path());
 const expectedWord=await readFile(fileURLToPath(new URL('../apps/web/public/templates/declaracoes/me-epp.docx',import.meta.url)));
 assert.deepEqual(actualWord,expectedWord);
 await dialog.getByRole('checkbox',{name:'Selecionar todos os modelos',exact:true}).check();
 const modelsEvent=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'Baixar Word (ZIP)',exact:true}).click();
 const modelsZip=await modelsEvent;
 const modelEntries=readStoredZip(await readFile(await modelsZip.path()));
 assert.equal(modelEntries.length,16);
 assert.equal(new Set(modelEntries.map(entry=>entry.name)).size,16);
 assert.ok(modelEntries.every(entry=>entry.name.endsWith('.docx')&&entry.data[0]===0x50&&entry.data[1]===0x4b));
 await dialog.locator('summary').click();
 assert.equal(await dialog.getByRole('combobox').locator('option').count(),17);
 await dialog.getByRole('combobox').selectOption('me-epp');
 const text=dialog.getByRole('textbox',{name:'Texto da declaração'});assert.match(await text.inputValue(),/ME_OU_EPP/);
 assert.equal(await dialog.getByRole('button',{name:'Imprimir / Salvar PDF'}).isEnabled(),false);
 for(const blank of ['', '   \n\t']){
 await text.fill(blank);
 await dialog.getByRole('checkbox',{name:'Conferi os dados, as declarações e as exigências do edital.'}).check();
 await dialog.getByRole('status').getByText('Escreva o texto da declaração antes de imprimir ou cadastrar.',{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Imprimir / Salvar PDF'}).isEnabled(),false);
 assert.equal(await dialog.getByRole('button',{name:'Cadastrar PDF assinado'}).isEnabled(),false);
 }
 await text.fill('DECLARAÇÃO\nEmpresa QA — CNPJ 11222333000181\nDeclaração revisada para teste.');
 await dialog.getByRole('checkbox',{name:'Conferi os dados, as declarações e as exigências do edital.'}).check();
 assert.equal(await dialog.getByRole('button',{name:'Imprimir / Salvar PDF'}).isEnabled(),true);
 if(process.env.QA_SCREENSHOT_DIR){await mkdir(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.QA_SCREENSHOT_DIR,`document-templates-${width}-${theme}.png`),fullPage:true});}
 const savedText=await text.inputValue();
 await dialog.getByRole('combobox').selectOption('menor');
 await dialog.getByRole('combobox').selectOption('me-epp');
 assert.equal(await text.inputValue(),savedText);assert.equal(await dialog.getByRole('checkbox',{name:'Conferi os dados, as declarações e as exigências do edital.'}).isChecked(),true);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Modelos de declarações'}).click();
 if((await dialog.locator('details').getAttribute('open'))===null)await dialog.locator('summary').click();
 assert.equal(await text.inputValue(),savedText);assert.equal(await dialog.getByRole('checkbox',{name:'Conferi os dados, as declarações e as exigências do edital.'}).isChecked(),true);
 await dialog.getByRole('button',{name:'Cadastrar PDF assinado'}).click();
 const upload=page.getByRole('dialog',{name:'Adicionar documento'});
 assert.equal(await upload.getByRole('textbox',{name:'Nome do documento'}).inputValue(),'Enquadramento como ME ou EPP');
 assert.equal(await upload.locator('input[type=file]').getAttribute('accept'),'.pdf,application/pdf');
 await upload.getByRole('button',{name:'Voltar ao modelo'}).click();
 if((await dialog.locator('details').getAttribute('open'))===null)await dialog.locator('summary').click();
 assert.equal(await text.inputValue(),savedText);
 await dialog.getByRole('button',{name:'Cadastrar PDF assinado'}).click();
 await upload.getByRole('button',{name:'Cancelar'}).click();
 await page.getByRole('button',{name:'Modelos de declarações'}).click();
 if((await dialog.locator('details').getAttribute('open'))===null)await dialog.locator('summary').click();
 assert.equal(await text.inputValue(),savedText);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Editar prazo'}).first().click();
 const deadline=page.getByRole('dialog',{name:'Prazo do documento'});
 await deadline.locator('input[type=date]').fill('2026-12-31');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/documents/document-qa')&&r.request().method()==='PATCH');
 await deadline.getByRole('button',{name:'Salvar prazo'}).click();await saved;
 await page.getByText('31 de dez. de 2026',{exact:true}).waitFor();
 const all=page.getByRole('checkbox',{name:'Selecionar todos os documentos visíveis'});
 await page.getByRole('checkbox',{name:'Selecionar Certidão QA',exact:true}).check();
 assert.equal(await all.evaluate(el=>el.indeterminate),true);
 await page.getByRole('textbox',{name:'Buscar documentos'}).fill('Certidão B');
 await page.waitForFunction(()=>document.querySelectorAll('tbody input[type=checkbox]:checked').length===0);
 await all.check();assert.equal(await page.getByRole('checkbox',{name:'Selecionar Certidão B',exact:true}).isChecked(),true);
 await page.getByRole('textbox',{name:'Buscar documentos'}).fill('');
 await page.waitForFunction(()=>document.querySelectorAll('tbody input[type=checkbox]:checked').length===0);
 await all.check();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:/Baixar selecionados/}).click();
 const downloaded=await download;
 const path=await downloaded.path();const entries=readStoredZip(await readFile(path));
 assert.equal(entries.length,2);assert.deepEqual(entries.map(e=>e.data),payloads);assert.notEqual(entries[0].name,entries[1].name);
 failDownload=true;let downloadCount=0;page.on('download',()=>downloadCount++);
 await page.getByRole('button',{name:/Baixar selecionados/}).click();
 await page.getByText(/Não foi possível baixar “Certidão B”/).waitFor();
 assert.equal(downloadCount,0);assert.equal(await all.isChecked(),true);
 assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await context.close();}
 }finally{await browser?.close();await server.close();await rm(cache,{recursive:true,force:true});}
});
