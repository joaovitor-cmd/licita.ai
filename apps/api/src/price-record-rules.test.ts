import test from 'node:test';
import assert from 'node:assert/strict';
import {priceRecordAlert,priceRecordSchema} from './price-record-rules.js';
test('validates calendar dates and decimal strings without floating point',()=>{
 const base={number:'1/2026',title:'Ata teste',agency:'Órgão',startsOn:'2026-10-01',endsOn:'2027-10-01',items:[{description:'Serviço',unit:'mês',quantity:'12.000001',unitPrice:'999999999999.123456',supplierName:'Fornecedor'}]};
 assert.equal(priceRecordSchema.parse(base).items[0].unitPrice,'999999999999.123456');
 for(const invalid of ['0','0.000000','1e3','1,2','-1'])assert.equal(priceRecordSchema.safeParse({...base,items:[{...base.items[0],quantity:invalid}]}).success,false);
 assert.equal(priceRecordSchema.safeParse({...base,endsOn:'2026-09-01'}).success,false);
 assert.equal(priceRecordSchema.safeParse({...base,startsOn:'2026-02-30'}).success,false);
});
test('ata alert uses inclusive Brasília dates, 30 days and separate expiration',()=>{
 const now=new Date('2026-10-15T01:00:00Z');
 assert.equal(priceRecordAlert('a','1','2026-11-14',now),null);
 assert.match(priceRecordAlert('a','1','2026-11-13',now)!.description,/30 dias/);
 assert.match(priceRecordAlert('a','1','2026-10-14',now)!.description,/hoje/);
 assert.match(priceRecordAlert('a','1','2026-10-13',now)!.key,/expired$/);
 assert.match(priceRecordAlert('a','1','2026-10-14',now)!.url,/atas-precos/);
});
