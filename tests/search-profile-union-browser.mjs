import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
test("joint profiles are explicitly selected, readable and never saved implicitly", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      writes = [],
      errors = [];
    const profiles = [
      { id: "a", name: "Impressão Sul", active: true },
      { id: "b", name: "Serviços", active: true },
      { id: "c", name: "Perfil pausado", active: false },
    ].map((p) => ({
      ...p,
      description: "",
      revision: 1,
      filters: { terms: p.name },
    }));
    page.on("pageerror", (e) => errors.push(e.message));
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
      if (url.pathname === "/api/search-profiles") json = profiles;
      if (url.pathname === "/api/opportunities")
        json = {
          items: url.searchParams.has('searchProfiles')?[{id:'op',publicCode:'LC-123',title:'Serviços de impressão',agency:'Órgão QA',state:'RS',city:'Porto Alegre',modality:'Pregão eletrônico',sourceCode:'pncp',sourceName:'PNCP',value:100,publishedAt:null,opensAt:null,closesAt:null,status:'Divulgado',syncedAt:null,trackingId:null,isDemo:true,match:{score:20,reasons:[],excluded:false},matchedSearchProfiles:profiles.filter(p=>(url.searchParams.get('searchProfiles')||'').split(',').includes(p.id))}]:[],
          total: 0,
          page: 1,
          pages: 1,
          pageSize: 20,
          searchProfiles: profiles.filter((p) =>
            (url.searchParams.get("searchProfiles") || "")
              .split(",")
              .includes(p.id),
          ),
        };
      await route.fulfill({ json });
    });
    await page.goto(
      "http://localhost:5173/app/oportunidades?states=SP&q=antiga&sort=value&pageSize=20",
    );
    await page
      .getByRole("button", { name: "Perfis de busca", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    assert.equal(
      await modal
        .getByRole("checkbox", {
          name: "Combinar perfil Perfil pausado",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await modal
      .getByRole("checkbox", {
        name: "Combinar perfil Impressão Sul",
        exact: true,
      })
      .check();
    await modal
      .getByRole("checkbox", { name: "Combinar perfil Serviços", exact: true })
      .check();
    await modal
      .getByRole("button", { name: "Buscar com selecionados (2)", exact: true })
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("searchProfiles") === "a,b",
    );
    const params = new URL(page.url()).searchParams;
    assert.equal(params.has("q"), false);
    assert.equal(params.has("states"), false);
    assert.equal(params.get("sort"), "value");
    assert.equal(params.get("pageSize"), "20");
    const region = page.getByRole("region", { name: "Filtros aplicados" });
    await page.getByText('Encontrado por 2 perfis de busca',{exact:true}).click();
    assert.match(await page.locator('.discovery-relevance').first().innerText(),/Impressão Sul/);
    assert.match(await page.locator('.discovery-relevance').first().innerText(),/Serviços/);
    await region
      .getByText("Impressão Sul, Serviços", { exact: false })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "2 perfis em busca", exact: true })
      .click();
    assert.equal(
      await modal
        .getByRole("checkbox", {
          name: "Combinar perfil Serviços",
          exact: true,
        })
        .isChecked(),
      true,
    );
    await modal
      .getByRole("button", { name: "Criar perfil de busca", exact: true })
      .click();
    await modal
      .getByText("Novo perfil independente.", { exact: false })
      .waitFor();
    assert.equal(
      await modal
        .getByLabel("Termos de interesse", { exact: false })
        .inputValue(),
      "",
    );
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Remover filtro: Perfis de busca",
        exact: true,
      })
      .click();
    await page.waitForURL((url) => !url.searchParams.has("searchProfiles"));
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Perfis de busca", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/search-profile-union-mobile.png",
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
});
