import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { commercialTotals } from "../apps/web/src/proposal-values.ts";

test("quotations preserve paginated selection, exact prices and failed-save intent; versions are read only", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    const company = {
      id: "org",
      name: "Empresa QA",
      cnpj: "11222333000181",
      revision: 1,
      details: { legalName: "Razão social QA" },
    };
    const opportunity = {
      id: "op-quote",
      publicCode: "LC-00000001",
      title: "Impressão",
      description: "Impressão",
      agency: "Prefeitura QA",
      city: "Porto Alegre",
      state: "RS",
      sourceName: "PNCP",
      sourceCode: "pncp",
      modality: "Pregão",
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
    let fail = true,
      invalidThird = true,
      summary = [],
      versions = [],
      saved = null;
    let historicalMode = false;
    let conflictMode = false;
    const storedVersions = new Map();
    const requests = [],
      catalogPaths = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method();
      let json = [];
      if (
        path.startsWith("/api/catalog") ||
        path.startsWith("/api/proposals/catalog-options")
      )
        catalogPaths.push(path);
      if (path === "/api/proposals/catalog-options")
        json = {
          page: 1,
          hasMore: false,
          items: [
            {
              id: "cat-compatible",
              name: "Venda por página",
              unit: "pagina",
              salePrice: "0.1250",
              priceBasis: "PER_UNIT",
            },
            {
              id: "cat-monthly",
              name: "Mensalidade",
              unit: "Página",
              salePrice: "100",
              priceBasis: "PER_MONTH",
            },
            {
              id: "cat-unit",
              name: "Equipamento",
              unit: "UN",
              salePrice: "100",
              priceBasis: "PER_UNIT",
            },
            {
              id: "cat-unknown",
              name: "Sem preço",
              unit: "Página",
              salePrice: null,
              priceBasis: "PER_UNIT",
            },
          ],
        };
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA", email: "qa@example.invalid" },
          organization: { id: "org", name: "Empresa QA" },
          role: "MEMBER",
        };
      if (path === "/api/entitlements")
        json = { features: ["discovery", "radar", "documents"] };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/search-profiles")
        json = [
          {
            id: "profile",
            name: "Impressão sem item 3",
            active: true,
            filters: { terms: "impressão", exclude: "item 3" },
          },
          {
            id: "paused",
            name: "Pausado",
            active: false,
            filters: { terms: "impressão" },
          },
        ];
      if (path === "/api/opportunities/op-quote") json = opportunity;
      if (path.endsWith("/proposal-context"))
        json = {
          company,
          sourceFingerprint: "a".repeat(64),
          selectionNotice: "Confira os lotes no edital.",
        };
      if (path.endsWith("/proposals")) json = summary;
      if (path.endsWith("/items")) {
        const n = Number(url.searchParams.get("page") || 1);
        json = {
          supported: true,
          page: n,
          hasMore: n === 1,
          checkedAt: "2026-10-07T12:00:00Z",
          items: [
            {
              number: n,
              description: `Impressão item ${n}`,
              quantity: 10,
              unit: "Página",
              confidential: n === 2,
              estimatedUnit: n === 2 ? null : 123.4567,
            },
            ...(n === 2
              ? [
                  {
                    number: 3,
                    description: invalidThird
                      ? "x".repeat(2001)
                      : "Impressão item 3",
                    quantity: 10,
                    unit: "Página",
                    confidential: false,
                    estimatedUnit: null,
                  },
                ]
              : []),
          ],
        };
      }
      if (
        (path === "/api/proposals" && method === "POST") ||
        (path === "/api/proposals/p1" && method === "PUT")
      ) {
        const input = route.request().postDataJSON();
        requests.push(input);
        if (conflictMode) {
          await route.fulfill({
            status: 409,
            json: {
              error:
                "A cotação mudou. Recarregue a versão atual antes de salvar.",
            },
          });
          return;
        }
        if (fail) {
          await route.fulfill({
            status: 503,
            json: { error: "Falha temporária. Tente novamente." },
          });
          return;
        }
        const revision = versions.length + 1,
          version = {
            revision,
            body: input.body,
            companySnapshot: structuredClone(company),
            totals: commercialTotals(input.body.items),
            createdAt: "2026-10-07T12:00:00Z",
            author: "QA",
          };
        versions.unshift({
          revision,
          state: input.body.state,
          created_at: version.createdAt,
        });
        storedVersions.set(revision, structuredClone(version));
        saved = {
          id: "p1",
          currentRevision: revision,
          isCurrent: true,
          version,
          versions,
          versionsHasMore: false,
          stale: false,
          staleReasons: [],
        };
        summary = [
          {
            id: "p1",
            name: input.body.name,
            currentRevision: revision,
            state: input.body.state,
            totals: version.totals,
          },
        ];
        json = { proposalId: "p1", currentRevision: revision, version };
      }
      if (path === "/api/proposals/p1" && method === "GET") {
        json = saved;
        if (historicalMode) {
          const revision = Number(url.searchParams.get("revision") || 51);
          const version =
            revision === 51
              ? { ...storedVersions.get(2), revision: 51 }
              : storedVersions.get(revision);
          if (!version) {
            await route.fulfill({
              status: 404,
              json: { error: "Versão não encontrada." },
            });
            return;
          }
          json = {
            ...saved,
            currentRevision: 51,
            isCurrent: revision === 51,
            version,
            versions: Array.from({ length: 50 }, (_, i) => ({
              revision: 51 - i,
              state: "DRAFT",
              created_at: "2026-10-07T12:00:00Z",
            })),
            versionsHasMore: true,
          };
        }
      }
      await route.fulfill({ json });
    });
    await page.goto(
      "http://localhost:5173/app/oportunidades/op-quote?tab=propostas",
    );
    await page
      .getByRole("button", { name: "Nova cotação", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Selecionar itens do edital", exact: true })
      .click();
    const picker = page.getByRole("region", {
      name: "Selecionar itens do edital",
      exact: true,
    });
    await picker.getByRole("checkbox").waitFor();
    assert.equal(await picker.getByRole("checkbox").isChecked(), false);
    await picker.getByRole("checkbox").check();
    const first = page.getByRole("article", {
      name: "Linha da proposta 1",
      exact: true,
    });
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "",
    );
    await first
      .getByLabel("Preço unitário ofertado (R$)", { exact: true })
      .fill("0,075");
    async function checkCatalog() {
      await first
        .getByRole("button", { name: "Escolher no catálogo", exact: true })
        .click();
      const catalog = first.getByRole("region", {
        name: "Catálogo comercial da linha",
        exact: true,
      });
      await catalog.getByText("Venda por página", { exact: true }).waitFor();
      const options = catalog.getByRole("article");
      assert.ok(
        await options
          .nth(0)
          .getByRole("button", { name: "Aplicar preço de venda", exact: true })
          .isEnabled(),
      );
      for (let i = 1; i < 4; i++)
        assert.ok(
          await options
            .nth(i)
            .getByRole("button", {
              name: "Aplicar preço de venda",
              exact: true,
            })
            .isDisabled(),
        );
      page.once("dialog", (dialog) => dialog.dismiss());
      await options
        .nth(0)
        .getByRole("button", { name: "Aplicar preço de venda", exact: true })
        .click();
      assert.equal(
        await first
          .getByLabel("Preço unitário ofertado (R$)", { exact: true })
          .inputValue(),
        "0,075",
      );
      page.once("dialog", (dialog) => dialog.accept());
      await options
        .nth(0)
        .getByRole("button", { name: "Aplicar preço de venda", exact: true })
        .click();
      assert.equal(
        await first
          .getByLabel("Preço unitário ofertado (R$)", { exact: true })
          .inputValue(),
        "0,125",
      );
      await first
        .getByText("Preço de venda aplicado", { exact: true })
        .waitFor();
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .fill("0,15");
      await first
        .getByText("Produto vinculado · preço manual", { exact: true })
        .waitFor();
      await first
        .getByRole("button", { name: "Escolher no catálogo", exact: true })
        .click();
      await catalog.getByText("Mensalidade", { exact: true }).waitFor();
      await catalog
        .getByRole("article")
        .nth(1)
        .getByRole("button", {
          name: "Vincular sem aplicar preço",
          exact: true,
        })
        .click();
      assert.equal(
        await first
          .getByLabel("Preço unitário ofertado (R$)", { exact: true })
          .inputValue(),
        "0,15",
      );
      await page
        .getByRole("button", { name: "Salvar rascunho", exact: true })
        .click();
      await page
        .getByText("Versão 2 salva. Nada foi enviado ao portal oficial.", {
          exact: true,
        })
        .waitFor();
      assert.equal(requests[2].body.items[0].catalogId, "cat-monthly");
      assert.equal(requests[2].body.items[0].catalogPriceApplied, false);
      assert.equal(requests[2].body.items[0].unitPrice, "0.15");
      assert.ok(catalogPaths.length > 0);
      assert.ok(
        catalogPaths.every((path) => path === "/api/proposals/catalog-options"),
      );
    }
    await picker
      .getByRole("button", { name: "Próxima página", exact: true })
      .click();
    await picker.getByText("Impressão item 2", { exact: true }).waitFor();
    assert.equal(await picker.getByRole("checkbox").first().isChecked(), false);
    await picker
      .getByRole("button", {
        name: "Selecionar itens exibidos nesta página",
        exact: true,
      })
      .click();
    await picker.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("article").count(), 1);
    invalidThird = false;
    await picker
      .getByRole("button", { name: "Página anterior", exact: true })
      .click();
    await picker.getByText("Impressão item 1", { exact: true }).waitFor();
    await picker
      .getByRole("button", { name: "Próxima página", exact: true })
      .click();
    await picker.getByText("Impressão item 3", { exact: true }).waitFor();
    await picker
      .getByRole("button", {
        name: "Selecionar itens exibidos nesta página",
        exact: true,
      })
      .click();
    assert.equal(await page.getByRole("article").count(), 3);
    await picker
      .getByLabel("Interesses de um perfil", { exact: true })
      .selectOption("profile");
    assert.equal(
      await picker
        .getByLabel("Interesses de um perfil", { exact: true })
        .getByRole("option")
        .count(),
      2,
    );
    await picker
      .getByRole("button", { name: "Só itens de interesse", exact: true })
      .click();
    assert.equal(await picker.getByRole("checkbox").count(), 1);
    assert.equal(await page.getByRole("article").count(), 3);
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,075",
    );
    await picker
      .getByRole("button", { name: "Mostrar todos", exact: true })
      .click();
    await picker
      .getByLabel("Pesquisar nesta página", { exact: true })
      .fill("item 3");
    await picker
      .getByRole("button", {
        name: "Limpar seleção dos itens exibidos",
        exact: true,
      })
      .click();
    assert.equal(await page.getByRole("article").count(), 2);
    await picker.getByLabel("Pesquisar nesta página", { exact: true }).fill("");
    const second = page.getByRole("article", {
      name: "Linha da proposta 2",
      exact: true,
    });
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,075",
    );
    assert.equal(
      await second
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "",
    );
    await page.getByText("Total parcial: R$ 0,75", { exact: true }).waitFor();
    await picker
      .getByLabel("Pesquisar nesta página", { exact: true })
      .fill("inexistente");
    assert.equal(await picker.getByRole("checkbox").count(), 0);
    assert.equal(await page.getByRole("article").count(), 2);
    await picker.getByLabel("Pesquisar nesta página", { exact: true }).fill("");
    await second
      .getByLabel("Preço unitário ofertado (R$)", { exact: true })
      .fill("0");
    await page.getByText("Total: R$ 0,75", { exact: true }).waitFor();
    let prompted = false;
    page.once("dialog", async (dialog) => {
      prompted = true;
      await dialog.dismiss();
    });
    await page
      .getByRole("tab", { name: "Itens e valores", exact: true })
      .click();
    assert.ok(prompted);
    assert.ok(await first.isVisible());
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByText("Falha temporária. Tente novamente.", { exact: true })
      .waitFor();
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,075",
    );
    fail = false;
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByText("Versão 1 salva. Nada foi enviado ao portal oficial.", {
        exact: true,
      })
      .waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].requestId, requests[1].requestId);
    assert.equal(requests[1].body.items[0].unitPrice, "0.075");
    assert.equal(requests[1].body.items[1].unitPrice, "0");
    assert.equal(requests[1].body.items[0].sourceItem.page, 1);
    assert.equal(requests[1].body.items[1].sourceItem.page, 2);
    assert.equal(
      await page
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Criar nova versão", exact: true })
      .click();
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,075",
    );
    assert.equal(
      await page
        .getByRole("checkbox")
        .evaluateAll((nodes) => nodes.filter((n) => n.checked).length),
      0,
    );
    await first
      .getByLabel("Preço unitário ofertado (R$)", { exact: true })
      .fill("1.000,00");
    assert.ok(
      await page
        .getByRole("button", { name: "Salvar rascunho", exact: true })
        .isDisabled(),
    );
    await first
      .getByLabel("Preço unitário ofertado (R$)", { exact: true })
      .fill("0,075");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(catalogPaths.length, 0);
    await checkCatalog();
    historicalMode = true;
    await page.locator(".proposal-saved-list button").first().click();
    await page.getByText("Nova cotação · versão 51", { exact: true }).waitFor();
    await page.getByLabel("Número da versão", { exact: true }).fill("0");
    assert.ok(
      await page
        .getByRole("button", {
          name: "Consultar versão pelo número",
          exact: true,
        })
        .isDisabled(),
    );
    await page.getByLabel("Número da versão", { exact: true }).fill("1");
    await page
      .getByRole("button", {
        name: "Consultar versão pelo número",
        exact: true,
      })
      .click();
    await page.getByText("Nova cotação · versão 1", { exact: true }).waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "Criar nova versão", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await page
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .count(),
      0,
    );
    await page.getByLabel("Número da versão", { exact: true }).fill("45");
    await page
      .getByRole("button", {
        name: "Consultar versão pelo número",
        exact: true,
      })
      .click();
    await page.getByText("Versão não encontrada.", { exact: true }).waitFor();
    await page.getByText("Nova cotação · versão 1", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Abrir versão atual", exact: true })
      .click();
    await page.getByText("Nova cotação · versão 51", { exact: true }).waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "Criar nova versão", exact: true })
        .isEnabled(),
    );
    await page
      .getByRole("button", { name: "Criar nova versão", exact: true })
      .click();
    await first
      .getByLabel("Preço unitário ofertado (R$)", { exact: true })
      .fill("0,2");
    conflictMode = true;
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Conferir versão atual sem descartar rascunho",
        exact: true,
      })
      .click();
    const review = page.getByRole("region", {
      name: "Conferir conflito da cotação",
      exact: true,
    });
    await review
      .getByText("Item 1 · Preço unitário ofertado", { exact: true })
      .waitFor();
    await review.getByText("0,2", { exact: true }).waitFor();
    await review.getByText("0,15", { exact: true }).waitFor();
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,2",
    );
    assert.equal(requests.length, 4);
    await review
      .getByRole("button", { name: "Fechar conferência", exact: true })
      .click();
    assert.equal(
      await first
        .getByLabel("Preço unitário ofertado (R$)", { exact: true })
        .inputValue(),
      "0,2",
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/proposals-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
