import test from 'node:test';
import assert from 'node:assert/strict';
import {sortRadarCards} from '../apps/web/src/radar-order.ts';
test('loaded cards retain exact order across additional pages and highlighted records',()=>{
 const cards=[{stage:'A',boardPosition:'-1024',id:'first'},{stage:'A',boardPosition:'9007199254741505',id:'highlight'},{stage:'A',boardPosition:'1024',id:'page-two'},{stage:'A',boardPosition:'9007199254741504',id:'precise'}];
 assert.deepEqual(sortRadarCards(cards).map(card=>card.id),['first','page-two','precise','highlight']);
 assert.equal(cards[1].id,'highlight');
 assert.deepEqual(sortRadarCards([{stage:'A',boardPosition:'0',id:'b'},{stage:'A',boardPosition:'0',id:'a'}]).map(card=>card.id),['a','b']);
 assert.deepEqual(sortRadarCards([cards[0],{stage:'B',boardPosition:'0',id:'other-stage'},cards[1],cards[2],cards[3]]).filter(card=>card.stage==='A').map(card=>card.id),['first','page-two','precise','highlight']);
 assert.deepEqual(sortRadarCards([{stage:'A',id:'legacy-a'},{stage:'A',id:'legacy-b'}]).map(card=>card.id),['legacy-a','legacy-b']);
});
