import type { Router } from "express";
import { z } from "zod";
import { one, transaction } from "./db.js";
import { current, requireAdmin, HttpError, rateLimit } from "./security.js";
import { normalizeCnpj, lookupCompany } from "./cnpj-profile.js";
const text = (max = 200) => z.string().trim().max(max).default("");
export const companyDetailsSchema = z
  .object({
    legalName: text(300),
    tradeName: text(300),
    legalNature: text(),
    companySize: text(100),
    phone: text(40),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    street: text(300),
    number: text(40),
    complement: text(),
    district: text(),
    city: text(),
    state: z.enum(['','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX']).default(""),
    zipCode: z
      .string()
      .trim()
      .regex(/^(?:\d{5}-?\d{3})?$/)
      .default(""),
    stateRegistration: text(60),
    municipalRegistration: text(60),
  })
  .strict();
function view(row: any) {
  return {
    companyName: row.name,
    taxId: row.tax_id ?? "",
    revision: row.company_revision,
    details: companyDetailsSchema.parse(row.company_details),
  };
}
export function companyDetailsRoutes(router: Router) {
  router.get("/company-details", async (req, res) => {
    res.json(
      view(
        await one(
          "SELECT name,tax_id,company_details,company_revision FROM organizations WHERE id=$1",
          [current(req).organization.id],
        ),
      ),
    );
  });
  router.put("/company-details", async (req, res) => {
    requireAdmin(req);
    const auth = current(req),
      body = z
        .object({
          companyName: z.string().trim().min(1).max(200),
          taxId: z.string().trim().max(24),
          revision: z.number().int().positive(),
          details: companyDetailsSchema,
        })
        .strict()
        .parse(req.body);
    let taxId: string | null = null;
    try {
      taxId = body.taxId ? normalizeCnpj(body.taxId) : null;
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const result = await transaction(async (db) => {
      const row = await one(
        "SELECT name,tax_id,company_details,company_revision FROM organizations WHERE id=$1 FOR UPDATE",
        [auth.organization.id],
        db,
      );
      if (row.company_revision !== body.revision)
        throw new HttpError(
          409,
          "Os dados da empresa foram alterados. Recarregue e compare antes de salvar; seu preenchimento foi preservado.",
        );
      const saved = await one(
        "UPDATE organizations SET name=$2,tax_id=$3,company_details=$4,company_revision=company_revision+1,updated_at=now() WHERE id=$1 RETURNING name,tax_id,company_details,company_revision",
        [
          auth.organization.id,
          body.companyName,
          taxId,
          JSON.stringify(body.details),
        ],
        db,
      );
      await db.query(
        "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)",
        [
          auth.organization.id,
          auth.user.id,
          "company.details.updated",
          auth.organization.id,
        ],
      );
      return view(saved);
    });
    res.json(result);
  });
  router.post(
    "/company-details/cnpj-lookup",
    rateLimit("company-registration", 10, 60000),
    async (req, res) => {
      requireAdmin(req);
      const body = z
        .object({ cnpj: z.string().trim().min(1).max(24) })
        .strict()
        .parse(req.body);
      let cnpj: string;
      try {
        cnpj = normalizeCnpj(body.cnpj);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      try {
        const result = await lookupCompany(cnpj);
        res.json({
          cnpj: result.cnpj,
          details: result.registration,
          source: result.source,
          consultedAt: result.consultedAt,
          notice:
            "Consulta externa. Revise antes de aplicar; nada foi salvo e inscrições/representantes não são inferidos.",
        });
      } catch {
        throw new HttpError(
          502,
          "A fonte de CNPJ não respondeu agora. Continue o cadastro manualmente; nenhum dado foi alterado.",
        );
      }
    },
  );
}
