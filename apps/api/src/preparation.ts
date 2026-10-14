import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { current, HttpError } from "./security.js";
import { one, rows, transaction } from "./db.js";
import { getOpportunity, addEvent } from "./data.js";
import { analysisView, ANALYSIS_ENGINE_VERSION } from "./edital-analysis.js";
import { fingerprint, topics } from "./analysis-rules.js";
import { documentState } from "./preparation-rules.js";
import {lockRadarOrder,ensureOrderedTracking} from './radar-order.js';
const uuid = z.string().uuid();
const title = z.string().trim().min(3).max(240);
const topicKey = z.string().refine((v) => topics.some((t) => t.key === v));
export function preparationRoutes(router: Router) {
  router.get("/opportunities/:id/preparation", async (req, res) => {
    const auth = current(req),
      oid = uuid.parse(req.params.id),
      org = auth.organization.id;
    await getOpportunity(auth, oid);
    const view = await analysisView(org, oid),
      a = view.analysis;
    const source = await one(
      "SELECT content_hash,documents FROM opportunities WHERE id=$1",
      [oid],
    );
    const version = `${a?.id ?? "none"}:${fingerprint(source)}`;
    const documents = await rows(
      `SELECT p.*,d.name document_name,d.expires_at,u.name reviewer_name
      FROM preparation_documents p LEFT JOIN documents d ON d.id=p.document_id AND d.organization_id=p.organization_id
      LEFT JOIN users u ON u.id=p.reviewed_by WHERE p.organization_id=$1 AND p.opportunity_id=$2 ORDER BY p.created_at,p.id`,
      [org, oid],
    );
    for (const d of documents) d.effective_state = documentState(d, version);
    const tracking = await one(
      "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
      [org, oid],
    );
    const tasks = tracking
      ? await rows(
          "SELECT id,title,done,source_analysis_id,source_topic FROM tasks WHERE tracking_id=$1 ORDER BY created_at",
          [tracking.id],
        )
      : [];
    const simulation = await one(
      "SELECT count(*)::integer total FROM simulations WHERE organization_id=$1 AND opportunity_id=$2",
      [org, oid],
    );
    const pendingTopics =
      topics.length -
      (a && !a.stale
        ? a.reviews.filter((r: any) => r.state === "REVIEWED").length
        : 0);
    const pendingDocuments = documents.filter(
      (d) => d.effective_state !== "REVIEWED",
    ).length;
    const incompleteAttachments =
      !a?.result?.documents?.length ||
      a.result.documents.some((d: any) => d.status !== "READ");
    const nextAction = !a
      ? "Inicie a leitura dos anexos e confira sua cobertura."
      : a.stale
        ? "Refaça a leitura: os dados ou anexos mudaram."
        : ["PENDING", "RUNNING"].includes(a.status)
          ? "Aguarde a leitura dos anexos."
          : a.status === "FAILED"
            ? "Tente a leitura novamente e confira os originais."
            : pendingDocuments
              ? "Confira as pendências do checklist documental."
              : !documents.length
                ? "Cadastre as exigências documentais após conferir o edital."
                : pendingTopics
                  ? "Confira os temas ainda não revisados."
                  : incompleteAttachments
                    ? "Confira manualmente os anexos com leitura incompleta."
                    : !simulation?.total
                      ? "Registre uma simulação vinculada a esta oportunidade."
                      : tasks.some((t) => !t.done)
                        ? "Conclua as tarefas pendentes da participação."
                        : "Faça a conferência final no edital e no portal oficial.";
    res.json({
      documents,
      tasks,
      trackingId: tracking?.id ?? null,
      summary: {
        pendingTopics,
        pendingDocuments,
        documentCount: documents.length,
        simulationCount: simulation?.total ?? 0,
        pendingTasks: tasks.filter((t) => !t.done).length,
        incompleteAttachments,
        analysisStatus: a?.status ?? null,
        stale: !!a?.stale,
        nextAction,
      },
    });
  });
  router.post("/opportunities/:id/preparation/actions", async (req, res) => {
    const auth = current(req),
      oid = uuid.parse(req.params.id),
      org = auth.organization.id;
    await getOpportunity(auth, oid);
    const b = z
      .object({
        analysisId: uuid,
        topic: topicKey,
        kind: z.enum(["TASK", "DOCUMENT"]),
        title,
      })
      .strict()
      .parse(req.body);
    const result = await transaction(async (db) => {
      await lockRadarOrder(org,db);
      const source = await one(
        "SELECT content_hash,documents FROM opportunities WHERE id=$1 FOR UPDATE",
        [oid],
        db,
      );
      const a = await one(
        "SELECT * FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
        [org, oid],
        db,
      );
      if (
        !a ||
        a.id !== b.analysisId ||
        a.source_fingerprint !== fingerprint(source) ||
        a.result?.version !== ANALYSIS_ENGINE_VERSION ||
        !["READY", "PARTIAL"].includes(a.status)
      )
        throw new HttpError(
          409,
          "Use uma leitura atual e concluída para criar ações.",
        );
      const evidence =
        a.result?.documents?.flatMap((d: any) =>
          (d.evidence ?? [])
            .filter((e: any) => e.topic === b.topic)
            .map((e: any) => ({ ...e, documentName: d.name, url: d.url })),
        ) ?? [];
      if (!evidence.length)
        throw new HttpError(
          400,
          "Não há trecho localizado para este tema. Cadastre a exigência manualmente após conferir o original.",
        );
      if (b.kind === "DOCUMENT") {
        const count = await one(
          "SELECT count(*)::integer n FROM preparation_documents WHERE organization_id=$1 AND opportunity_id=$2",
          [org, oid],
          db,
        );
        if (count!.n >= 100)
          throw new HttpError(
            400,
            "Limite de 100 exigências por oportunidade.",
          );
        const inserted = await one(
          `INSERT INTO preparation_documents(id,organization_id,opportunity_id,title,source_analysis_id,source_topic,source_evidence)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
          [
            randomUUID(),
            org,
            oid,
            b.title,
            a.id,
            b.topic,
            JSON.stringify(evidence),
          ],
          db,
        );
        return (
          inserted ??
          (await one(
            "SELECT id FROM preparation_documents WHERE organization_id=$1 AND opportunity_id=$2 AND source_analysis_id=$3 AND source_topic=$4",
            [org, oid, a.id, b.topic],
            db,
          ))
        );
      }
      const tracking = await ensureOrderedTracking(org,oid,db);
      const inserted = await one(
        `INSERT INTO tasks(id,tracking_id,title,source_analysis_id,source_topic,source_evidence) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [
          randomUUID(),
          tracking!.id,
          b.title,
          a.id,
          b.topic,
          JSON.stringify(evidence),
        ],
        db,
      );
      if (inserted)
        await addEvent(
          tracking!.id,
          "TASK",
          "Tarefa criada a partir da leitura",
          `${b.title}\n${topics.find((t) => t.key === b.topic)!.action}\n${evidence.map((e: any) => `${e.documentName}, página ${e.page}: ${e.quote}`).join("\n")}`,
          auth.user.id,
          db,
        );
      return {
        trackingId: tracking!.id,
        ...(inserted ??
          (await one(
            "SELECT id FROM tasks WHERE tracking_id=$1 AND source_analysis_id=$2 AND source_topic=$3",
            [tracking!.id, a.id, b.topic],
            db,
          ))),
      };
    });
    res.json(result);
  });
  router.post("/opportunities/:id/preparation/documents", async (req, res) => {
    const auth = current(req),
      oid = uuid.parse(req.params.id),
      org = auth.organization.id;
    await getOpportunity(auth, oid);
    const b = z.object({ title }).strict().parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        await db.query("SELECT id FROM opportunities WHERE id=$1 FOR UPDATE", [
          oid,
        ]);
        const count = await one(
          "SELECT count(*)::integer n FROM preparation_documents WHERE organization_id=$1 AND opportunity_id=$2",
          [org, oid],
          db,
        );
        if (count!.n >= 100)
          throw new HttpError(
            400,
            "Limite de 100 exigências por oportunidade.",
          );
        return one(
          "INSERT INTO preparation_documents(id,organization_id,opportunity_id,title) VALUES($1,$2,$3,$4) RETURNING id",
          [randomUUID(), org, oid, b.title],
          db,
        );
      }),
    );
  });
  router.put(
    "/opportunities/:id/preparation/documents/:documentId",
    async (req, res) => {
      const auth = current(req),
        oid = uuid.parse(req.params.id),
        org = auth.organization.id,
        pid = uuid.parse(req.params.documentId);
      await getOpportunity(auth, oid);
      const b = z
        .object({
          title,
          documentId: uuid.nullable(),
          state: z.enum(["MISSING", "LINKED", "REVIEWED", "UPDATE"]),
          notes: z.string().trim().max(3000),
          revision: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
      await transaction(async (db) => {
        const source = await one(
          "SELECT content_hash,documents FROM opportunities WHERE id=$1 FOR UPDATE",
          [oid],
          db,
        );
        const row = await one(
          "SELECT * FROM preparation_documents WHERE id=$1 AND organization_id=$2 AND opportunity_id=$3 FOR UPDATE",
          [pid, org, oid],
          db,
        );
        if (!row) throw new HttpError(404, "Exigência não encontrada.");
        if (row.revision !== b.revision)
          throw new HttpError(
            409,
            "Outra pessoa alterou este item. Atualize a página antes de salvar.",
          );
        const doc = b.documentId
          ? await one(
              "SELECT id,expires_at FROM documents WHERE id=$1 AND organization_id=$2 FOR SHARE",
              [b.documentId, org],
              db,
            )
          : null;
        if (b.documentId && !doc)
          throw new HttpError(
            404,
            "Documento não encontrado na biblioteca da empresa.",
          );
        if ((!doc && b.state !== "MISSING") || (doc && b.state === "MISSING"))
          throw new HttpError(
            400,
            "Selecione um estado compatível com o vínculo do documento.",
          );
        if (
          b.state === "REVIEWED" &&
          doc?.expires_at &&
          new Date(doc.expires_at).getTime() <= Date.now()
        )
          throw new HttpError(
            400,
            "O documento venceu. Vincule um arquivo atualizado antes de conferir.",
          );
        const a = await one(
          "SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
          [org, oid],
          db,
        );
        await db.query(
          `UPDATE preparation_documents SET title=$1,document_id=$2,state=$3,notes=$4,reviewed_by=$5,reviewed_at=$6,review_version=$7,revision=revision+1 WHERE id=$8`,
          [
            b.title,
            b.documentId,
            b.state,
            b.notes,
            b.state === "REVIEWED" ? auth.user.id : null,
            b.state === "REVIEWED" ? new Date() : null,
            b.state === "REVIEWED"
              ? `${a?.id ?? "none"}:${fingerprint(source)}`
              : null,
            pid,
          ],
        );
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)",
          [org, auth.user.id, `DOCUMENT_REQUIREMENT_${b.state}`, pid],
        );
      });
      res.json({ ok: true });
    },
  );
  router.delete(
    "/opportunities/:id/preparation/documents/:documentId",
    async (req, res) => {
      const auth = current(req),
        oid = uuid.parse(req.params.id);
      await getOpportunity(auth, oid);
      const b = z
        .object({ revision: z.number().int().positive() })
        .strict()
        .parse(req.body);
      await transaction(async (db) => {
        const deleted = await one(
          "DELETE FROM preparation_documents WHERE id=$1 AND organization_id=$2 AND opportunity_id=$3 AND revision=$4 RETURNING id",
          [
            uuid.parse(req.params.documentId),
            auth.organization.id,
            oid,
            b.revision,
          ],
          db,
        );
        if (!deleted)
          throw new HttpError(
            409,
            "Item removido ou alterado. Atualize a página.",
          );
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)",
          [
            auth.organization.id,
            auth.user.id,
            "DOCUMENT_REQUIREMENT_REMOVED",
            deleted.id,
          ],
        );
      });
      res.json({ ok: true });
    },
  );
}
