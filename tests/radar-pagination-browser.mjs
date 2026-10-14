import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

test("Radar: carregamento por coluna, falha recuperável, filtros e lista paginada", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cards = Array.from({ length: 60 }, (_, index) => ({
      id: `card-${index}`,
      opportunityId: `op-${index}`,
      stage: index < 52 ? "IDENTIFIED" : "IN_ANALYSIS",
      ownerId: null,
      deadline: null,
      expectedValue: null,
      notes: "",
      events: [],
      tasks: [],
      pendingChanges: 0,
      opportunity: {
        id: `op-${index}`,
        title: `Impressão ${index}`,
        agency: "Órgão de teste",
        city: "Porto Alegre",
        state: "RS",
        value: 100,
        modality: "Pregão",
        sourceName: "PNCP",
        documents: [],
        match: { score: 0, reasons: [], excluded: false },
      },
    }));
    let failMore = true,
      delayOld = false;
    let orderRevision = 0,
      failOrder = false,
      conflictOrder = false;
    const requests = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json = [];
      if (url.pathname === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA" },
          organization: { id: "org", name: "Empresa" },
          role: "ADMIN",
        };
      if (url.pathname === "/api/entitlements")
        json = { features: ["radar", "discovery"], multiCompany: false };
      if (url.pathname === "/api/getting-started")
        json = { profileReady: true, radarReady: true };
      if (url.pathname.endsWith("/order")) {
        if (failOrder) {
          await route.fulfill({
            status: 503,
            json: { error: "Falha ao salvar a posição." },
          });
          return;
        }
        if (conflictOrder) {
          await route.fulfill({
            status: 409,
            json: { error: "O quadro foi reorganizado por outra pessoa." },
          });
          return;
        }
        const body = route.request().postDataJSON(),
          id = url.pathname.split("/")[3];
        assert.equal(body.revision, String(orderRevision));
        const index = cards.findIndex((card) => card.id === id),
          [card] = cards.splice(index, 1);
        cards.splice(
          body.beforeId
            ? cards.findIndex((other) => other.id === body.beforeId)
            : cards.length,
          0,
          card,
        );
        orderRevision++;
        json = {
          tracking: card,
          changed: true,
          orderRevision: String(orderRevision),
        };
      }
      if (url.pathname === "/api/trackings/page") {
        const p = url.searchParams,
          n = Number(p.get("page") || 1),
          view = p.get("view"),
          stage = p.get("stage"),
          q = p.get("q");
        requests.push(url.search);
        if (stage && n === 2 && failMore) {
          failMore = false;
          await route.fulfill({
            status: 503,
            json: { error: "Não foi possível carregar esta coluna." },
          });
          return;
        }
        if (stage && delayOld)
          await new Promise((resolve) => setTimeout(resolve, 500));
        const matching = cards.filter(
          (card) =>
            !q ||
            card.opportunity.title.toLowerCase().includes(q.toLowerCase()),
        );
        const size = view === "list" ? 50 : 25;
        const stages = ["IDENTIFIED", "IN_ANALYSIS"].map((value) => ({
          stage: value,
          count: matching.filter((card) => card.stage === value).length,
          potential:
            matching.filter((card) => card.stage === value).length * 100,
          unknownValues: 0,
          pendingTasks: 0,
          hasMore:
            matching.filter((card) => card.stage === value).length > n * size,
        }));
        const selected =
          view === "list"
            ? matching.slice((n - 1) * size, n * size)
            : stages
                .filter((row) => !stage || row.stage === stage)
                .flatMap((row) =>
                  matching
                    .filter((card) => card.stage === row.stage)
                    .slice((n - 1) * size, n * size),
                );
        json = {
          items: selected,
          orderRevision: String(orderRevision),
          page: n,
          pageSize: size,
          view,
          stages,
          total: matching.length,
          pageTotal: matching.length,
          hasMore:
            view === "list"
              ? matching.length > n * size
              : stages.some((row) => row.hasMore),
          summary: {
            active: matching.length,
            potential: matching.length * 100,
            unknownValues: 0,
            pendingTasks: 0,
          },
        };
      }
      try {
        await route.fulfill({ json });
      } catch (error) {
        if (!route.request().failure()) throw error;
      }
    });
    await page.goto("http://localhost:5173/app/radar");
    await page.locator("[data-tracking-id]").first().waitFor();
    assert.equal(await page.locator("[data-tracking-id]").count(), 33);
    assert.match(await page.locator(".radar-summary").innerText(), /60/);
    const more = page.getByRole("button", {
      name: "Carregar mais em No radar",
      exact: true,
    });
    await more.click();
    await page
      .getByText("Não foi possível carregar esta coluna.", { exact: true })
      .waitFor();
    assert.equal(await page.locator("[data-tracking-id]").count(), 33);
    await more.click();
    await page.waitForFunction(
      () => document.querySelectorAll("[data-tracking-id]").length === 58,
    );
    await more.click();
    await page.waitForFunction(
      () => document.querySelectorAll("[data-tracking-id]").length === 60,
    );
    assert.equal(
      new Set(
        await page
          .locator("[data-tracking-id]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.trackingId)),
      ).size,
      60,
    );
    const card5 = page.locator('[data-tracking-id="card-5"]');
    await card5.locator(".radar-actions > summary").click();
    await card5
      .getByRole("button", { name: "Organizar posição", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").selectOption("card-0");
    await page.screenshot({path:'test-results/radar-order-dialog.png',fullPage:false});
    failOrder = true;
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await dialog
      .getByText("Falha ao salvar a posição.", { exact: true })
      .waitFor();
    assert.equal(await dialog.getByRole("combobox").inputValue(), "card-0");
    failOrder = false;
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="No radar"] [data-tracking-id]')
          ?.dataset.trackingId === "card-5",
    );
    await page.reload();
    await card5.waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "No radar", exact: true })
        .locator("[data-tracking-id]")
        .first()
        .getAttribute("data-tracking-id"),
      "card-5",
    );
    const card0 = page.locator('[data-tracking-id="card-0"]');
    await card0.locator(".drag-handle").dragTo(card5);
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="No radar"] [data-tracking-id]')
          ?.dataset.trackingId === "card-0",
    );
    const beforeSelf=orderRevision;
    await card0.locator('.drag-handle').dragTo(card0);
    await page.waitForTimeout(150);assert.equal(orderRevision,beforeSelf);
    await card0.locator(".radar-actions > summary").click();
    await card0
      .getByRole("button", { name: "Organizar posição", exact: true })
      .click();
    conflictOrder = true;
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await dialog
      .getByText("O quadro foi reorganizado por outra pessoa.", { exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Salvar", exact: true })
        .isDisabled(),
      true,
    );
    conflictOrder = false;
    await dialog
      .getByRole("button", { name: "Atualizar quadro", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Visualização em lista" }).click();
    await page
      .getByText("Página 1 · 50 exibidas de 60 participações", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Próxima página do radar" }).click();
    await page
      .getByText("Página 2 · 10 exibidas de 60 participações", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Próxima página do radar" })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("textbox", { name: "Buscar no radar" })
      .fill("Impressão 59");
    await page
      .getByText("Página 1 · 1 exibidas de 1 participações", { exact: true })
      .waitFor();
    await page.getByRole("textbox", { name: "Buscar no radar" }).fill("");
    await page
      .getByText("Página 1 · 50 exibidas de 60 participações", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Visualização em quadro" }).click();
    await more.waitFor();
    delayOld = true;
    orderRevision++;
    const refresh=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/trackings/page'&&url.searchParams.get('view')==='board'&&!url.searchParams.has('stage');});
    await more.click();await refresh;
    await page.waitForFunction(()=>document.querySelectorAll('[data-tracking-id]').length===33);
    await more.click();
    await page
      .getByRole("textbox", { name: "Buscar no radar" })
      .fill("sem resultado");
    await page
      .getByText("Nenhuma participação com estes filtros", { exact: true })
      .waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.locator("[data-tracking-id]").count(), 0);
    await page
      .getByRole("textbox", { name: "Buscar no radar" })
      .fill("Impressão 59");
    await page.locator("[data-tracking-id]").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.ok(requests.some((url) => url.includes("stage=IDENTIFIED")));
  } finally {
    await browser.close();
  }
});
