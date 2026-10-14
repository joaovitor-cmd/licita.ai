import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

test("personal home preference survives entry and does not hide overview navigation", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Preference UI error:", e.message);
    });
    let homePage = "overview",
      failSave = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
      let json = [];
      if(path==='/api/trackings/page')json={items:[],page:1,pageSize:25,view:'board',total:0,pageTotal:0,hasMore:false,stages:[],summary:{active:0,potential:null,unknownValues:0,pendingTasks:0}};
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
      if (path === "/api/preferences")
        json = { inApp: true, email: false, minScore: 60 };
      if (path === "/api/sources")
        json = {
          sources: [],
          runs: [],
          scheduler: {
            enabled: false,
            intervalMinutes: 30,
            emailConfigured: false,
          },
        };
      if (path === "/api/user-preferences") {
        if (method === "PUT") {
          if (failSave) {
            await route.fulfill({
              status: 503,
              json: { error: "Falha simulada nas preferências." },
            });
            return;
          }
          homePage = route.request().postDataJSON().homePage;
        }
        json = { homePage, effectiveHomePage: homePage, radarAvailable: true };
      }
      if (path === "/api/dashboard") {
        await route.fulfill({
          status: 503,
          json: { error: "Indicadores temporariamente indisponíveis." },
        });
        return;
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/configuracoes");
    await page.getByLabel("Começar em", { exact: true }).selectOption("radar");
    await page
      .getByRole("button", { name: "Salvar página inicial", exact: true })
      .click();
    await page
      .getByText("Falha simulada nas preferências.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Começar em", { exact: true }).inputValue(),
      "radar",
    );
    failSave = false;
    await page
      .getByRole("button", { name: "Salvar página inicial", exact: true })
      .click();
    await page
      .getByText("Sua página inicial foi atualizada.", { exact: true })
      .waitFor();
    await page.goto("http://localhost:5173/app");
    await page.waitForURL("**/app/radar");
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    assert.equal(
      await page
        .getByRole("link", { name: "Visão geral", exact: true })
        .getAttribute("href"),
      "/app/visao-geral",
    );
    await page.getByRole("link", { name: "Visão geral", exact: true }).click();
    await page
      .getByText("Indicadores temporariamente indisponíveis.", { exact: true })
      .waitFor();
    assert.ok(page.url().endsWith("/app/visao-geral"));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
