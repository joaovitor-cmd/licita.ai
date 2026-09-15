import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { pool } from "../apps/api/src/db.js";
test("histórico comercial: métricas, datas Brasília, privacidade, classificação e paginação", async () => {
  const origin = "http://localhost:5173",
    accounts: any[] = [];
  let browser;
  async function client() {
    const r = await fetch(origin + "/api/auth/demo", {
      method: "POST",
      headers: { Origin: origin },
    });
    assert.equal(r.status, 201);
    const account = await r.json();
    accounts.push(account);
    const cookie = r.headers.getSetCookie().at(-1)!.split(";")[0];
    return {
      account,
      cookie,
      call: async (path: string, method = "GET", body?: any, status = 200) => {
        const r = await fetch(origin + "/api" + path, {
          method,
          headers: {
            Origin: origin,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await r.json();
        assert.equal(r.status, status, `${path}: ${JSON.stringify(data)}`);
        return data;
      },
    };
  }
  try {
    const a = await client(),
      b = await client(),
      org = a.account.organization.id;
    // These records belong only to the demonstration created by this test.
    await pool.query("DELETE FROM trackings WHERE organization_id=$1", [org]);
    let report = await a.call("/commercial-report");
    assert.equal(report.summary.total, 0);
    assert.equal(report.summary.win_rate, null);
    const opps = (await a.call("/opportunities")).items;
    const tracked = [];
    for (const o of opps.slice(0, 3))
      tracked.push(
        await a.call("/trackings", "POST", { opportunityId: o.id }, 201),
      );
    await a.call(`/trackings/${tracked[0].id}`, "PATCH", {
      stage: "WON",
      expectedValue: 1000,
      ownerId: a.account.user.id,
      outcomeCategory: "PRICE",
      outcomeReason: "Preço competitivo conforme registro da equipe",
    });
    await a.call(`/trackings/${tracked[1].id}`, "PATCH", {
      stage: "LOST",
      expectedValue: 500,
      outcomeCategory: "DOCUMENTATION",
    });
    await a.call(`/trackings/${tracked[2].id}`, "PATCH", {
      stage: "DISCARDED",
      expectedValue: 200,
    });
    await pool.query(
      "UPDATE trackings SET created_at='2026-09-11T12:00:00Z' WHERE organization_id=$1",
      [org],
    );
    await pool.query(
      "UPDATE trackings SET created_at='2026-09-10T02:59:59Z' WHERE id=$1",
      [tracked[0].id],
    );
    await pool.query(
      "UPDATE trackings SET created_at='2026-09-10T03:00:00Z' WHERE id=$1",
      [tracked[1].id],
    );
    for (let i = 0; i < 30; i++) {
      const oid = randomUUID();
      await pool.query(
        `INSERT INTO opportunities(id,canonical_key,title,agency,source_code,source_name,content_hash,demo_org_id) VALUES($1::uuid,$1::text,$2,'Órgão fictício','qa','QA','qa',$3)`,
        [oid, `Histórico sintético ${i}`, org],
      );
      await pool.query(
        `INSERT INTO trackings(id,organization_id,opportunity_id,created_at,expected_value) VALUES($1,$2,$3,'2026-09-11T12:00:00Z',$4)`,
        [randomUUID(), org, oid, i === 0 ? 0 : null],
      );
    }
    report = await a.call("/commercial-report");
    assert.equal(report.summary.total, 33);
    assert.equal(report.summary.active, 30);
    assert.equal(report.summary.won, 1);
    assert.equal(report.summary.lost, 1);
    assert.equal(report.summary.discarded, 1);
    assert.equal(report.summary.win_rate, 50);
    assert.equal(Number(report.summary.won_value), 1000);
    assert.equal(report.summary.active_value_missing, 29);
    assert.equal(report.items.length, 25);
    assert.equal(report.pages, 2);
    assert.equal(report.summary.unclassified, 1);
    assert.equal((await a.call("/commercial-report?page=2")).items.length, 8);
    const filtered = await a.call("/commercial-report?stage=LOST");
    assert.equal(filtered.total, 1);
    assert.equal(filtered.summary.total, 33);
    assert.equal(filtered.summary.win_rate, 50);
    const brDay = await a.call(
      "/commercial-report?from=2026-09-09&to=2026-09-09",
    );
    assert.equal(brDay.summary.total, 1);
    assert.equal(brDay.summary.won, 1);
    assert.equal(
      (await a.call("/commercial-report?from=2026-09-10&to=2026-09-10")).summary
        .lost,
      1,
    );
    await a.call(
      "/commercial-report?from=2026-09-10&to=2026-09-09",
      "GET",
      undefined,
      400,
    );
    assert.equal(
      (await a.call(`/commercial-report?ownerId=${b.account.user.id}`)).summary
        .total,
      0,
    );
    assert.equal(
      (await b.call("/commercial-report")).items.some((i: any) =>
        tracked.some((t) => t.id === i.id),
      ),
      false,
    );
    await b.call(
      `/trackings/${tracked[0].id}`,
      "PATCH",
      { outcomeCategory: "OTHER" },
      404,
    );
    await a.call(`/trackings/${tracked[0].id}`, "PATCH", {
      stage: "IN_ANALYSIS",
    });
    assert.equal(
      (await a.call(`/trackings/${tracked[0].id}`)).outcomeCategory,
      null,
    );
    await a.call(`/trackings/${tracked[0].id}`, "PATCH", {
      stage: "WON",
      outcomeCategory: "OTHER",
    });
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const [name, ...value] = a.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await context.newPage();
    await page.goto(origin + `/app/radar/${tracked[0].id}`);
    await page
      .getByLabel("Classificação do motivo", { exact: true })
      .selectOption("COMPETITION");
    await page
      .getByRole("button", { name: "Salvar alterações", exact: false })
      .click();
    await page.getByText("Participação atualizada.", { exact: true }).waitFor();
    assert.equal(
      (await a.call(`/trackings/${tracked[0].id}`)).outcomeCategory,
      "COMPETITION",
    );
    await page.goto(origin + "/app/comercial");
    await page
      .getByRole("button", { name: "Ver todo o histórico", exact: true })
      .click();
    await page.getByText("33 registros na lista.", { exact: false }).waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const check = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        check.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
    await page.screenshot({
      path: "test-results/18-commercial-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await page.getByText("Página 2 de 2", { exact: true }).waitFor();
    assert.equal(await page.locator(".commercial-history tbody tr").count(), 8);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/18-commercial-mobile.png",
      fullPage: true,
    });
  } finally {
    await browser?.close();
    for (const a of accounts) {
      await pool.query("DELETE FROM organizations WHERE id=$1", [
        a.organization.id,
      ]);
      await pool.query("DELETE FROM users WHERE id=$1", [a.user.id]);
    }
    await pool.end();
  }
});
