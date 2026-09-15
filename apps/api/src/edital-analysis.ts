import { randomUUID, createHash } from "node:crypto";
import { one, pool, rows } from "./db.js";
import {
  fingerprint,
  findEvidence,
  officialPdfUrl,
  topics,
} from "./analysis-rules.js";
import { downloadPdf, readPdf } from "./pdf-reader.js";
import { HttpError } from "./security.js";
export async function analysisView(org: string, opportunity: string, version?:string) {
  const versions=await rows('SELECT id,status,created_at FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20',[org,opportunity]);
  const row = await one(
    "SELECT * FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC,id DESC LIMIT 1",
    [org, opportunity,version??null],
  );
  if(version&&!row)throw new HttpError(404,'Versão não encontrada.');
  const source = await one(
    "SELECT content_hash,documents FROM opportunities WHERE id=$1",
    [opportunity],
  );
  return {
    analysis: row
      ? {
          ...row,
          stale: row.source_fingerprint !== fingerprint(source)||versions[0]?.id!==row.id,
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
  const source = await one(
    "SELECT content_hash,documents FROM opportunities WHERE id=$1",
    [opportunity],
  );
  const active = await one(
    "SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND status IN ('PENDING','RUNNING')",
    [org, opportunity],
  );
  if (active) return active;
  const recent = await one(
    "SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 AND created_at>now()-interval '30 seconds'",
    [org, opportunity],
  );
  if (recent)
    throw new HttpError(
      429,
      "Aguarde alguns segundos antes de solicitar uma nova leitura.",
    );
  return one(
    "INSERT INTO edital_analyses(id,organization_id,opportunity_id,status,source_fingerprint) VALUES($1,$2,$3,'PENDING',$4) RETURNING id",
    [randomUUID(), org, opportunity, fingerprint(source)],
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
    await db.query(
      "UPDATE edital_analyses SET status='FAILED',error='A leitura foi interrompida. Solicite uma nova análise.',finished_at=now() WHERE status='RUNNING'",
    );
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
    await db.query(
      "UPDATE edital_analyses SET status='RUNNING',source_fingerprint=$2 WHERE id=$1",
      [job.id, sourceFingerprint],
    );
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(120000),
    ]);
    try {
      const documents: any[] = [];
      const files = Array.isArray(source.documents) ? source.documents : [];
      for (const [index, file] of files.entries()) {
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
          const bytes = await downloadPdf(entry.url, signal);
          entry.hash = createHash("sha256").update(bytes).digest("hex");
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
      await db.query(
        "UPDATE edital_analyses SET status=$2,result=$3,finished_at=now() WHERE id=$1",
        [
          job.id,
          allRead ? "READY" : "PARTIAL",
          JSON.stringify({
            version: 1,
            method: "Busca de trechos por temas, sem IA generativa",
            documents,
            warning: files.length
              ? "A cobertura se limita aos anexos listados nesta oportunidade no momento da leitura. Menções não comprovam exigências nem atendimento."
              : "Nenhum anexo disponível nesta oportunidade. Atualize os anexos e tente novamente.",
          }),
        ],
      );
    } catch {
      await db.query(
        "UPDATE edital_analyses SET status='FAILED',error='Não foi possível concluir a leitura. Tente novamente.',finished_at=now() WHERE id=$1",
        [job.id],
      );
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
