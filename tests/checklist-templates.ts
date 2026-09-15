import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { pool } from "../apps/api/src/db.js";

test("modelos: isolamento, cópias independentes, aplicação atômica e interface", async () => {
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
        const result = await r.json();
        assert.equal(
          r.status,
          status,
          `${method} ${path}: ${JSON.stringify(result)}`,
        );
        return result;
      },
    };
  }
  try {
    const a = await client(),
      b = await client();
    const opps = (await a.call("/opportunities")).items,
      oid = opps[0].id,
      secondOid = opps[1].id,
      thirdOid = opps[2].id,
      bOid = (await b.call("/opportunities")).items[0].id;
    const endpoint = (id: string) =>
      `/opportunities/${id}/checklist-applications`;
    const templates = await a.call("/checklist-templates");
    assert.equal(templates.filter((t: any) => t.builtin).length, 2);
    const body = {
      name: "Modelo QA",
      items: [
        { kind: "TASK", title: "Conferir preço QA" },
        { kind: "DOCUMENT", title: "Atestado QA" },
        { kind: "TASK", title: "  CONFERIR preço QA" },
      ],
    };
    const model = await a.call("/checklist-templates", "POST", body, 201);
    assert.equal(
      (await b.call("/checklist-templates")).some(
        (t: any) => t.id === model.id,
      ),
      false,
    );
    await b.call(
      "/checklist-templates/" + model.id,
      "PUT",
      { ...body, revision: 1 },
      404,
    );
    await b.call(
      endpoint(bOid),
      "POST",
      { templateId: model.id, revision: 1, selected: [0] },
      404,
    );
    await b.call(endpoint(oid), "GET", undefined, 404);
    await a.call(
      "/checklist-templates",
      "POST",
      {
        name: "Inválido",
        items: [{ kind: "TASK", title: "Tarefa", done: true }],
      },
      400,
    );
    const apply = { templateId: model.id, revision: 1, selected: [0, 1, 2] };
    const [first, duplicate] = await Promise.all([
      a.call(endpoint(oid), "POST", apply),
      a.call(endpoint(oid), "POST", apply),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal(first.created_tasks, 1);
    assert.equal(first.created_documents, 1);
    assert.equal(first.skipped, 1);
    let preparation = await a.call(`/opportunities/${oid}/preparation`);
    const task = preparation.tasks.find(
      (t: any) => t.title === "Conferir preço QA",
    );
    assert.ok(task);
    assert.equal(preparation.documents[0].document_id, null);
    assert.equal(preparation.documents[0].effective_state, "MISSING");
    assert.equal(preparation.documents[0].reviewed_by, null);
    await a.call(
      `/trackings/${preparation.trackingId}/tasks/${task.id}`,
      "PATCH",
      { done: true },
    );
    const before = await a.call(endpoint(oid), "POST", {
      ...apply,
      selected: [1],
    });
    assert.equal(before.alreadyApplied, true);
    const changed = {
      name: "Modelo QA revisado",
      items: [
        { kind: "TASK", title: "Conferir preço QA" },
        { kind: "DOCUMENT", title: "Documento novo QA" },
      ],
      revision: 1,
    };
    const updated = await a.call(
      "/checklist-templates/" + model.id,
      "PUT",
      changed,
    );
    assert.equal(updated.revision, 2);
    preparation = await a.call(`/opportunities/${oid}/preparation`);
    assert.equal(preparation.documents[0].title, "Atestado QA");
    assert.equal(
      preparation.tasks.find((t: any) => t.id === task.id).done,
      true,
    );
    await a.call("/checklist-templates/" + model.id, "PUT", changed, 409);
    await a.call(endpoint(secondOid), "POST", apply, 409);
    const rev2 = await a.call(endpoint(oid), "POST", {
      templateId: model.id,
      revision: 2,
      selected: [0, 1],
    });
    assert.equal(rev2.created_tasks, 0);
    assert.equal(rev2.skipped, 1);
    assert.equal(rev2.created_documents, 1);
    await a.call(endpoint(secondOid), "POST", {
      templateId: model.id,
      revision: 2,
      selected: [0, 1],
    });
    const second = await a.call(`/opportunities/${secondOid}/preparation`);
    assert.equal(
      second.tasks.find((t: any) => t.title === "Conferir preço QA").done,
      false,
    );
    await a.call(
      `/trackings/${second.trackingId}/tasks/${second.tasks.find((t: any) => t.title === "Conferir preço QA").id}`,
      "PATCH",
      { title: "Tarefa adaptada à segunda oportunidade" },
    );
    assert.equal(
      (await a.call("/checklist-templates")).find((t: any) => t.id === model.id)
        .items[0].title,
      "Conferir preço QA",
    );
    await a.call("/checklist-templates/" + model.id, "DELETE", { revision: 2 });
    assert.equal(
      (await a.call("/checklist-templates")).some(
        (t: any) => t.id === model.id,
      ),
      false,
    );
    assert.equal((await a.call(endpoint(oid))).length, 2);
    assert.ok(
      (await a.call(`/opportunities/${oid}/preparation`)).tasks.some(
        (t: any) => t.id === task.id,
      ),
    );
    await a.call(
      endpoint(secondOid),
      "POST",
      { templateId: model.id, revision: 2, selected: [0] },
      404,
    );
    // Capacity failure must roll back tasks and application history as well.
    const capacity = await a.call(
      "/checklist-templates",
      "POST",
      {
        name: "Limite QA",
        items: [
          { kind: "TASK", title: "Não criar em falha QA" },
          { kind: "DOCUMENT", title: "Documento extra um QA" },
          { kind: "DOCUMENT", title: "Documento extra dois QA" },
        ],
      },
      201,
    );
    for (let i = 0; i < 99; i++)
      await pool.query(
        "INSERT INTO preparation_documents(id,organization_id,opportunity_id,title) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          a.account.organization.id,
          thirdOid,
          `Exigência sintética ${i}`,
        ],
      );
    await a.call(
      endpoint(thirdOid),
      "POST",
      { templateId: capacity.id, revision: 1, selected: [0, 1, 2] },
      400,
    );
    assert.equal((await a.call(endpoint(thirdOid))).length, 0);
    assert.equal(
      (await a.call(`/opportunities/${thirdOid}/preparation`)).tasks.some(
        (t: any) => t.title === "Não criar em falha QA",
      ),
      false,
    );
    await a.call(
      endpoint(thirdOid),
      "POST",
      { templateId: capacity.id, revision: 1, selected: [1, 1] },
      400,
    );
    await a.call(
      endpoint(thirdOid),
      "POST",
      { templateId: capacity.id, revision: 1, selected: [59] },
      400,
    );
    const boundary = await a.call(endpoint(thirdOid), "POST", {
      templateId: capacity.id,
      revision: 1,
      selected: [1],
    });
    assert.equal(boundary.created_documents, 1);

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const [name, ...value] = a.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await context.newPage();
    await page.goto(origin + `/app/oportunidades/${oid}`);
    const panel = page.locator(".checklist-templates");
    await panel.locator("summary").first().click();
    await panel
      .getByLabel("Modelo para esta oportunidade", { exact: true })
      .selectOption("outsourcing-impressao");
    await panel
      .getByRole("button", { name: "Duplicar e personalizar", exact: true })
      .click();
    await panel
      .getByLabel("Nome do modelo", { exact: true })
      .fill("Modelo visual QA");
    await panel
      .getByLabel("Tarefas do modelo", { exact: true })
      .fill("Conferir margem visual QA\nConferir assistência visual QA");
    await panel
      .getByLabel("Exigências documentais do modelo", { exact: true })
      .fill("Documento visual QA");
    await panel
      .getByRole("button", { name: "Salvar modelo", exact: true })
      .click();
    await page
      .getByText(
        "Modelo salvo. Checklists já aplicados permanecem independentes.",
        { exact: true },
      )
      .waitFor();
    await panel
      .getByRole("checkbox", {
        name: "Tarefa: Conferir assistência visual QA",
        exact: true,
      })
      .uncheck();
    await panel
      .getByRole("button", { name: "Aplicar itens selecionados", exact: true })
      .click();
    await page
      .getByText(
        "1 tarefas e 1 exigências adicionadas. 0 itens repetidos preservados.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await panel
        .getByRole("button", {
          name: "Aplicar itens selecionados",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await panel
      .getByRole("button", {
        name: "Salvar preparação atual como modelo",
        exact: true,
      })
      .click();
    assert.match(
      await panel.getByLabel("Tarefas do modelo", { exact: true }).inputValue(),
      /Conferir margem visual QA/,
    );
    assert.match(
      await panel
        .getByLabel("Exigências documentais do modelo", { exact: true })
        .inputValue(),
      /Documento visual QA/,
    );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
    await page.screenshot({
      path: "test-results/16-checklist-templates-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/16-checklist-templates-mobile.png",
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
