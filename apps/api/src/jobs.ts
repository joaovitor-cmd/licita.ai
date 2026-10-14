import { randomUUID } from "node:crypto";
import { pool, one, rows, transaction } from "./db.js";
import {
  collectSource,
  refreshOpportunity,
  SOURCE_DEFINITIONS,
  normalizeBrasiliaDate,
  type ExternalOpportunity,
} from "./connectors.js";
import { addEvent, iso, notify } from "./data.js";
import { digest, HttpError, type Auth } from "./security.js";
import { companyEmailConfigured } from "./smtp-settings.js";
import { defaultProfile, scoreOpportunity } from "./scoring.js";
import type { PoolClient } from "pg";
import {recordSourceChange,findRelatedPublications} from './source-changes.js';
import {notifyAgencyWatches} from './agency-watches.js';
import {documentNotifications} from './document-alerts.js';
import {priceRecordNotifications} from './price-records.js';
import {reconcileSource,type PublicSnapshot} from './source-reconciliation.js';

const intervalMinutes = Math.max(
  15,
  Number(process.env.SYNC_INTERVAL_MINUTES ?? 60) || 60,
);
const schedulerEnabled = process.env.SCHEDULER_ENABLED === "true";
let timer: NodeJS.Timeout | undefined,
  active = false,
  stopped = false;
