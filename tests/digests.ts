import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { pool, one } from "../apps/api/src/db.js";
import { generateDigestInTransaction } from "../apps/api/src/digests.js";

test("boletim: configuração, isolamento, cursor, fila sem envio real e interface", async () => {
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
        const value = await r.json();
        assert.equal(r.status, status, `${path}: ${JSON.stringify(value)}`);
        return value;
      },
    };
  }
  try {
    const a = await client(),
      b = await client(),
      org = a.account.organization.id;
    const settings = await a.call("/digest-settings");
    assert.equal(settings.enabled, false);
    assert.equal(settings.revision, 0);
    const body = {
      enabled: false,
      sendTime: "09:15",
      recipientIds: [a.account.user.id],
      revision: 0,
    };
    await a.call(
      "/digest-settings",
      "PUT",
      { ...body, recipientIds: [b.account.user.id] },
      400,
    );
    await a.call("/digest-settings", "PUT", { ...body, enabled: true }, 400);
    await a.call("/digest-settings", "PUT", body);
    await a.call("/digest-settings", "PUT", body, 409);
    assert.equal((await b.call("/digest-settings")).revision, 0);
    const preview = await a.call("/digest-preview");
    assert.ok(preview.scanned > 0);
    assert.ok(preview.items.every((i: any) => i.title));
    assert.equal(
      (await one(
        "SELECT count(*)::integer n FROM email_deliveries WHERE organization_id=$1",
        [org],
      ))!.n,
      0,
    );
    await pool.query(
      "UPDATE members SET role='MEMBER' WHERE organization_id=$1",
      [org],
    );
    await a.call("/digest-settings", "GET", undefined, 403);
    await a.call("/digest-preview", "GET", undefined, 403);
    await a.call("/digest-settings", "PUT", { ...body, revision: 1 }, 403);
    await pool.query(
      "UPDATE members SET role='ADMIN' WHERE organization_id=$1",
      [org],
    );

    // Nothing in this transaction can be observed by a mail worker. Always rolled back.
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `UPDATE organizations SET is_demo=false,profile=$2,preferences=$3 WHERE id=$1`,
        [
          org,
          JSON.stringify({ keywords: ["digestqafixture"] }),
          JSON.stringify({ email: true, inApp: true, minScore: 40 }),
        ],
      );
      await db.query(
        "UPDATE digest_settings SET enabled=true,send_time='00:00',cursor_at='2030-03-31T12:00:00.123455Z',cursor_id='ffffffff-ffff-ffff-ffff-ffffffffffff' WHERE organization_id=$1",
        [org],
      );
      for (let i = 0; i < 30; i++) {
        const id = randomUUID();
        await db.query(
          `INSERT INTO opportunities(id,canonical_key,title,agency,source_code,source_name,content_hash,created_at) VALUES($1::uuid,$1::text,$2,'Fixture QA','qa','QA','qa','2030-03-31T12:00:00.123456Z')`,
          [id, `digestqafixture ${i}`],
        );
      }
      const first = await generateDigestInTransaction(
        org,
        new Date("2030-03-31T15:00:00Z"),
        db,
      );
      assert.equal(first!.count, 30);
      assert.equal(
        await generateDigestInTransaction(
          org,
          new Date("2030-03-31T16:00:00Z"),
          db,
        ),
        null,
      );
      const emails = await db.query(
        "SELECT recipient,body,category FROM email_deliveries WHERE organization_id=$1",
        [org],
      );
      assert.equal(emails.rows.length, 1);
      assert.equal(emails.rows[0].recipient, a.account.user.email);
      assert.equal(emails.rows[0].category, "DIGEST");
      assert.match(emails.rows[0].body, /lista completa/);
      const empty = await generateDigestInTransaction(
        org,
        new Date("2030-04-01T15:00:00Z"),
        db,
      );
      assert.equal(empty!.count, 0);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::integer n FROM email_deliveries WHERE organization_id=$1",
            [org],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT cursor_at::text value FROM digest_settings WHERE organization_id=$1",
            [org],
          )
        ).rows[0].value.includes("123456"),
        true,
      );
      await db.query(
        "UPDATE digest_settings SET enabled=false WHERE organization_id=$1",
        [org],
      );
      assert.equal(
        await generateDigestInTransaction(
          org,
          new Date("2030-04-02T15:00:00Z"),
          db,
        ),
        null,
      );
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
    assert.equal(
      (await one(
        "SELECT count(*)::integer n FROM email_deliveries WHERE organization_id=$1",
        [org],
      ))!.n,
      0,
    );
    // Saved, fictional bulletin for read-only page/pagination QA in the isolated demo.
    const runId = randomUUID();
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: randomUUID(),
      title: `Boletim sintético QA ${i}`,
      agency: "Órgão fictício",
      state: "RS",
      score: 80,
    }));
    await pool.query(
      "INSERT INTO digest_runs(id,organization_id,run_day,items,scanned) VALUES($1,$2,$3,$4,30)",
      [runId, org, "2026-09-09", JSON.stringify(items)],
    );
    assert.equal((await a.call(`/digests/${runId}`)).items.length, 25);
    assert.equal((await a.call(`/digests/${runId}?page=2`)).items.length, 5);
    await b.call(`/digests/${runId}`, "GET", undefined, 404);
    await a.call(`/digests/${runId}?page=0`, "GET", undefined, 400);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const [name, ...value] = a.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await context.newPage();
    await page.goto(origin + "/app/configuracoes");
    const panel = page.locator(".digest-settings");
    await panel
      .getByRole("heading", {
        name: "Boletim diário de oportunidades",
        exact: true,
      })
      .waitFor();
    await panel
      .getByLabel("Horário do boletim — Brasília", { exact: true })
      .fill("10:30");
    await panel
      .getByRole("button", { name: "Salvar boletim", exact: true })
      .click();
    await page
      .getByText(
        "Configuração do boletim salva. Nenhum envio de teste foi realizado.",
        { exact: true },
      )
      .waitFor();
    assert.equal((await a.call("/digest-settings")).sendTime, "10:30");
    await panel
      .getByRole("button", { name: "Ver prévia sem enviar", exact: true })
      .click();
    await panel
      .getByRole("heading", {
        name: "Prévia — nenhum e-mail enviado",
        exact: true,
      })
      .waitFor();
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
    await panel.screenshot({ path: "test-results/17-digest-settings.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await panel.screenshot({ path: "test-results/17-digest-mobile.png" });
    await page.goto(origin + `/app/boletins/${runId}`);
    await page
      .getByRole("heading", {
        name: "Boletim de oportunidades · 2026-09-09",
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await page.getByText("Página 2 de 2", { exact: true }).waitFor();
    assert.equal(await page.locator(".digest-items li").count(), 5);
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
