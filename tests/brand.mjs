import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 await page.goto('http://localhost:5173/login');
 assert.equal(await page.title(),'Licitaro — Inteligência comercial');
 assert.equal((await page.locator('.auth-story .brand').innerText()).trim(),'Licitaro');
 await page.getByRole('button',{name:'Explorar demonstração'}).click();
 await page.getByRole('link',{name:'Licitaro — início',exact:true}).waitFor();
 for(const theme of ['light','dark']) {
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  assert.ok(await page.locator('.brand-link').evaluate(el=>el.scrollWidth<=el.clientWidth));
 }
 await page.screenshot({path:'test-results/13-licitaro.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().left>=0);
 assert.ok(await page.locator('.brand-link').evaluate(el=>el.scrollWidth<=el.clientWidth));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Licitaro: título, login, marca no portal e menu móvel verificados.');
} finally {await browser.close();}
