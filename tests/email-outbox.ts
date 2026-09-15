import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../apps/api/src/db.js';
import {notify} from '../apps/api/src/data.js';
test('notificação e fila persistem juntas, sem duplicar mensagem e sem envio externo',async()=>{
 await migrate();const org=randomUUID(),user=randomUUID();
 try{await pool.query("INSERT INTO organizations(id,name,preferences) VALUES($1,'QA fila',$2)",[org,JSON.stringify({inApp:true,email:true})]);await pool.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'QA fila',$2,'qa-not-a-valid-password')",[user,`queue-${user}@example.invalid`]);await pool.query("INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",[org,user]);
 await notify(org,'QA alerta','Dados sintéticos','/app','qa-dedupe');await notify(org,'QA alerta','Dados sintéticos','/app','qa-dedupe');
 assert.equal((await pool.query('SELECT count(*)::int n FROM notifications WHERE organization_id=$1',[org])).rows[0].n,1);
 const deliveries=(await pool.query('SELECT * FROM email_deliveries WHERE organization_id=$1',[org])).rows;assert.equal(deliveries.length,1);assert.equal(deliveries[0].attempts,0);assert.ok(['PENDING','BLOCKED'].includes(deliveries[0].status));
 await pool.query("UPDATE organizations SET preferences=$2 WHERE id=$1",[org,JSON.stringify({email:false,inApp:true})]);await notify(org,'QA sem e-mail','Dados sintéticos','/app','qa-second');assert.equal((await pool.query('SELECT count(*)::int n FROM email_deliveries WHERE organization_id=$1',[org])).rows[0].n,1);
 }finally{await pool.query('DELETE FROM organizations WHERE id=$1',[org]);await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();}
});
