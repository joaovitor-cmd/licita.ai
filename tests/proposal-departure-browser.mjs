import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

async function harness(page) {
  const errors = [],
    writes = [],
    state = {
      organizationId: "org",
      authenticated: true,
      fail: true,
      hold: false,
      release: () => {},
    };
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  const opportunity = {
    id: "op",
    publicCode: "LC-123",
    title: "Impressão",
    agency: "Órgão QA",
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
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    let json = [];
    if (method !== "GET") writes.push(path);
    if (path === "/api/auth/me") {
      if (!state.authenticated) {
        await route.fulfill({
          status: 401,
          json: { error: "Sessão encerrada" },
        });
        return;
      }
      json = {
        user: { id: "qa", name: "QA", email: "qa@example.invalid" },
        organization: {
          id: state.organizationId,
          name:
            state.organizationId === "org"
              ? "Empresa original"
              : "Empresa destino",
        },
        role: "ADMIN",
      };
    }
    if (path === "/api/entitlements")
      json = {
        features: ["discovery", "radar", "catalog"],
        multiCompany: true,
      };
    if (path === "/api/getting-started")
      json = { onboardingStatus: "DISMISSED" };
    if (path === "/api/workspaces")
      json = [
        { id: "org", name: "Empresa original" },
        { id: "org2", name: "Empresa destino" },
      ];
    if (path === "/api/opportunities/op") json = opportunity;
    if (path.endsWith("/proposal-context"))
      json = {
        company: {
          id: "org",
          name: "Empresa original",
          cnpj: "11222333000181",
          revision: 1,
          details: { legalName: "Empresa original" },
        },
        sourceFingerprint: "a".repeat(64),
        selectionNotice: "Confira o edital.",
      };
    if (path === "/api/user-preferences")
      json = {
        homePage: "radar",
        effectiveHomePage: "radar",
        radarAvailable: true,
      };
    if (path === "/api/trackings/page")
      json = {
        items: [],
        total: 0,
        page: 1,
        pageTotal: 0,
        pageSize: 25,
        stages: [],
        summary: {
          active: 0,
          potential: null,
          unknownValues: 0,
          pendingTasks: 0,
        },
      };
    if (
      (path === "/api/auth/logout" ||
        path === "/api/workspaces/switch" ||
        path === "/api/proposals") &&
      method === "POST"
    ) {
      if (state.hold) await new Promise((resolve) => (state.release = resolve));
      if (state.fail) {
        await route.fulfill({
          status: 503,
          json: { error: "Falha simulada de saída" },
        });
        return;
      }
      if (path === "/api/auth/logout") state.authenticated = false;
      else if (path === "/api/workspaces/switch") state.organizationId = "org2";
    }
    await route.fulfill({ json });
  });
  await page.goto("http://localhost:5173/app/oportunidades/op?tab=propostas");
  await page.getByRole("button", { name: "Nova cotação", exact: true }).click();
  await page
    .getByLabel("Nome da cotação", { exact: true })
    .fill("Rascunho de saída");
  return { errors, writes, state };
}
async function logout(page) {
  await page.locator(".user-button").click();
  await page
    .getByRole("button", { name: "Sair da plataforma", exact: true })
    .click();
}
async function decide(page, accept) {
  const messages = [];
  page.once("dialog", async (dialog) => {
    messages.push(dialog.message());
    accept ? await dialog.accept() : await dialog.dismiss();
  });
  return messages;
}

