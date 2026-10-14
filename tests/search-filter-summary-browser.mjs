import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
test("active filters are readable, removable and do not submit drafts or mutate saved profiles", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [],
      queries = [],
      writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const terms =
      "impressão, toner, <img src=x onerror=alert(1)>, " +
      "produto técnico ".repeat(20);
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json = [];
      if (route.request().method() !== "GET") writes.push(url.pathname);
      if (url.pathname === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA" },
          organization: { id: "org", name: "Empresa" },
          role: "ADMIN",
        };
      if (url.pathname === "/api/entitlements")
        json = { features: ["discovery", "radar"], multiCompany: false };
      if (url.pathname === "/api/getting-started")
        json = { profileReady: true, radarReady: true };
      if (url.pathname === "/api/search-profiles")
        json = [
          {
            id: "profile",
            name: "Impressão Sul",
            description: "Perfil salvo",
            revision: 1,
            active: true,
            filters: {
              q: "laser",
              terms,
              exclude: "remanufaturado",
              state: "RS",
              states: "RS,SC",
              sources: "pncp,comprasgov",
              minValue: 0,
              sort: "value",
            },
          },
        ];
      if (url.pathname === "/api/opportunities") {
        queries.push(url.searchParams.toString());
        json = {
          items: [],
          total: 0,
          page: Number(url.searchParams.get("page") || 1),
          pages: 1,
          pageSize: 20,
        };
      }
      await route.fulfill({ json });
    });
    const params = new URLSearchParams({
      q: "laser",
      terms,
      exclude: "remanufaturado",
      state: "RS",
      states: "RS,SC",
      sources: "pncp,comprasgov",
      minValue: "0",
      sort: "value",
      pageSize: "20",
      page: "3",
      searchProfile: "profile",
    });
    await page.goto("http://localhost:5173/app/oportunidades?" + params);
    const region = page.getByRole("region", { name: "Filtros aplicados" });
    await region.waitFor();
    assert.equal(await region.locator("ul > li").count(), 5);
    assert.match(await region.innerText(), /PNCP, Compras.gov.br/);
    assert.match(await region.innerText(), /0,00/);
    await region.getByText("Ver filtros completos", { exact: true }).click();
    assert.match(
      await region.locator("dl").innerText(),
      /<img src=x onerror=alert\(1\)>/,
    );
    assert.equal(await region.locator("img").count(), 0);
    const search = page.getByRole("textbox", { name: "Buscar oportunidades" });
    await search.fill("rascunho sem buscar");
    await page
      .getByRole("button", { name: "Remover filtro: Estados", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        !url.searchParams.has("states") && !url.searchParams.has("state"),
    );
    let current = new URL(page.url()).searchParams;
    assert.equal(current.has("page"), false);
    assert.equal(current.get("q"), "laser");
    assert.equal(current.get("sort"), "value");
    assert.equal(current.get("pageSize"), "20");
    assert.equal(current.get("searchProfile"), "profile");
    assert.equal(current.get("terms"), terms);
    assert.equal(await search.inputValue(), "rascunho sem buscar");
    const portals = page.getByRole("button", {
      name: "Remover filtro: Portais",
      exact: true,
    });
    await portals.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.searchParams.has("sources"));
    assert.equal(await search.inputValue(), "rascunho sem buscar");
    await page
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click();
    await region.waitFor({ state: "detached" });
    current = new URL(page.url()).searchParams;
    assert.equal(current.toString(), "q=laser&sort=value&pageSize=20");
    assert.equal(await search.inputValue(), "rascunho sem buscar");
    assert.ok(queries.every((query) => !query.includes("rascunho")));
    assert.deepEqual(writes, []);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.waitForURL(
      (url) => url.searchParams.get("q") === "rascunho sem buscar",
    );
    await page.goBack();
    await page.waitForURL((url) => url.searchParams.get("q") === "laser");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Buscar oportunidades"]')
          ?.value === "laser",
    );
    assert.equal(await search.inputValue(), "laser");
    for (let index = 0; index < 3; index++) {
      const value = `nova busca ${index}`;
      await search.fill(value);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("q") === value);
      await page.goBack();
      await page.waitForURL((url) => url.searchParams.get("q") === "laser");
      await page.waitForFunction(
        () =>
          document.querySelector('input[aria-label="Buscar oportunidades"]')
            ?.value === "laser",
      );
    }
    await page.goForward();
    await page.waitForURL(
      (url) => url.searchParams.get("q") === "nova busca 2",
    );
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Buscar oportunidades"]')
          ?.value === "nova busca 2",
    );
    await page.goto("http://localhost:5173/app/oportunidades?" + params);
    await region.waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mkdir("test-results", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "test-results/search-filter-summary-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
  } finally {
    await browser.close();
  }
});
