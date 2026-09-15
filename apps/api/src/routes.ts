import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, one, rows, transaction } from "./db.js";
import {
  current,
  requireAdmin,
  HttpError,
  hashPassword,
  rateLimit,
} from "./security.js";
import {
  catalogSchema,
  dateValue,
  email,
  password,
  profileSchema,
  short,
  taskSchema,
  trackingSchema,
  uuid,
} from "./validation.js";
import {
  addEvent,
  catalog,
  ensureOwner,
  ensureTracking,
  getOpportunity,
  getProfile,
  getTracking,
  iso,
  listTrackings,
  mapCatalog,
  mapEvent,
  mapTask,
  searchOpportunities,
} from "./data.js";
import { enqueueSync, sourceStatus, refreshOne, ensureAttachments } from "./jobs.js";
import {openOpportunitySql,recommendationThreshold,deadlineSummary} from './availability.js';
import {companyEmailConfigured} from './smtp-settings.js';
import {normalizeCnpj,lookupCompany} from './cnpj-profile.js';

export const router = Router();
import {enforcePlan,entitlements} from './entitlements.js';
router.use(enforcePlan);
import {preparationRoutes} from './preparation.js';
preparationRoutes(router);
import {checklistRoutes} from './checklist-templates.js';
checklistRoutes(router);
import {digestRoutes} from './digests.js';
digestRoutes(router);
import {commercialRoutes} from './commercial.js';
commercialRoutes(router);
import {itemRoutes} from './item-routes.js';
itemRoutes(router);
import {changeRoutes} from './change-routes.js';
changeRoutes(router);
import {workspaceRoutes} from './workspaces.js';
workspaceRoutes(router);
import {retryDelivery} from './email-queue.js';
import {analysisView,enqueueAnalysis} from './edital-analysis.js';
import {topics,fingerprint} from './analysis-rules.js';
const id = (value: unknown) => uuid.parse(value);
const orgId = (req: any) => current(req).organization.id;
router.get("/profile", async (req, res) =>
  res.json(await getProfile(current(req))),
);
router.get('/getting-started',async(req,res)=>{
  const profile=await getProfile(current(req));
  const radar=await one('SELECT EXISTS(SELECT 1 FROM trackings WHERE organization_id=$1) AS present',[orgId(req)]);
  res.json({profileReady:profile.segments.length>0||profile.keywords.length>0,radarReady:!!radar?.present});
});
router.post('/profile/cnpj-suggestion',rateLimit('cnpj-suggestion',10,60000),async(req,res)=>{
  requireAdmin(req);
  const {cnpj}=z.object({cnpj:z.string().trim().min(1).max(24)}).strict().parse(req.body);
  let normalized:string;
  try{normalized=normalizeCnpj(cnpj);}catch(error){throw new HttpError(400,(error as Error).message);}
  try{res.json(await lookupCompany(normalized));}
  catch{throw new HttpError(502,'Não foi possível obter sugestões na fonte externa agora. Tente novamente mais tarde ou continue preenchendo o perfil manualmente. Seus dados não foram alterados por esta consulta.');}
});
router.put("/profile", async (req, res) => {
  requireAdmin(req);
  const body = profileSchema.parse(req.body);
  const { organizationName, taxId, ...profile } = body;
  await pool.query(
    "UPDATE organizations SET name=$1,tax_id=$2,profile=$3,updated_at=now() WHERE id=$4",
    [organizationName, taxId, JSON.stringify(profile), orgId(req)],
  );
  res.json(body);
});
router.get("/members", async (req, res) =>
  res.json(
    await rows(
      "SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name",
      [orgId(req)],
    ),
  ),
);
router.post("/members", async (req, res) => {
  requireAdmin(req);
  const body = z
    .object({ name: short, email, password, role: z.enum(["ADMIN", "MEMBER"]) })
    .strict()
    .parse(req.body);
  const userId = randomUUID(),
    hash = await hashPassword(body.password);
  await transaction(async (db) => {
    if (await one("SELECT id FROM users WHERE email=$1", [body.email], db))
      throw new HttpError(
        409,
        "Este e-mail já possui uma conta. A vinculação de contas existentes requer convite e ainda não está disponível.",
      );
    await db.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [userId, body.name, body.email, hash],
    );
    await db.query(
      "INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,$3)",
      [orgId(req), userId, body.role],
    );
  });
  res
    .status(201)
    .json({ id: userId, name: body.name, email: body.email, role: body.role });
});
router.get("/catalog", async (req, res) =>
  res.json(await catalog(current(req))),
);
router.post("/catalog", async (req, res) => {
  const b = catalogSchema.parse(req.body);
  res
    .status(201)
    .json(
      mapCatalog(
        await one(
          "INSERT INTO catalog(id,organization_id,type,name,description,category,keywords,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            randomUUID(),
            orgId(req),
            b.type,
            b.name,
            b.description,
            b.category,
            JSON.stringify(b.keywords),
            b.active,
          ],
        ),
      ),
    );
});
router.patch("/catalog/:id", async (req, res) => {
  const itemId = id(req.params.id),
    b = catalogSchema.partial().parse(req.body);
  const result = await transaction(async (db) => {
    const existing = await one(
      "SELECT * FROM catalog WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [itemId, orgId(req)],
      db,
    );
    if (!existing) throw new HttpError(404, "Item do catálogo não encontrado.");
    const item = { ...mapCatalog(existing), ...b };
    return mapCatalog(
      await one(
        "UPDATE catalog SET type=$1,name=$2,description=$3,category=$4,keywords=$5,active=$6,updated_at=now() WHERE id=$7 AND organization_id=$8 RETURNING *",
        [
          item.type,
          item.name,
          item.description,
          item.category,
          JSON.stringify(item.keywords),
          item.active,
          itemId,
          orgId(req),
        ],
        db,
      ),
    );
  });
  res.json(result);
});
router.delete("/catalog/:id", async (req, res) => {
  if (
    !(
      await pool.query(
        "DELETE FROM catalog WHERE id=$1 AND organization_id=$2",
        [id(req.params.id), orgId(req)],
      )
    ).rowCount
  )
    throw new HttpError(404, "Item do catálogo não encontrado.");
  res.json({ ok: true });
});
router.get("/opportunities", async (req, res) =>
  res.json(await searchOpportunities(current(req), req.query)),
);
router.get('/opportunities/:id/analysis',async(req,res)=>{
 const opportunity=await getOpportunity(current(req),id(req.params.id));
 res.json(await analysisView(orgId(req),opportunity.id,req.query.version?id(req.query.version):undefined));
});
router.post('/opportunities/:id/analysis',rateLimit('edital-analysis',6,60000),async(req,res)=>{
 const opportunity=await getOpportunity(current(req),id(req.params.id));
 res.status(202).json(await enqueueAnalysis(orgId(req),opportunity.id));
});
router.put('/opportunities/:id/analysis/:analysisId/review',async(req,res)=>{
 const opportunity=await getOpportunity(current(req),id(req.params.id));
 const b=z.object({topic:z.string().refine(v=>topics.some(t=>t.key===v)),state:z.enum(['PENDING','REVIEWED','ATTENTION']),notes:z.string().trim().max(3000)}).strict().parse(req.body);
 const analysis=await one('SELECT * FROM edital_analyses WHERE id=$1 AND organization_id=$2 AND opportunity_id=$3',[id(req.params.analysisId),orgId(req),opportunity.id]);
 if(!analysis)throw new HttpError(404,'Análise não encontrada.');
 const latest=await one('SELECT id FROM edital_analyses WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[orgId(req),opportunity.id]);
 if(latest.id!==analysis.id)throw new HttpError(409,'Versão anterior disponível apenas para consulta.');
 const source=await one('SELECT content_hash,documents FROM opportunities WHERE id=$1',[opportunity.id]);
 if(analysis.source_fingerprint!==fingerprint(source))throw new HttpError(409,'Os dados mudaram. Refaça a leitura antes de revisar esta versão.');
 if(!['READY','PARTIAL'].includes(analysis.status))throw new HttpError(409,'Aguarde a conclusão da leitura.');
 await pool.query('INSERT INTO edital_reviews(analysis_id,topic,state,notes,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(analysis_id,topic) DO UPDATE SET state=$3,notes=$4,actor_id=$5,updated_at=now()',[analysis.id,b.topic,b.state,b.notes,current(req).user.id]);
 res.json({ok:true});
});
router.get("/opportunities/:id", async (req, res) => {
  const opportunity = await getOpportunity(current(req), id(req.params.id));
  if (!opportunity.isDemo && !opportunity.documents.length) {
    try { await ensureAttachments(opportunity.id); }
    catch { return res.json({...opportunity, attachmentWarning: "A fonte não respondeu à consulta automática dos anexos. Os dados existentes foram preservados; tente atualizar novamente mais tarde."}); }
    return res.json(await getOpportunity(current(req), opportunity.id));
  }
  res.json(opportunity);
});
router.post(
  "/opportunities/:id/refresh",
  rateLimit("refresh", 15, 60_000),
  async (req, res) => {
    const opportunity = await getOpportunity(current(req), id(req.params.id));
    if (opportunity.isDemo)
      throw new HttpError(400, "Editais fictícios não têm fonte oficial.");
    await refreshOne(opportunity.id);
    res.json(await getOpportunity(current(req), opportunity.id));
  },
);
router.get("/trackings", async (req, res) =>
  res.json(await listTrackings(current(req))),
);
router.post("/trackings", async (req, res) => {
  const auth = current(req),
    body = z.object({ opportunityId: uuid }).strict().parse(req.body);
  await getOpportunity(auth, body.opportunityId);
  const trackingId = await transaction(async (db) => {
    const inserted = await one(
      "INSERT INTO trackings(id,organization_id,opportunity_id) VALUES($1,$2,$3) ON CONFLICT(organization_id,opportunity_id) DO NOTHING RETURNING id",
      [randomUUID(), auth.organization.id, body.opportunityId],
      db,
    );
    if (inserted) {
      await addEvent(
        inserted.id,
        "CREATED",
        "Oportunidade adicionada ao radar",
        "Início do acompanhamento pela empresa.",
        auth.user.id,
        db,
      );
      for (const title of [
        "Ler o edital e validar requisitos",
        "Conferir documentos e certidões",
        "Revisar proposta técnica e preços",
      ])
        await db.query(
          "INSERT INTO tasks(id,tracking_id,title) VALUES($1,$2,$3)",
          [randomUUID(), inserted.id, title],
        );
      return inserted.id;
    }
    return (
      await one(
        "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
        [auth.organization.id, body.opportunityId],
        db,
      )
    ).id;
  });
  res.status(201).json(await getTracking(auth, trackingId));
});
router.get("/trackings/:id", async (req, res) =>
  res.json(await getTracking(current(req), id(req.params.id))),
);
router.patch("/trackings/:id", async (req, res) => {
  const auth = current(req),
    trackingId = id(req.params.id),
    body = trackingSchema.parse(req.body);
  const columns: Record<string, string> = {
    stage: "stage",
    ownerId: "owner_id",
    deadline: "deadline",
    expectedValue: "expected_value",
    outcomeReason: "outcome_reason",
    outcomeCategory: "outcome_category",
    notes: "notes",
  };
  await transaction(async (db) => {
    const before = await one(
      "SELECT * FROM trackings WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [trackingId, auth.organization.id],
      db,
    );
    if (!before) throw new HttpError(404, "Acompanhamento não encontrado.");
    await ensureOwner(auth, body.ownerId, db);
    // Do not silently carry a previous result category into a new stage.
    if(body.stage && body.stage!==before.stage && body.outcomeCategory===undefined) body.outcomeCategory=null;
    const pairs = Object.entries(body).filter(([, v]) => v !== undefined);
    if (pairs.length) {
      await db.query(
        `UPDATE trackings SET ${pairs.map(([k], i) => `${columns[k]}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${pairs.length + 1} AND organization_id=$${pairs.length + 2}`,
        [...pairs.map(([, v]) => v), trackingId, auth.organization.id],
      );
      const descriptions = pairs
        .filter(
          ([k, v]) => String(before[columns[k]] ?? "") !== String(v ?? ""),
        )
        .map(([k, v]) =>
          k === "notes"
            ? "Notas internas revisadas."
            : `${k}: ${before[columns[k]] ?? "não definido"} → ${v ?? "não definido"}`,
        );
      if (descriptions.length)
        await addEvent(
          trackingId,
          "UPDATED",
          body.stage && body.stage !== before.stage
            ? "Etapa da participação alterada"
            : "Participação atualizada",
          descriptions.join("\n"),
          auth.user.id,
          db,
        );
    }
  });
  res.json(await getTracking(auth, trackingId));
});
router.post("/trackings/:id/tasks", async (req, res) => {
  const auth = current(req),
    tid = id(req.params.id),
    b = taskSchema.parse(req.body);
  const task = await transaction(async (db) => {
    await ensureTracking(auth, tid, db);
    await ensureOwner(auth, b.ownerId, db);
    const created = await one(
      "INSERT INTO tasks(id,tracking_id,title,done,deadline,owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [randomUUID(), tid, b.title, b.done, b.deadline, b.ownerId],
      db,
    );
    await addEvent(
      tid,
      "TASK_CREATED",
      "Tarefa criada",
      b.title,
      auth.user.id,
      db,
    );
    return mapTask(created);
  });
  res.status(201).json(task);
});
router.patch("/trackings/:id/tasks/:taskId", async (req, res) => {
  const auth = current(req),
    tid = id(req.params.id),
    taskId = id(req.params.taskId),
    b = taskSchema.partial().parse(req.body);
  const result = await transaction(async (db) => {
    await ensureTracking(auth, tid, db);
    await ensureOwner(auth, b.ownerId, db);
    const before = await one(
      "SELECT * FROM tasks WHERE id=$1 AND tracking_id=$2 FOR UPDATE",
      [taskId, tid],
      db,
    );
    if (!before) throw new HttpError(404, "Tarefa não encontrada.");
    const after = { ...mapTask(before), ...b };
    const saved = await one(
      "UPDATE tasks SET title=$1,done=$2,deadline=$3,owner_id=$4 WHERE id=$5 AND tracking_id=$6 RETURNING *",
      [after.title, after.done, after.deadline, after.ownerId, taskId, tid],
      db,
    );
    await addEvent(
      tid,
      "TASK_UPDATED",
      b.done === true
        ? "Tarefa concluída"
        : b.done === false
          ? "Tarefa reaberta"
          : "Tarefa atualizada",
      after.title,
      auth.user.id,
      db,
    );
    return mapTask(saved);
  });
  res.json(result);
});
router.delete("/trackings/:id/tasks/:taskId", async (req, res) => {
  const auth = current(req),
    tid = id(req.params.id);
  await transaction(async (db) => {
    await ensureTracking(auth, tid, db);
    const removed = await one(
      "DELETE FROM tasks WHERE id=$1 AND tracking_id=$2 RETURNING title",
      [id(req.params.taskId), tid],
      db,
    );
    if (!removed) throw new HttpError(404, "Tarefa não encontrada.");
    await addEvent(
      tid,
      "TASK_DELETED",
      "Tarefa excluída",
      removed.title,
      auth.user.id,
      db,
    );
  });
  res.json({ ok: true });
});
router.post("/trackings/:id/events", async (req, res) => {
  const auth = current(req),
    tid = id(req.params.id),
    b = z
      .object({ description: z.string().trim().min(1).max(5000) })
      .strict()
      .parse(req.body);
  await ensureTracking(auth, tid);
  res
    .status(201)
    .json(
      await addEvent(
        tid,
        "COMMENT",
        "Comentário da equipe",
        b.description,
        auth.user.id,
      ),
    );
});
router.get("/trackings/:id/export", async (req, res) => {
  const t = await getTracking(current(req), id(req.params.id));
  const content = [
    `# Dossiê de preparação — ${t.opportunity.title}`,
    "",
    `Empresa: ${current(req).organization.name}`,
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "> Documento interno. Não é uma proposta enviada, não comprova habilitação e não substitui o edital oficial.",
    t.opportunity.isDemo
      ? "> DEMONSTRAÇÃO: todos os dados deste edital são fictícios."
      : "",
    `\nÓrgão: ${t.opportunity.agency}`,
    `Local: ${t.opportunity.city ?? ""} / ${t.opportunity.state ?? ""}`,
    `Etapa: ${t.stage}`,
    `Prazo oficial: ${t.opportunity.closesAt ?? "Não informado"}`,
    `Prazo interno: ${t.deadline ?? "Não definido"}`,
    `Valor previsto: ${t.expectedValue ?? "Não definido"}`,
    `Portal de origem: ${t.opportunity.url ?? "Não informado"}`,
    "\n## Tarefas",
    ...t.tasks.map(
      (task) =>
        `- [${task.done ? "x" : " "}] ${task.title}${task.deadline ? ` — ${task.deadline}` : ""}`,
    ),
    "\n## Notas internas",
    t.notes || "Sem notas.",
    "\n## Motivo / resultado",
    t.outcomeReason || "Não informado.",
    "\n## Documentos da fonte",
    ...t.opportunity.documents.map((d: any) => `- ${d.name}: ${d.url}`),
    "\n## Histórico",
    ...t.events.map((e) => `- ${e.createdAt} — ${e.title}: ${e.description}`),
  ].join("\n");
  res
    .attachment(`dossie-${t.id}.md`)
    .type("text/markdown; charset=utf-8")
    .send(content);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1000 },
});
const mapDocument = (r: any) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  expiresAt: iso(r.expires_at),
  fileName: r.file_name,
  mimeType: r.mime_type,
  size: r.size,
  createdAt: iso(r.created_at),
});
router.get("/documents", async (req, res) =>
  res.json(
    (
      await rows(
        "SELECT id,name,category,expires_at,file_name,mime_type,size,created_at FROM documents WHERE organization_id=$1 ORDER BY created_at DESC",
        [orgId(req)],
      )
    ).map(mapDocument),
  ),
);
router.post(
  "/documents",
  rateLimit("upload", 30, 60_000),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "Selecione um arquivo.");
    const b = z
      .object({ name: short, category: short, expiresAt: dateValue.optional() })
      .strict()
      .parse({ ...req.body, expiresAt: req.body.expiresAt || null });
    const extension = file.originalname.toLowerCase().split(".").pop() ?? "";
    const allowed: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    const signature = file.buffer.subarray(0, 8);
    if (!allowed[extension] || file.mimetype !== allowed[extension])
      throw new HttpError(400, "Use PDF, DOCX, XLSX, PNG ou JPG.");
    const valid =
      extension === "pdf"
        ? signature.toString().startsWith("%PDF-")
        : ["docx", "xlsx"].includes(extension)
          ? signature[0] === 80 && signature[1] === 75
          : extension === "png"
            ? signature.toString("hex") === "89504e470d0a1a0a"
            : signature[0] === 255 && signature[1] === 216;
    if (!valid)
      throw new HttpError(
        400,
        "O conteúdo não corresponde ao tipo do arquivo.",
      );
    const result = await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        orgId(req),
      ]);
      const total = await one(
        "SELECT coalesce(sum(size),0) total FROM documents WHERE organization_id=$1",
        [orgId(req)],
        db,
      );
      if (Number(total.total) + file.size > 100 * 1024 * 1024)
        throw new HttpError(
          400,
          "Limite local de 100 MB por empresa atingido.",
        );
      return one(
        "INSERT INTO documents(id,organization_id,name,category,expires_at,file_name,mime_type,size,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,category,expires_at,file_name,mime_type,size,created_at",
        [
          randomUUID(),
          orgId(req),
          b.name,
          b.category,
          b.expiresAt,
          file.originalname.replace(/[\r\n\\/]/g, "_"),
          allowed[extension],
          file.size,
          file.buffer,
        ],
        db,
      );
    });
    res.status(201).json(mapDocument(result));
  },
);
router.get("/documents/:id/download", async (req, res) => {
  const d = await one(
    "SELECT * FROM documents WHERE id=$1 AND organization_id=$2",
    [id(req.params.id), orgId(req)],
  );
  if (!d) throw new HttpError(404, "Documento não encontrado.");
  res.setHeader("Cache-Control", "private, no-store");
  res.attachment(d.file_name).type(d.mime_type).send(d.content);
});
router.delete("/documents/:id", async (req, res) => {
  if (
    !(
      await pool.query(
        "DELETE FROM documents WHERE id=$1 AND organization_id=$2",
        [id(req.params.id), orgId(req)],
      )
    ).rowCount
  )
    throw new HttpError(404, "Documento não encontrado.");
  res.json({ ok: true });
});
const mapNotification = (r: any) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  read: r.read,
  createdAt: iso(r.created_at),
  url: r.url,
});
router.get("/notifications", async (req, res) =>
  res.json(
    (
      await rows(
        "SELECT * FROM notifications WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
        [orgId(req)],
      )
    ).map(mapNotification),
  ),
);
router.patch("/notifications/:id", async (req, res) => {
  const b = z.object({ read: z.boolean() }).strict().parse(req.body);
  const row = await one(
    "UPDATE notifications SET read=$1 WHERE id=$2 AND organization_id=$3 RETURNING *",
    [b.read, id(req.params.id), orgId(req)],
  );
  if (!row) throw new HttpError(404, "Notificação não encontrada.");
  res.json(mapNotification(row));
});
router.post("/notifications/read-all", async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read=true WHERE organization_id=$1",
    [orgId(req)],
  );
  res.json({ ok: true });
});
router.get('/email-deliveries',async(req,res)=>{
 requireAdmin(req);const page=z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
 const result=await one(`WITH entries AS (SELECT id,recipient,subject,status,attempts,next_attempt_at,accepted_at,last_error,created_at FROM email_deliveries WHERE organization_id=$1)
 SELECT (SELECT count(*)::int FROM entries) total,coalesce((SELECT jsonb_agg(e) FROM(SELECT * FROM entries ORDER BY created_at DESC,id LIMIT 20 OFFSET $2)e),'[]'::jsonb) items`,[orgId(req),(page-1)*20]);
 res.json({...result,page,pages:Math.ceil(result.total/20)});
});
router.post('/email-deliveries/:id/retry',async(req,res)=>{requireAdmin(req);const b=z.object({confirmUnknown:z.boolean().default(false)}).strict().parse(req.body??{});res.json(await retryDelivery(orgId(req),id(req.params.id),b.confirmUnknown));});
router.get("/preferences", async (req, res) =>
  res.json(
    (
      await one("SELECT preferences FROM organizations WHERE id=$1", [
        orgId(req),
      ])
    ).preferences,
  ),
);
router.put("/preferences", async (req, res) => {
  requireAdmin(req);
  const b = z
    .object({ inApp: z.boolean(), email: z.boolean(), minScore: z.number().int().min(0).max(100).default(60) })
    .strict()
    .parse(req.body);
  if (b.email && !await companyEmailConfigured(orgId(req)))
    throw new HttpError(
      400,
      "Configure e teste o serviço de e-mail em Configurações antes de ativar este canal.",
    );
  await pool.query("UPDATE organizations SET preferences=$1 WHERE id=$2", [
    JSON.stringify(b),
    orgId(req),
  ]);
  res.json(b);
});
const simulationInputs = z.object({monoPages:z.number().min(0).max(1e9),colorPages:z.number().min(0).max(1e9),monoPrice:z.number().min(0).max(1e6),colorPrice:z.number().min(0).max(1e6),monoCost:z.number().min(0).max(1e6),colorCost:z.number().min(0).max(1e6),fixedRevenue:z.number().min(0).max(1e12),equipment:z.number().min(0).max(1e12),operations:z.number().min(0).max(1e12),taxPercent:z.number().min(0).max(99),targetMargin:z.number().min(0).max(99),months:z.number().int().min(1).max(120)}).strict();
router.get("/simulations", async (req,res) => res.json(await rows("SELECT s.id,s.name,s.inputs,s.created_at,s.opportunity_id,o.title opportunity_title FROM simulations s LEFT JOIN opportunities o ON o.id=s.opportunity_id WHERE s.organization_id=$1 ORDER BY s.created_at DESC,s.id LIMIT 100", [orgId(req)])));
router.post("/simulations", async (req,res) => {
  const b=z.object({name:z.string().trim().min(1).max(150),inputs:simulationInputs.extend({monoIncluded:z.number().int().min(0).max(1e9).default(0),colorIncluded:z.number().int().min(0).max(1e9).default(0)}),opportunityId:z.string().uuid().nullable().default(null)}).strict().parse(req.body);
  if(b.opportunityId)await getOpportunity(current(req),b.opportunityId);
  res.status(201).json(await one("INSERT INTO simulations(id,organization_id,name,inputs,opportunity_id) VALUES($1,$2,$3,$4,$5) RETURNING id,name,inputs,created_at,opportunity_id",[randomUUID(),orgId(req),b.name,JSON.stringify(b.inputs),b.opportunityId]));
});
router.get('/simulation-context/:id',async(req,res)=>{
 const opportunity=await getOpportunity(current(req),id(req.params.id));
 res.json({id:opportunity.id,title:opportunity.title,agency:opportunity.agency,value:opportunity.value});
});
router.get("/sources", async (req, res) =>
  res.json(await sourceStatus(current(req))),
);
router.post("/sources/sync", rateLimit("sync", 4, 60_000), async (req, res) => {
  requireAdmin(req);
  if (current(req).organization.isDemo)
    throw new HttpError(
      403,
      "A demonstração não executa coletas. Crie sua conta para consultar fontes reais.",
    );
  const b = z
    .object({ sourceCode: z.enum(["pncp", "comprasgov"]).optional() })
    .strict()
    .parse(req.body ?? {});
  const jobId = await enqueueSync(b.sourceCode ?? "pncp", orgId(req));
  res
    .status(202)
    .json({
      jobId,
      message: "Coleta adicionada à fila. Acompanhe o andamento nesta página.",
    });
});
router.get("/dashboard", async (req, res) => {
  const plan=await entitlements(current(req).organization.id);
  if(!plan.features.includes('discovery') || !plan.features.includes('radar')) throw new HttpError(403,'O resumo de oportunidades e radar não está incluído neste plano. Acesse os módulos disponíveis pelo menu.');
  const preferences = await one('SELECT preferences FROM organizations WHERE id=$1',[current(req).organization.id]);
  const minScore = recommendationThreshold(preferences?.preferences?.minScore);
  const auth = current(req),
    [first, trackings, events] = await Promise.all([
      searchOpportunities(auth, { status: 'open', pageSize: 1, sort: "newest" }),
      listTrackings(auth),
      rows(
        "SELECT e.* FROM events e JOIN trackings t ON t.id=e.tracking_id WHERE t.organization_id=$1 ORDER BY e.created_at DESC LIMIT 8",
        [auth.organization.id],
      ),
    ]);
  const clause = auth.organization.isDemo
    ? "demo_org_id=$1"
    : "demo_org_id IS NULL";
  const args = auth.organization.isDemo ? [auth.organization.id] : [];
  const [byState, byModality, recommended, last] = await Promise.all([
    rows(
      `SELECT coalesce(state,'N/I') label,count(*)::int count FROM opportunities o WHERE ${clause} AND ${openOpportunitySql} GROUP BY state ORDER BY count(*) DESC`,
      args,
    ),
    rows(
      `SELECT coalesce(modality,'Não informada') label,count(*)::int count FROM opportunities o WHERE ${clause} AND ${openOpportunitySql} GROUP BY modality ORDER BY count(*) DESC`,
      args,
    ),
    searchOpportunities(auth, { status: 'open', minScore, pageSize: 4 }),
    one(`SELECT max(synced_at) date FROM opportunities WHERE ${clause}`, args),
  ]);
  const active = trackings.filter(
    (t) => !["WON", "LOST", "DISCARDED"].includes(t.stage),
  );
  const deadlines = deadlineSummary(trackings);
  res.json({
    stats: {
      opportunities: first.total,
      recommended: recommended.total,
      tracked: trackings.length,
      urgent: deadlines.urgent,
      overdue: deadlines.overdue,
      potentialValue: active.reduce(
        (sum, t) => sum + (t.expectedValue ?? t.opportunity.value ?? 0),
        0,
      ),
    },
    recommended: recommended.items,
    recommendationMinScore: minScore,
    deadlines: deadlines.deadlines,
    byState,
    byModality,
    activity: events.map(mapEvent),
    lastSync: auth.organization.isDemo ? null : iso(last?.date),
  });
});
