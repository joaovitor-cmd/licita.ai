import type { Router } from "express";
import { z } from "zod";
import { one, pool, type Database } from "./db.js";
import { current, HttpError } from "./security.js";
import { requirePlatform } from "./management.js";

export const REPORT_TIME_ZONE = "America/Sao_Paulo";
export const REPORT_EXPORT_LIMIT = 10_000;
export const participationDefinition =
  "Participações são registros adicionados ao radar no período, com o status comercial atual; não confirmam envio de proposta ou participação formal. O valor é o estimado publicado do edital por empresa participante, não receita ou valor contratado. O mesmo edital pode contar para mais de uma empresa.";
export const reportStageLabels: Record<string, string> = {
  IDENTIFIED: "No radar",
  IN_ANALYSIS: "Em análise",
  WILL_PARTICIPATE: "Preparando proposta",
  PROPOSAL_SENT: "Proposta enviada",
  WON: "Ganho",
  LOST: "Perdido",
  DISCARDED: "Descartado",
};
const periodFields = { from: z.iso.date(), to: z.iso.date() };
const validPeriod = (q: { from: string; to: string }) =>
  q.from >= "0001-01-01" &&
  q.from <= q.to &&
  (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < 3660;
const periodMessage = {
  message:
    "Informe um período válido de até 3.660 dias, com a data inicial anterior ou igual à final.",
};
export const managementReportQuery = z
  .object({
    ...periodFields,
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(validPeriod, periodMessage);
export const managementExportQuery = z
  .object(periodFields)
  .strict()
  .refine(validPeriod, periodMessage);

// Preserve archived customer history. Administrative and demonstration environments
// are never part of a customer's commercial cohort.
const cohortSql = `WITH cohort AS MATERIALIZED (
  SELECT t.id tracking_id,t.created_at,t.stage,c.id company_id,c.name company_name,
    c.tax_id company_tax_id,e.name environment_name,(e.archived_at IS NOT NULL) environment_archived,
    o.id opportunity_id,o.title,o.agency,o.source_code,o.url,o.value estimated_value,o.raw
  FROM trackings t JOIN organizations c ON c.id=t.organization_id
  JOIN organizations e ON e.id=coalesce(c.environment_id,c.id)
  JOIN opportunities o ON o.id=t.opportunity_id
  WHERE NOT c.is_demo AND NOT e.is_demo AND e.id<>$1 AND o.demo_org_id IS NULL
    AND t.created_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND t.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
)`;

export type ManagementReportRow = {
  tracking_id: string;
  created_at: string;
  stage: string;
  status_label: string;
  company_id: string;
  company_name: string;
  company_tax_id: string | null;
  environment_name: string;
  environment_archived: boolean;
  opportunity_id: string;
  title: string;
  agency: string;
  source_code: string;
  external_id: string | null;
  pncp_id: string | null;
  url: string | null;
  estimated_value: string | null;
};
type ReportSummary = {
  total_participations: number;
  estimated_value_total: string | null;
  missing_values: number;
};
export async function readManagementReport(
  excludedOrganization: string,
  q: { from: string; to: string; page: number; pageSize: number },
  db: Database = pool,
) {
  const result = await one<{
    summary: ReportSummary;
    items: ManagementReportRow[];
  }>(
    `${cohortSql}, summary AS (
      SELECT count(*)::int total_participations,sum(estimated_value)::text estimated_value_total,
        count(*) FILTER(WHERE estimated_value IS NULL)::int missing_values FROM cohort
    ), page_rows AS (
      SELECT * FROM cohort ORDER BY created_at DESC,tracking_id DESC LIMIT $4 OFFSET $5
    ), detail AS (
      SELECT p.tracking_id,p.created_at,p.stage,p.company_id,p.company_name,p.company_tax_id,
        p.environment_name,p.environment_archived,p.opportunity_id,p.title,p.agency,p.source_code,p.url,
        p.estimated_value::text estimated_value,s.external_id,
        CASE WHEN p.raw->>'numeroControlePNCP' ~ '^[0-9]{14}-[0-9]+-[0-9]+/[0-9]{4}$'
          THEN p.raw->>'numeroControlePNCP' ELSE pncp.external_id END pncp_id
      FROM page_rows p
      LEFT JOIN LATERAL (SELECT external_id FROM opportunity_sources WHERE opportunity_id=p.opportunity_id
        AND source_code=p.source_code ORDER BY external_id LIMIT 1) s ON true
      LEFT JOIN LATERAL (SELECT external_id FROM opportunity_sources WHERE opportunity_id=p.opportunity_id
        AND lower(source_code)='pncp' AND external_id ~ '^[0-9]{14}-[0-9]+-[0-9]+/[0-9]{4}$'
        ORDER BY external_id LIMIT 1) pncp ON true
    ) SELECT (SELECT row_to_json(summary) FROM summary) summary,
      coalesce((SELECT jsonb_agg(detail ORDER BY created_at DESC,tracking_id DESC) FROM detail),'[]') items`,
    [excludedOrganization, q.from, q.to, q.pageSize, (q.page - 1) * q.pageSize],
    db,
  );
  if (!result) throw new HttpError(500, "Não foi possível gerar o relatório.");
  return {
    period: { from: q.from, to: q.to, timeZone: REPORT_TIME_ZONE },
    total: result.summary.total_participations,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(
      1,
      Math.ceil(result.summary.total_participations / q.pageSize),
    ),
    summary: result.summary,
    definition: participationDefinition,
    items: result.items.map((item) => ({
      ...item,
      status_label: reportStageLabels[item.stage] ?? item.stage,
    })),
  };
}

export async function readManagementOverview(
  excludedOrganization: string,
  db: Database = pool,
) {
  const data = await one<any>(
    `WITH bounds AS (
    SELECT date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') first_day,
      (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date today
  ), environments AS MATERIALIZED (
    SELECT * FROM organizations WHERE environment_id IS NULL AND NOT is_demo AND id<>$1 AND archived_at IS NULL
  ), participations AS MATERIALIZED (
    SELECT t.stage,o.value FROM trackings t JOIN organizations c ON c.id=t.organization_id
    JOIN organizations e ON e.id=coalesce(c.environment_id,c.id)
    JOIN opportunities o ON o.id=t.opportunity_id CROSS JOIN bounds b
    WHERE NOT c.is_demo AND NOT e.is_demo AND e.id<>$1 AND o.demo_org_id IS NULL
      AND t.created_at>=(b.first_day AT TIME ZONE 'America/Sao_Paulo')
      AND t.created_at<((b.today+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ), stages AS (SELECT stage,count(*)::int count FROM participations GROUP BY stage)
  SELECT (SELECT to_char(first_day,'YYYY-MM-DD') FROM bounds) period_from,
    (SELECT to_char(today,'YYYY-MM-DD') FROM bounds) period_to,
    (SELECT count(*)::int FROM environments) total_environments,
    (SELECT count(*)::int FROM environments WHERE created_at>=((SELECT first_day FROM bounds) AT TIME ZONE 'America/Sao_Paulo')
      AND created_at<(((SELECT today FROM bounds)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')) environments_created_month,
    (SELECT count(*)::int FROM participations) total_participations,
    (SELECT sum(value)::text FROM participations) estimated_value_total,
    (SELECT count(*)::int FROM participations WHERE value IS NULL) missing_values,
    coalesce((SELECT jsonb_agg(stages ORDER BY stage) FROM stages),'[]') stages`,
    [excludedOrganization],
    db,
  );
  if (!data)
    throw new HttpError(500, "Não foi possível carregar os indicadores.");
  const { period_from, period_to, ...metrics } = data;
  return {
    ...metrics,
    period: { from: period_from, to: period_to, timeZone: REPORT_TIME_ZONE },
    definition: participationDefinition,
  };
}

// Quoting alone does not prevent spreadsheet formula execution.
export function managementCsvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function managementReportCsv(items: ManagementReportRow[]) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  });
  const columns = [
    "Empresa",
    "CNPJ",
    "Ambiente",
    "Ambiente arquivado",
    "Data de inclusão no radar (Brasília)",
    "Edital",
    "Órgão",
    "ID do acompanhamento",
    "ID único do edital no Licitaro",
    "Fonte",
    "Identificador na fonte",
    "Número de controle PNCP",
    "URL do edital",
    "Valor estimado publicado (BRL; não é receita)",
    "Status comercial atual",
    "Código do status",
  ];
  const body = items.map((item) =>
    [
      item.company_name,
      item.company_tax_id?.replace(
        /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/i,
        "$1.$2.$3/$4-$5",
      ) ?? "",
      item.environment_name,
      item.environment_archived ? "Sim" : "Não",
      date.format(new Date(item.created_at)),
      item.title,
      item.agency,
      item.tracking_id,
      item.opportunity_id,
      item.source_code,
      item.external_id,
      item.pncp_id,
      item.url,
      item.estimated_value === null
        ? ""
        : item.estimated_value.replace(".", ","),
      item.status_label,
      item.stage,
    ]
      .map(managementCsvCell)
      .join(";"),
  );
  return (
    "\uFEFF" +
    [columns.map(managementCsvCell).join(";"), ...body].join("\r\n") +
    "\r\n"
  );
}

