import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
import {createDocumentZip} from '../apps/web/src/document-archive.ts';
export function readStoredZip(buffer){
 const entries=[];let offset=0;
 while(buffer.readUInt32LE(offset)===0x04034b50){
  assert.equal(buffer.readUInt16LE(offset+8),0);
  const size=buffer.readUInt32LE(offset+18),length=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  const name=buffer.subarray(offset+30,offset+30+length).toString('utf8'),start=offset+30+length+extra,data=buffer.subarray(start,start+size);
  assert.equal(crc32(data),buffer.readUInt32LE(offset+14));entries.push({name,data});offset=start+size;
 }
 assert.equal(buffer.readUInt32LE(offset),0x02014b50);
 const end=buffer.length-22;assert.equal(buffer.readUInt32LE(end),0x06054b50);assert.equal(buffer.readUInt16LE(end+10),entries.length);assert.equal(buffer.readUInt32LE(end+16),offset);
 return entries;
}
test('ZIP preserves binary content and gives duplicate/unicode filenames safe unique paths',()=>{
 const files=[{name:'../Declaração.pdf',data:Buffer.from([0,1,255,99])},{name:'Declaração.pdf',data:Buffer.from('%PDF-QA')}];
 const entries=readStoredZip(Buffer.from(createDocumentZip(files)));
 assert.equal(entries.length,2);assert.notEqual(entries[0].name,entries[1].name);
 assert.ok(entries.every(e=>!e.name.includes('/')&&!e.name.includes('\\')&&e.name.includes('Declaração.pdf')));
 assert.deepEqual(entries.map(e=>e.data),files.map(f=>f.data));
 const portable=readStoredZip(Buffer.from(createDocumentZip([{name:'ab:c*?"<>|. ',data:Buffer.from('x')}]))) [0].name;
 assert.ok(!/[:*?"<>|]/.test(portable)&&!/[. ]$/.test(portable));
 assert.throws(()=>createDocumentZip([]));
});