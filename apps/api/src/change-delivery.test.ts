import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from './db.js';
import {pumpEmail} from './email-queue.js';
for(const settings of [{email:false,types:['CANCELLATION']},{email:true,types:['DEADLINE']},{email:true,types:[]}]){
 test(`aviso desativado é cancelado antes do SMTP: ${JSON.stringify(settings)}`,async t=>{
  const statements:string[]=[];
  t.mock.method(pool,'connect',async()=>({query:async(sql:string)=>{
   statements.push(sql);
   if(sql.includes('e.id environment_id'))return {rows:[{active:true,enforce_features:false,max_companies:1}]};
   if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
   if(sql.startsWith('SELECT * FROM email_deliveries'))return {rows:[{id:'qa',category:'CHANGE:CANCELLATION',organization_id:'qa-org',recipient:'qa@example.invalid'}]};
   if(sql.startsWith('SELECT 1 FROM organizations'))return {rows:[{}]};
   if(sql.startsWith('SELECT settings FROM change_alert_settings'))return {rows:[{settings}]};
   return {rows:[],rowCount:1};
  },release:()=>{}}) as any);
  let sent=false;await pumpEmail(async()=>{sent=true;return true;});
  assert.equal(sent,false);assert.ok(statements.some(s=>s.includes("status='CANCELLED'")));
 });
}
