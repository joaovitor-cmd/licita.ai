import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool} from '../apps/api/src/db.js';
import {saveOpportunity} from '../apps/api/src/jobs.js';
import type {ExternalOpportunity} from '../apps/api/src/connectors.js';
test('consolidação entre fontes, histórico sem duplicidade e proteção contra versões antigas',async()=>{
  const orgId=randomUUID(),trackingId=randomUUID(),canonicalKey=`qa-storage:${randomUUID()}`;let opportunityId='';
  const item:ExternalOpportunity={canonicalKey,externalId:randomUUID(),title:'DADO FICTÍCIO — teste temporário de persistência',description:'Teste removido ao concluir.',agency:'QA',state:'RS',city:'Porto Alegre',modality:'Pregão - Eletrônico',sphere:'Municipal',value:5000,publishedAt:'2026-09-01T12:00:00Z',opensAt:null,closesAt:'2026-09-15T12:00:00Z',status:'Divulgada',url:'https://pncp.gov.br/app/editais',sourceCode:'pncp',sourceName:'PNCP',documents:[],raw:{dataAtualizacaoGlobal:'2026-09-07T12:00:00Z'}};
  try{
    await pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[orgId,'QA temporária de armazenamento']);
    const first=await saveOpportunity(item);opportunityId=first.id;assert.equal(first.created,true);
    await pool.query('INSERT INTO trackings(id,organization_id,opportunity_id) VALUES($1,$2,$3)',[trackingId,orgId,opportunityId]);
    const copy=await saveOpportunity({...item,sourceCode:'comprasgov',sourceName:'Compras.gov.br',externalId:randomUUID()});assert.equal(copy.id,first.id);assert.equal(copy.created,false);assert.equal(copy.updated,false);
    const revised={...item,closesAt:'2026-09-18T12:00:00Z',raw:{dataAtualizacaoGlobal:'2026-09-08T12:00:00Z'}};
    assert.equal((await saveOpportunity(revised)).updated,true);
    assert.equal((await saveOpportunity(revised)).updated,false);
    assert.equal((await saveOpportunity(item)).updated,false);
    const saved=(await pool.query('SELECT closes_at FROM opportunities WHERE id=$1',[first.id])).rows[0];assert.equal(saved.closes_at.toISOString(),'2026-09-18T12:00:00.000Z');
    assert.equal((await pool.query('SELECT * FROM events WHERE tracking_id=$1',[trackingId])).rowCount,1);
    assert.equal((await pool.query('SELECT * FROM opportunity_sources WHERE opportunity_id=$1',[first.id])).rowCount,2);
  }finally{
    await pool.query('DELETE FROM organizations WHERE id=$1',[orgId]);
    if(opportunityId)await pool.query('DELETE FROM opportunities WHERE id=$1 AND canonical_key=$2',[opportunityId,canonicalKey]);
    await pool.end();
  }
});
