import { randomUUID, createHash } from "node:crypto";
import { one, pool, rows, transaction, type Database } from "./db.js";
import {
  fingerprint,
  findEvidence,
  officialPdfUrl,
  topics,
} from "./analysis-rules.js";
import { downloadPdf, readPdf } from "./pdf-reader.js";
import { HttpError } from "./security.js";
export const ANALYSIS_ENGINE_VERSION = 1;
export async function analysisView(
  org: string,
  opportunity: string,
  version?: string,
) {
  const versions = await rows(
    "SELECT id,status,created_at FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20",
    [org, opportunity],
  );
  const row = await one(
    "SELECT * FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC,id DESC LIMIT 1",
    [org, opportunity, version ?? null],
  );
  if (version && !row) throw new HttpError(404, "Versão não encontrada.");
  const source = await one(
    "SELECT content_hash,documents FROM opportunities WHERE id=$1",
    [opportunity],
  );
  return {
    analysis: row
      ? {
          ...row,
          stale:
            row.source_fingerprint !== fingerprint(source) ||
            versions[0]?.id !== row.id ||
            (!!row.result && row.result.version !== ANALYSIS_ENGINE_VERSION),
          reviews: await rows(
            "SELECT topic,state,notes,updated_at FROM edital_reviews WHERE analysis_id=$1",
            [row.id],
          ),
        }
      : null,
    topics,
    versions,
  };
}
export async function enqueueAnalysis(org: string, opportunity: string) {
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `analysis:${org}:${opportunity}`,
    ]);
    const source = await one(
      "SELECT content_hash,documents FROM opportunities WHERE id=$1",
      [opportunity],
      db,
    );
    const active = await one(
      "SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND status IN ('PENDING','RUNNING')",
      [org, opportunity],
      db,
    );
    if (active) return active;
    const recent = await one(
      "SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND created_at>now()-interval '30 seconds'",
      [org, opportunity],
      db,
    );
    if (recent)
      throw new HttpError(
        429,
        "Aguarde alguns segundos antes de solicitar uma nova leitura.",
      );
    return one(
      "INSERT INTO edital_analyses(id,organization_id,opportunity_id,status,source_fingerprint) VALUES($1,$2,$3,'PENDING',$4) RETURNING id",
      [randomUUID(), org, opportunity, fingerprint(source)],
      db,
    );
  });
}
async function finishNotice(db: Database, job: any, status: string) {
  const title =
    status === "FAILED"
      ? "Leitura dos anexos não concluída"
      : status === "READY"
        ? "Leitura dos anexos concluída"
        : "Leitura dos anexos concluída com pendências";
  const description =
    status === "FAILED"
      ? "Abra a oportunidade para consultar o motivo e tentar novamente."
      : "O resultado está salvo. Confira a cobertura e as evidências antes de tomar decisões.";
  await db.query(
    `INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key)
    SELECT $1,id,$3,$4,$5,$6 FROM organizations WHERE id=$2 AND active=true AND COALESCE((preferences->>'inApp')::boolean,true)
    ON CONFLICT(organization_id,dedupe_key) DO NOTHING`,
    [
      randomUUID(),
      job.organization_id,
      title,
      description,
      `/app/oportunidades/${job.opportunity_id}`,
      `analysis:${job.id}:finished`,
    ],
  );
}
let running: Promise<void> | undefined,
  timer: NodeJS.Timeout | undefined,
  controller: AbortController | undefined;
