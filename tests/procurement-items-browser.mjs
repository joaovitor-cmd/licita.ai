import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

test("items: compact table, accents, exclusions, privacy, pages and responsive layout", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await mkdir("test-results", { recursive: true });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    const opportunity = {
      id: "op-items",
      publicCode: "LC-00000001",
      title: "Serviços de impressão",
      description: "Serviços de impressão",
      agency: "Prefeitura QA",
      city: "Porto Alegre",
      state: "RS",
      sourceName: "PNCP",
      sourceCode: "pncp",
      modality: "Pregão eletrônico",
      status: "Recebendo propostas",
      value: 2000,
      publishedAt: null,
      opensAt: null,
      closesAt: null,
      syncedAt: null,
      url: "https://pncp.gov.br",
      isDemo: false,
      match: { score: 80, reasons: [], excluded: false },
      documents: [],
    };
    const item = {
      number: 1,
      description: "Impressão monocromática em papel A4",
      quantity: 10000,
      unit: "Página",
      confidential: false,
      estimatedUnit: 0.0345,
      estimatedTotal: 345,
      hasResult: false,
      status: "Em andamento",
    };
    const items = [
      item,
      {
        ...item,
        number: 2,
        description: "Impressão offset em papel A4",
        confidential: true,
        estimatedUnit: null,
        estimatedTotal: null,
      },
      {
        ...item,
        number: 3,
        description:
          "Locação de equipamento. " +
          "Especificação técnica detalhada. ".repeat(20),
        quantity: null,
        unit: null,
        estimatedUnit: null,
        estimatedTotal: null,
        hasResult: true,
      },
    ];
    let failItems = false,
      failProfiles = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      let json = [];
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA", email: "qa@example.invalid" },
          organization: { id: "org", name: "Empresa QA" },
          role: "ADMIN",
        };
      if (path === "/api/entitlements")
        json = { features: ["discovery", "radar", "documents"] };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/opportunities/op-items") json = opportunity;
      if (path.endsWith("/analysis"))
        json = { analysis: null, topics: [], versions: [] };
      if (path === "/api/search-profiles") {
        if (failProfiles) {
          await route.fulfill({
            status: 503,
            json: { error: "Perfis indisponíveis" },
          });
          return;
        }
        json = [
          {
            id: "print",
            name: "Impressão",
            active: true,
            filters: { terms: "impressao", exclude: "offset" },
          },
          {
            id: "paused",
            name: "Perfil pausado",
            active: false,
            filters: { terms: "locação" },
          },
        ];
      }
      if (path === "/api/opportunities/op-items/items") {
        if (failItems) {
          await route.fulfill({
            status: 502,
            json: { error: "Fonte indisponível para os itens." },
          });
          return;
        }
        const current = Number(url.searchParams.get("page"));
        json = {
          supported: true,
          items:
            current === 1
              ? items
              : [{ ...item, number: 26, description: "Impressão colorida" }],
          page: current,
          hasMore: current === 1,
          checkedAt: "2026-10-06T12:00:00Z",
          stale: current === 2,
          notice: current === 2 ? "Exibindo consulta anterior." : undefined,
          sourceUrl:
            "https://pncp.gov.br/api/pncp/v1/orgaos/09203665000177/compras/2026/31/itens",
        };
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/oportunidades/op-items");
    await page
      .getByRole("tab", { name: "Itens e valores", exact: true })
      .click();
    const table = page.locator(".procurement-table");
    await table.waitFor();
    assert.equal(await table.locator("tbody tr").count(), 3);
    assert.match(await table.innerText(), /0,0345/);
    assert.equal(
      await table.getByText("Orçamento sigiloso", { exact: true }).count(),
      2,
    );
    assert.match(await table.innerText(), /Não informado/);
    await page
      .getByLabel("Pesquisar itens nesta página", { exact: true })
      .fill("IMPRESSAO");
    assert.equal(await table.locator("tbody tr").count(), 2);
    await page
      .getByLabel("Interesses de um perfil", { exact: true })
      .selectOption("print");
    assert.equal(
      await page
        .getByLabel("Interesses de um perfil", { exact: true })
        .getByRole("option", { name: "Perfil pausado", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Só itens de interesse", exact: true })
      .click();
    assert.equal(await table.locator("tbody tr").count(), 1);
    assert.match(await table.locator("mark").first().innerText(), /Impressão/);
    await page
      .getByLabel("Pesquisar itens nesta página", { exact: true })
      .fill("inexistente");
    await page
      .getByText("Nenhum item desta página corresponde ao filtro.", {
        exact: false,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Limpar filtro dos itens", exact: true })
      .click();
    assert.equal(await table.locator("tbody tr").count(), 3);
    await table.getByText("Ver descrição completa", { exact: true }).click();
    assert.ok(await table.locator("details").evaluate((el) => el.open));
    await page.screenshot({
      path: "test-results/items-desktop-light.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await page.locator(".sidebar[inert]").waitFor({state:"attached"});
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/items-mobile-light.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Próxima página", exact: true })
      .click();
    await table.locator("tbody th").filter({ hasText: "26" }).waitFor();
    assert.equal(await table.locator("tbody tr").count(), 1);
    await page
      .getByText("Exibindo consulta anterior.", { exact: true })
      .waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "Próxima página", exact: true })
        .isDisabled(),
    );
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.screenshot({
      path: "test-results/items-mobile-dark.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    failItems = true;
    await page
      .getByRole("button", { name: "Página anterior", exact: true })
      .click();
    await page
      .getByText("Fonte indisponível para os itens.", { exact: true })
      .waitFor();
    failItems = false;
    await page
      .getByRole("button", { name: "Tentar novamente", exact: false })
      .click();
    await table.waitFor();
    failProfiles = true;
    await page.reload();
    await page
      .getByRole("tab", { name: "Itens e valores", exact: true })
      .click();
    await page
      .getByText("Não foi possível carregar os perfis.", { exact: false })
      .waitFor();
    await table.waitFor();
    assert.equal(await table.locator("tbody tr").count(), 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
