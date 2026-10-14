import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentAlert} from './document-alert-rules.js';
test('document reminder uses Brasília calendar days and boundaries',()=>{
 const now=new Date('2026-10-15T02:00:00Z'); // still October 14 in Brasília
 assert.equal(documentAlert('doc','QA','2026-10-30T00:00:00Z',now),null);
 const upcoming=documentAlert('doc','QA','2026-10-29T00:00:00Z',now);
 assert.match(upcoming.description,/15 dias/);
 assert.match(documentAlert('doc','QA','2026-10-14T00:00:00Z',now).description,/hoje/);
 const expired=documentAlert('doc','QA','2026-10-13T00:00:00Z',now);
 assert.notEqual(expired.key,upcoming.key);
 assert.match(expired.key,/expired$/);
 assert.equal(documentAlert('doc','QA','invalid',now),null);
});