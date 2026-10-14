import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
test("opportunities: compact objects, explicit source status, unknown values and mobile expansion", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    let calls = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    const title =
      "Contratação de serviços de impressão e manutenção de equipamentos para diversas unidades municipais. ".repeat(
        9,
      ) + "CONTINUAÇÃO FINAL DO OBJETO";
    const base = {
      id: "long",
      publicCode: "LC-00055555",
      title,
      description: null,
      agency: "Prefeitura de Teste",
      city: "Teste",
      state: "RS",
      modality: "Pregão eletrônico",
      sourceCode: "pncp",
      sourceName: "PNCP",
      capag: null,
      uasg: null,
      editalNumber: null,
      publishedAt: null,
      opensAt: null,
      closesAt: "2050-12-01T12:00:00Z",
      syncedAt: "2026-10-07T12:00:00Z",
      value: null,
      status: "Cancelada",
      isDemo: false,
      url: "https://pncp.gov.br",
      match: { score: 50, reasons: [], excluded: false },
      trackingId: null,
      documents: [],
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json = [];
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA" },
          organization: { id: "org", name: "Empresa" },
          role: "ADMIN",
        };
      if (path === "/api/entitlements")
        json = { features: ["discovery", "radar"], multiCompany: false };
      if (path === "/api/getting-started")
        json = { profileReady: true, radarReady: true };
      if (path === "/api/opportunities") {
        calls++;
        json = {
          items: [
            base,
            {
              ...base,
              id: "short",
              title: "Fornecimento de papel",
              value: 0,
              closesAt: "2000-01-01T12:00:00Z",
              status: null,
            },
            {
              ...base,
              id: "invalid",
              title: "Dados incompletos",
              status:
                "Aviso do portal " +
                "Detalhes da situação informada. ".repeat(8) +
                "<img src=x onerror=alert(1)>",
              opensAt: "invalid",
              closesAt: null,
            },
          ],
          total: 3,
          page: 1,
          pages: 1,
          pageSize: 20,
        };
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/oportunidades?terms=impressao");
    const cards = page.locator(".discovery-list-card"),
      first = cards.nth(0),
      second = cards.nth(1),
      third = cards.nth(2);
    await first.waitFor();
    assert.equal(await cards.count(), 3);
    const toggle = first.getByRole("button", {
      name: "Ler objeto completo",
      exact: true,
    });
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.ok(!(await first.locator("h3").innerText()).includes("CONTINUAÇÃO"));
    assert.equal(
      await first.locator(".discovery-source-status strong").innerText(),
      "Cancelada",
    );
    assert.ok(!(await first.innerText()).includes("Recebendo propostas"));
    assert.match(
      await first.locator(".discovery-facts").innerText(),
      /Valor estimado do edital/i,
    );
    assert.match(
      await first.locator(".discovery-facts").innerText(),
      /Não informado/,
    );
    assert.match(await second.locator(".discovery-facts").innerText(), /0,00/);
    assert.match(
      await second.locator(".discovery-source-status").innerText(),
      /já passou/,
    );
    assert.equal(
      await second
        .getByRole("button", { name: "Ler objeto completo", exact: true })
        .count(),
      0,
    );
    assert.match(
      await third.locator(".discovery-source-status").innerText(),
      /inconsistentes/,
    );
    const initialCalls=calls;
    await toggle.click();
    assert.equal(await first.locator("h3").innerText(), title);
    assert.equal(
      await first
        .getByRole("button", { name: "Recolher objeto", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.ok(
      (
        await first.locator(".discovery-object mark").allTextContents()
      ).includes("impressão"),
    );
    await first
      .getByRole("button", { name: "Recolher objeto", exact: true })
      .click();
    await first
      .getByText("Sobre os dados deste edital", { exact: true })
      .click();
    await first.getByText(/não necessariamente o horário da sessão/).waitFor();
    await third
      .getByText("Sobre os dados deste edital", { exact: true })
      .click();
    assert.match(
      await third.locator(".discovery-source-context").innerText(),
      /<img src=x onerror=alert\(1\)>/,
    );
    assert.equal(await third.locator("img").count(), 0);
    assert.equal(calls, initialCalls);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await toggle.click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mkdir("test-results", { recursive: true });
    const skipLink=await page.locator('.skip-link').boundingBox();
    assert.ok(skipLink&&skipLink.y+skipLink.height<=0,'Atalho de navegação deve ficar fora da tela quando não está focado.');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({
      path: "test-results/opportunity-reading-mobile.png",
      fullPage: true,
    });
    await first
      .getByRole("button", { name: "Recolher objeto", exact: true })
      .click();
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({
      path: "test-results/opportunity-reading-mobile-dark.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
