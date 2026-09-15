import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { migrate, one, pool } from '../apps/api/src/db.js';
import { authRouter } from '../apps/api/src/auth.js';
import { router } from '../apps/api/src/routes.js';
import { digest, hashPassword, opaqueToken, requireSession, session } from '../apps/api/src/security.js';
import { createConsoleApp } from '../apps/api/src/console-server.js';

type Result = { status: number; data: any; setCookies: string[] };
const consoleOrigin = 'http://localhost:5174';

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, base: `http://127.0.0.1:${address.port}/api` };
}

function client(base: string, defaultOrigin?: string) {
  let cookie = '';
  return {
    cookie: () => cookie,
    call: async (path: string, method = 'GET', body?: unknown, expected: number | number[] = 200,
      options: { cookie?: string; origin?: string | null } = {}): Promise<Result> => {
      const origin = options.origin === undefined ? defaultOrigin : options.origin;
      const response = await fetch(base + path, {
        method,
        headers: {
          Cookie: options.cookie ?? cookie,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(origin ? { Origin: origin } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookies = response.headers.getSetCookie();
      if (options.cookie === undefined && setCookies.length) cookie = setCookies.at(-1)!.split(';')[0];
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      const accepted = Array.isArray(expected) ? expected : [expected];
      assert.ok(accepted.includes(response.status), `${method} ${path}: expected ${accepted.join('/')}, got ${response.status}: ${JSON.stringify(data)}`);
      return { status: response.status, data, setCookies };
    },
  };
}

test('console independente: cookies, credenciais, origens, permissões e revogação', { timeout: 120_000 }, async () => {
  const suffix = randomUUID();
  const organization = randomUUID(), userId = randomUUID();
  const organizations = [organization];
  const ownerId = randomUUID(), adminId = randomUUID(), viewerId = randomUUID();
  const identities = [ownerId, adminId, viewerId];
  const publicEmail = `qa-console-owner-${suffix}@example.invalid`;
  const clientPassword = `Cliente!-${randomUUID()}`;
  const consolePassword = `Console!-${randomUUID()}`;
  const adminEmail = `qa-console-admin-${suffix}@example.invalid`;
  const viewerEmail = `qa-console-viewer-${suffix}@example.invalid`;
  const servers: Server[] = [];
  try {
    await migrate();
    await pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)', [organization, `QA console ${suffix}`]);
    await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [userId, 'Cliente QA', publicEmail, await hashPassword(clientPassword)]);
    await pool.query("INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')", [organization, userId]);
    const passwordHash = await hashPassword(consolePassword);
    for (const [id, name, email, role] of [
      [ownerId, 'Proprietário QA', publicEmail, 'OWNER'],
      [adminId, 'Administrador QA', adminEmail, 'ADMIN'],
      [viewerId, 'Consulta QA', viewerEmail, 'VIEWER'],
    ]) {
      await pool.query('INSERT INTO console_admins(id,name,email,password_hash,role,active,organization_id) VALUES($1,$2,$3,$4,$5,true,$6)', [id, name, email, passwordHash, role, organization]);
    }

    // Two independently built HTTP applications, using the real middleware and routes.
    const publicApp = express();
    publicApp.use(express.json(), cookieParser(), session);
    publicApp.use('/api/auth', authRouter);
    publicApp.use('/api', requireSession, router);
    publicApp.use((_req, res) => res.status(404).json({ error: 'Não encontrado.' }));
    publicApp.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 400).json({ error: error.message }));
    const publicRuntime = await listen(publicApp); servers.push(publicRuntime.server);
    const consoleRuntime = await listen(createConsoleApp()); servers.push(consoleRuntime.server);
    const customer = client(publicRuntime.base);
    const owner = client(consoleRuntime.base, consoleOrigin);
    const admin = client(consoleRuntime.base, consoleOrigin);
    const viewer = client(consoleRuntime.base, consoleOrigin);

    const publicLogin = await customer.call('/auth/login', 'POST', { email: publicEmail, password: clientPassword });
    // Staging validates the new console before removing the old entry point, avoiding owner lockout.
    // The final acceptance run must omit CONSOLE_STAGING and prove that public management is gone.
    if (process.env.CONSOLE_STAGING !== '1') {
      assert.notEqual(publicLogin.data.isPlatformAdmin, true, 'Sessão de cliente nunca concede privilégio global');
      await customer.call('/management/companies', 'GET', undefined, 404);
      await customer.call('/admin', 'GET', undefined, 404);
      await customer.call('/console-auth/login', 'POST', { email: publicEmail, password: consolePassword }, 404);
    }

    // Same email, intentionally different passwords: public recovery/login cannot become console access.
    await owner.call('/console-auth/login', 'POST', { email: publicEmail, password: clientPassword }, 401);
    await owner.call('/console-auth/me', 'GET', undefined, 401, { cookie: customer.cookie() });
    await owner.call('/console-auth/me', 'GET', undefined, 401, { cookie: `licitaro_console_session=${customer.cookie().split('=')[1]}` });
    const consoleLogin = await owner.call('/console-auth/login', 'POST', { email: publicEmail, password: consolePassword });
    assert.ok(consoleLogin.setCookies.some(value => /^licitaro_console_session=/.test(value) && /httponly/i.test(value)), 'Cookie administrativo independente e inacessível ao JavaScript');
    assert.ok(!consoleLogin.setCookies.some(value => /^licita_v2_session=/.test(value)), 'Console não cria cookie cliente');
    await customer.call('/auth/me', 'GET', undefined, 401, { cookie: owner.cookie() });
    await customer.call('/auth/me', 'GET', undefined, 401, { cookie: `licita_v2_session=${owner.cookie().split('=')[1]}` });
    await owner.call('/console-auth/me');

    await owner.call('/management/admins', 'POST', { name: 'Origem inválida', email: `wrong-origin-${suffix}@example.invalid`, role: 'VIEWER' }, 403, { origin: 'http://localhost:5173' });
    await owner.call('/console-auth/logout', 'POST', {}, 403, { origin: null });
    await owner.call('/console-auth/me');
    await admin.call('/console-auth/login', 'POST', { email: adminEmail, password: consolePassword });
    await viewer.call('/console-auth/login', 'POST', { email: viewerEmail, password: consolePassword });
    await viewer.call('/management/metrics');
    await viewer.call('/management/companies');
    await viewer.call('/management/plans');
    await viewer.call('/management/companies', 'POST', {}, 403);
    await viewer.call('/management/plans/initial', 'PUT', {}, 403);
    await viewer.call(`/management/companies/${organization}`, 'PATCH', {}, 403);
    await viewer.call(`/management/companies/${organization}`, 'DELETE', {}, 403);
    await viewer.call('/management/admins', 'GET', undefined, 403);
    await admin.call('/management/admins', 'GET', undefined, 403);
    await admin.call('/management/admins', 'POST', { name: 'Acesso negado', email: `denied-${suffix}@example.invalid`, role: 'VIEWER' }, 403);
    const listing = await owner.call('/management/admins');
    assert.ok(!JSON.stringify(listing.data).includes('password_hash'), 'Listagem não expõe hashes de senha');
    await owner.call(`/management/admins/${ownerId}`, 'PATCH', { active: false, role: 'ADMIN' }, [400, 403, 409]);
    await owner.call('/console-auth/me');

    const invitation = await owner.call('/management/admins', 'POST', { name: 'Convidado QA', email: `qa-console-invite-${suffix}@example.invalid`, role: 'VIEWER' }, 201);
    assert.ok(invitation.data.id && invitation.data.activationUrl);
    identities.push(invitation.data.id);
    const inviteToken = new URL(invitation.data.activationUrl).searchParams.get('token');
    assert.ok(inviteToken);
    await customer.call('/auth/reset-password', 'POST', { token: inviteToken, password: clientPassword }, 400);
    const publicResetToken = opaqueToken();
    await pool.query("INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [digest(publicResetToken), userId]);
    const guest = client(consoleRuntime.base, consoleOrigin);
    await guest.call('/console-auth/activate', 'POST', { token: publicResetToken, password: consolePassword }, 400);
    await guest.call('/console-auth/activate', 'POST', { token: inviteToken, password: consolePassword });
    await guest.call('/console-auth/activate', 'POST', { token: inviteToken, password: consolePassword }, 400);
    await guest.call('/console-auth/login', 'POST', { email: `qa-console-invite-${suffix}@example.invalid`, password: consolePassword });
    await owner.call(`/management/admins/${invitation.data.id}`, 'PATCH', { active: false, role: 'VIEWER' });
    await guest.call('/console-auth/me', 'GET', undefined, 401);
    await guest.call('/console-auth/login', 'POST', { email: `qa-console-invite-${suffix}@example.invalid`, password: consolePassword }, 401);

    // Role changes take effect for an existing administrative cookie, not just after another login.
    await owner.call(`/management/admins/${adminId}`, 'PATCH', { active: true, role: 'VIEWER' });
    await admin.call('/management/companies', 'POST', {}, [401, 403]);
    await admin.call('/console-auth/login', 'POST', { email: adminEmail, password: consolePassword });
    await admin.call('/management/companies', 'POST', {}, 403);

    const environmentName = `QA arquivamento ${suffix}`;
    const environment = await owner.call('/management/companies', 'POST', {
      name: environmentName, taxId: '00123456000100', planCode: 'complete',
      ownerName: 'Cliente QA', ownerEmail: publicEmail,
    }, 201);
    const environmentId = environment.data.id;
    organizations.push(environmentId);
    const environmentSession = opaqueToken(), catalogId = randomUUID();
    await pool.query("INSERT INTO sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [digest(environmentSession), userId, environmentId]);
    await pool.query("INSERT INTO catalog(id,organization_id,type,name) VALUES($1,$2,'SERVICE','Registro a preservar')", [catalogId, environmentId]);
    const environmentCookie = `licita_v2_session=${environmentSession}`;
    await customer.call('/auth/me', 'GET', undefined, 200, { cookie: environmentCookie });
    const archived = await owner.call(`/management/companies/${environmentId}`, 'DELETE', { revision: 1 });
    assert.equal(archived.data.recoverable, true);
    await customer.call('/auth/me', 'GET', undefined, 401, { cookie: environmentCookie });
    const normalList = await owner.call(`/management/companies?q=${encodeURIComponent(environmentName)}`);
    assert.ok(!normalList.data.items.some((item: any) => item.id === environmentId));
    const archivedList = await owner.call(`/management/companies?archived=true&q=${encodeURIComponent(environmentName)}`);
    assert.ok(archivedList.data.items.some((item: any) => item.id === environmentId));
    await owner.call(`/management/companies/${environmentId}`, 'PATCH', { name: environmentName, active: true, planCode: 'complete', revision: 2 }, 409);
    await owner.call(`/management/companies/${environmentId}/restore`, 'POST', { revision: 1 }, 409);
    await owner.call(`/management/companies/${environmentId}/restore`, 'POST', { revision: 2 });
    const restored = await owner.call(`/management/companies/${environmentId}`);
    assert.equal(restored.data.company.archived_at, null);
    assert.equal(restored.data.company.active, false, 'Restaurar não libera o cliente sem uma decisão explícita');
    assert.ok(await one('SELECT id FROM catalog WHERE id=$1 AND organization_id=$2', [catalogId, environmentId]), 'Arquivar e restaurar preserva os dados comerciais');
    await owner.call(`/management/companies/${environmentId}`, 'PATCH', { name: environmentName, taxId: '11222333000181', active: true, planCode: 'complete', revision: 3 });
    const edited = await owner.call(`/management/companies/${environmentId}`);
    assert.equal(edited.data.company.tax_id, '11222333000181');
    assert.equal(edited.data.company.active, true);

    // Blocking the customer environment must not lock the independent console administrator out.
    await pool.query('UPDATE organizations SET active=false WHERE id=$1', [organization]);
    await customer.call('/auth/me', 'GET', undefined, 401);
    await owner.call('/console-auth/me');
    assert.ok(await one('SELECT id FROM console_admins WHERE id=$1 AND active', [ownerId]));
    const oldConsoleCookie = owner.cookie();
    await owner.call('/console-auth/logout', 'POST', {});
    await owner.call('/console-auth/me', 'GET', undefined, 401, { cookie: oldConsoleCookie });
  } finally {
    for (const server of servers) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query('DELETE FROM console_invites WHERE admin_id=ANY($1::uuid[])', [identities]);
    await pool.query('DELETE FROM console_sessions WHERE admin_id=ANY($1::uuid[])', [identities]);
    await pool.query('DELETE FROM console_admins WHERE id=ANY($1::uuid[])', [identities]);
    for (const id of organizations.reverse()) {
      await pool.query('DELETE FROM audit_logs WHERE organization_id=$1', [id]);
      await pool.query('DELETE FROM organizations WHERE id=$1', [id]);
    }
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    await pool.end();
  }
});