export function managementReportRoutes(router: Router) {
  router.get("/management/overview", async (req, res) => {
    requirePlatform(req);
    res.setHeader("Cache-Control", "no-store");
    res.json(await readManagementOverview(current(req).organization.id));
  });
  router.get("/management/reports", async (req, res) => {
    requirePlatform(req);
    const query = managementReportQuery.parse(req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json(await readManagementReport(current(req).organization.id, query));
  });
  router.get("/management/reports/export", async (req, res) => {
    requirePlatform(req);
    const query = managementExportQuery.parse(req.query);
    const auth = current(req);
    const report = await readManagementReport(auth.organization.id, {
      ...query,
      page: 1,
      pageSize: REPORT_EXPORT_LIMIT + 1,
    });
    if (report.total > REPORT_EXPORT_LIMIT)
      throw new HttpError(
        422,
        `Este período contém ${report.total} registros. O limite por arquivo é ${REPORT_EXPORT_LIMIT}. Reduza o período para exportar sem omitir registros.`,
      );
    await pool.query(
      "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,'MANAGEMENT_REPORT_EXPORTED',$3)",
      [
        auth.organization.id,
        auth.user.id,
        `${query.from} a ${query.to}: ${report.total} registros`,
      ],
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="licitaro-participacoes-${query.from}-${query.to}.csv"`,
    );
    res.send(managementReportCsv(report.items));
  });
}
