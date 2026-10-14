import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
/** Run only inside qa-workflow's disposable local database. */
export async function testSourceReconciliation({a,b,db,sa,sb}){
 assert.equal(process.env.LICITARO_ISOLATED_QA,'true');
 const url=new URL(process.env.DATABASE_URL||'');
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/licitaro_qa_\d+$/.test(url.pathname));
 const {saveOpportunity}=await import('../apps/api/dist/jobs.js');
 const tag=randomUUID(),key='pncp:12345678000100-1-'+Date.now()+'/2026';
 const initial={canonicalKey:key,externalId:'qa-pncp-'+tag,title:'Reconciliação de fontes QA',description:'Descrição conhecida',agency:'Órgão QA',state:'SP',city:'Matão',modality:'Pregão',sphere:'Municipal',value:100,publishedAt:'2026-10-01T12:00:00Z',opensAt:'2026-10-02T12:00:00Z',closesAt:'2026-11-20T12:00:00Z',status:'Aberta',url:'https://example.invalid/pncp',sourceCode:'pncp',sourceName:'PNCP',documents:[{name:'Edital QA',url:'https://example.invalid/edital.pdf'}],raw:{dataAtualizacaoGlobal:'2026-10-10T12:00:00Z'}};
 const created=await saveOpportunity(initial,true),oid=created.id;
 const current=async()=>(await db.query('SELECT * FROM opportunities WHERE id=$1',[oid])).rows[0];
 const changes=async()=>Number((await db.query('SELECT count(*) FROM opportunity_changes WHERE opportunity_id=$1',[oid])).rows[0].count);
 const observations=async()=>(await db.query('SELECT * FROM opportunity_source_observations WHERE opportunity_id=$1 ORDER BY source_code',[oid])).rows;
 try{
  assert.equal(created.created,true);
  const newer={...initial,externalId:'qa-compras-'+tag,sourceCode:'comprasgov',sourceName:'Compras.gov.br',url:'https://example.invalid/compras',status:'Suspensa',city:null,value:0,closesAt:null,documents:[],raw:{dataAtualizacaoGlobal:'2026-10-11T12:00:00Z'}};
  const updated=await saveOpportunity(newer,true);assert.equal(updated.id,oid);assert.equal(updated.updated,true);
  const approved=await current(),baseline=await changes();
  assert.equal(approved.source_code,'comprasgov');assert.equal(approved.source_name,'Compras.gov.br');assert.equal(approved.status,'Suspensa');assert.equal(Number(approved.value),0);assert.equal(approved.city,'Matão');assert.equal(approved.closes_at.toISOString(),initial.closesAt.replace('Z','.000Z'));assert.deepEqual(approved.documents,initial.documents);
  assert.equal((await db.query('SELECT id FROM opportunities WHERE canonical_key=$1',[key])).rowCount,1);
  assert.equal((await db.query('SELECT * FROM opportunity_sources WHERE opportunity_id=$1',[oid])).rowCount,2);
  const assertUnchanged=async()=>{const actual=await current();assert.equal(actual.content_hash,approved.content_hash);assert.equal(actual.status,approved.status);assert.equal(actual.source_code,approved.source_code);assert.equal(actual.source_updated_at.toISOString(),approved.source_updated_at.toISOString());assert.equal(await changes(),baseline);};
  assert.equal((await saveOpportunity({...initial,status:'Cancelada'},true)).updated,false);await assertUnchanged();
  assert.equal((await observations()).find(x=>x.source_code==='pncp').decision,'rejected');
  assert.equal((await saveOpportunity({...newer,status:'Cancelada'},true)).updated,false);await assertUnchanged();
  assert.equal((await observations()).find(x=>x.source_code==='comprasgov').reason,'equal_source_date_divergence');
  assert.equal((await saveOpportunity({...initial,status:'Revogada',raw:{}},true)).updated,false);await assertUnchanged();
  const observed=await observations();assert.equal(observed.length,2);assert.equal(observed.find(x=>x.source_code==='pncp').decision,'conflicting');assert.equal(observed.find(x=>x.source_code==='pncp').reported_updated_at,null);assert.equal(observed.find(x=>x.source_code==='pncp').snapshot.status,'Revogada');assert.ok(observed.every(x=>x.consulted_at instanceof Date));
  // Real companies may see public records; demo organizations cannot.
  await db.query('UPDATE organizations SET is_demo=false WHERE id=$1',[sa.organization.id]);
  const response=await a('/opportunities/'+oid+'/source-observations');assert.equal(response.length,2);assert.ok(response.every(x=>x.sourceCode&&x.sourceName&&x.consultedAt&&x.snapshot));
  await b('/opportunities/'+oid+'/source-observations','GET',undefined,404);
  // The same visibility gate must hide another company's demo fixtures.
  await db.query('UPDATE organizations SET is_demo=true WHERE id=$1',[sa.organization.id]);
  await db.query('UPDATE opportunities SET demo_org_id=$2 WHERE id=$1',[oid,sa.organization.id]);
  assert.equal((await a('/opportunities/'+oid+'/source-observations')).length,2);
  await b('/opportunities/'+oid+'/source-observations','GET',undefined,404);
  console.log('PASS: conservative source reconciliation, canonical dedupe, latest observations, zero/null preservation and visibility.');
 }finally{
  await db.query('DELETE FROM opportunities WHERE id=$1',[oid]);
  await db.query('UPDATE organizations SET is_demo=true WHERE id=$1',[sa.organization.id]);
 }
}
