import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base='http://localhost:3000/api';let cookie='';
async function request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{Origin:'http://localhost:5173',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const token=r.headers.getSetCookie().at(-1);if(token)cookie=token.split(';')[0];const data=await r.json();assert.ok(r.ok,`${r.status} ${JSON.stringify(data)}`);return data;}
await request('/auth/register','POST',{name:'Validação da coleta',organizationName:'Validação técnica · dados públicos',email:`sync-qa-${Date.now()}@licita.local`,password:randomBytes(24).toString('hex')});
const profile=await request('/profile');await request('/profile','PUT',{...profile,states:['RS'],keywords:['computadores','notebooks','suporte','equipamentos']});
const job=await request('/sources/sync','POST',{sourceCode:process.env.SYNC_SOURCE||'comprasgov'});console.log('Coleta real enfileirada.');
let run;
for(let i=0;i<55;i++){await new Promise(r=>setTimeout(r,4000));run=(await request('/sources')).runs.find(r=>r.id===job.jobId);if(run&&!['RUNNING','PENDING'].includes(run.status))break;if(i%5===0)console.log(`Em andamento: ${run?.read||0} registros lidos.`);}
console.log(JSON.stringify({status:run?.status,read:run?.read,created:run?.created,updated:run?.updated,observation:run?.error},null,2));
assert.ok(run&&['SUCCEEDED','PARTIAL'].includes(run.status),'A coleta não concluiu com registros.');
const list=await request('/opportunities?pageSize=2');assert.ok(list.total>0);assert.equal(list.items[0].isDemo,false);console.log(`Editais reais consultáveis: ${list.total}. Exemplo: ${list.items[0].title}`);
if(process.env.TEST_REFRESH==='true'){const item=list.items[0];const updated=await request(`/opportunities/${item.id}/refresh`,'POST',{});console.log(`Detalhe atualizado: ${updated.documents.length} anexos oficiais.`);}
