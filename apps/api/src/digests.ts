import { randomUUID } from "node:crypto";
import {entitlements} from './entitlements.js';
import type { Router } from "express";
import { z } from "zod";
import { one, rows, transaction, type Database } from "./db.js";
import { current, requireAdmin, HttpError, rateLimit } from "./security.js";
import { companyEmailConfigured } from "./smtp-settings.js";
import { enqueueEmail } from "./email-queue.js";
import { defaultProfile, scoreOpportunity } from "./scoring.js";
import {
  brazilClock,
  digestSchema,
  digestText,
  type DigestItem,
} from "./digest-rules.js";
const MAX_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export async function collectDigest(
  org: any,
  settings: any,
  now: Date,
  db: Database,
) {
  const candidates = await rows(
    `SELECT id,title,description,agency,state,city,modality,value,closes_at,created_at::text created_cursor FROM opportunities
  WHERE ${org.is_demo ? "demo_org_id=$1" : "demo_org_id IS NULL AND $1::uuid IS NOT NULL"} AND (created_at,id)>($2::timestamptz,$3::uuid) AND created_at<=$4
  ORDER BY created_at,id LIMIT 2001`,
    [org.id, settings.cursor_text, settings.cursor_id, now],
    db,
  );
  const batch = candidates.slice(0, 2000),
    offerings = await rows(
      "SELECT name,keywords,active FROM catalog WHERE organization_id=$1 AND active=true",
      [org.id],
      db,
    );
  const items: DigestItem[] = [];
  for (const o of batch) {
    if (o.closes_at && new Date(o.closes_at).getTime() <= now.getTime())
      continue;
    const score = scoreOpportunity(
      o,
      { ...defaultProfile, ...org.profile },
      offerings,
    );
    if (!score.excluded && score.score >= (org.preferences.minScore ?? 60))
      items.push({
        id: o.id,
        title: o.title,
        agency: o.agency,
        state: o.state,
        score: score.score,
      });
  }
  items.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const last = batch.at(-1);
  return {
    items,
    scanned: batch.length,
    remaining: candidates.length > 2000,
    cursorAt: last?.created_cursor ?? settings.cursor_text,
    cursorId: last?.id ?? settings.cursor_id,
  };
}
export async function generateDigest(orgId: string, now = new Date()) {
  return transaction((db) => generateDigestInTransaction(orgId, now, db));
}
// Shared transaction boundary also permits rollback-only integration tests, without queuing real mail.
export async function generateDigestInTransaction(
  orgId: string,
  now: Date,
  db: Database,
) {
  const plan = await entitlements(orgId,db);
  if(!plan.active || !plan.features.includes('digest')) return null;
  const settings = await one(
    "SELECT *,cursor_at::text cursor_text FROM digest_settings WHERE organization_id=$1 FOR UPDATE",
    [orgId],
    db,
  );
  const org = await one(
      "SELECT id,is_demo,preferences,profile,active FROM organizations WHERE id=$1",
      [orgId],
      db,
    ),
    clock = brazilClock(now);
  if (
    !settings?.enabled ||
    !org ||
    org.is_demo ||
    org.active===false ||
    !org.preferences.email ||
    clock.time < settings.send_time
  )
    return null;
  if (
    await one(
      "SELECT id FROM digest_runs WHERE organization_id=$1 AND run_day=$2",
      [orgId, clock.day],
      db,
    )
  )
    return null;
  const recipients = await rows(
    `SELECT u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='ADMIN' AND ($2::jsonb='[]'::jsonb OR $2::jsonb ? m.user_id::text)`,
    [orgId, JSON.stringify(settings.recipient_ids)],
    db,
  );
  if (!recipients.length) return null;
  const result = await collectDigest(org, settings, now, db),
    id = randomUUID();
  await db.query(
    "INSERT INTO digest_runs(id,organization_id,run_day,items,scanned,remaining) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      orgId,
      clock.day,
      JSON.stringify(result.items),
      result.scanned,
      result.remaining,
    ],
  );
  await db.query(
    "UPDATE digest_settings SET cursor_at=$1,cursor_id=$2 WHERE organization_id=$3",
    [result.cursorAt, result.cursorId, orgId],
  );
  if (result.items.length) {
    const notification = randomUUID(),
      url = `/app/boletins/${id}`,
      title = `Licitaro: ${result.items.length} oportunidades no boletim diário`;
    await db.query(
      "INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        notification,
        orgId,
        title,
        `Boletim de ${clock.day}. Aderência calculada com o perfil atual; confira as condições oficiais.`,
        url,
        `digest:${clock.day}`,
        !org.preferences.inApp,
      ],
    );
    for (const r of recipients)
      await enqueueEmail(
        db,
        orgId,
        notification,
        r.email,
        title,
        digestText(
          result.items,
          clock.day,
          `${process.env.APP_URL ?? "http://localhost:5173"}${url}`,
          result.remaining,
        ),
        "DIGEST",
      );
  }
  return {
    id,
    count: result.items.length,
    scanned: result.scanned,
    remaining: result.remaining,
  };
}
let timer: NodeJS.Timeout | undefined, active: Promise<void> | undefined;
async function tick() {
  const clock = brazilClock(new Date());
  const due = await rows(
    `SELECT d.organization_id FROM digest_settings d JOIN organizations o ON o.id=d.organization_id WHERE d.enabled AND o.active AND NOT o.is_demo AND o.preferences->>'email'='true' AND d.send_time<=$1 AND NOT EXISTS(SELECT 1 FROM digest_runs r WHERE r.organization_id=d.organization_id AND r.run_day=$2) ORDER BY d.organization_id LIMIT 20`,
    [clock.time, clock.day],
  );
  for (const row of due) {
    try {
      await generateDigest(row.organization_id);
    } catch {
      console.warn(
        "Não foi possível preparar um boletim. Nova tentativa no próximo ciclo.",
      );
    }
  }
}
export function startDigestWorker() {
  timer = setInterval(() => {
    if (!active)
      active = tick()
        .catch(() =>
          console.warn(
            "Boletim temporariamente indisponível; estado preservado.",
          ),
        )
        .finally(() => {
          active = undefined;
        });
  }, 60000);
  timer.unref();
}
export async function stopDigestWorker() {
  if (timer) clearInterval(timer);
  await active;
}
export function digestRoutes(router: Router) {
  router.get("/digest-settings", async (req, res) => {
    requireAdmin(req);
    const org = current(req).organization.id;
    const s = await one(
      "SELECT * FROM digest_settings WHERE organization_id=$1",
      [org],
    );
    const o = await one("SELECT preferences FROM organizations WHERE id=$1", [
      org,
    ]);
    res.json({
      enabled: s?.enabled ?? false,
      sendTime: s?.send_time ?? "08:00",
      recipientIds: s?.recipient_ids ?? [],
      revision: s?.revision ?? 0,
      emailEnabled: !!o!.preferences.email,
      smtpConfigured: await companyEmailConfigured(org),
      isDemo: current(req).organization.isDemo,
    });
  });
  router.put("/digest-settings", async (req, res) => {
    requireAdmin(req);
    const auth = current(req),
      org = auth.organization.id,
      b = digestSchema.parse(req.body);
    if (
      b.enabled &&
      (auth.organization.isDemo || !(await companyEmailConfigured(org)))
    )
      throw new HttpError(
        400,
        "Ative somente em conta real, com SMTP configurado e testado.",
      );
    await transaction(async (db) => {
      const o = await one(
        "SELECT preferences FROM organizations WHERE id=$1 FOR UPDATE",
        [org],
        db,
      );
      if (b.enabled && !o!.preferences.email)
        throw new HttpError(
          400,
          "Ative o canal de e-mail nas preferências antes do boletim.",
        );
      const existing = await one(
        "SELECT * FROM digest_settings WHERE organization_id=$1 FOR UPDATE",
        [org],
        db,
      );
      if ((existing?.revision ?? 0) !== b.revision)
        throw new HttpError(
          409,
          "Configuração alterada por outra pessoa. Atualize antes de salvar.",
        );
      const admins = await rows(
        "SELECT user_id FROM members WHERE organization_id=$1 AND role='ADMIN'",
        [org],
        db,
      );
      if (b.recipientIds.some((id) => !admins.some((a) => a.user_id === id)))
        throw new HttpError(
          400,
          "Selecione apenas administradores atuais da empresa.",
        );
      await db.query(
        `INSERT INTO digest_settings(organization_id,enabled,send_time,recipient_ids) VALUES($1,$2,$3,$4)
    ON CONFLICT(organization_id) DO UPDATE SET enabled=$2,send_time=$3,recipient_ids=$4,revision=digest_settings.revision+1,
    cursor_at=CASE WHEN $2 AND NOT digest_settings.enabled THEN now() ELSE digest_settings.cursor_at END,
    cursor_id=CASE WHEN $2 AND NOT digest_settings.enabled THEN $5::uuid ELSE digest_settings.cursor_id END`,
        [org, b.enabled, b.sendTime, JSON.stringify(b.recipientIds), MAX_ID],
      );
      await db.query(
        `UPDATE email_deliveries e SET status='CANCELLED',last_error='Boletim desativado ou destinatário removido.',updated_at=now() WHERE e.organization_id=$1 AND e.category='DIGEST' AND e.status IN ('PENDING','BLOCKED') AND (NOT $2::boolean OR NOT EXISTS(SELECT 1 FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='ADMIN' AND u.email=e.recipient AND ($3::jsonb='[]'::jsonb OR $3::jsonb ? m.user_id::text)))`,
        [org, b.enabled, JSON.stringify(b.recipientIds)],
      );
    });
    res.json({ ok: true });
  });
  router.get(
    "/digest-preview",
    rateLimit("digest-preview", 10, 60000),
    async (req, res) => {
      requireAdmin(req);
      const orgId = current(req).organization.id;
      const result = await transaction(async (db) => {
        const org = await one(
          "SELECT id,is_demo,profile,preferences FROM organizations WHERE id=$1",
          [orgId],
          db,
        );
        const settings = await one(
          "SELECT *,cursor_at::text cursor_text FROM digest_settings WHERE organization_id=$1",
          [orgId],
          db,
        );
        const now = new Date();
        return collectDigest(
          org,
          settings?.enabled
            ? settings
            : {
                cursor_text: new Date(now.getTime() - 86400000).toISOString(),
                cursor_id: MAX_ID,
              },
          now,
          db,
        );
      });
      res.json({
        count: result.items.length,
        scanned: result.scanned,
        remaining: result.remaining,
        items: result.items.slice(0, 20),
        notice:
          "Prévia sem envio. Desativado: consulta às últimas 24h; ativado: registros novos desde a última verificação. Até 20 itens nesta prévia. Ativar não envia registros antigos.",
      });
    },
  );
  router.get("/digests", async (req, res) =>
    res.json(
      await rows(
        "SELECT id,run_day::text,scanned,remaining,jsonb_array_length(items) count,created_at FROM digest_runs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 30",
        [current(req).organization.id],
      ),
    ),
  );
  router.get("/digests/:id", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      org = current(req).organization.id,
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
    const run = await one(
      "SELECT id,run_day::text,scanned,remaining,jsonb_array_length(items) total,created_at FROM digest_runs WHERE id=$1 AND organization_id=$2",
      [id, org],
    );
    if (!run) throw new HttpError(404, "Boletim não encontrado.");
    const items = await rows(
      "SELECT element.value FROM digest_runs r CROSS JOIN LATERAL jsonb_array_elements(r.items) WITH ORDINALITY AS element(value,n) WHERE r.id=$1 AND r.organization_id=$2 ORDER BY element.n LIMIT 25 OFFSET $3",
      [id, org, (page - 1) * 25],
    );
    res.json({
      ...run,
      page,
      pages: Math.max(1, Math.ceil(run.total / 25)),
      items: items.map((i) => i.value),
    });
  });
}