let attachmentTimer: NodeJS.Timeout | undefined;
const attachmentRequests = new Map<string, Promise<unknown>>();
export async function ensureAttachments(id: string) {
  const pending = attachmentRequests.get(id);
  if (pending) return pending;
  if (attachmentRequests.size >= 2) throw new Error("Consulta de anexos ocupada");
  const work = (async () => {
    const row = await one("SELECT review_attempted_at FROM opportunities WHERE id=$1 AND demo_org_id IS NULL", [id]);
    if (!row || (row.review_attempted_at && Date.now()-new Date(row.review_attempted_at).getTime()<300_000)) return;
    return refreshOne(id);
  })();
  attachmentRequests.set(id, work);
  try { return await work; } finally { attachmentRequests.delete(id); }
}
async function collectMissingAttachments() {
  if (stopped || attachmentRequests.size) return;
  const row = await one("SELECT id FROM opportunities WHERE demo_org_id IS NULL AND documents='[]'::jsonb AND (review_attempted_at IS NULL OR review_attempted_at<now()-interval '6 hours') AND (closes_at IS NULL OR closes_at>=now()) ORDER BY published_at DESC NULLS LAST LIMIT 1");
  if (row) await ensureAttachments(row.id);
}
export const mapRun = (r: any) => ({
  id: r.id,
  sourceCode: r.source_code,
  status: r.status,
  created: r.records_created,
  updated: r.records_updated,
  read: r.records_read,
  error: r.error,
  startedAt: iso(r.started_at),
  finishedAt: iso(r.finished_at),
});
const relevant = (o: any) => ({
  title: o.title,
  description: o.description ?? "",
  agency: o.agency,
  state: o.state,
  city: o.city,
  modality: o.modality,
  sphere: o.sphere,
  value: o.value === null ? null : Number(o.value),
  publishedAt: iso(o.publishedAt ?? o.published_at),
  opensAt: iso(o.opensAt ?? o.opens_at),
  closesAt: iso(o.closesAt ?? o.closes_at),
  status: o.status,
  url: o.url,
  documents: o.documents ?? [],
});
export async function saveOpportunity(
  item: ExternalOpportunity,
  includeDocuments = false,
) {
  const outcome = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      item.canonicalKey,
    ]);
    const previous = await one(
      "SELECT * FROM opportunities WHERE canonical_key=$1 FOR UPDATE",
      [item.canonicalKey],
      db,
    );
    const raw = (item.raw ?? {}) as Record<string, unknown>;
    const sourceDate = normalizeBrasiliaDate(
      raw.dataAtualizacaoGlobal ??
        raw.dataAtualizacaoPncp ??
        raw.dataAtualizacao,
    );
    const observed=relevant(item) as PublicSnapshot;
    const reconciliation=reconcileSource(previous?relevant(previous) as PublicSnapshot:null,observed,iso(previous?.source_updated_at),sourceDate,includeDocuments);
    const recordObservation=async(oid:string)=>db.query(
      'INSERT INTO opportunity_source_observations(id,opportunity_id,source_code,external_id,source_url,reported_updated_at,decision,reason,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(opportunity_id,source_code) DO UPDATE SET external_id=excluded.external_id,source_url=excluded.source_url,reported_updated_at=excluded.reported_updated_at,consulted_at=now(),decision=excluded.decision,reason=excluded.reason,snapshot=excluded.snapshot',
      [randomUUID(),oid,item.sourceCode,item.externalId,item.url,sourceDate,reconciliation.decision,reconciliation.reason,JSON.stringify(observed)],
    );
    if(previous&&reconciliation.decision!=='accepted'){
      await db.query('INSERT INTO opportunity_sources(opportunity_id,source_code,external_id) VALUES($1,$2,$3) ON CONFLICT(source_code,external_id) DO UPDATE SET synced_at=now()',[previous.id,item.sourceCode,item.externalId]);
      await recordObservation(previous.id);
      return {id:previous.id,created:false,updated:false,hash:previous.content_hash};
    }
    const merged={...item,...reconciliation.snapshot};
    if(previous&&reconciliation.reason==='same_known_fields'&&!sourceDate){
      merged.sourceCode=previous.source_code;merged.sourceName=previous.source_name;merged.raw=previous.raw;
    }
    const documents=merged.documents;
    const hash = digest(JSON.stringify(relevant(merged))),
      changed = !!previous && previous.content_hash !== hash;
    const oid = previous?.id ?? randomUUID();
    await db.query(
      `INSERT INTO opportunities(id,canonical_key,title,description,agency,state,city,modality,sphere,value,published_at,opens_at,closes_at,status,url,source_code,source_name,documents,content_hash,raw)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT(canonical_key) DO UPDATE SET title=excluded.title,description=excluded.description,agency=excluded.agency,state=excluded.state,city=excluded.city,modality=excluded.modality,sphere=excluded.sphere,value=excluded.value,published_at=excluded.published_at,opens_at=excluded.opens_at,closes_at=excluded.closes_at,status=excluded.status,url=excluded.url,source_code=excluded.source_code,source_name=excluded.source_name,documents=excluded.documents,content_hash=excluded.content_hash,raw=excluded.raw,synced_at=now(),updated_at=CASE WHEN opportunities.content_hash<>excluded.content_hash THEN now() ELSE opportunities.updated_at END`,
      [
        oid,
        item.canonicalKey,
        merged.title,
        merged.description,
        merged.agency,
        merged.state,
        merged.city,
        merged.modality,
        merged.sphere,
        merged.value,
        merged.publishedAt,
        merged.opensAt,
        merged.closesAt,
        merged.status,
        merged.url,
        merged.sourceCode,
        merged.sourceName,
        JSON.stringify(documents),
        hash,
        JSON.stringify(merged.raw ?? null),
      ],
    );
    await db.query(
      "INSERT INTO opportunity_sources(opportunity_id,source_code,external_id) VALUES($1,$2,$3) ON CONFLICT(source_code,external_id) DO UPDATE SET synced_at=now()",
      [oid, item.sourceCode, item.externalId],
    );
    await recordObservation(oid);
    if (sourceDate)
      await db.query(
        "UPDATE opportunities SET source_updated_at=$1 WHERE id=$2",
        [sourceDate, oid],
      );
    if (changed) {
      const before = relevant(previous),
        after = relevant(merged);
      const labels: Record<string, string> = {
        title: "Objeto",
        description: "Descrição",
        agency: "Órgão",
        state: "UF",
        city: "Município",
        modality: "Modalidade",
        sphere: "Esfera",
        value: "Valor estimado",
        publishedAt: "Publicação",
        opensAt: "Abertura",
        closesAt: "Encerramento",
        status: "Situação",
        url: "Portal de origem",
        documents: "Anexos",
      };
      const description = Object.keys(after)
        .filter(
          (k) =>
            JSON.stringify((before as any)[k]) !==
            JSON.stringify((after as any)[k]),
        )
        .map(
          (k) =>
            `${labels[k]}: ${JSON.stringify((before as any)[k])} → ${JSON.stringify((after as any)[k])}`,
        )
        .join("\n");
      await recordSourceChange(db,oid,before,after,description);
    }
    if(!previous) {await findRelatedPublications(db,oid,merged);await notifyAgencyWatches(db,oid,merged);}
    return { id: oid, created: !previous, updated: changed, hash };
  });
  return outcome;
}
export async function refreshOne(opportunityId: string) {
  const row = await one(
    "SELECT * FROM opportunities WHERE id=$1 AND demo_org_id IS NULL",
    [opportunityId],
  );
  if (!row) throw new HttpError(404, "Edital real não encontrado.");
  let refreshed;
  try {
    refreshed = await refreshOpportunity({
      canonicalKey: row.canonical_key,
      sourceCode: "pncp",
    });
  } catch (error: any) {
    await pool.query("UPDATE opportunities SET attachment_error=$2 WHERE id=$1", [opportunityId, "A última consulta de dados e anexos falhou. Os documentos anteriores foram preservados. Confira a fonte ou tente novamente mais tarde."]);
    throw new HttpError(
      502,
      `Não foi possível atualizar na fonte: ${error.message}. Os dados anteriores foram preservados.`,
    );
  } finally {
    await pool.query(
      "UPDATE opportunities SET review_attempted_at=now() WHERE id=$1",
      [opportunityId],
    );
  }
  if (!refreshed) {
    await pool.query("UPDATE opportunities SET attachment_error=$2 WHERE id=$1", [opportunityId, "A fonte não retornou este edital na última consulta. Os dados anteriores foram preservados."]);
    throw new HttpError(
      502,
      "O edital não foi retornado pela fonte. Os dados anteriores foram preservados.",
    );
  }
  const result = await saveOpportunity(refreshed, true);
  await pool.query("UPDATE opportunities SET attachment_error=NULL WHERE id=$1", [opportunityId]);
  return result;
}
export async function enqueueSync(
  sourceCode: string,
  organizationId: string | null,
) {
  if (!["pncp", "comprasgov"].includes(sourceCode))
    throw new HttpError(400, "Fonte sem conector implementado.");
  const jobId = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(8206910)");
    const existing = await one(
      "SELECT id FROM sync_runs WHERE source_code=$1 AND organization_id IS NOT DISTINCT FROM $2 AND status IN ('PENDING','RUNNING') ORDER BY started_at LIMIT 1",
      [sourceCode, organizationId],
      db,
    );
    if (existing) return existing.id;
    const id = randomUUID();
    await db.query(
      "INSERT INTO sync_runs(id,source_code,organization_id,status) VALUES($1,$2,$3,'PENDING')",
      [id, sourceCode, organizationId],
    );
    return id;
  });
  setImmediate(() => void pump().catch(logFailure));
  return jobId;
}
export async function sourceStatus(auth: Auth) {
  const found = auth.organization.isDemo
    ? []
    : await rows(
        "SELECT * FROM sync_runs WHERE organization_id=$1 OR organization_id IS NULL ORDER BY started_at DESC LIMIT 30",
        [auth.organization.id],
      );
  const sources = await Promise.all(
    SOURCE_DEFINITIONS.map(async (s) => {
      const last = found.find((r) => r.source_code === s.code);
      const count = auth.organization.isDemo
        ? 0
        : Number(
            (
              await one(
                "SELECT count(*) FROM opportunity_sources WHERE source_code=$1",
                [s.code],
              )
            ).count,
          );
      return {
        ...s,
        status: last?.status === "FAILED" ? "unavailable" : s.status,
        lastRun: iso(last?.finished_at ?? last?.started_at),
        records: count,
      };
    }),
  );
  return {
    sources,
    runs: found.map(mapRun),
    scheduler: { enabled: schedulerEnabled, intervalMinutes, emailConfigured: await companyEmailConfigured(auth.organization.id) },
  };
}
async function deadlineNotifications() {
  const tracked =
    await rows(`SELECT t.id,t.organization_id,o.title,coalesce(t.deadline,o.closes_at) due FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id JOIN organizations org ON org.id=t.organization_id
    WHERE org.is_demo=false AND t.stage NOT IN ('WON','LOST','DISCARDED') AND coalesce(t.deadline,o.closes_at) BETWEEN now()-interval '1 day' AND now()+interval '3 days'`);
  for (const t of tracked)
    await notify(
      t.organization_id,
      "Prazo de participação próximo",
      `${t.title} — ${iso(t.due)}`,
      `/app/radar/${t.id}`,
      `deadline:${t.id}:${iso(t.due)?.slice(0, 10)}`,
    );

}
const logFailure = (error: any) =>
  console.error(
    JSON.stringify({
      level: "error",
      component: "jobs",
      message: error.message,
    }),
  );
