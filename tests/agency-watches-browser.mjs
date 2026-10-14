import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

test("agency monitors preserve failed drafts, pause explicitly and expose traceable history with member read-only access", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultTimeout(10000);
    let watches = [],
      failCreate = true,
      role = "ADMIN",
      posts = 0;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
      let json = [];
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA", email: "qa@example.invalid" },
          organization: { id: "org", name: "QA" },
          role,
        };
      if (path === "/api/entitlements")
        json = { features: ["discovery", "radar", "documents"] };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/agency-watches") {
        json = watches;
        if (method === "POST") {
          posts++;
          if (failCreate) {
            await route.fulfill({
              status: 503,
              json: { error: "Falha temporária ao salvar." },
            });
            return;
          }
          const body = route.request().postDataJSON();
          assert.deepEqual(body.terms, ["impressão", "software"]);
          assert.deepEqual(body.states, ["RS", "SC"]);
          watches = [
            {
              ...body,
              id: "watch-qa",
              agencyCnpj: "11222333000181",
              revision: 1,
              active: true,
              activeSince: "2026-10-06T12:00:00Z",
              hitCount: 1,
            },
          ];
          json = watches[0];
        }
      }
      if (path === "/api/agency-watches/watch-qa/active") {
        const body = route.request().postDataJSON();
        assert.equal(body.revision, watches[0].revision);
        watches = [
          {
            ...watches[0],
            active: body.active,
            revision: watches[0].revision + 1,
          },
        ];
        json = watches[0];
      }
      if (path === "/api/agency-watches/watch-qa/hits")
        json = {
          total: 1,
          pages: 1,
          page: 1,
          items: [
            {
              opportunity_id: "op-qa",
              title:
                "Serviços de impressão com manutenção e fornecimento de materiais",
              agency: "Prefeitura QA",
              state: "RS",
              source_name: "PNCP",
              public_code: "918",
              published_at: "2026-10-06T13:00:00Z",
              detected_at: "2026-10-06T13:10:00Z",
              rule_snapshot: {
                name: "Regra anterior",
                revision: 1,
                agencyCnpj: "11222333000181",
                terms: ["impressão"],
                excludedTerms: [],
                states: ["RS"],
              },
            },
          ],
        };
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/monitoramentos");
    await page
      .getByRole("button", { name: "Novo monitoramento", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Nome do monitoramento")
      .fill("Prefeitura impressão");
    await dialog
      .getByLabel("CNPJ do órgão", { exact: true })
      .fill("11.222.333/0001-81");
    await dialog.getByLabel("Assuntos (opcional)").fill("impressão, software");
    await dialog
      .getByLabel("UFs da unidade do órgão (opcional)")
      .fill("rs, sc");
    await dialog.getByRole("button", { name: "Salvar monitoramento" }).click();
    await dialog
      .getByText("Falha temporária ao salvar.", { exact: true })
      .waitFor();
    assert.equal(
      await dialog.getByLabel("Nome do monitoramento").inputValue(),
      "Prefeitura impressão",
    );
    failCreate = false;
    await dialog.getByRole("button", { name: "Salvar monitoramento" }).click();
    await dialog.waitFor({ state: "detached" });
    await page
      .getByRole("heading", { name: "Prefeitura impressão", exact: true })
      .waitFor();
    assert.equal(posts, 2);
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await page.getByText("Pausado", { exact: true }).waitFor();
    assert.equal(watches[0].active, false);
    assert.equal(watches[0].hitCount, 1);
    await page
      .getByRole("button", { name: "Ver publicações", exact: true })
      .click();
    await dialog.getByText("LC-00000918", { exact: false }).waitFor();
    await dialog.getByText("Por que apareceu aqui?", { exact: true }).click();
    await dialog
      .getByText("Regra “Regra anterior”", { exact: false })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("link", { name: "Abrir oportunidade" })
        .getAttribute("href"),
      "/app/oportunidades/op-qa",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/agency-monitor-mobile.png",
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Fechar janela" }).click();
    role = "MEMBER";
    await page.reload();
    await page
      .getByRole("heading", { name: "Prefeitura impressão", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Novo monitoramento", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Editar", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Retomar", exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Ver publicações", exact: true })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
