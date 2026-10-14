// Read-only: never loads .env, dependencies, application modules or services.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const errors = [];
const major = Number(process.versions.node.split('.')[0]);
console.log(`Node ${process.versions.node}`);
if (major < 24) errors.push('Node 24+ required.');
for (const path of ['package.json', 'package-lock.json', 'AGENTS.md', 'docs/AGENTES.md', 'apps/api/package.json', 'apps/web/package.json', 'apps/console/package.json', 'scripts/qa-workflow.mjs', 'tests/onboarding-search-api.mjs']) {
  if (!existsSync(join(root, path))) errors.push(`Missing: ${path}`);
}
if (existsSync(join(root, 'package.json'))) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const workspace of ['apps/api', 'apps/web', 'apps/console']) {
      if (!pkg.workspaces?.includes(workspace)) errors.push(`Missing workspace: ${workspace}`);
    }
    if (!pkg.scripts?.typecheck) errors.push('Missing typecheck script.');
  } catch { errors.push('Cannot parse root package.json.'); }
}
console.log(`Dependencies directory: ${existsSync(join(root, 'node_modules')) ? 'present; integrity not checked' : 'missing'}`);
console.log('Database, credentials, network and services: not accessed.');
console.log('Preflight does not validate npm, test safety, CI or branch protection.');
for (const error of errors) console.error(error);
process.exitCode = errors.length ? 1 : 0;
console.log(errors.length ? 'Preflight failed.' : 'Read-only preflight passed.');