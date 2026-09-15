import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction, type Database } from "./db.js";
import {
  current,
  HttpError,
  hashPassword,
  opaqueToken,
  digest,
  clearSession,
  issueSession,
  rateLimit,
} from "./security.js";
import { email } from "./validation.js";
import { entitlements } from "./entitlements.js";
const name = z.string().trim().min(2).max(150),
  id = z.string().uuid();
export const plannedFeatures = [
  "discovery",
  "radar",
  "catalog",
  "documents",
  "analysis",
  "simulator",
  "digest",
  "changeAlerts",
  "commercialHistory",
] as const;
export function requirePlatform(req: any) {
  if (!current(req).isPlatformAdmin)
    throw new HttpError(403, "Área exclusiva da gestão da plataforma.");
}
async function audit(
  db: Database,
  org: string,
  actor: string,
  action: string,
  target: string,
) {
  await db.query(
    "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)",
    [org, actor, action, target],
  );
}
async function grant(
  db: Database,
  org: string,
  body: { email: string; name: string; role: "ADMIN" | "MEMBER" },
) {
  let user = await one("SELECT id FROM users WHERE email=$1", [body.email], db),
    activationUrl: string | null = null;
  if (!user) {
    user = { id: randomUUID() };
    await db.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [user.id, body.name, body.email, await hashPassword(opaqueToken())],
    );
    const token = opaqueToken();
    await db.query(
      "INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
      [digest(token), user.id],
    );
    activationUrl = `${process.env.APP_URL ?? "http://localhost:5173"}/redefinir-senha?token=${encodeURIComponent(token)}`;
  }
  const membership = await one(
    "SELECT active FROM members WHERE organization_id=$1 AND user_id=$2",
    [org, user.id],
    db,
  );
  if (membership)
    throw new HttpError(
      409,
      "Usuário já vinculado. Gerencie seu acesso na lista.",
    );
  await db.query(
    "INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,$3)",
    [org, user.id, body.role],
  );
  await db.query(
    "INSERT INTO members(organization_id,user_id,role) SELECT id,$2,$3 FROM organizations WHERE environment_id=$1 ON CONFLICT DO NOTHING",
    [org, user.id, body.role],
  );
  return { userId: user.id, activationUrl };
}
export function managementRoutes(router: Router) {
  router.get("/management/metrics", async (req, res) => {
    requirePlatform(req);
    const data = await one(
      `WITH env AS (SELECT * FROM organizations WHERE environment_id IS NULL AND NOT is_demo AND id<>$1),
  companies AS (SELECT o.* FROM organizations o JOIN env e ON e.id=coalesce(o.environment_id,o.id)),
  access AS (SELECT m.* FROM members m JOIN companies c ON c.id=m.organization_id)
  SELECT (SELECT count(*)::int FROM env) environments,(SELECT count(*)::int FROM env WHERE active) active_environments,
  (SELECT count(*)::int FROM env WHERE NOT active) blocked_environments,(SELECT count(*)::int FROM companies) companies,
  (SELECT count(DISTINCT user_id)::int FROM access) users,
  (SELECT count(DISTINCT user_id)::int FROM access WHERE last_access_at>=now()-interval '7 days') users_7d,
  (SELECT count(*)::int FROM trackings t JOIN companies c ON c.id=t.organization_id) tracked,
  (SELECT count(*)::int FROM catalog t JOIN companies c ON c.id=t.organization_id) catalog_items,
  (SELECT count(*)::int FROM simulations t JOIN companies c ON c.id=t.organization_id) simulations,
  (SELECT count(*)::int FROM email_deliveries t JOIN companies c ON c.id=t.organization_id WHERE t.status='SENT' AND t.created_at>=now()-interval '30 days') emails_30d,
  coalesce((SELECT jsonb_agg(p) FROM(SELECT cp.name,count(e.id)::int environments FROM commercial_plans cp LEFT JOIN env e ON e.plan_code=cp.code GROUP BY cp.code,cp.name ORDER BY cp.name)p),'[]') plans`,
      [current(req).organization.id],
    );
    res.json(data);
  });
  router.post("/management/environments/:id/companies", async (req, res) => {
    requirePlatform(req);
    const root = id.parse(req.params.id),
      b = z
        .object({ name, taxId: z.string().max(30).default("") })
        .strict()
        .parse(req.body);
    const child = await transaction(async (db) => {
      const e = await one(
        "SELECT * FROM organizations WHERE id=$1 AND environment_id IS NULL AND active AND NOT is_demo FOR UPDATE",
        [root],
        db,
      );
      if (!e) throw new HttpError(404, "Ambiente ativo não encontrado.");
      const p = await one(
        "SELECT * FROM commercial_plans WHERE code=$1 FOR SHARE",
        [e.plan_code],
        db,
      );
      const count = await one(
        "SELECT count(*)::int n FROM organizations WHERE (id=$1 OR environment_id=$1) AND active",
        [root],
        db,
      );
      if (count.n >= p.max_companies)
        throw new HttpError(403, "O limite de empresas do plano foi atingido.");
      const childId = randomUUID();
      await db.query(
        "INSERT INTO organizations(id,name,tax_id,environment_id,plan_code) VALUES($1,$2,$3,$4,$5)",
        [childId, b.name, b.taxId || null, root, e.plan_code],
      );
      await db.query(
        "INSERT INTO members(organization_id,user_id,role) SELECT $1,user_id,role FROM members WHERE organization_id=$2 AND active",
        [childId, root],
      );
      await audit(
        db,
        root,
        current(req).user.id,
        "ENVIRONMENT_COMPANY_CREATED",
        childId,
      );
      return { id: childId };
    });
    res.status(201).json(child);
  });
  router.get("/entitlements", async (req, res) =>
    res.json(await entitlements(current(req).organization.id)),
  );
  router.patch('/management/environments/:id/companies/:childId',async(req,res)=>{
    requirePlatform(req);
    const root=id.parse(req.params.id),child=id.parse(req.params.childId),b=z.object({active:z.boolean()}).strict().parse(req.body);
    await transaction(async db=>{
      const e=await one('SELECT * FROM organizations WHERE id=$1 AND environment_id IS NULL AND NOT is_demo FOR UPDATE',[root],db);
      if(!e)throw new HttpError(404,'Ambiente não encontrado.');
      const c=await one('SELECT * FROM organizations WHERE id=$1 AND environment_id=$2 FOR UPDATE',[child,root],db);
      if(!c)throw new HttpError(404,'Empresa vinculada não encontrada.');
      const p=await one('SELECT * FROM commercial_plans WHERE code=$1 FOR SHARE',[e.plan_code],db);
      if(b.active&&!c.active){
        const count=await one('SELECT count(*)::int n FROM organizations WHERE (id=$1 OR environment_id=$1) AND (active OR id=$1)',[root],db);
        if(count.n>=p.max_companies)throw new HttpError(409,'O limite de empresas do plano foi atingido.');
      }
      await db.query('UPDATE organizations SET active=$1,access_revision=access_revision+1,updated_at=now() WHERE id=$2',[b.active,child]);
      if(!b.active){
        await db.query('DELETE FROM sessions WHERE organization_id=$1',[child]);
        await db.query("UPDATE email_deliveries SET status='CANCELLED',last_error='Empresa inativada pela gestão.',updated_at=now() WHERE organization_id=$1 AND status IN ('PENDING','BLOCKED')",[child]);
      }
      await audit(db,root,current(req).user.id,b.active?'ENVIRONMENT_COMPANY_REACTIVATED':'ENVIRONMENT_COMPANY_SUSPENDED',child);
    });res.json({ok:true});
  });
  router.get("/workspaces", async (req, res) => {
    const auth = current(req),
      plan = await entitlements(auth.organization.id);
    res.json(
      await rows(
        "SELECT o.id,o.name,m.role FROM members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active AND o.active AND coalesce(o.environment_id,o.id)=$2 AND ($3::boolean OR o.id=$4) ORDER BY o.name,o.id",
        [
          auth.user.id,
          plan.environment_id,
          plan.multiCompany,
          auth.organization.id,
        ],
      ),
    );
  });
  router.post(
    "/workspaces/switch",
    rateLimit("switch-workspace", 30, 60000),
    async (req, res) => {
      const org = id.parse(req.body.organizationId),
        auth = current(req);
      const plan = await entitlements(auth.organization.id);
      if (!plan.multiCompany)
        throw new HttpError(403, "Seu plano permite somente uma empresa.");
      const allowed = await one(
        "SELECT o.id FROM organizations o JOIN members m ON m.organization_id=o.id WHERE o.id=$1 AND m.user_id=$2 AND m.active AND o.active AND coalesce(o.environment_id,o.id)=$3",
        [org, auth.user.id, plan.environment_id],
      );
      if (!allowed)
        throw new HttpError(403, "Você não tem acesso ativo a esta empresa.");
      await clearSession(req, res);
      await issueSession(res, auth.user.id, org);
      res.json({ ok: true });
    },
  );
  router.get("/management/plans", async (req, res) => {
    requirePlatform(req);
    res.json({
      plans: await rows("SELECT * FROM commercial_plans ORDER BY code"),
      features: plannedFeatures,
      enforced: true,
    });
  });
  router.put("/management/plans/:code", async (req, res) => {
    requirePlatform(req);
    const b = z
      .object({
        name,
        description: z.string().max(1000),
        plannedFeatures: z.array(z.enum(plannedFeatures)).max(9),
        revision: z.number().int().positive(),
        maxCompanies: z.number().int().min(1).max(100),
        enforceFeatures: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const plan = await transaction(async (db) => {
      await db.query(
        "SELECT code FROM commercial_plans WHERE code=$1 FOR UPDATE",
        [req.params.code],
      );
      if (
        await one(
          "SELECT e.id FROM organizations e WHERE e.environment_id IS NULL AND e.plan_code=$1 AND (SELECT count(*) FROM organizations c WHERE (c.id=e.id OR c.environment_id=e.id) AND c.active)>$2 LIMIT 1",
          [req.params.code, b.maxCompanies],
          db,
        )
      )
        throw new HttpError(
          409,
          "Há ambientes com mais empresas ativas que este limite. Ajuste os ambientes antes de reduzir.",
        );
      const updated = await one(
        "UPDATE commercial_plans SET name=$1,description=$2,planned_features=$3,max_companies=$6,enforce_features=$7,revision=revision+1 WHERE code=$4 AND revision=$5 RETURNING *",
        [
          b.name,
          b.description,
          JSON.stringify([...new Set(b.plannedFeatures)]),
          req.params.code,
          b.revision,
          b.maxCompanies,
          b.enforceFeatures,
        ],
        db,
      );
      await audit(
        db,
        current(req).organization.id,
        current(req).user.id,
        "PLAN_UPDATED",
        String(req.params.code),
      );
      return updated;
    });
    if (!plan)
      throw new HttpError(409, "Plano alterado ou inexistente. Recarregue.");
    res.json(plan);
  });
  router.get("/management/companies", async (req, res) => {
    requirePlatform(req);
    const q = z
      .object({
        q: z.string().max(150).default(""),
        archived: z.enum(['true','false']).default('false'),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(req.query);
    const data = await one(
      `WITH filtered AS MATERIALIZED(SELECT o.id,o.name,o.tax_id,o.active,o.plan_code,o.access_revision,o.created_at,o.archived_at,p.name plan_name FROM organizations o JOIN commercial_plans p ON p.code=o.plan_code WHERE NOT o.is_demo AND o.environment_id IS NULL AND o.id<>$3 AND (o.archived_at IS NOT NULL)=$4::boolean AND (position(lower($1) in lower(o.name))>0 OR (regexp_replace(lower($1),'[^a-z0-9]','','g')<>'' AND position(regexp_replace(lower($1),'[^a-z0-9]','','g') in regexp_replace(lower(coalesce(o.tax_id,'')),'[^a-z0-9]','','g'))>0)))
   SELECT (SELECT count(*)::int FROM filtered) total,coalesce((SELECT jsonb_agg(t) FROM(SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT 20 OFFSET $2)t),'[]') items`,
      [q.q, (q.page - 1) * 20,current(req).organization.id,q.archived==='true'],
    );
    res.json({
      ...data,
      page: q.page,
      pages: Math.max(1, Math.ceil(data.total / 20)),
    });
  });
  router.post(
    "/management/companies",
    rateLimit("provision-company", 10, 60000),
    async (req, res) => {
      requirePlatform(req);
      const b = z
        .object({
          name,
          taxId: z.string().max(30).default(""),
          planCode: z.string().max(30),
          ownerName: name,
          ownerEmail: email,
        })
        .strict()
        .parse(req.body);
      const result = await transaction(async (db) => {
        if (
          !(await one(
            "SELECT code FROM commercial_plans WHERE code=$1",
            [b.planCode],
            db,
          ))
        )
          throw new HttpError(400, "Plano inválido.");
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `grant:${b.ownerEmail}`,
        ]);
        const org = randomUUID();
        await db.query(
          "INSERT INTO organizations(id,name,tax_id,plan_code) VALUES($1,$2,$3,$4)",
          [org, b.name, b.taxId || null, b.planCode],
        );
        const access = await grant(db, org, {
          name: b.ownerName,
          email: b.ownerEmail,
          role: "ADMIN",
        });
        await audit(db, org, current(req).user.id, "COMPANY_CREATED", org);
        return { id: org, ...access };
      });
      res.status(201).json(result);
    },
  );
  router.get("/management/companies/:id", async (req, res) => {
    requirePlatform(req);
    const org = id.parse(req.params.id),
      company = await one(
        "SELECT id,name,tax_id,active,plan_code,access_revision,archived_at FROM organizations WHERE id=$1 AND NOT is_demo",
        [org],
      );
    if (!company) throw new HttpError(404, "Empresa não encontrada.");
    res.json({
      company,
      entitlements: await entitlements(org),
      companies: await rows(
        "SELECT id,name,active FROM organizations WHERE id=$1 OR environment_id=$1 ORDER BY created_at,id",
        [org],
      ),
      members: await rows(
        "SELECT u.id,u.name,u.email,m.role,m.active FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name",
        [org],
      ),
      audit: await rows(
        "SELECT action,target,occurred_at FROM audit_logs WHERE organization_id=$1 ORDER BY occurred_at DESC LIMIT 20",
        [org],
      ),
    });
  });
  router.patch("/management/companies/:id", async (req, res) => {
    requirePlatform(req);
    const org = id.parse(req.params.id),
      b = z
        .object({
          name,
          active: z.boolean(),
          planCode: z.string().max(30),
          revision: z.number().int().positive(),
          taxId: z.string().max(30).optional(),
        })
        .strict()
        .parse(req.body),
      auth = current(req);
    if (!b.active && org === auth.organization.id)
      throw new HttpError(
        400,
        "Mantenha ativa a empresa usada para administrar a plataforma.",
      );
    await transaction(async (db) => {
      const plan = await one(
        "SELECT * FROM commercial_plans WHERE code=$1 FOR SHARE",
        [b.planCode],
        db,
      );
      if (!plan) throw new HttpError(400, "Plano inválido.");
      const owned = await one(
        "SELECT environment_id,archived_at,tax_id FROM organizations WHERE id=$1 FOR UPDATE",
        [org],
        db,
      );
      if (!owned) throw new HttpError(404, "Ambiente não encontrado.");
      if(owned.archived_at)throw new HttpError(409,'Restaure o ambiente arquivado antes de editar.');
      if (
        !owned.environment_id &&
        b.active &&
        (
          await one(
            "SELECT count(*)::int n FROM organizations WHERE (id=$1 OR environment_id=$1) AND (active OR id=$1)",
            [org],
            db,
          )
        ).n > plan.max_companies
      )
        throw new HttpError(
          409,
          "Este plano não comporta as empresas ativas do ambiente.",
        );
      const changed = await one(
        "UPDATE organizations SET name=$1,active=$2,plan_code=$3,tax_id=$6,access_revision=access_revision+1,updated_at=now() WHERE id=$4 AND access_revision=$5 AND NOT is_demo AND environment_id IS NULL RETURNING id",
        [b.name, b.active, b.planCode, org, b.revision,b.taxId===undefined?owned.tax_id:b.taxId||null],
        db,
      );
      if (!changed)
        throw new HttpError(
          409,
          "Empresa alterada ou inexistente. Recarregue.",
        );
      if (!b.active) {
        await db.query(
          "DELETE FROM sessions WHERE organization_id IN(SELECT id FROM organizations WHERE id=$1 OR environment_id=$1)",
          [org],
        );
        await db.query(
          "UPDATE email_deliveries SET status='CANCELLED',last_error='Ambiente inativado pela gestão.',updated_at=now() WHERE organization_id IN(SELECT id FROM organizations WHERE id=$1 OR environment_id=$1) AND status IN ('PENDING','BLOCKED')",
          [org],
        );
      }
      await audit(
        db,
        org,
        auth.user.id,
        b.active ? "COMPANY_UPDATED_ACTIVE" : "COMPANY_SUSPENDED",
        org,
      );
    });
    res.json({ ok: true });
  });
  router.delete('/management/companies/:id',async(req,res)=>{
    requirePlatform(req);const org=id.parse(req.params.id),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body);
    if(org===current(req).organization.id)throw new HttpError(400,'O ambiente da gestão não pode ser excluído.');
    await transaction(async db=>{
      const e=await one('SELECT id FROM organizations WHERE id=$1 AND environment_id IS NULL AND NOT is_demo AND archived_at IS NULL AND access_revision=$2 FOR UPDATE',[org,b.revision],db);
      if(!e)throw new HttpError(409,'Ambiente alterado ou já arquivado. Recarregue.');
      await db.query('UPDATE organizations SET archived_at=now(),active=false,access_revision=access_revision+1,updated_at=now() WHERE id=$1',[org]);
      await db.query('DELETE FROM sessions WHERE organization_id IN(SELECT id FROM organizations WHERE id=$1 OR environment_id=$1)',[org]);
      await db.query("UPDATE email_deliveries SET status='CANCELLED',last_error='Ambiente arquivado pela gestão.',updated_at=now() WHERE organization_id IN(SELECT id FROM organizations WHERE id=$1 OR environment_id=$1) AND status IN ('PENDING','BLOCKED')",[org]);
      await audit(db,org,current(req).user.id,'ENVIRONMENT_ARCHIVED',org);
    });res.json({ok:true,recoverable:true});
  });
  router.post('/management/companies/:id/restore',async(req,res)=>{
    requirePlatform(req);const org=id.parse(req.params.id),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body);
    await transaction(async db=>{
      const e=await one('UPDATE organizations SET archived_at=NULL,active=false,access_revision=access_revision+1,updated_at=now() WHERE id=$1 AND environment_id IS NULL AND NOT is_demo AND archived_at IS NOT NULL AND access_revision=$2 RETURNING id',[org,b.revision],db);
      if(!e)throw new HttpError(409,'Ambiente alterado ou não arquivado. Recarregue.');
      await audit(db,org,current(req).user.id,'ENVIRONMENT_RESTORED_BLOCKED',org);
    });res.json({ok:true});
  });
  router.post("/management/companies/:id/members", async (req, res) => {
    requirePlatform(req);
    const org = id.parse(req.params.id),
      b = z
        .object({ name, email, role: z.enum(["ADMIN", "MEMBER"]) })
        .strict()
        .parse(req.body);
    const result = await transaction(async (db) => {
      if (
        !(await one(
          "SELECT id FROM organizations WHERE id=$1 AND NOT is_demo",
          [org],
          db,
        ))
      )
        throw new HttpError(404, "Empresa não encontrada.");
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `grant:${b.email}`,
      ]);
      const access = await grant(db, org, b);
      await audit(
        db,
        org,
        current(req).user.id,
        "MEMBER_GRANTED",
        access.userId,
      );
      return access;
    });
    res.status(201).json(result);
  });
  router.patch(
    "/management/companies/:id/members/:userId",
    async (req, res) => {
      requirePlatform(req);
      const org = id.parse(req.params.id),
        user = id.parse(req.params.userId),
        b = z
          .object({ active: z.boolean(), role: z.enum(["ADMIN", "MEMBER"]) })
          .strict()
          .parse(req.body);
      if (user === current(req).user.id && !b.active)
        throw new HttpError(
          400,
          "Você não pode inativar seu próprio acesso de gestão.",
        );
      await transaction(async (db) => {
        const m = await one(
          "UPDATE members SET active=$1,role=$2 WHERE organization_id IN(SELECT id FROM organizations WHERE id=$3 OR environment_id=$3) AND user_id=$4 RETURNING user_id",
          [b.active, b.role, org, user],
          db,
        );
        if (!m) throw new HttpError(404, "Acesso não encontrado.");
        await db.query(
          "DELETE FROM sessions WHERE organization_id IN(SELECT id FROM organizations WHERE id=$1 OR environment_id=$1) AND user_id=$2",
          [org, user],
        );
        await audit(
          db,
          org,
          current(req).user.id,
          b.active ? "MEMBER_ACTIVATED" : "MEMBER_SUSPENDED",
          user,
        );
      });
      res.json({ ok: true });
    },
  );
}
