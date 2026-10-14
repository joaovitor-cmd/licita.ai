import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction } from "./db.js";
import { current, requireAdmin, HttpError } from "./security.js";
import { searchSchema, uuid } from "./validation.js";

export const savedSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(""),
    filters: searchSchema.omit({ page: true, pageSize: true,searchProfiles:true }).strict(),
  })
  .strict()
  .refine(
    (b) =>
      b.filters.minValue === undefined ||
      b.filters.maxValue === undefined ||
      b.filters.minValue <= b.filters.maxValue,
    {
      message: "O valor máximo deve ser maior ou igual ao mínimo.",
      path: ["filters"],
    },
  )
  .refine(
    (b) => !b.filters.from || !b.filters.to || b.filters.from <= b.filters.to,
    {
      message: "A data final deve ser posterior à inicial.",
      path: ["filters"],
    },
  );
const dto = (r: any) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  filters: r.filters,
  revision: r.revision,
  active: r.active,
});
export function searchProfileRoutes(router: Router) {
  router.patch("/search-profiles/:id/active", async (req, res) => {
    requireAdmin(req);
    const id = uuid.parse(req.params.id),
      org = current(req).organization.id;
    const body = z
      .object({ active: z.boolean(), revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    const result = await transaction(async (db) => {
      const old = await one(
        "SELECT revision,active FROM search_profiles WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [id, org],
        db,
      );
      if (!old) throw new HttpError(404, "Perfil de busca não encontrado.");
      if (old.revision !== body.revision)
        throw new HttpError(
          409,
          "Este perfil foi alterado. Atualize a lista antes de continuar.",
        );
      if (old.active === body.active)
        return one(
          "SELECT * FROM search_profiles WHERE id=$1 AND organization_id=$2",
          [id, org],
          db,
        );
      return one(
        "UPDATE search_profiles SET active=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *",
        [id, org, body.active],
        db,
      );
    });
    res.json(dto(result));
  });
  router.get("/search-profiles", async (req, res) =>
    res.json(
      (
        await rows(
          "SELECT * FROM search_profiles WHERE organization_id=$1 ORDER BY lower(name),id",
          [current(req).organization.id],
        )
      ).map(dto),
    ),
  );
  router.post("/search-profiles", async (req, res) => {
    requireAdmin(req);
    const b = savedSearchSchema.parse(req.body),
      org = current(req).organization.id;
    const result = await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        org,
      ]);
      const count = await one(
        "SELECT count(*)::int n FROM search_profiles WHERE organization_id=$1",
        [org],
        db,
      );
      if (count.n >= 50)
        throw new HttpError(
          400,
          "Sua empresa atingiu o limite de 50 buscas salvas. Edite ou exclua uma para continuar.",
        );
      return one(
        "INSERT INTO search_profiles(id,organization_id,name,description,filters) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), org, b.name, b.description, JSON.stringify(b.filters)],
        db,
      );
    });
    res.status(201).json(dto(result));
  });
  router.put("/search-profiles/:id", async (req, res) => {
    requireAdmin(req);
    const id = uuid.parse(req.params.id),
      org = current(req).organization.id;
    const { revision, ...body } = z
        .object({ revision: z.number().int().positive() })
        .passthrough()
        .parse(req.body),
      b = savedSearchSchema.parse(body);
    const result = await transaction(async (db) => {
      const old = await one(
        "SELECT revision FROM search_profiles WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [id, org],
        db,
      );
      if (!old) throw new HttpError(404, "Perfil de busca não encontrado.");
      if (old.revision !== revision)
        throw new HttpError(
          409,
          "Este perfil foi alterado por outra pessoa. Feche e atualize a lista antes de editar.",
        );
      return one(
        "UPDATE search_profiles SET name=$3,description=$4,filters=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *",
        [id, org, b.name, b.description, JSON.stringify(b.filters)],
        db,
      );
    });
    res.json(dto(result));
  });
  router.delete("/search-profiles/:id", async (req, res) => {
    requireAdmin(req);
    const id = uuid.parse(req.params.id),
      org = current(req).organization.id;
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const old = await one(
        "SELECT revision FROM search_profiles WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [id, org],
        db,
      );
      if (!old) throw new HttpError(404, "Perfil de busca não encontrado.");
      if (old.revision !== revision)
        throw new HttpError(
          409,
          "Este perfil foi alterado. Atualize a lista antes de excluir.",
        );
      await db.query(
        "DELETE FROM search_profiles WHERE id=$1 AND organization_id=$2",
        [id, org],
      );
    });
    res.json({ ok: true });
  });
}
