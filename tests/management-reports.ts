import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate, pool } from "../apps/api/src/db.js";
import {
  readManagementOverview,
  readManagementReport,
} from "../apps/api/src/management-reports.js";

test("relatórios SQL: coorte Brasília, paginação, multiempresa, fontes sem duplicação, nulos e arquivos", async () => {
  await migrate();
  const db = await pool.connect();
  const management = randomUUID(),
    root = randomUUID(),
    child = randomUUID(),
    demo = randomUUID();
  const valued = randomUUID(),
    unknown = randomUUID(),
    zero = randomUUID(),
    before = randomUUID(),
    after = randomUUID(),
    demonstration = randomUUID(),
    current = randomUUID();
  try {
    // All fixtures are uncommitted: no worker or real customer can ever see them.
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const query = {
      from: "2001-04-15",
      to: "2001-04-15",
      page: 1,
      pageSize: 100,
    };
    const baseline = await readManagementReport(management, query, db);
    const baselineOverview = await readManagementOverview(management, db);
    const empty = await readManagementReport(
      management,
      { from: "2200-01-01", to: "2200-01-01", page: 1, pageSize: 25 },
      db,
    );
    assert.equal(empty.total, 0);
    assert.equal(
      empty.summary.estimated_value_total,
      null,
      "Sem valores conhecidos não deve parecer soma zero.",
    );
    assert.equal(empty.summary.missing_values, 0);
    for (const [id, name, isDemo, parent] of [
      [management, "QA Gestão relatórios", false, null],
      [root, "QA Cliente relatórios", false, null],
      [child, "QA Segunda empresa", false, root],
      [demo, "QA Demonstração", true, null],
    ])
      await db.query(
        "INSERT INTO organizations(id,name,tax_id,is_demo,environment_id) VALUES($1,$2,'00123456000100',$3,$4)",
        [id, name, isDemo, parent],
      );
    for (const [id, value, demoOrg] of [
      [valued, "1250.50", null],
      [unknown, null, null],
      [zero, "0.00", null],
      [before, "500.00", null],
      [after, "600.00", null],
      [demonstration, "900.00", demo],
      [current, "999.00", null],
    ])
      await db.query(
        "INSERT INTO opportunities(id,canonical_key,title,agency,source_code,source_name,content_hash,value,demo_org_id,raw) VALUES($1::uuid,$1::text,'QA edital','QA órgão','pncp','PNCP QA','qa',$2,$3,$4)",
        [
          id,
          value,
          demoOrg,
          JSON.stringify({
            numeroControlePNCP: "00123456000100-1-000123/2001",
          }),
        ],
      );
    const fixture = async (
      org: string,
      opportunity: string,
      time: string,
      stage = "WON",
    ) =>
      db.query(
        "INSERT INTO trackings(id,organization_id,opportunity_id,stage,created_at) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), org, opportunity, stage, time],
      );
    await fixture(root, valued, "2001-04-15T03:00:00Z");
    await fixture(child, valued, "2001-04-16T02:59:59Z", "LOST");
    await fixture(root, unknown, "2001-04-15T12:00:00Z", "IN_ANALYSIS");
    await fixture(root, zero, "2001-04-15T14:00:00Z", "IDENTIFIED");
    await fixture(root, before, "2001-04-15T02:59:59Z");
    await fixture(root, after, "2001-04-16T03:00:00Z");
    await fixture(management, valued, "2001-04-15T12:00:00Z");
    await fixture(demo, valued, "2001-04-15T12:00:00Z");
    await fixture(root, demonstration, "2001-04-15T12:00:00Z");
    for (const code of ["pncp", "qa-secondary", "qa-third"])
      await db.query(
        "INSERT INTO opportunity_sources(opportunity_id,source_code,external_id) VALUES($1,$2,$3)",
        [valued, code, `qa-${randomUUID()}`],
      );
    await db.query(
      "INSERT INTO opportunity_sources(opportunity_id,source_code,external_id) VALUES($1,'qa-other',$2)",
      [unknown, `qa-${randomUUID()}`],
    );
    const report = await readManagementReport(management, query, db);
    assert.equal(report.total - baseline.total, 4);
    assert.equal(
      Number(report.summary.estimated_value_total) -
        Number(baseline.summary.estimated_value_total),
      2501,
    );
    assert.equal(
      report.summary.missing_values - baseline.summary.missing_values,
      1,
    );
    const ours = report.items.filter((r) =>
      [root, child].includes(r.company_id),
    );
    assert.equal(ours.length, 4);
    assert.equal(
      ours.find((r) => r.opportunity_id === unknown)?.estimated_value,
      null,
    );
    assert.equal(
      ours.find((r) => r.opportunity_id === unknown)?.external_id,
      null,
      "Identificador de outra fonte não pode ser rotulado como PNCP.",
    );
    assert.equal(
      ours.find((r) => r.opportunity_id === zero)?.estimated_value,
      "0.00",
    );
    assert.ok(
      ours.every(
        (r) =>
          r.company_tax_id === "00123456000100" &&
          r.pncp_id === "00123456000100-1-000123/2001",
      ),
    );
    const first = await readManagementReport(
      management,
      { ...query, pageSize: 1 },
      db,
    );
    const second = await readManagementReport(
      management,
      { ...query, pageSize: 1, page: 2 },
      db,
    );
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].tracking_id, second.items[0].tracking_id);
    assert.equal(first.total, report.total);
    const absent = await readManagementReport(
      management,
      { ...query, page: report.total + 1, pageSize: 1 },
      db,
    );
    assert.equal(absent.items.length, 0);
    assert.equal(absent.total, report.total);
    await fixture(root, current, new Date().toISOString());
    const overview = await readManagementOverview(management, db);
    assert.equal(
      overview.total_environments - baselineOverview.total_environments,
      1,
    );
    assert.equal(
      overview.environments_created_month -
        baselineOverview.environments_created_month,
      1,
    );
    assert.equal(
      overview.total_participations - baselineOverview.total_participations,
      1,
    );
    assert.equal(
      Number(overview.estimated_value_total) -
        Number(baselineOverview.estimated_value_total),
      999,
    );
    await db.query("UPDATE organizations SET archived_at=now() WHERE id=$1", [
      root,
    ]);
    const archived = await readManagementReport(management, query, db);
    assert.equal(archived.total, report.total);
    assert.ok(
      archived.items
        .filter((r) => [root, child].includes(r.company_id))
        .every((r) => r.environment_archived),
    );
    assert.equal(
      (await readManagementOverview(management, db)).total_environments,
      baselineOverview.total_environments,
    );
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
  }
});
