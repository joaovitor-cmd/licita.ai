import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDestination} from '../apps/web/src/notification-destination.ts';
test('notification destinations preserve one opportunity and change tab',()=>{
 assert.equal(notificationDestination('/app/oportunidades/qa?tab=mudancas'),'/app/oportunidades/qa?tab=mudancas');
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(notificationDestination('/app/radar?highlight='+id),'/app/radar/'+id);
 assert.equal(notificationDestination('/app/radar/qa'),'/app/radar/qa');
 assert.equal(notificationDestination('https://external.invalid/app'),'/app/radar');
 assert.equal(notificationDestination('/application'),'/app/radar');
});