import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
test("catalog import requires reviewed selection, distinguishes prices and preserves retry identity", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await mkdir("test-results", { recursive: true });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    let catalog = [],
      previewBody,
      confirmBodies = [],
      failConfirm = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
      let json = [];
      if (path === "/api/auth/me")
        json = {
          user: { id: "qa", name: "QA", email: "qa@example.invalid" },
          organization: { id: "org", name: "Empresa QA" },
          role: "ADMIN",
        };
      if (path === "/api/entitlements")
        json = { features: ["discovery", "radar", "documents", "catalog"] };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/catalog") json = catalog;
      if (path === "/api/catalog/import/preview") {
        previewBody = route.request().postDataJSON();
        json = {
          notice: "Nada foi gravado. Confira os itens.",
          rows: previewBody.items.map((item, index) => ({
            row: index + 1,
            item: index === 2 ? null : item,
            duplicate: index === 1,
            issues: index === 2 ? ["Custo interno: confira o formato."] : [],
            warnings: [],
          })),
        };
      }
      if (path === "/api/catalog/import/confirm") {
        const body = route.request().postDataJSON();
        confirmBodies.push(body);
        if (failConfirm) {
          await route.fulfill({
            status: 503,
            json: { error: "Falha temporária na confirmação." },
          });
          return;
        }
        catalog = body.items.map((item, index) => ({
          ...item,
          id: "catalog-" + index,
          updatedAt: "2026-10-06T12:00:00Z",
        }));
        json = { created: catalog.length, ids: catalog.map((item) => item.id) };
      }
      if (path === "/api/catalog/catalog-0" && method === "PATCH") {
        const body = route.request().postDataJSON();
        catalog = [{ ...catalog[0], ...body }];
        json = catalog[0];
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/catalogo");
    await page
      .getByRole("button", { name: "Importar CSV", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await page
      .getByLabel("Arquivo CSV do catálogo", { exact: true })
      .setInputFiles({
        name: "catalogo.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "tipo;nome;unidade;custo interno unitario;preco de venda unitario;periodicidade\r\nServiço;Impressão QA;Página;0,0345;0,0750;Por unidade\r\nProduto;Existente;Equipamento;100,00;200,00;Mensal\r\nProduto;Inválido;Unidade;erro;10,00;Por unidade\r\n",
        ),
      });
    assert.equal(
      await page
        .getByLabel("Coluna: Custo interno unitário", { exact: true })
        .inputValue(),
      "3",
    );
    assert.equal(
      await page
        .getByLabel("Coluna: Preço de venda unitário", { exact: true })
        .inputValue(),
      "4",
    );
    await page
      .getByRole("button", { name: "Conferir prévia", exact: true })
      .click();
    await page
      .getByText("Prévia — nada gravado ainda", { exact: true })
      .waitFor();
    assert.equal(previewBody.items[0].unitCost, 0.0345);
    assert.equal(previewBody.items[0].salePrice, 0.075);
    assert.equal(previewBody.items[0].priceBasis, "PER_UNIT");
    assert.equal(await dialog.getByRole("checkbox").count(), 3);
    assert.ok(
      await page
        .getByRole("button", {
          name: "Confirmar importação de 0 itens",
          exact: true,
        })
        .isDisabled(),
    );
    assert.ok(
      await dialog
        .getByRole("checkbox", { name: "Linha 2: Existente", exact: true })
        .isDisabled(),
    );
    assert.ok(
      await dialog
        .getByRole("checkbox", { name: "Linha 3: Item inválido", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Selecionar 1 itens válidos", exact: true })
      .click();
    const bounds=await dialog.boundingBox();
    assert.ok(bounds && bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<=844);
    await dialog.locator('.catalog-preview').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/catalog-import-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", {
        name: "Confirmar importação de 1 itens",
        exact: true,
      })
      .click();
    await page
      .getByText("Falha temporária na confirmação.", { exact: true })
      .waitFor();
    assert.ok(
      await dialog
        .getByRole("checkbox", { name: "Linha 1: Impressão QA", exact: true })
        .isChecked(),
    );
    failConfirm = false;
    await page
      .getByRole("button", {
        name: "Confirmar importação de 1 itens",
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(confirmBodies[0], confirmBodies[1]);
    assert.equal(catalog.length, 1);
    await page
      .getByRole("button", { name: "Editar Impressão QA", exact: true })
      .click();
    await page
      .getByText("Custos, preço de venda e unidade (opcional)", { exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Custo interno unitário", { exact: true })
        .inputValue(),
      "0.0345",
    );
    assert.equal(
      await page
        .getByLabel("Preço de venda unitário", { exact: true })
        .inputValue(),
      "0.075",
    );
    assert.equal(
      await page
        .getByLabel("Periodicidade dos valores", { exact: true })
        .inputValue(),
      "PER_UNIT",
    );
    await page.getByLabel("Custo interno unitário", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "Salvar item", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(catalog[0].unitCost, 0);
    assert.equal(catalog[0].salePrice, 0.075);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