test("logout cancellation sends nothing; failed logout preserves and re-protects the draft", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      { errors, writes, state } = await harness(page);
    const declined = await decide(page, false);
    await logout(page);
    assert.equal(declined.length, 1);
    assert.match(declined[0], /alterações ainda não salvas/);
    assert.deepEqual(writes, []);
    assert.equal(
      await page.getByLabel("Nome da cotação", { exact: true }).inputValue(),
      "Rascunho de saída",
    );
    await page.locator(".user-button").click();
    await decide(page, true);
    state.hold = true;
    await logout(page);
    await page.waitForFunction(
      () => document.querySelector(".proposal-editor")?.disabled === true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Sair da plataforma", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("tab", { name: "Visão do edital", exact: true })
        .isDisabled(),
      true,
    );
    state.release();
    await page.getByText("Falha simulada de saída", { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector(".proposal-editor")?.disabled === false,
    );
    assert.equal(
      await page.getByLabel("Nome da cotação", { exact: true }).inputValue(),
      "Rascunho de saída",
    );
    assert.equal(state.authenticated, true);
    await page
      .getByRole("link", { name: "Todas as oportunidades", exact: true })
      .click();
    const guard = page.getByRole("dialog", {
      name: "Alterações não salvas",
      exact: true,
    });
    await guard.waitFor();
    await guard
      .getByRole("button", { name: "Continuar na cotação", exact: true })
      .click();
    assert.deepEqual(writes, ["/api/auth/logout"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
test("workspace cancellation/failure keeps company and draft; confirmed switch has no second reload prompt", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      { errors, writes, state } = await harness(page),
      selector = page.getByLabel("Empresa ativa", { exact: true });
    await decide(page, false);
    await selector.selectOption("org2");
    assert.deepEqual(writes, []);
    assert.equal(await selector.inputValue(), "org");
    await decide(page, true);
    await selector.selectOption("org2");
    await page.getByText("Falha simulada de saída", { exact: true }).waitFor();
    assert.equal(await selector.inputValue(), "org");
    assert.equal(
      await page.getByLabel("Nome da cotação", { exact: true }).inputValue(),
      "Rascunho de saída",
    );
    state.fail = false;
    const prompts = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.type());
      await dialog.accept();
    });
    await selector.selectOption("org2");
    await page.waitForURL((url) => url.pathname === "/app/radar");
    assert.equal(await selector.inputValue(), "org2");
    assert.deepEqual(prompts, ["confirm"]);
    assert.equal(state.organizationId, "org2");
    assert.deepEqual(writes, [
      "/api/workspaces/switch",
      "/api/workspaces/switch",
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
test("confirmed logout reaches login without router or native prompt loops", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      { errors, writes, state } = await harness(page);
    state.fail = false;
    const prompts = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.type());
      await dialog.accept();
    });
    await logout(page);
    await page.waitForURL((url) => url.pathname === "/login");
    assert.deepEqual(prompts, ["confirm"]);
    assert.deepEqual(writes, ["/api/auth/logout"]);
    assert.equal(state.authenticated, false);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
test("pending quote save refuses context changes before any session request", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      { errors, writes, state } = await harness(page);
    state.hold = true;
    await page
      .getByRole("button", { name: "Adicionar item manual", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvando…", exact: true })
      .waitFor();
    const prompts = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.type());
      await dialog.accept();
    });
    await logout(page);
    await page
      .getByLabel("Empresa ativa", { exact: true })
      .selectOption("org2");
    assert.deepEqual(prompts, ["alert", "alert"]);
    assert.deepEqual(writes, ["/api/proposals"]);
    assert.equal(state.organizationId, "org");
    assert.equal(state.authenticated, true);
    state.release();
    await page.getByText("Falha simulada de saída", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Nome da cotação", { exact: true }).inputValue(),
      "Rascunho de saída",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
test("confirmed workspace switch still reloads when cross-tab storage is unavailable", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      { errors, writes, state } = await harness(page);
    state.fail = false;
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "licitaro-workspace-change")
          throw new Error("Simulated storage failure");
        return original.call(this, key, value);
      };
    });
    const prompts = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.type());
      await dialog.accept();
    });
    await page
      .getByLabel("Empresa ativa", { exact: true })
      .selectOption("org2");
    await page.waitForURL((url) => url.pathname === "/app/radar");
    assert.equal(
      await page.getByLabel("Empresa ativa", { exact: true }).inputValue(),
      "org2",
    );
    assert.deepEqual(prompts, ["confirm"]);
    assert.deepEqual(writes, ["/api/workspaces/switch"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
