import test from "node:test";
import assert from "node:assert/strict";
import {
  managementCsvCell,
  managementExportQuery,
  managementReportCsv,
  managementReportQuery,
  type ManagementReportRow,
} from "./management-reports.js";

test("relatórios: período real, inclusivo, ordenado e limitado", () => {
  assert.equal(
    managementReportQuery.parse({ from: "2024-02-29", to: "2024-02-29" })
      .pageSize,
    25,
  );
  for (const q of [
    { from: "0000-01-01", to: "0000-01-01" },
    { from: "2026-02-29", to: "2026-03-01" },
    { from: "2026-09-02", to: "2026-09-01" },
    { from: "2000-01-01", to: "2026-01-01" },
    { from: "2026-09-01", to: "2026-09-01", page: 0 },
    { from: "2026-09-01", to: "2026-09-01", pageSize: 101 },
    { from: "2026-09-01", to: "2026-09-01", organizationId: "escape" },
  ])
    assert.equal(
      managementReportQuery.safeParse(q).success,
      false,
      JSON.stringify(q),
    );
  assert.equal(
    managementExportQuery.safeParse({
      from: "2026-01-01",
      to: "2026-01-01",
      page: 1,
    }).success,
    false,
  );
});

test("CSV: bloqueia fórmulas mesmo com espaços e controles antes do operador", () => {
  for (const cell of [
    "=HYPERLINK(1)",
    "+1",
    "-10",
    "@SUM(A1)",
    "  =1",
    "\t=1",
    "\r\n+1",
    "\uFEFF=1",
    "\u0000=1",
  ]) {
    assert.ok(managementCsvCell(cell).startsWith("\"'"), JSON.stringify(cell));
  }
  assert.equal(managementCsvCell('nome; "teste"'), '"nome; ""teste"""');
  assert.equal(managementCsvCell(null), '""');
  assert.equal(managementCsvCell(0), '"0"');
});

test("CSV: UTF-8 BOM, data de Brasília, CNPJ, valor desconhecido distinto de zero", () => {
  const row: ManagementReportRow = {
    tracking_id: "tracking",
    created_at: "2026-09-02T01:02:03.000Z",
    stage: "WON",
    status_label: "Ganho",
    company_id: "company",
    company_name: "=Nome perigoso",
    company_tax_id: "00123456000100",
    environment_name: "Cliente",
    environment_archived: false,
    opportunity_id: "unique-id",
    title: "Edital",
    agency: "Órgão",
    source_code: "pncp",
    external_id: "fonte",
    pncp_id: null,
    url: null,
    estimated_value: null,
  };
  const csv = managementReportCsv([row, { ...row, estimated_value: "0.00" }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes("01/09/2026, 22:02:03"));
  assert.ok(csv.includes("00.123.456/0001-00"));
  assert.ok(csv.includes('"\'=Nome perigoso"'));
  assert.ok(csv.includes(';"";"Ganho";"WON"'));
  assert.ok(csv.includes(';"0,00";"Ganho";"WON"'));
});
