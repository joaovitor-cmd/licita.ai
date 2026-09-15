// Optional, bounded read-only PNCP smoke test. Never sends mail or proposals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../apps/api/src/db.js';
test('PNCP real: consulta limitada e reutilização da página no banco',async()=>{
 const origin='http://localhost:5173';
 let account:any;
 try{
  const login=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{Origin:origin}});
  assert.equal(login.status,201); account=await login.json();
  const cookie=login.headers.getSetCookie().at(-1)!.split(';')[0];
  // Only this temporary QA organization changes visibility. No SMTP configuration.
  await pool.query('UPDATE organizations SET is_demo=false WHERE id=$1',[account.organization.id]);
  const found=await pool.query("SELECT id FROM opportunities WHERE demo_org_id IS NULL AND canonical_key=$1",['pncp:09203665000177-1-000031/2026']);
  assert.equal(found.rowCount,1,'A publicação pública usada neste smoke test precisa estar na base.');
  const path=origin+`/api/opportunities/${found.rows[0].id}/items?page=1`;
  const first=await fetch(path,{headers:{Cookie:cookie}}), data=await first.json();
  assert.equal(first.status,200,JSON.stringify(data)); assert.equal(data.supported,true);
  assert.equal(data.stale,false); assert.ok(data.items.length>0);
  const again=await fetch(path,{headers:{Cookie:cookie}}), cached=await again.json();
  assert.equal(again.status,200); assert.equal(cached.checkedAt,data.checkedAt);
  assert.deepEqual(cached.items,data.items);
  console.log(`PNCP: ${data.items.length} itens reais; segunda consulta reaproveitou a mesma página salva.`);
 }finally{
  if(account){
   await pool.query('DELETE FROM organizations WHERE id=$1',[account.organization.id]);
   await pool.query('DELETE FROM users WHERE id=$1',[account.user.id]);
  }
  await pool.end();
 }
});
