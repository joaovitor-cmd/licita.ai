import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
test("quotation navigation guards preserve drafts across menus, history and pending saves", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [],
      writes = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    const opportunity = {
      id: "op",
      publicCode: "LC-123",
      title: "Impressão",
      agency: "Órgão QA",
      city: "Porto Alegre",
      state: "RS",
      sourceCode: "pncp",
      sourceName: "PNCP",
      isDemo: true,
      documents: [],
      value: null,
      publishedAt: null,
      opensAt: null,
      closesAt: null,
      syncedAt: null,
      status: "Divulgado",
      match: { score: 20, reasons: [], excluded: false },
    };
    let releaseSave;
    const pendingSave = new Promise((resolve) => (releaseSave = resolve));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      let json = [];
      if (route.request().method() !== "GET") writes.push(path);
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA" },
          organization: { id: "org", name: "Empresa" },
          role: "ADMIN",
        };
      if (path === "/api/entitlements")
        json = {
          features: ["discovery", "radar", "catalog"],
          multiCompany: false,
        };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/opportunities")
        json = {
          items: [opportunity],
          total: 1,
          page: 1,
          pages: 1,
          pageSize: 12,
        };
      if (path === "/api/opportunities/op") json = opportunity;
      if(path.endsWith('/analysis'))json={analysis:null,topics:[],versions:[]};
      if (path.endsWith("/proposal-context"))
        json = {
          company: {
            id: "org",
            name: "Empresa",
            cnpj: "11222333000181",
            revision: 1,
            details: { legalName: "Empresa" },
          },
          sourceFingerprint: "a".repeat(64),
          selectionNotice: "Confira o edital.",
        };
      if (path === "/api/proposals" && route.request().method() === "POST") {
        await pendingSave;
        await route.fulfill({
          status: 503,
          json: { error: "Falha temporária de teste" },
        });
        return;
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/oportunidades?q=impressao");
    await page.getByRole("link", { name: "Ver edital", exact: true }).click();
    await page.getByRole("tab", { name: "Cotações", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova cotação", exact: true })
      .click();
    const name = page.getByLabel("Nome da cotação", { exact: true });
    await name.fill("Rascunho protegido");
    await page.getByRole("link", { name: "Catálogo", exact: true }).click();
    const guard = page.getByRole("dialog", {
      name: "Alterações não salvas",
      exact: true,
    });
    await guard.waitFor();
    assert.ok(page.url().includes("/oportunidades/op"));
    await guard
      .getByRole("button", { name: "Continuar na cotação", exact: true })
      .click();
    assert.equal(await name.inputValue(), "Rascunho protegido");
    await page
      .getByRole("link", { name: "Todas as oportunidades", exact: true })
      .click();
    await guard.waitFor();
    await page.keyboard.press("Escape");
    await guard.waitFor({ state: "detached" });
    assert.equal(await name.inputValue(), "Rascunho protegido");
    await page.evaluate(() => history.back());
    await guard.waitFor();
    await guard
      .getByRole("button", { name: "Continuar na cotação", exact: true })
      .click();
    assert.ok(page.url().includes("/oportunidades/op"));
    assert.equal(await name.inputValue(), "Rascunho protegido");
    await page.evaluate(() => history.back());
    await guard.waitFor();
    await guard
      .getByRole("button", { name: "Sair sem salvar", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/app/oportunidades");
    assert.equal(new URL(page.url()).searchParams.get("q"), "impressao");
    assert.deepEqual(writes, []);
    await page.evaluate(() => history.forward());
    await page.waitForURL((url) => url.pathname === "/app/oportunidades/op");
    await page.getByRole("tab", { name: "Cotações", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova cotação", exact: true })
      .click();
    assert.equal(await name.inputValue(), "Nova cotação");
    // A clean editor does not ask for confirmation.
    await page.getByRole("link", { name: "Catálogo", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app/catalogo");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.evaluate(() => history.back());
    await page.waitForURL((url) => url.pathname === "/app/oportunidades/op");
    await page.getByRole("tab", { name: "Cotações", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova cotação", exact: true })
      .click();
    await name.fill("Falha preservada");
    await page
      .getByRole("button", { name: "Adicionar item manual", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvando…", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("tab", { name: "Visão do edital", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("link", { name: "Catálogo", exact: true }).click();
    const working = page.getByRole("dialog", {
      name: "Operação em andamento",
      exact: true,
    });
    await working.waitFor();
    assert.equal(
      await working
        .getByRole("button", { name: "Sair sem salvar", exact: true })
        .count(),
      0,
    );
    await working
      .getByRole("button", { name: "Continuar na cotação", exact: true })
      .click();
    releaseSave();
    await page
      .getByText("Falha temporária de teste", { exact: true })
      .waitFor();
    assert.equal(await name.inputValue(), "Falha preservada");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("link", { name: "Todas as oportunidades", exact: true })
      .click();
    await guard.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/proposal-navigation-mobile.png",
      fullPage: true,
    });
    await guard
      .getByRole("button", { name: "Continuar na cotação", exact: true })
      .click();
    // The browser's own prompt also protects a hard reload (no draft is stored locally).
    let reloadPrompt = false;
    page.once("dialog", async (dialog) => {
      reloadPrompt = dialog.type() === "beforeunload";
      await dialog.dismiss();
    });
    await page.reload({ timeout: 3000 }).catch((error) => {
      assert.match(error.message, /net::ERR_ABORTED|Timeout/);
    });
    assert.equal(reloadPrompt, true);
    assert.equal(await name.inputValue(), "Falha preservada");
    assert.deepEqual(writes, ["/api/proposals"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
