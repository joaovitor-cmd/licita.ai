import { randomUUID } from "node:crypto";
import { type Database, one, pool, rows, transaction } from "./db.js";
import { current, HttpError, type Auth } from "./security.js";
import {
  defaultProfile,
  matchesModality,
  matchesSearch,
  normalize,
  type Profile,
  scoreOpportunity,
  smartNormalize,
} from "./scoring.js";
import { searchSchema } from "./validation.js";
import { openOpportunitySql } from './availability.js';
import {enqueueEmail} from './email-queue.js';
import {scoreSql} from './search-query.js';

export const iso = (date: any): string | null =>
  date ? new Date(date).toISOString() : null;
export async function getProfile(
  auth: Auth,
  db: Database = pool,
): Promise<Profile> {
  const org = await one(
    "SELECT name,tax_id,profile FROM organizations WHERE id=$1",
    [auth.organization.id],
    db,
  );
  return {
    ...defaultProfile,
    ...org.profile,
    organizationName: org.name,
    taxId: org.tax_id,
  };
}
export function mapCatalog(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    category: row.category,
    keywords: row.keywords,
    active: row.active,
    updatedAt: iso(row.updated_at),
  };
}
export async function catalog(auth: Auth, db: Database = pool) {
  return (
    await rows(
      "SELECT * FROM catalog WHERE organization_id=$1 ORDER BY active DESC,name",
      [auth.organization.id],
      db,
    )
  ).map(mapCatalog);
}
export const visibility = (auth: Auth, offset = 1) =>
  auth.organization.isDemo
    ? `o.demo_org_id=$${offset}`
    : "o.demo_org_id IS NULL";

export function mapOpportunity(row: any, profile: Profile, offerings: any[]) {
  const item = {
    id: row.id,
    canonicalKey: row.canonical_key,
    title: row.title,
    description: row.description,
    agency: row.agency,
    state: row.state,
    city: row.city,
    modality: row.modality,
    sphere: row.sphere,
    value: row.value === null ? null : Number(row.value),
    publishedAt: iso(row.published_at),
    opensAt: iso(row.opens_at),
    closesAt: iso(row.closes_at),
    status: row.status,
    url: row.url,
    sourceCode: row.source_code,
    sourceName: row.source_name,
    syncedAt: iso(row.synced_at),
    isDemo: !!row.demo_org_id,
    documents: row.documents ?? [],
    attachmentWarning: row.attachment_error ?? undefined,
    trackingId: row.tracking_id ?? null,
  };
  return {
    ...item,
    match: scoreOpportunity(
      item,
      profile,
      offerings.filter((o) => o.active),
    ),
  };
}

export async function getOpportunity(
  auth: Auth,
  id: string,
  db: Database = pool,
) {
  const row = await one(
    `SELECT o.*, t.id tracking_id FROM opportunities o
    LEFT JOIN trackings t ON t.opportunity_id=o.id AND t.organization_id=$2
    WHERE o.id=$1 AND ${auth.organization.isDemo ? "o.demo_org_id=$2" : "o.demo_org_id IS NULL"}`,
    [id, auth.organization.id],
    db,
  );
  if (!row) throw new HttpError(404, "Oportunidade não encontrada.");
  const [profile, offerings] = await Promise.all([
    getProfile(auth, db),
    catalog(auth, db),
  ]);
  return mapOpportunity(row, profile, offerings);
}

export async function searchOpportunities(auth: Auth, query: unknown) {
  const q = searchSchema.parse(query);
  const values: unknown[] = [auth.organization.id];
  const where = [visibility(auth)];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (q.state) where.push(`o.state=${bind(q.state.toUpperCase())}`);
  if (q.minValue !== undefined) where.push(`o.value>=${bind(q.minValue)}`);
  if (q.maxValue !== undefined) where.push(`o.value<=${bind(q.maxValue)}`);
  if (q.from) where.push(`o.published_at>=${bind(q.from)}`);
  if (q.to) where.push(`o.published_at<${bind(q.to)}::date+interval '1 day'`);
  if (q.source) {
    const p = bind(q.source);
    where.push(
      `(o.source_code=${p} OR EXISTS(SELECT 1 FROM opportunity_sources s WHERE s.opportunity_id=o.id AND s.source_code=${p}))`,
    );
  }
  if (q.status === "open" || q.status === "recebendo_proposta")
    where.push(
      `(${openOpportunitySql})`,
    );
  else if (q.status === "closed") where.push("o.closes_at<now()");
  else if (q.status)
    where.push(
      `o.status ILIKE ${bind("%" + q.status.replace(/[\\%_]/g, "\\$&") + "%")}`,
    );
  const [profile,offerings]=await Promise.all([getProfile(auth),catalog(auth)]);
  const tokens=smartNormalize(q.q).split(' ').filter(Boolean);
  if(tokens.length)where.push(`o.search_tokens @> ${bind(tokens)}::text[]`);
  if(q.city)where.push(`position(${bind(normalize(q.city))} in o.city_search)>0`);
  if(q.agency)where.push(`position(${bind(normalize(q.agency))} in o.agency_search)>0`);
  if(q.modality){const p=bind(normalize(q.modality));where.push(`(o.modality_search=${p} OR left(o.modality_search,length(${p})+1)=${p}||' ')`);}
  const needsScore=q.sort==='score'||q.minScore!==undefined;
  const rank=needsScore?scoreSql(profile,offerings,bind):'0';
  const threshold=q.minScore===undefined?'TRUE':`rank_score>=${bind(q.minScore)}`;
  const orders={score:'rank_score DESC,published_at DESC NULLS LAST,id',newest:'published_at DESC NULLS LAST,id',deadline:'closes_at ASC NULLS LAST,id',value:'value DESC NULLS LAST,id'};
  const limit=bind(q.pageSize),offset=bind((q.page-1)*q.pageSize);
  // Count and page share one database snapshot. Only the requested rows cross the connection.
  const result=await one(`WITH candidates AS MATERIALIZED (
    SELECT o.id,o.published_at,o.closes_at,o.value,${rank} rank_score FROM opportunities o WHERE ${where.join(' AND ')}
  ), filtered AS MATERIALIZED (SELECT * FROM candidates WHERE ${threshold}),
  page AS (SELECT * FROM filtered ORDER BY ${orders[q.sort]} LIMIT ${limit} OFFSET ${offset})
  SELECT (SELECT count(*)::int FROM filtered) total,coalesce((SELECT jsonb_agg(record ORDER BY position) FROM (
    SELECT o.id,o.canonical_key,o.title,o.description,o.agency,o.state,o.city,o.modality,o.sphere,o.value,o.published_at,o.opens_at,o.closes_at,o.status,o.url,o.source_code,o.source_name,o.synced_at,o.demo_org_id,o.documents,o.attachment_error,t.id tracking_id,
    row_number() OVER(ORDER BY ${orders[q.sort].split(',').map(part=>'p.'+part).join(',')}) position
    FROM page p JOIN opportunities o ON o.id=p.id LEFT JOIN trackings t ON t.opportunity_id=o.id AND t.organization_id=$1
  ) record),'[]'::jsonb) items`,values);
  const total=Number(result.total),page=q.page;
  const items=result.items.map((row:any)=>mapOpportunity(row,profile,offerings));
  return {
    items,
    total,
    page,
    pageSize: q.pageSize,
    pages: Math.ceil(total / q.pageSize),
  };
}

