import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { STAGES } from '../apps/web/src/types.js';

test('status preservam suas cores, contraste e indicadores nos dois temas',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1050,height:850}});
  const page=await context.newPage();
  const css=(await Promise.all(['styles','readability','dark'].map(name=>readFile(new URL(`../apps/web/src/${name}.css`,import.meta.url),'utf8')))).join('\n');
  const badges=STAGES.map(s=>`<p><span class="badge ${s.color}"><i></i>${s.label}</span></p>`).join('');
  await page.setContent(`<html lang="pt-BR"><head><title>Status — regressão visual</title><style>${css}</style></head><body><main class="main-shell" style="margin:0;padding:32px"><h1>Status das participações</h1><section class="card" style="padding:24px;margin-top:24px">${badges}</section><div class="modal" style="position:static;padding:24px">${badges}</div></main></body></html>`);
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const results=await page.locator('.badge').evaluateAll(nodes=>nodes.map(node=>{
    const s=getComputedStyle(node),dot=getComputedStyle(node.querySelector('i')!);
    return {color:s.color,bg:s.backgroundColor,dot:dot.backgroundColor};
   }));
   assert.equal(new Set(results.slice(0,7).map(r=>r.bg)).size,6,`${theme}: seis cores distintas`);
   assert.deepEqual(results.slice(0,7),results.slice(7),`${theme}: modal e página consistentes`);
   for(const r of results) assert.equal(r.dot,r.color);
   if(theme==='dark'){
    const backgrounds:Record<string,string>={slate:'rgb(41, 53, 72)',blue:'rgb(34, 59, 87)',purple:'rgb(54, 48, 79)',amber:'rgb(68, 53, 29)',green:'rgb(25, 62, 53)',red:'rgb(73, 41, 53)'};
    STAGES.forEach((s,i)=>assert.equal(results[i].bg,backgrounds[s.color],s.label));
   }
   const check=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   assert.deepEqual(check.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   await page.screenshot({path:`test-results/20-status-${theme}.png`,fullPage:true});
  }
 }finally{await browser.close();}
});
