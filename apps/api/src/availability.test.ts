import test from 'node:test';
import assert from 'node:assert/strict';
import {deadlineSummary,recommendationThreshold} from './availability.js';
test('limiar de recomendação respeita configuração inclusive zero',()=>{
 for(const n of [0,35,60,80,100]) assert.equal(recommendationThreshold(n),n);
 for(const n of [undefined,null,-1,101,NaN,'80']) assert.equal(recommendationThreshold(n),60);
});
test('agenda prioriza prazo interno e separa vencidos de próximos sete dias',()=>{
 const now=Date.parse('2026-09-10T12:00:00Z'), at=(days:number)=>new Date(now+days*86400000).toISOString();
 const t=(stage:string,official:string|null,internal:string|null=null)=>({stage,deadline:internal,opportunity:{closesAt:official}});
 const result=deadlineSummary([t('IN_ANALYSIS',at(2)),t('IN_ANALYSIS',at(1),at(9)),t('WON',at(1)),t('LOST',at(1)),t('DISCARDED',at(1)),t('IN_ANALYSIS',at(-1)),t('IN_ANALYSIS',null),t('IN_ANALYSIS',at(7)),t('IN_ANALYSIS',at(0))],now);
 assert.equal(result.urgent,3); assert.equal(result.overdue,1); assert.equal(result.deadlines.length,5);
 assert.equal(result.deadlines[0].opportunity.closesAt,at(-1));
});