export const mapTask = (r: any) => ({
  id: r.id,
  title: r.title,
  done: r.done,
  deadline: iso(r.deadline),
  ownerId: r.owner_id,
});
export const mapEvent = (r: any) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  createdAt: iso(r.created_at),
});
export async function ensureTracking(
  auth: Auth,
  id: string,
  db: Database = pool,
) {
  const row = await one(
    "SELECT * FROM trackings WHERE id=$1 AND organization_id=$2",
    [id, auth.organization.id],
    db,
  );
  if (!row) throw new HttpError(404, "Acompanhamento não encontrado.");
  return row;
}
export async function ensureOwner(
  auth: Auth,
  ownerId: string | null | undefined,
  db: Database = pool,
) {
  if (
    ownerId &&
    !(await one(
        "SELECT 1 FROM members WHERE user_id=$1 AND organization_id=$2 AND active",
      [ownerId, auth.organization.id],
      db,
    ))
  )
    throw new HttpError(400, "O responsável deve pertencer à sua empresa.");
}
export async function getTracking(auth: Auth, id: string, db: Database = pool) {
  const row = await ensureTracking(auth, id, db);
  const [opportunity, tasks, events] = await Promise.all([
    getOpportunity(auth, row.opportunity_id, db),
    rows(
      "SELECT * FROM tasks WHERE tracking_id=$1 ORDER BY created_at,id",
      [id],
      db,
    ),
    rows(
      "SELECT * FROM events WHERE tracking_id=$1 ORDER BY created_at DESC,id",
      [id],
      db,
    ),
  ]);
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunity,
    stage: row.stage,
    ownerId: row.owner_id,
    deadline: iso(row.deadline),
    expectedValue:
      row.expected_value === null ? null : Number(row.expected_value),
    outcomeReason: row.outcome_reason,
    outcomeCategory: row.outcome_category,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    tasks: tasks.map(mapTask),
    events: events.map(mapEvent),
  };
}
export async function listTrackings(auth: Auth) {
  const found = await rows(
    "SELECT id FROM trackings WHERE organization_id=$1 ORDER BY updated_at DESC",
    [auth.organization.id],
  );
  return Promise.all(found.map((row) => getTracking(auth, row.id)));
}
export async function addEvent(
  trackingId: string,
  type: string,
  title: string,
  description = "",
  actorId: string | null = null,
  db: Database = pool,
) {
  return mapEvent(
    await one(
      `INSERT INTO events(id,tracking_id,type,title,description,actor_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), trackingId, type, title, description, actorId],
      db,
    ),
  );
}
export async function notify(
  organizationId: string,
  title: string,
  description: string,
  url: string,
  dedupeKey: string | null = null,
  skipEmail = false,
) {
  const org = await one(
    "SELECT preferences,is_demo,active FROM organizations WHERE id=$1",
    [organizationId],
  );
  if (!org || org.active===false) return;
  await transaction(async db=>{
  const inserted = await one(
    `INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,dedupe_key) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      organizationId,
      title,
      description,
      url,
      dedupeKey,
      !org.preferences.inApp,
    ],
    db,
  );
  if (inserted && org.preferences.email && !org.is_demo && !skipEmail) {
    const members = await rows(
      "SELECT u.email FROM users u JOIN members m ON m.user_id=u.id WHERE m.organization_id=$1 AND m.role='ADMIN'",
      [organizationId],
      db,
    );
    for (const member of members) {
      await enqueueEmail(db,organizationId,inserted.id,member.email,title,`${description}\n\n${process.env.APP_URL ?? "http://localhost:5173"}${url}`);
    }
  }
  });
}
