import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction } from "./db.js";
import { current, HttpError } from "./security.js";
import { getOpportunity, addEvent } from "./data.js";
import {
  checklistSchema,
  itemKey,
  starterTemplates,
  type ChecklistItem,
} from "./checklist-rules.js";
const uuid = z.string().uuid();
export function checklistRoutes(router: Router) {
  router.get("/checklist-templates", async (req, res) => {
    const own = await rows(
      "SELECT id,name,items,revision FROM checklist_templates WHERE organization_id=$1 AND NOT archived ORDER BY updated_at DESC,id",
      [current(req).organization.id],
    );
    res.json([
      ...starterTemplates,
      ...own.map((t) => ({ ...t, builtin: false })),
    ]);
  });
  router.post("/checklist-templates", async (req, res) => {
    const auth = current(req),
      b = checklistSchema.parse(req.body);
    const result = await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        auth.organization.id,
      ]);
      const count = await one(
        "SELECT count(*)::integer n FROM checklist_templates WHERE organization_id=$1 AND NOT archived",
        [auth.organization.id],
        db,
      );
      if (count!.n >= 100)
        throw new HttpError(400, "Limite de 100 modelos ativos por empresa.");
      return one(
        "INSERT INTO checklist_templates(id,organization_id,name,items) VALUES($1,$2,$3,$4) RETURNING id,name,items,revision",
        [randomUUID(), auth.organization.id, b.name, JSON.stringify(b.items)],
        db,
      );
    });
    res.status(201).json({ ...result, builtin: false });
  });
  router.put("/checklist-templates/:id", async (req, res) => {
    const auth = current(req),
      b = checklistSchema
        .extend({ revision: z.number().int().positive() })
        .parse(req.body);
    const result = await transaction(async (db) => {
      const t = await one(
        "SELECT id,revision FROM checklist_templates WHERE id=$1 AND organization_id=$2 AND NOT archived FOR UPDATE",
        [uuid.parse(req.params.id), auth.organization.id],
        db,
      );
      if (!t) throw new HttpError(404, "Modelo não encontrado.");
      if (t.revision !== b.revision)
        throw new HttpError(
          409,
          "O modelo foi alterado por outra pessoa. Atualize a lista antes de editar.",
        );
      return one(
        "UPDATE checklist_templates SET name=$1,items=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,name,items,revision",
        [b.name, JSON.stringify(b.items), t.id],
        db,
      );
    });
    res.json({ ...result, builtin: false });
  });
  router.delete("/checklist-templates/:id", async (req, res) => {
    const org = current(req).organization.id,
      b = z
        .object({ revision: z.number().int().positive() })
        .strict()
        .parse(req.body);
    await transaction(async (db) => {
      const t = await one(
        "SELECT id,revision FROM checklist_templates WHERE id=$1 AND organization_id=$2 AND NOT archived FOR UPDATE",
        [uuid.parse(req.params.id), org],
        db,
      );
      if (!t) throw new HttpError(404, "Modelo não encontrado.");
      if (t.revision !== b.revision)
        throw new HttpError(
          409,
          "O modelo mudou. Atualize a lista antes de arquivar.",
        );
      await db.query(
        "UPDATE checklist_templates SET archived=true,updated_at=now() WHERE id=$1",
        [t.id],
      );
    });
    res.json({ ok: true });
  });
  router.get("/opportunities/:id/checklist-applications", async (req, res) => {
    const auth = current(req),
      oid = uuid.parse(req.params.id);
    await getOpportunity(auth, oid);
    res.json(
      await rows(
        "SELECT id,template_id,template_revision,template_name,items,created_tasks,created_documents,skipped,created_at FROM checklist_applications WHERE organization_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC",
        [auth.organization.id, oid],
      ),
    );
  });
  router.post("/opportunities/:id/checklist-applications", async (req, res) => {
    const auth = current(req),
      org = auth.organization.id,
      oid = uuid.parse(req.params.id);
    await getOpportunity(auth, oid);
    const b = z
      .object({
        templateId: z.union([
          uuid,
          z.enum(["participacao-inicial", "outsourcing-impressao"]),
        ]),
        revision: z.number().int().positive(),
        selected: z
          .array(z.number().int().min(0).max(59))
          .min(1)
          .max(60)
          .refine((v) => new Set(v).size === v.length),
      })
      .strict()
      .parse(req.body);
    const result = await transaction(async (db) => {
      await db.query("SELECT id FROM opportunities WHERE id=$1 FOR UPDATE", [
        oid,
      ]);
      const builtin = starterTemplates.find((t) => t.id === b.templateId);
      const template =
        builtin ??
        (await one(
          "SELECT id,name,items,revision FROM checklist_templates WHERE id=$1 AND organization_id=$2 AND NOT archived FOR SHARE",
          [b.templateId, org],
          db,
        ));
      if (!template) throw new HttpError(404, "Modelo não encontrado.");
      const previous = await one(
        "SELECT * FROM checklist_applications WHERE organization_id=$1 AND opportunity_id=$2 AND template_id=$3 AND template_revision=$4",
        [org, oid, b.templateId, b.revision],
        db,
      );
      if (previous) return { ...previous, alreadyApplied: true };
      if (template.revision !== b.revision)
        throw new HttpError(
          409,
          "O modelo mudou. Confira a versão atual antes de aplicar.",
        );
      const items: ChecklistItem[] = b.selected.map((i) => {
        const item = template.items[i];
        if (!item) throw new HttpError(400, "Item fora do modelo.");
        return item;
      });
      let tracking = await one(
        "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
        [org, oid],
        db,
      );
      if (tracking)
        await db.query("SELECT id FROM trackings WHERE id=$1 FOR UPDATE", [
          tracking.id,
        ]);
      const docs = await rows(
        "SELECT title FROM preparation_documents WHERE organization_id=$1 AND opportunity_id=$2",
        [org, oid],
        db,
      );
      const tasks = tracking
        ? await rows(
            "SELECT title FROM tasks WHERE tracking_id=$1",
            [tracking.id],
            db,
          )
        : [];
      const keys = new Set([
        ...docs.map((d) => itemKey({ kind: "DOCUMENT", title: d.title })),
        ...tasks.map((t) => itemKey({ kind: "TASK", title: t.title })),
      ]);
      const fresh: ChecklistItem[] = [];
      for (const item of items) {
        const key = itemKey(item);
        if (!keys.has(key)) {
          fresh.push(item);
          keys.add(key);
        }
      }
      const taskCount = fresh.filter((i) => i.kind === "TASK").length,
        docCount = fresh.length - taskCount;
      if (docs.length + docCount > 100)
        throw new HttpError(
          400,
          "A aplicação ultrapassaria 100 exigências documentais. Selecione menos itens; nada foi alterado.",
        );
      if (taskCount && !tracking) {
        await db.query(
          "INSERT INTO trackings(id,organization_id,opportunity_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [randomUUID(), org, oid],
        );
        tracking = await one(
          "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
          [org, oid],
          db,
        );
        await addEvent(
          tracking!.id,
          "CREATED",
          "Acompanhamento iniciado com modelo de checklist",
          "",
          auth.user.id,
          db,
        );
      }
      for (const item of fresh) {
        if (item.kind === "TASK")
          await db.query(
            "INSERT INTO tasks(id,tracking_id,title) VALUES($1,$2,$3)",
            [randomUUID(), tracking!.id, item.title],
          );
        else
          await db.query(
            "INSERT INTO preparation_documents(id,organization_id,opportunity_id,title) VALUES($1,$2,$3,$4)",
            [randomUUID(), org, oid, item.title],
          );
      }
      const applied = await one(
        `INSERT INTO checklist_applications(id,organization_id,opportunity_id,template_id,template_revision,template_name,items,created_tasks,created_documents,skipped,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          randomUUID(),
          org,
          oid,
          b.templateId,
          b.revision,
          template.name,
          JSON.stringify(items),
          taskCount,
          docCount,
          items.length - fresh.length,
          auth.user.id,
        ],
        db,
      );
      if (tracking)
        await addEvent(
          tracking.id,
          "CHECKLIST",
          "Modelo de checklist aplicado",
          `${template.name} · versão ${b.revision}: ${taskCount} tarefas e ${docCount} exigências adicionadas; ${items.length - fresh.length} itens já existentes ou repetidos preservados.`,
          auth.user.id,
          db,
        );
      return { ...applied, alreadyApplied: false };
    });
    res.json(result);
  });
}
