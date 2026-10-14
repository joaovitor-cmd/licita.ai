import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testDocumentDates({a,b,db,sa}){
 const id=randomUUID();
 await db.query("UPDATE organizations SET is_demo=false,preferences=jsonb_set(preferences,'{inApp}','true') WHERE id=$1",[sa.organization.id]);
 await db.query("INSERT INTO documents(id,organization_id,name,category,expires_at,file_name,mime_type,size,content) VALUES($1,$2,'Documento QA','Declaração',(now() AT TIME ZONE 'America/Sao_Paulo')::date+10,'qa.pdf','application/pdf',5,$3)",[id,sa.organization.id,Buffer.from('%PDF-')]);
 await b('/documents/'+id,'PATCH',{expiresAt:'2026-12-31'},404);
 await a('/documents/'+id,'PATCH',{expiresAt:'invalid'},400);
 const {documentNotifications}=await import('../apps/api/dist/document-alerts.js');
 await documentNotifications();await documentNotifications();
 assert.equal((await db.query("SELECT id FROM notifications WHERE dedupe_key LIKE $1",['document-date:'+id+':%'])).rowCount,1);
 assert.equal((await db.query('SELECT organization_id,url FROM notifications WHERE dedupe_key LIKE $1',['document-date:'+id+':%'])).rows[0].organization_id,sa.organization.id);
 const sameDate=(await a('/documents')).find(d=>d.id===id).expiresAt;
 await a('/documents/'+id,'PATCH',{expiresAt:sameDate});
 assert.equal((await db.query('SELECT id FROM notifications WHERE dedupe_key LIKE $1 AND NOT read',['document-date:'+id+':%'])).rowCount,1);
 await db.query("UPDATE documents SET expires_at=(now() AT TIME ZONE 'America/Sao_Paulo')::date-1 WHERE id=$1",[id]);await documentNotifications();
 assert.equal((await db.query("SELECT id FROM notifications WHERE dedupe_key LIKE $1",['document-date:'+id+':%'])).rowCount,2);
 await a('/documents/'+id,'PATCH',{expiresAt:null});await documentNotifications();
 assert.equal((await db.query('SELECT expires_at FROM documents WHERE id=$1',[id])).rows[0].expires_at,null);
 assert.equal((await db.query("SELECT id FROM notifications WHERE dedupe_key LIKE $1",['document-date:'+id+':%'])).rowCount,2);
 assert.equal((await db.query('SELECT id FROM email_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE dedupe_key LIKE $1)',['document-date:'+id+':%'])).rowCount,0);
 assert.equal((await db.query('SELECT id FROM notifications WHERE dedupe_key LIKE $1 AND NOT read',['document-date:'+id+':%'])).rowCount,0);
 const changed=await a('/documents/'+id,'PATCH',{expiresAt:'2026-12-31T23:00:00-03:00'});
 assert.equal(changed.expiresAt,'2026-12-31T00:00:00.000Z');
 // Deletion also resolves a pending reminder, without deleting history.
 await db.query('UPDATE notifications SET read=false WHERE dedupe_key LIKE $1',['document-date:'+id+':%']);
 await a('/documents/'+id,'DELETE',undefined);
 assert.equal((await db.query('SELECT id FROM notifications WHERE dedupe_key LIKE $1 AND NOT read',['document-date:'+id+':%'])).rowCount,0);
 await db.query('UPDATE organizations SET is_demo=true WHERE id=$1',[sa.organization.id]);
 console.log('PASS: document dates, tenant isolation, reminder deduplication and expired transition.');
}