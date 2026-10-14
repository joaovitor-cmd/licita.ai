import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {mkdir} from 'node:fs/promises';
import { commercialTotals } from "../apps/web/src/proposal-values.ts";
test("reference adoption is explicit, preserves commercial fields and never rebases a concurrent version", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [],
      requests = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    const company = {
        id: "org",
        name: "Empresa",
        cnpj: "11222333000181",
        revision: 1,
        details: { legalName: "Empresa original" },
      },
      context = {
        company,
        sourceFingerprint: "a".repeat(64),
        selectionNotice: "Confira o edital.",
      };
    let activeContext = context,
      failContext = false,
      currentRevision = 7;
    const line = {
      id: "line",
      number: "1",
      lot: "",
      description: "Impressão",
      unit: "Página",
      quantity: "10",
      unitPrice: "0.075",
      brand: "Marca",
      model: "Modelo",
      solution: "",
      catalogId: null,
      catalogPriceApplied: false,
      sourceItem: null,
    };
    const body = {
      name: "Cotação preservada",
      state: "DRAFT",
      items: [line],
      conditions: {
        validity: "30 dias",
        payment: "Conferido",
        delivery: "Conferido",
        observations: "Condição especial",
      },
      reviewChecks: {
        selectionAllowed: false,
        itemsChecked: false,
        conditionsChecked: false,
        zeroPriceAllowed: false,
      },
    };
    const opportunity = {
      id: "op",
      publicCode: "LC-123",
      title: "Impressão",
      agency: "Órgão",
      isDemo: true,
      documents: [],
      value: null,
      publishedAt: null,
      opensAt: null,
      closesAt: null,
      syncedAt: null,
      sourceCode: "pncp",
      sourceName: "PNCP",
      match: { score: 0, reasons: [], excluded: false },
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
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
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/opportunities/op") json = opportunity;
      if (path.endsWith("/proposal-context")) {
        if (failContext) {
          await route.fulfill({
            status: 503,
            json: { error: "Referências indisponíveis" },
          });
          return;
        }
        json = activeContext;
      }
      if (path.endsWith("/proposals"))
        json = [
          {
            id: "p",
            name: body.name,
            currentRevision: 7,
            state: "DRAFT",
            totals: { total: "0.75", complete: true },
          },
        ];
      if (path === "/api/proposals/p" && method === "GET")
        json = {
          id: "p",
          currentRevision,
          isCurrent: true,
          version: {
            revision: currentRevision,
            body,
            companySnapshot: company,
            totals: commercialTotals(body.items),
            createdAt: "2026-10-07T12:00:00Z",
            author: "QA",
          },
          versions: [
            {
              revision: currentRevision,
              state: "DRAFT",
              created_at: "2026-10-07T12:00:00Z",
            },
          ],
          versionsHasMore: false,
          stale: false,
          staleReasons: [],
        };
      if (path === "/api/proposals/p" && method === "PUT") {
        requests.push(route.request().postDataJSON());
        await route.fulfill({
          status: 409,
          json: { error: "A versão atual mudou" },
        });
        return;
      }
      await route.fulfill({ json });
    });
    await page.goto("http://localhost:5173/app/oportunidades/op?tab=propostas");
    await page
      .getByRole("button", { name: /Cotação preservada Versão 7/ })
      .click();
    await page
      .getByRole("button", { name: "Criar nova versão", exact: true })
      .click();
    const price = page.getByLabel("Preço unitário ofertado (R$)", {
      exact: true,
    });
    await price.fill("0,2");
    await page
      .getByLabel(
        "Conferi quantidades, unidades e especificações no original.",
        { exact: true },
      )
      .check();
    activeContext = {
      ...context,
      company: {
        ...company,
        revision: 2,
        details: { legalName: "Empresa revisada" },
      },
      sourceFingerprint: "b".repeat(64),
    };
    currentRevision = 8;
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
      }),
      adopt = review.getByRole("button", {
        name: "Usar referências conferidas",
        exact: true,
      });
    await review
      .getByText("Empresa revisada", { exact: false })
      .first()
      .waitFor();
    assert.equal(await adopt.isDisabled(), true);
    assert.equal(requests.length, 1);
    await review.getByText('Versão atual salva:',{exact:false}).waitFor();
    await mkdir('test-results',{recursive:true});await review.screenshot({path:'test-results/proposal-references-mobile.png'});
    assert.equal(
      await review
        .getByRole("link", {
          name: "Dados da empresa em outra aba",
          exact: true,
        })
        .getAttribute("target"),
      "_blank",
    );
    await review
      .getByLabel(
        "Conferi os dados da empresa e as alterações do edital para este rascunho",
        { exact: true },
      )
      .check();
    await adopt.click();
    assert.equal(await price.inputValue(), "0,2");
    assert.equal(
      await page
        .getByLabel("Validade da proposta", { exact: true })
        .inputValue(),
      "30 dias",
    );
    assert.equal(
      await page
        .getByLabel(
          "Conferi quantidades, unidades e especificações no original.",
          { exact: true },
        )
        .isChecked(),
      false,
    );
    assert.equal(requests.length, 1);
    await page
      .getByText("Esta edição partiu da versão 7.", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Conferir versão atual sem descartar rascunho",
        exact: true,
      })
      .waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].expectedRevision, 7);
    assert.equal(requests[1].companyRevision, 2);
    assert.equal(requests[1].sourceFingerprint, "b".repeat(64));
    assert.equal(requests[1].body.items[0].unitPrice, "0.2");
    assert.equal(requests[1].body.conditions.observations, "Condição especial");
    assert.notEqual(requests[0].requestId, requests[1].requestId);
    failContext = true;
    await page
      .getByRole("button", {
        name: "Conferir versão atual sem descartar rascunho",
        exact: true,
      })
      .click();
    await review
      .getByText("Referências indisponíveis", { exact: true })
      .waitFor();
    assert.equal(await adopt.isDisabled(), true);
    failContext = false;
    await review
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await review
      .getByText("Empresa revisada", { exact: false })
      .first()
      .waitFor();
    assert.equal(
      await review
        .getByLabel(
          "Conferi os dados da empresa e as alterações do edital para este rascunho",
          { exact: true },
        )
        .isChecked(),
      false,
    );
    await review
      .getByRole("button", { name: "Fechar conferência", exact: true })
      .click();
    activeContext = {
      ...activeContext,
      company: { ...activeContext.company, id: "foreign" },
    };
    await page
      .getByRole("button", {
        name: "Conferir versão atual sem descartar rascunho",
        exact: true,
      })
      .click();
    await review
      .getByText("A empresa consultada não é a mesma desta edição.", {
        exact: false,
      })
      .waitFor();
    assert.equal(await adopt.isDisabled(), true);
    assert.equal(await price.inputValue(), "0,2");
    assert.equal(requests.length, 2);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
