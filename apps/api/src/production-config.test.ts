import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseSecurity,trustedProxyHops} from './production-config.js';
test('produção exige TLS verificado; configuração local permanece compatível',()=>{
 assert.deepEqual(databaseSecurity({}),{max:12});
 assert.throws(()=>databaseSecurity({NODE_ENV:'production'}));
 assert.deepEqual(databaseSecurity({NODE_ENV:'production',DATABASE_SSL:'true',DATABASE_POOL_MAX:'6'}),{max:6,ssl:{rejectUnauthorized:true}});
 assert.throws(()=>databaseSecurity({DATABASE_SSL:'true',DATABASE_URL:'postgresql://u:p@host/db?sslmode=no-verify'}));
 assert.throws(()=>databaseSecurity({DATABASE_POOL_MAX:'1'}));
 assert.equal(trustedProxyHops({}),0);assert.equal(trustedProxyHops({TRUST_PROXY_HOPS:'1'}),1);assert.throws(()=>trustedProxyHops({TRUST_PROXY_HOPS:'true'}));
});
