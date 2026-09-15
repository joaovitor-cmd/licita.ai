import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { pool, one } from "../apps/api/src/db.js";
import { fingerprint } from "../apps/api/src/analysis-rules.js";

test("plano de ação, documentos, prontidão, concorrência e isolamento", async () => {
  const origin = "http://localhost:5173",
    accounts: any[] = [];
  let browser;
  async function client() {
    const response = await fetch(origin + "/api/auth/demo", {
      method: "POST",
      headers: { Origin: origin },
    });
    assert.equal(response.status, 201);
    const account = await response.json();
    accounts.push(account);
    const cookie = response.headers.getSetCookie().at(-1)!.split(";")[0];
    return {
      account,
      cookie,
      call: async (path: string, method = "GET", body?: any, status = 200) => {
        const response = await fetch(origin + "/api" + path, {
          method,
          headers: {
            Origin: origin,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const value = await response.json();
        assert.equal(response.status, status, JSON.stringify(value));
        return value;
      },
    };
  }
  try {
    const a = await client(),
      b = await client(),
      oid = (await a.call("/opportunities")).items[0].id;
    const path = `/opportunities/${oid}/preparation`;
    assert.equal((await a.call(path)).summary.documentCount, 0);
    await b.call(path, "GET", undefined, 404);
    const source = await one(
      "SELECT content_hash,documents FROM opportunities WHERE id=$1",
      [oid],
    );
    const aid = randomUUID();
    await pool.query(
      `INSERT INTO edital_analyses(id,organization_id,opportunity_id,status,source_fingerprint,result) VALUES($1,$2,$3,'READY',$4,$5)`,
      [
        aid,
        a.account.organization.id,
        oid,
        fingerprint(source),
        JSON.stringify({
          method: "Fixture sintética de teste",
          warning: "Não é edital real.",
          documents: [
            {
              name: "Anexo QA",
              url: "https://pncp.gov.br/pncp-api/v1/orgaos/12345678000190/compras/2026/1/arquivos/1",
              status: "READ",
              message: "Fixture QA",
              readPages: 1,
              totalPages: 1,
              evidence: [
                {
                  topic: "service",
                  page: 1,
                  quote: "Atendimento técnico conforme condições do anexo.",
                },
              ],
            },
          ],
        }),
      ],
    );
    const action = {
      analysisId: aid,
      topic: "service",
      kind: "TASK",
      title: "Validar cobertura técnica",
    };
    const [first, second] = await Promise.all([
      a.call(path + "/actions", "POST", action),
      a.call(path + "/actions", "POST", action),
    ]);
    assert.equal(first.id, second.id);
    const tracking = await a.call("/trackings/" + first.trackingId);
    assert.equal(
      tracking.tasks.filter((t: any) => t.id === first.id).length,
      1,
    );
    const req = await a.call(path + "/actions", "POST", {
      ...action,
      kind: "DOCUMENT",
      title: "Comprovação da cobertura técnica",
    });
    assert.equal(
      (
        await a.call(path + "/actions", "POST", {
          ...action,
          kind: "DOCUMENT",
          title: "Comprovação da cobertura técnica",
        })
      ).id,
      req.id,
    );
    await a.call(
      path + "/actions",
      "POST",
      { ...action, topic: "billing" },
      400,
    );
    const docId = randomUUID(),
      foreignId = randomUUID();
    for (const [id, org] of [
      [docId, a.account.organization.id],
      [foreignId, b.account.organization.id],
    ])
      await pool.query(
        `INSERT INTO documents(id,organization_id,name,file_name,mime_type,size,content) VALUES($1,$2,'Documento QA','qa.pdf','application/pdf',8,$3)`,
        [id, org, Buffer.from("%PDF-QA\n")],
      );
    const save = {
      title: "Comprovação da cobertura técnica",
      notes: "Conferência humana QA",
      documentId: docId,
      state: "LINKED",
      revision: 1,
    };
    await a.call(
      path + "/documents/" + req.id,
      "PUT",
      { ...save, documentId: foreignId },
      404,
    );
    await a.call(path + "/documents/" + req.id, "PUT", save);
    await a.call(path + "/documents/" + req.id, "PUT", save, 409);
    await a.call(path + "/documents/" + req.id, "PUT", {
      ...save,
      state: "REVIEWED",
      revision: 2,
    });
    let data = await a.call(path);
    assert.equal(data.documents[0].effective_state, "REVIEWED");
    assert.equal(data.summary.pendingDocuments, 0);
    assert.ok(data.documents[0].reviewer_name);
    assert.ok(data.documents[0].reviewed_at);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const [name, ...value] = a.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await context.newPage();
    await page.goto(origin + `/app/oportunidades/${oid}`);
    await page
      .getByRole("heading", { name: "Preparação em andamento", exact: true })
      .waitFor();
    await page.locator("#checklist-documental > summary").click();
    await page
      .getByLabel("Exigência documental identificada", { exact: true })
      .fill("Certidão complementar QA");
    await page
      .getByRole("button", { name: "Adicionar exigência", exact: true })
      .click();
    await page
      .getByText("Exigência adicionada para conferência.", { exact: true })
      .waitFor();
    const manual = page
      .locator("#checklist-documental .analysis-topic")
      .filter({ hasText: "Certidão complementar QA" });
    await manual.locator("summary").first().click();
    await manual
      .getByLabel("Arquivo: Certidão complementar QA", { exact: true })
      .selectOption(docId);
    await manual
      .getByLabel("Estado: Certidão complementar QA", { exact: true })
      .selectOption("REVIEWED");
    await manual
      .getByRole("button", {
        name: "Salvar documento e conferência",
        exact: true,
      })
      .click();
    await page
      .getByText("Checklist documental atualizado.", { exact: true })
      .waitFor();
    const topic = page
      .locator(".edict-guide .analysis-topic")
      .filter({ hasText: "Manutenção e atendimento" });
    await topic.locator("summary").first().click();
    await topic
      .getByRole("button", { name: "Confirmar e criar ação", exact: true })
      .click();
    await page
      .getByText("Tarefa disponível na participação.", { exact: true })
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const checks = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        checks.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
    await page.screenshot({
      path: "test-results/15-preparation-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/15-preparation-mobile.png",
      fullPage: true,
    });
    await pool.query(
      "UPDATE documents SET expires_at='2020-01-01' WHERE id=$1",
      [docId],
    );
    data = await a.call(path);
    assert.equal(data.documents[0].effective_state, "UPDATE");
    await a.call(
      path + "/documents/" + req.id,
      "PUT",
      { ...save, state: "REVIEWED", revision: 3 },
      400,
    );
    await pool.query("UPDATE documents SET expires_at=NULL WHERE id=$1", [
      docId,
    ]);
    await pool.query(
      "UPDATE opportunities SET content_hash='preparation-qa-new' WHERE id=$1",
      [oid],
    );
    data = await a.call(path);
    assert.equal(data.summary.stale, true);
    assert.equal(data.documents[0].effective_state, "UPDATE");
    await a.call(path + "/actions", "POST", action, 409);
    await a.call("/documents/" + docId, "DELETE");
    data = await a.call(path);
    assert.equal(data.documents[0].effective_state, "MISSING");
    assert.equal(data.summary.pendingDocuments, 2);
    await b.call(
      path + "/documents/" + req.id,
      "PUT",
      { ...save, revision: 3 },
      404,
    );
    await a.call(path + "/documents/" + req.id, "DELETE", { revision: 3 });
    assert.equal((await a.call(path)).documents.length, 1);
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
