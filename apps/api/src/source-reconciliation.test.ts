import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSource,type PublicSnapshot} from './source-reconciliation.js';
const base:PublicSnapshot={title:'Edital',description:'Objeto completo',agency:'Prefeitura',state:'SP',city:'Matão',modality:'Pregão',sphere:'Municipal',value:123,publishedAt:'2026-10-01T00:00:00Z',opensAt:'2026-10-02T00:00:00Z',closesAt:'2026-10-20T00:00:00Z',status:'Aberta',url:'https://example.test/1',documents:[{name:'Edital',url:'https://example.test/a.pdf'}]};
const old='2026-10-10T00:00:00Z',newer='2026-10-11T00:00:00Z';
test('initial snapshot without date is accepted explicitly, not claimed newest',()=>{const r=reconcileSource(null,base,null,null,true);assert.equal(r.decision,'accepted');assert.equal(r.reason,'initial_snapshot');});
test('missing, equal and incomparable timestamps cannot replace divergent approved content',()=>{
 for(const dates of [[old,null],[null,newer],[old,old],[null,null]] as Array<[string|null,string|null]>){const r=reconcileSource(base,{...base,status:'Suspensa'},...dates,true);assert.equal(r.decision,'conflicting');assert.equal(r.snapshot.status,'Aberta');}
});
test('older snapshot is rejected even when supplied fields are equal',()=>{const r=reconcileSource(base,base,newer,old,true);assert.equal(r.decision,'rejected');assert.equal(r.reason,'older_source_date');});
test('newer snapshots preserve missing known fields, zero is a real value',()=>{
 const r=reconcileSource(base,{...base,description:null,city:null,closesAt:null,value:0,status:'Suspensa',documents:[]},old,newer,true);
 assert.equal(r.decision,'accepted');assert.equal(r.snapshot.closesAt,base.closesAt);assert.equal(r.snapshot.city,base.city);assert.equal(r.snapshot.description,base.description);assert.equal(r.snapshot.value,0);assert.deepEqual(r.snapshot.documents,base.documents);
});
test('undated identical observations do not pretend a material update',()=>{const r=reconcileSource(base,{...base,description:null},old,null,true);assert.equal(r.decision,'accepted');assert.equal(r.reason,'same_known_fields');assert.deepEqual(r.snapshot,base);});
test('attachments change only when requested and snapshot provably newer',()=>{
 const incoming={...base,documents:[{name:'Retificação',url:'https://example.test/b.pdf'}]};
 assert.deepEqual(reconcileSource(base,incoming,old,newer,false).snapshot.documents,base.documents);
 assert.equal(reconcileSource(base,incoming,old,old,true).decision,'conflicting');
 assert.deepEqual(reconcileSource(base,incoming,old,newer,true).snapshot.documents,incoming.documents);
});
