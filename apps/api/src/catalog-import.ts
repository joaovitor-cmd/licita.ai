import type { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction } from "./db.js";
import { current, HttpError, rateLimit } from "./security.js";
import { catalogSchema } from "./validation.js";

export const catalogIdentity = (item: { type: string; name: string }) =>
  `${item.type}:${item.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()}`;
export function catalogPreview(
  input: unknown[],
  existing: { type: string; name: string }[],
) {
  const labels: Record<string, string> = {
    name: "Nome",
    type: "Tipo",
    description: "Descrição",
    category: "Categoria",
    keywords: "Palavras-chave",
    unit: "Unidade",
    unitCost: "Custo interno",
    salePrice: "Preço de venda",
    priceBasis: "Periodicidade",
  };
  const known = new Set(existing.map(catalogIdentity)),
    seen = new Set<string>();
  return input.map((raw, index) => {
    const result = catalogSchema.safeParse(raw);
    if (!result.success)
      return {
        row: index + 1,
        item: null,
        issues: result.error.issues.map(
          (i) =>
            `${labels[String(i.path[0])] || "Item"}: confira o formato e o tamanho do campo.${["unitCost", "salePrice"].includes(String(i.path[0])) ? " Use um valor não negativo com até quatro casas decimais." : ""}`,
        ),
        duplicate: false,
      };
    const key = catalogIdentity(result.data),
      duplicate = known.has(key) || seen.has(key);
    seen.add(key);
    const warnings = [];
    if (
      (result.data.unitCost !== null || result.data.salePrice !== null) &&
      (!result.data.unit || !result.data.priceBasis)
    )
      warnings.push(
        "Valor informado sem unidade ou periodicidade; confira antes de usar em simulações.",
      );
    return {
      row: index + 1,
      item: result.data,
      issues: [],
      duplicate,
      warnings,
    };
  });
}
export function catalogImportRoutes(router: Router) {
  router.post(
    "/catalog/import/preview",
    rateLimit("catalog-preview", 20, 60000),
    async (req, res) => {
      const body = z
        .object({ items: z.array(z.unknown()).min(1).max(200) })
        .strict()
        .parse(req.body);
      const existing = await rows(
        "SELECT type,name FROM catalog WHERE organization_id=$1",
        [current(req).organization.id],
      );
      res.json({
        rows: catalogPreview(body.items, existing),
        notice:
          "Nada foi gravado. Confira os campos e selecione os itens. Duplicados por tipo/nome não substituem o catálogo.",
      });
    },
  );
  router.post(
    "/catalog/import/confirm",
    rateLimit("catalog-import", 10, 60000),
    async (req, res) => {
      const body = z
          .object({
            requestId: z.uuid(),
            items: z.array(catalogSchema).min(1).max(200),
          })
          .strict()
          .parse(req.body),
        auth = current(req);
      const hash = createHash("sha256")
        .update(JSON.stringify(body.items))
        .digest("hex");
      const result = await transaction(async (db) => {
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `catalog-import:${auth.organization.id}`,
        ]);
        const previous = await one(
          "SELECT input_hash,result FROM catalog_imports WHERE organization_id=$1 AND request_id=$2",
          [auth.organization.id, body.requestId],
          db,
        );
        if (previous) {
          if (previous.input_hash !== hash)
            throw new HttpError(
              409,
              "Esta confirmação já foi usada para outros dados. Refaça a prévia.",
            );
          return previous.result;
        }
        const existing = await rows(
          "SELECT type,name FROM catalog WHERE organization_id=$1",
          [auth.organization.id],
          db,
        );
        if (catalogPreview(body.items, existing).some((row) => row.duplicate))
          throw new HttpError(
            409,
            "Há itens com o mesmo tipo e nome no catálogo ou na seleção. Refaça a prévia; nenhum item desta importação foi gravado.",
          );
        // One bounded insert rather than one round trip per row. Existing items are never overwritten.
        const ids = body.items.map(() => randomUUID());
        await db.query(
          `INSERT INTO catalog(id,organization_id,type,name,description,category,keywords,active,unit,unit_cost,sale_price,price_basis)
    SELECT x.id,$1,x.type,x.name,x.description,x.category,x.keywords,x.active,x.unit,x."unitCost",x."salePrice",x."priceBasis"
    FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,type text,name text,description text,category text,keywords jsonb,active boolean,unit text,"unitCost" numeric,"salePrice" numeric,"priceBasis" text)`,
          [
            auth.organization.id,
            JSON.stringify(
              body.items.map((item, index) => ({ ...item, id: ids[index] })),
            ),
          ],
        );
        const result = { created: ids.length, ids };
        await db.query(
          "INSERT INTO catalog_imports(organization_id,request_id,input_hash,result,imported_by) VALUES($1,$2,$3,$4,$5)",
          [
            auth.organization.id,
            body.requestId,
            hash,
            JSON.stringify(result),
            auth.user.id,
          ],
        );
        return result;
      });
      res.status(201).json(result);
    },
  );
}
