import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { isolatedQaEnvironment } from '../scripts/qa-environment.mjs';

test('QA inherits only OS variables, dropping credentials and Node injection options', () => {
  const env = isolatedQaEnvironment({ Path: 'local-path', SystemRoot: 'windows', DATABASE_URL: 'private', SMTP_PASSWORD: 'private', OPENAI_API_KEY: 'private', NODE_OPTIONS: '--require=untrusted', PLATFORM_ADMIN_USER_ID: 'private', CUSTOM_SECRET: 'private' });
  assert.equal(env.Path, 'local-path');
  assert.equal(env.SystemRoot, 'windows');
  for (const key of ['DATABASE_URL', 'SMTP_PASSWORD', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'PLATFORM_ADMIN_USER_ID', 'CUSTOM_SECRET']) assert.equal(env[key], undefined);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.LICITARO_ISOLATED_QA, 'true');
});

function loadEnv(url, mode = 'test') {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', 'await import("./apps/api/src/env.ts"); if (process.env.SMTP_ENCRYPTION_KEY || process.env.PLATFORM_ADMIN_USER_ID) throw new Error("Private configuration loaded");'], {
    env: { ...isolatedQaEnvironment(), NODE_ENV: mode, DATABASE_URL: url }, encoding: 'utf8', windowsHide: true,
  });
}
test('QA rejects remote and non-disposable databases before loading .env', () => {
  for (const url of ['postgresql://qa:qa@remote.invalid/licitaro_qa_123', 'postgresql://qa:qa@127.0.0.1/real_database', '']) assert.notEqual(loadEnv(url).status, 0);
  assert.notEqual(loadEnv('postgresql://qa:qa@127.0.0.1/licitaro_qa_123', 'production').status, 0);
});
test('valid QA configuration does not load private .env', () => {
  const result = loadEnv('postgresql://qa:qa@127.0.0.1/licitaro_qa_123');
  assert.equal(result.status, 0, result.stderr);
});