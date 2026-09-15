import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {writeFile} from 'node:fs/promises';
const response=await fetch('https://pncp.gov.br/pncp-api/v1/orgaos/83811307000108/compras/2026/45/arquivos/1',{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error('Documento indisponível');
const task=getDocument({data:new Uint8Array(await response.arrayBuffer()),isEvalSupported:false,verbosity:0});const pdf=await task.promise;
try{const page=await pdf.getPage(1);const viewport=page.getViewport({scale:1.4});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise;await writeFile('test-results/analysis-source-page-1.png',canvas.toBuffer('image/png'));}finally{await task.destroy();}