async function recoverInterruptedRuns(connection: PoolClient) {
  // The caller owns the worker lock, so no other worker can still own these runs.
  await connection.query(
    "UPDATE sync_runs SET status=CASE WHEN records_read>0 OR records_created>0 OR records_updated>0 THEN 'PARTIAL' ELSE 'FAILED' END,error='Processo interrompido antes de concluir. Execute novamente para retomar a coleta.',finished_at=now() WHERE status='RUNNING'",
  );
}

async function releaseWorkerConnection(
  connection: PoolClient,
  locked: boolean,
) {
  let discard = false;
  try {
    if (locked) await connection.query("SELECT pg_advisory_unlock(8206911)");
  } catch (error) {
    discard = true;
    logFailure(error);
  } finally {
    // Never return a connection with a possibly retained session lock to the pool.
    connection.release(discard);
  }
}

export async function pump() {
  if (active || stopped) return;
  active = true;
  let connection: PoolClient | undefined;
  let locked = false;
  let run: any;
  let finalized = false;
  let created = 0,
    updated = 0,
    read = 0;
  try {
    connection = await pool.connect();
    locked = (
      await connection.query("SELECT pg_try_advisory_lock(8206911) locked")
    ).rows[0].locked;
    if (!locked) return;
    await recoverInterruptedRuns(connection);
    run = await one(
      "SELECT * FROM sync_runs WHERE status='PENDING' ORDER BY started_at LIMIT 1",
    );
    if (!run) return;
    await pool.query(
      "UPDATE sync_runs SET status='RUNNING',started_at=now() WHERE id=$1",
      [run.id],
    );
    const errors: string[] = [];
    const newItems: ExternalOpportunity[] = [];
    try {
      const orgs = await rows(
        "SELECT id,name,profile FROM organizations WHERE is_demo=false AND ($1::uuid IS NULL OR id=$1)",
        [run.organization_id],
      );
      const states = [
        ...new Set<string>(orgs.flatMap((o) => o.profile.states ?? [])),
      ];
      const result = await collectSource(
        run.source_code,
        {
          states,
          days: 7,
          maxPages: 40,
          cursor: (
            await one("SELECT cursor FROM collection_cursors WHERE scope=$1", [
              `${run.source_code}:${run.organization_id ?? "global"}`,
            ])
          )?.cursor,
          onCheckpoint: async (cursor) => {
            await pool.query(
              "INSERT INTO collection_cursors(scope,cursor) VALUES($1,$2) ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor,updated_at=now()",
              [
                `${run.source_code}:${run.organization_id ?? "global"}`,
                JSON.stringify(cursor),
              ],
            );
          },
        },
        async (items) => {
          for (const item of items) {
            const saved = await saveOpportunity(item);
            if (saved.created) {
              created++;
              newItems.push(item);
            }
            if (saved.updated) updated++;
            read++;
          }
          await pool.query(
            "UPDATE sync_runs SET records_read=$1,records_created=$2,records_updated=$3 WHERE id=$4",
            [read, created, updated, run.id],
          );
        },
      );
      read = Math.max(read, result.read);
    } catch (error: any) {
      errors.push(error.message);
      read = Math.max(read, error.recordsRead ?? error.read ?? 0);
    }
    // Always review tracked records independently of publication date.
    const tracked = await rows(
      "SELECT DISTINCT o.id,o.review_attempted_at FROM opportunities o JOIN trackings t ON t.opportunity_id=o.id WHERE o.demo_org_id IS NULL AND ($1::uuid IS NULL OR t.organization_id=$1) ORDER BY o.review_attempted_at ASC NULLS FIRST LIMIT 101",
      [run.organization_id],
    );
    if (tracked.length > 100)
      errors.push(
        "Mais de 100 editais no radar; revisão individual limitada aos primeiros 100 nesta execução.",
      );
    const reviewStarted = Date.now();
    for (const o of tracked.slice(0, 100)) {
      if (Date.now() - reviewStarted > 120_000) {
        errors.push(
          "Limite de tempo da revisão individual atingido. Os editais menos recentemente revisados terão prioridade na próxima execução.",
        );
        break;
      }
      try {
        const changed = await refreshOne(o.id);
        if (changed.updated) updated++;
      } catch (e: any) {
        errors.push(`Revisão do radar: ${e.message}`);
      }
    }
    try {
      if (newItems.length) {
        const orgs = await rows(
          "SELECT o.id,o.profile,o.preferences,coalesce(d.enabled,false) daily_digest FROM organizations o LEFT JOIN digest_settings d ON d.organization_id=o.id WHERE o.is_demo=false",
        );
        for (const org of orgs) {
          const offerings = await rows(
            "SELECT * FROM catalog WHERE organization_id=$1 AND active=true",
            [org.id],
          );
          const matches = newItems.filter(
            (item) =>
              scoreOpportunity(
                item,
                { ...defaultProfile, ...org.profile },
                offerings,
              ).score >= (org.preferences.minScore ?? 60) && !scoreOpportunity(item, { ...defaultProfile, ...org.profile }, offerings).excluded,
          );
          if (matches.length)
            await notify(
              org.id,
              `${matches.length} novas oportunidades aderentes`,
              `Novos editais com aderência mínima de ${org.preferences.minScore ?? 60}%:\n${matches.slice(0, 10).map(item => `• ${item.title} — ${item.agency} (${item.state ?? "UF não informada"})`).join("\n")}`,
              `/app/oportunidades?minScore=${org.preferences.minScore ?? 60}`,
              `run:${run.id}:${org.id}`,
              org.daily_digest,
            );
        }
      }
      await deadlineNotifications();
    } catch (e: any) {
      errors.push(`Notificações: ${e.message}`);
    }
    const status = errors.length
      ? read || created || updated
        ? "PARTIAL"
        : "FAILED"
      : "SUCCEEDED";
    await pool.query(
      "UPDATE sync_runs SET status=$1,records_read=$2,records_created=$3,records_updated=$4,error=$5,finished_at=now() WHERE id=$6",
      [
        status,
        read,
        created,
        updated,
        errors.length ? errors.slice(0, 8).join("\n") : null,
        run.id,
      ],
    );
    finalized = true;
    console.log(
      JSON.stringify({
        level: "info",
        component: "sync",
        source: run.source_code,
        status,
        read,
        created,
        updated,
      }),
    );
  } catch (error: any) {
    if (run && !finalized) {
      try {
        await pool.query(
          `UPDATE sync_runs SET status=CASE WHEN greatest(records_read,$1)>0 OR greatest(records_created,$2)>0 OR greatest(records_updated,$3)>0 THEN 'PARTIAL' ELSE 'FAILED' END,
          records_read=greatest(records_read,$1),records_created=greatest(records_created,$2),records_updated=greatest(records_updated,$3),error=$4,finished_at=now()
          WHERE id=$5 AND status='RUNNING'`,
          [
            read,
            created,
            updated,
            `Execução interrompida: ${error.message}`.slice(0, 4000),
            run.id,
          ],
        );
      } catch (persistenceError) {
        // If the database is unavailable, the next lock owner recovers this run.
        logFailure(persistenceError);
      }
    }
    throw error;
  } finally {
    try {
      if (connection) await releaseWorkerConnection(connection, locked);
    } finally {
      active = false;
    }
  }
}
export async function startJobs() {
  stopped = false;
  // Only the worker holding the advisory lock may classify abandoned runs.
  const c = await pool.connect();
  let locked = false;
  try {
    locked = (await c.query("SELECT pg_try_advisory_lock(8206911) locked"))
      .rows[0].locked;
    if (locked) await recoverInterruptedRuns(c);
  } finally {
    await releaseWorkerConnection(c, locked);
  }
  timer = setInterval(() => void tick().catch(logFailure), 5000);
  timer.unref();
  attachmentTimer = setInterval(() => void collectMissingAttachments().catch(logFailure), 30_000);
  attachmentTimer.unref();
}
let nextDocumentCheck=0;
export async function tick() {
  if(!stopped && Date.now()>=nextDocumentCheck){nextDocumentCheck=Date.now()+60_000;await documentNotifications();await priceRecordNotifications();}
  if (schedulerEnabled && !active && !stopped) {
    const org = await one(
      "SELECT id FROM organizations WHERE is_demo=false LIMIT 1",
    );
    if (org)
      for (const source of ["pncp", "comprasgov"]) {
        const last = await one(
          "SELECT started_at FROM sync_runs WHERE source_code=$1 AND organization_id IS NULL ORDER BY started_at DESC LIMIT 1",
          [source],
        );
        if (
          !last ||
          Date.now() - new Date(last.started_at).getTime() >
            intervalMinutes * 60000
        )
          await enqueueSync(source, null);
      }
  }
  await pump();
}
export function stopJobs() {
  stopped = true;
  if (timer) clearInterval(timer);
  if (attachmentTimer) clearInterval(attachmentTimer);
}
