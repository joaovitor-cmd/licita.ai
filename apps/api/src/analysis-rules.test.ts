import test from 'node:test';
import assert from 'node:assert/strict';
import {findEvidence,fingerprint,officialPdfUrl} from './analysis-rules.js';
import {readPdf,downloadPdf} from './pdf-reader.js';
test('evidência mantém página e contexto, inclusive negação',()=>{
 const text='Não será exigido atestado de capacidade técnica para este item. Franquia mensal de 10000 páginas e cobrança de excedente conforme a tabela.';
 const result=findEvidence([{page:7,text}]);
 assert.ok(result.some(e=>e.topic==='qualification'&&e.page===7&&e.quote.includes('Não será exigido')));
 assert.ok(result.some(e=>e.topic==='billing'&&e.quote.includes('10000')));
 assert.deepEqual(findEvidence([{page:1,text:''}]),[]);
 assert.equal(findEvidence(Array.from({length:20},(_,i)=>({page:i+1,text:'Franquia mensal de impressão.'}))).filter(e=>e.topic==='billing').length,4);
});
test('mudança de documentos invalida referência de versão',()=>{
 assert.notEqual(fingerprint({content_hash:'a',documents:[]}),fingerprint({content_hash:'a',documents:[{url:'novo'}]}));
});
test('download não aceita hosts, caminhos, redirecionamento ou credenciais arbitrários',async()=>{
 const valid='https://pncp.gov.br/api/pncp/v1/orgaos/12345678000190/compras/2026/1/arquivos/1';
 assert.equal(officialPdfUrl(valid),valid);
 assert.equal(officialPdfUrl(valid.replace('/api/pncp/','/pncp-api/')),valid.replace('/api/pncp/','/pncp-api/'));
 for(const url of ['http://127.0.0.1/a.pdf','https://pncp.gov.br.evil.test/a.pdf',valid+'?url=http://localhost',valid.replace('pncp.gov.br','user@pncp.gov.br'),valid.replace('/arquivos/1','/../../users'),'file:///c:/private'])assert.equal(officialPdfUrl(url),null);
 await assert.rejects(downloadPdf('http://localhost/private',new AbortController().signal),/Origem/);
});
test('PDF inválido falha com mensagem segura em processo isolado',async()=>{
 await assert.rejects(readPdf(Buffer.from('not a PDF'),new AbortController().signal),/PDF protegido/);
});
test('download limita tamanho e recusa redirecionamentos e formatos sem seguir outros hosts',async t=>{
 const url='https://pncp.gov.br/pncp-api/v1/orgaos/12345678000190/compras/2026/1/arquivos/1';
 let response=new Response(null,{status:302,headers:{location:'http://localhost/private'}}),calls=0;
 t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{calls++;assert.equal(options.redirect,'manual');return response;});
 await assert.rejects(downloadPdf(url,new AbortController().signal),/diretamente/);assert.equal(calls,1);
 response=new Response('x',{headers:{'content-length':String(11*1024*1024)}});await assert.rejects(downloadPdf(url,new AbortController().signal),/10 MB/);
 response=new Response('<html>login</html>');await assert.rejects(downloadPdf(url,new AbortController().signal),/não é um PDF/);
 response=new Response(new Uint8Array(10*1024*1024+1));await assert.rejects(downloadPdf(url,new AbortController().signal),/10 MB/);
});
