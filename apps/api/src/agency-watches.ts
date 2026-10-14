import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction, type Database } from "./db.js";
import { current, requireAdmin, HttpError } from "./security.js";
import {
  agencyCnpj,
  agencyWatchSchema,
  watchMatch,
  watchText,
  watchTermMatches,
} from "./agency-watch-rules.js";
import type { ExternalOpportunity } from "./connectors.js";
import { normalize } from "./scoring.js";

const dto = (r: any) => ({
  id: r.id,
  name: r.name,
  agencyCnpj: r.agency_cnpj,
  terms: r.terms,
  excludedTerms: r.excluded_terms,
  states: r.states,
  active: r.active,
  revision: r.revision,
  activeSince: r.active_since,
  createdAt: r.created_at,
  hitCount: r.hit_count ?? 0,
});
export function agencyWatchRoutes(router: Router) {
  router.get("/agency-watches", async (req, res) => {
    const list = await rows(
      `SELECT w.*,(SELECT count(*)::int FROM agency_watch_hits h WHERE h.watch_id=w.id) hit_count FROM agency_watches w WHERE organization_id=$1 ORDER BY lower(name),id`,
      [current(req).organization.id],
    );
    res.json(list.map(dto));
  });
  router.post("/agency-watches", async (req, res) => {
    requireAdmin(req);
    const b = agencyWatchSchema.parse(req.body),
      org = current(req).organization.id;
    const saved = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `agency-watches:${org}`,
      ]);
      const existing = await rows(
        "SELECT id,name FROM agency_watches WHERE organization_id=$1",
        [org],
        db,
      );
      if (existing.some((w) => normalize(w.name) === normalize(b.name)))
        throw new HttpError(409, "Já existe um monitoramento com este nome.");
      if (existing.length >= 50)
        throw new HttpError(
          409,
          "Limite técnico de 50 monitoramentos por empresa atingido.",
        );
      return one(
        `INSERT INTO agency_watches(id,organization_id,name,agency_cnpj,terms,excluded_terms,states) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          randomUUID(),
          org,
          b.name,
          b.agencyCnpj,
          JSON.stringify(b.terms),
          JSON.stringify(b.excludedTerms),
          JSON.stringify(b.states),
        ],
        db,
      );
    });
    res.status(201).json(dto(saved));
  });
  router.put("/agency-watches/:id", async (req, res) => {
    requireAdmin(req);
    const id = z.string().uuid().parse(req.params.id),
      { revision, ...b } = agencyWatchSchema
        .extend({ revision: z.number().int().positive() })
        .parse(req.body),
      org = current(req).organization.id;
    const saved = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `agency-watches:${org}`,
      ]);
      const existing = await rows(
          "SELECT id,name,revision FROM agency_watches WHERE organization_id=$1",
          [org],
          db,
        ),
        old = existing.find((w) => w.id === id);
      if (!old) throw new HttpError(404, "Monitoramento não encontrado.");
      if (old.revision !== revision)
        throw new HttpError(
          409,
          "Este monitoramento mudou. Atualize a lista antes de salvar.",
        );
      if (
        existing.some(
          (w) => w.id !== id && normalize(w.name) === normalize(b.name),
        )
      )
        throw new HttpError(409, "Já existe um monitoramento com este nome.");
      return one(
        `UPDATE agency_watches SET name=$3,agency_cnpj=$4,terms=$5,excluded_terms=$6,states=$7,revision=revision+1,active_since=now(),updated_at=now() WHERE id=$1 AND organization_id=$2 AND revision=$8 RETURNING *`,
        [
          id,
          org,
          b.name,
          b.agencyCnpj,
          JSON.stringify(b.terms),
          JSON.stringify(b.excludedTerms),
          JSON.stringify(b.states),
          revision,
        ],
        db,
      );
    });
    if (!saved) {
      if (
        !(await one(
          "SELECT id FROM agency_watches WHERE id=$1 AND organization_id=$2",
          [id, org],
        ))
      )
        throw new HttpError(404, "Monitoramento não encontrado.");
      throw new HttpError(
        409,
        "Este monitoramento mudou. Atualize a lista antes de salvar.",
      );
    }
    res.json(dto(saved));
  });
  router.patch("/agency-watches/:id/active", async (req, res) => {
    requireAdmin(req);
    const id = z.string().uuid().parse(req.params.id),
      org = current(req).organization.id,
      b = z
        .object({ active: z.boolean(), revision: z.number().int().positive() })
        .strict()
        .parse(req.body);
    const saved = await one(
      `UPDATE agency_watches SET active=$3,revision=revision+1,active_since=CASE WHEN $3 AND NOT active THEN now() ELSE active_since END,updated_at=now() WHERE id=$1 AND organization_id=$2 AND revision=$4 RETURNING *`,
      [id, org, b.active, b.revision],
    );
    if (!saved) {
      if (
        !(await one(
          "SELECT id FROM agency_watches WHERE id=$1 AND organization_id=$2",
          [id, org],
        ))
      )
        throw new HttpError(404, "Monitoramento não encontrado.");
      throw new HttpError(409, "Este monitoramento mudou. Atualize a lista.");
    }
    res.json(dto(saved));
  });
  router.get("/agency-watches/:id/hits", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      org = current(req).organization.id,
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
    if (
      !(await one(
        "SELECT id FROM agency_watches WHERE id=$1 AND organization_id=$2",
        [id, org],
      ))
    )
      throw new HttpError(404, "Monitoramento não encontrado.");
    const result = await one(
      `SELECT (SELECT count(*)::int FROM agency_watch_hits h JOIN opportunities o ON o.id=h.opportunity_id WHERE h.watch_id=$1 AND o.demo_org_id IS NULL) total,
      coalesce((SELECT jsonb_agg(p ORDER BY detected_at DESC,opportunity_id) FROM
      (SELECT h.*,o.title,o.agency,o.state,o.city,o.public_code::text public_code,o.source_name,o.published_at FROM agency_watch_hits h JOIN opportunities o ON o.id=h.opportunity_id WHERE h.watch_id=$1 AND o.demo_org_id IS NULL ORDER BY h.detected_at DESC,h.opportunity_id LIMIT 20 OFFSET $2) p),'[]') items`,
      [id, (page - 1) * 20],
    );
    res.json({
      ...result,
      page,
      pages: Math.max(1, Math.ceil(result.total / 20)),
    });
  });
}

// Called inside the collector's transaction only for the first insertion of a public record.
// Query candidates by indexed CNPJ; batch hits/notices avoid a query per company or watch.
export async function notifyAgencyWatches(
  db: Database,
  opportunityId: string,
  item: ExternalOpportunity,
) {
  const cnpj = agencyCnpj(item),
    published = item.publishedAt;
  if (!cnpj || !published || !Number.isFinite(Date.parse(published))) return;
  const candidates = await rows(
    `SELECT w.*,o.preferences FROM agency_watches w JOIN organizations o ON o.id=w.organization_id
  JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) JOIN commercial_plans p ON p.code=e.plan_code
  WHERE w.agency_cnpj=$1 AND w.active AND o.active AND e.active AND NOT o.is_demo AND w.active_since<=$2::timestamptz
  AND (NOT p.enforce_features OR p.planned_features ? 'discovery') FOR SHARE OF w`,
    [cnpj, published],
    db,
  );
  const text = watchText(item),
    matches = candidates.filter((w) => watchMatch(w, item, text));
  if (!matches.length) return;
  const payload = matches.map((w) => ({
    watch_id: w.id,
    opportunity_id: opportunityId,
    rule_snapshot: {
      name: w.name,
      revision: w.revision,
      agencyCnpj: cnpj,
      terms: w.terms,
      excludedTerms: w.excluded_terms,
      states: w.states,
      activeSince: w.active_since,
      matchingTerms: w.terms.filter((term: string) =>
        watchTermMatches(term, text),
      ),
      objectAtCollection: item.title.slice(0, 2000),
      sourceAtCollection: item.sourceName,
      publicationAtCollection: item.publishedAt,
    },
  }));
  const inserted = await rows(
    `INSERT INTO agency_watch_hits(watch_id,opportunity_id,rule_snapshot) SELECT * FROM jsonb_to_recordset($1::jsonb) AS h(watch_id uuid,opportunity_id uuid,rule_snapshot jsonb)
  ON CONFLICT(watch_id,opportunity_id) DO NOTHING RETURNING watch_id`,
    [JSON.stringify(payload)],
    db,
  );
  const newIds = new Set(inserted.map((h) => h.watch_id)),
    groups = new Map<string, any[]>();
  for (const w of matches) {
    if (!newIds.has(w.id) || w.preferences?.inApp === false) continue;
    const group = groups.get(w.organization_id) ?? [];
    group.push(w);
    groups.set(w.organization_id, group);
  }
  if (!groups.size) return;
  const title = item.title
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const notices = [...groups].map(([organization_id, matched]) => ({
    id: randomUUID(),
    organization_id,
    title: "Nova publicação de órgão monitorado",
    description: `${title}\nÓrgão: ${item.agency.slice(0, 200)} · CNPJ ${cnpj}. Monitoramento: ${matched
      .map((w) => w.name)
      .join(", ")
      .slice(
        0,
        300,
      )}. Identificado na coleta; confira datas e condições na publicação oficial.`,
    url: `/app/oportunidades/${opportunityId}`,
    dedupe_key: `agency-watch:${opportunityId}`,
  }));
  await db.query(
    `INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key) SELECT * FROM jsonb_to_recordset($1::jsonb) AS n(id uuid,organization_id uuid,title text,description text,url text,dedupe_key text) ON CONFLICT(organization_id,dedupe_key) DO NOTHING`,
    [JSON.stringify(notices)],
  );
}
