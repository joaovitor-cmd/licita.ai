import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyChanges,statusKind,relationEvidence,changeSettingsSchema,defaultChangeSettings} from './change-rules.js';
const before={status:'Divulgada no PNCP',closesAt:'2030-01-01T12:00:00Z',opensAt:null,documents:[],title:'Objeto'};
test('mudanças: cancelamento, suspensão e reabertura são diferenciados',()=>{
 assert.deepEqual(classifyChanges(before,{...before,status:'Anulada'}),['CANCELLATION']);
 assert.deepEqual(classifyChanges(before,{...before,status:'Suspensa'}),['SUSPENSION']);
 assert.ok(classifyChanges({...before,status:'Suspensa'},before,Date.parse('2029-01-01')).includes('REOPENING'));
 assert.ok(!classifyChanges({...before,status:'Suspensa'},{...before,closesAt:'2020-01-01'},Date.parse('2029-01-01')).includes('REOPENING'));
 assert.equal(statusKind('Pedido de cancelamento indeferido'),'unknown');
 assert.equal(statusKind('Não cancelada'),'unknown');
});
test('mudanças: anexos não são interpretados como impugnação e prazo possui categoria própria',()=>{
 assert.deepEqual(classifyChanges(before,{...before,documents:[{name:'Impugnação.pdf',url:'https://pncp.gov.br/test'}]}),['DOCUMENTS']);
 assert.ok(classifyChanges(before,{...before,closesAt:'2030-02-01T12:00:00Z'}).includes('DEADLINE'));
});
test('relações: exige órgão, modalidade, data posterior e objeto suficientemente semelhante',()=>{
 const a={canonicalKey:'pncp:12345678000100-1-1/2026',title:'Contratação de serviço de impressão com equipamentos multifuncionais e suporte técnico presencial',modality:'Pregão eletrônico',publishedAt:'2026-01-01'},b={...a,canonicalKey:'pncp:12345678000100-1-2/2026',publishedAt:'2026-02-01'};
 assert.equal(relationEvidence(a,b)?.titleSimilarity,100);
 for(const other of [{...b,canonicalKey:a.canonicalKey},{...b,canonicalKey:'pncp:99999999000100-1-2/2026'},{...b,publishedAt:'2025-01-01'},{...b,title:'Aquisição de materiais médicos'},{...b,modality:'Dispensa'},{...b,publishedAt:'2028-01-01'}])assert.equal(relationEvidence(a,other),null);
});
test('configuração mantém avisos existentes e republicações são opt-in',()=>{
 assert.equal(defaultChangeSettings.types.includes('RELATED'),false);
 assert.equal(changeSettingsSchema.safeParse({...defaultChangeSettings,revision:0}).success,true);
 assert.equal(changeSettingsSchema.safeParse({...defaultChangeSettings,types:['STATUS','STATUS'],revision:0}).success,false);
});