export function startAnalysisWorker() {
  timer = setInterval(() => {
    if (!running) {
      running = processAnalysis()
        .catch(() =>
          console.warn(
            "Leitura assistida temporariamente indisponível; resultado preservado.",
          ),
        )
        .finally(() => {
          running = undefined;
        });
    }
  }, 3000);
  timer.unref();
}
export async function stopAnalysisWorker() {
  if (timer) clearInterval(timer);
  controller?.abort();
  await running;
}
export async function processAnalysis() {
  const db = await pool.connect();
  let locked = false,
    discard = false;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(8206913) locked"))
      .rows[0].locked;
    if (!locked) return;
    await transaction(async (recovery) => {
      const interrupted = await rows(
        "UPDATE edital_analyses SET status='FAILED',progress=jsonb_build_object('phase','INTERRUPTED'),error='A leitura foi interrompida. Solicite uma nova análise.',finished_at=now() WHERE status='RUNNING' RETURNING id,organization_id,opportunity_id",
        [],
        recovery,
      );
      for (const item of interrupted)
        await finishNotice(recovery, item, "FAILED");
    });
    const job = await one(
      "SELECT * FROM edital_analyses WHERE status='PENDING' ORDER BY created_at,id LIMIT 1",
      [],
      db,
    );
    if (!job) return;
    const source = await one(
      "SELECT documents,content_hash,demo_org_id FROM opportunities WHERE id=$1",
      [job.opportunity_id],
      db,
    );
    const sourceFingerprint = fingerprint(source);
    const files = Array.isArray(source.documents) ? source.documents : [];
    const progress = async (
      phase: string,
      processed: number,
      currentDocument?: string,
    ) => {
      await db.query("UPDATE edital_analyses SET progress=$2 WHERE id=$1", [
        job.id,
        JSON.stringify({
          phase,
          processed,
          total: files.length,
          currentDocument: currentDocument?.slice(0, 200),
        }),
      ]);
    };
    await db.query(
      "UPDATE edital_analyses SET status='RUNNING',source_fingerprint=$2 WHERE id=$1",
      [job.id, sourceFingerprint],
    );
    await progress("PREPARING", 0);
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(120000),
    ]);
    try {
      const documents: any[] = [];
      for (const [index, file] of files.entries()) {
        await progress("CHECKING", index, String(file.name || "Anexo"));
        const entry: any = {
          name: String(file.name || "Anexo"),
          url: String(file.url || ""),
          status: "PENDING",
          readPages: 0,
          totalPages: null,
          evidence: [],
        };
        documents.push(entry);
        if (index >= 12 || signal.aborted) {
          entry.message =
            "Limite desta leitura atingido; confira este anexo manualmente.";
          continue;
        }
        if (source.demo_org_id) {
          entry.message =
            "Anexo de demonstração: não foi baixado nem analisado.";
          continue;
        }
        if (!officialPdfUrl(entry.url)) {
          entry.message =
            "Origem ou formato de link ainda não suportado. Abra o documento original.";
          continue;
        }
        try {
          await progress("DOWNLOADING", index, entry.name);
          const bytes = await downloadPdf(entry.url, signal);
          entry.hash = createHash("sha256").update(bytes).digest("hex");
          await progress("READING", index, entry.name);
          const pdf = await readPdf(bytes, signal);
          entry.readPages = pdf.pages.filter(
            (p) => p.text.replace(/\s/g, "").length >= 30,
          ).length;
          entry.totalPages = pdf.totalPages;
          entry.evidence = findEvidence(pdf.pages);
          entry.status =
            !pdf.partial && entry.readPages === pdf.totalPages
              ? "READ"
              : "PARTIAL";
          entry.message =
            entry.status === "READ"
              ? "Texto extraído; interpretação e tabelas exigem conferência."
              : "Há páginas sem texto suficiente ou fora do limite. Pode exigir leitura manual ou OCR.";
        } catch (error) {
          entry.status = "PENDING";
          entry.message = (error as Error).message;
        }
      }
      const allRead =
        documents.length > 0 && documents.every((d) => d.status === "READ");
      await progress("FINALIZING", files.length);
      await transaction(async (final) => {
        await final.query(
          "UPDATE edital_analyses SET status=$2,result=$3,progress=$4,finished_at=now() WHERE id=$1",
          [
            job.id,
            allRead ? "READY" : "PARTIAL",
            JSON.stringify({
            version: ANALYSIS_ENGINE_VERSION,
              method: "Busca de trechos por temas, sem IA generativa",
              documents,
              warning: files.length
                ? "A cobertura se limita aos anexos listados nesta oportunidade no momento da leitura. Menções não comprovam exigências nem atendimento."
                : "Nenhum anexo disponível nesta oportunidade. Atualize os anexos e tente novamente.",
            }),
            JSON.stringify({
              phase: "DONE",
              processed: files.length,
              total: files.length,
            }),
          ],
        );
        await finishNotice(final, job, allRead ? "READY" : "PARTIAL");
      });
    } catch {
      await transaction(async (final) => {
        await final.query(
          "UPDATE edital_analyses SET status='FAILED',progress=jsonb_build_object('phase','FAILED'),error='Não foi possível concluir a leitura. Tente novamente.',finished_at=now() WHERE id=$1",
          [job.id],
        );
        await finishNotice(final, job, "FAILED");
      });
    }
  } finally {
    controller = undefined;
    try {
      if (locked) await db.query("SELECT pg_advisory_unlock(8206913)");
    } catch {
      discard = true;
    }
    db.release(discard);
  }
}
