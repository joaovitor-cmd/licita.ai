import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

test("source differences and participation checklist are readable, editable and preserve failed drafts", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    const opportunity = {
      id: "op-check",
      title: "Serviços de impressão",
      description: "Objeto",
      agency: "Prefeitura QA",
      city: "Porto Alegre",
      state: "RS",
      sourceName: "PNCP",
      sourceCode: "pncp",
      modality: "Pregão eletrônico",
      value: 1000,
      status: "Aberta",
      closesAt: null,
      url: "https://pncp.gov.br",
      isDemo: false,
      match: { score: 80, reasons: [], excluded: false },
      documents: [],
    };
    const tracking = {
      id: "track-check",
      opportunityId: "op-check",
      opportunity,
      stage: "IN_ANALYSIS",
      ownerId: null,
      deadline: null,
      expectedValue: null,
      notes: "",
      outcomeReason: "",
      tasks: [],
      events: [],
    };
    let documents = [],
      reviewedAt = null, failReview = true,
      failAdd = true,
      failSave = true;
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
        json = {
          features: ["discovery", "radar", "documents", "changeAlerts"],
        };
      if (path === "/api/getting-started")
        json = { onboardingStatus: "DISMISSED" };
      if (path === "/api/opportunities/op-check") json = opportunity;
      if (path === "/api/trackings/track-check") json = tracking;
      if (path === "/api/documents")
        json = [{ id: "file-1", name: "Atestado técnico" }];
      if (path === "/api/opportunities/op-check/changes")
        json = {
          total: 1,
          pending: reviewedAt ? 0 : 1, canReview: true,
          page: 1,
          pages: 1,
          relations: [],
          labels: { DOCUMENTS: "Alteração na lista de anexos" },
          items: [
            {
              id: "change-1",
              reviewed_at: reviewedAt, reviewer: reviewedAt ? 'QA' : null,
              types: ["DOCUMENTS"],
              detected_at: "2026-10-06T12:00:00Z",
              summary:
                "Lista de documentos atualizada: 0 antes, 1 agora. Confira o histórico.",
              before_data: {
                documents: [],
                url: "https://old.invalid",
                debug: "segredo interno",
              },
              after_data: {
                documents: [
                  {
                    name: "Termo de referência.pdf",
                    url: "https://pncp.gov.br/" + "url-extensa".repeat(300),
                  },
                ],
                url: "https://pncp.gov.br",
                debug: "outro segredo",
              },
            },
          ],
        };
      if (path === '/api/opportunities/op-check/changes/change-1/review' && method === 'POST') {
        if (failReview) {await route.fulfill({status:503,json:{error:'Não foi possível registrar a conferência.'}});return;}
        reviewedAt='2026-10-06T13:00:00Z';json={reviewed_at:reviewedAt,reviewer:'QA'};
      }
      if (path === "/api/opportunities/op-check/preparation")
        json = {
          documents,
          trackingId: "track-check",
          tasks: [],
          summary: {
            pendingTopics: 8,
            pendingDocuments: documents.length,
            documentCount: documents.length,
            simulationCount: 0,
            pendingTasks: 0,
            incompleteAttachments: true,
            analysisStatus: null,
            stale: false,
            nextAction: "Leia os anexos",
          },
        };
      if (
        path === "/api/opportunities/op-check/preparation/documents" &&
        method === "POST"
      ) {
        if (failAdd) {
          await route.fulfill({
            status: 503,
            json: { error: "Falha ao adicionar exigência." },
          });
          return;
        }
        const body = route.request().postDataJSON();
        documents = [
          {
            id: "req-1",
            title: body.title,
            notes: "",
            document_id: null,
            effective_state: "MISSING",
            revision: 1,
            expires_at: null,
            reviewer_name: null,
            reviewed_at: null,
            source_evidence: null,
          },
        ];
        json = documents[0];
      }
      if (
        path === "/api/opportunities/op-check/preparation/documents/req-1" &&
        method === "PUT"
      ) {
        if (failSave) {
          await route.fulfill({
            status: 409,
            json: {
              error: "Esta exigência foi alterada. Recarregue antes de salvar.",
            },
          });
          return;
        }
        const body = route.request().postDataJSON();
        documents = [
          {
            ...documents[0],
            title: body.title,
            notes: body.notes,
            document_id: body.documentId,
            effective_state: body.state,
            revision: 2,
          },
        ];
        json = documents[0];
      }
      await route.fulfill({ json });
    });
    await page.goto(
      "http://localhost:5173/app/oportunidades/op-check?tab=mudancas",
    );
    await page
      .getByText(
        "Lista de documentos atualizada: 0 antes, 1 agora. Confira o histórico.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByText("Ver o que mudou: antes e depois", { exact: true })
      .click();
    const changes = page.locator(".source-change-panel");
    assert.match(await changes.innerText(), /Termo de referência\.pdf/);
    assert.doesNotMatch(
      await changes.innerText(),
      /https?:\/\/|url-extensa|debug|segredo/,
    );
    assert.equal(
      await changes
        .getByRole("link", { name: "Conferir publicação oficial", exact: true })
        .getAttribute("href"),
      "https://pncp.gov.br/",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    page.once('dialog',dialog=>dialog.dismiss());await changes.getByRole('button',{name:'Marcar alteração como conferida'}).click();assert.equal(reviewedAt,null);
    page.once('dialog',dialog=>dialog.accept());await changes.getByRole('button',{name:'Marcar alteração como conferida'}).click();await page.getByText('Não foi possível registrar a conferência.',{exact:true}).waitFor();assert.equal(reviewedAt,null);
    failReview=false;page.once('dialog',dialog=>dialog.accept());await changes.getByRole('button',{name:'Marcar alteração como conferida'}).click();await changes.getByText('Conferida pela equipe:',{exact:false}).waitFor();assert.equal(await changes.getByRole('button',{name:'Marcar alteração como conferida'}).count(),0);
    await page.reload();await changes.getByText('Conferida pela equipe:',{exact:false}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto("http://localhost:5173/app/radar/track-check");
    await page.getByRole("tab", { name: "Documentação", exact: true }).click();
    const checklist = page.getByRole("region", {
      name: "Checklist documental",
      exact: true,
    });
    await checklist.waitFor();
    assert.equal(
      await page.getByText("Preparação em andamento", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByText("Seu próximo passo, sem complicar", { exact: true })
        .count(),
      0,
    );
    const input = page.getByLabel("Exigência documental identificada", {
      exact: true,
    });
    await input.fill("Atestado de capacidade técnica");
    await page
      .getByRole("button", { name: "Adicionar exigência", exact: true })
      .click();
    await page
      .getByText("Falha ao adicionar exigência.", { exact: true })
      .waitFor();
    assert.equal(await input.inputValue(), "Atestado de capacidade técnica");
    failAdd = false;
    await page
      .getByRole("button", { name: "Adicionar exigência", exact: true })
      .click();
    await checklist
      .getByText("Atestado de capacidade técnica · Falta providenciar", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Arquivo: Atestado de capacidade técnica", { exact: true })
      .selectOption("file-1");
    const state = page.getByLabel("Estado: Atestado de capacidade técnica", {
      exact: true,
    });
    assert.equal(await state.inputValue(), "LINKED");
    await page
      .getByLabel("Observações: Atestado de capacidade técnica", {
        exact: true,
      })
      .fill("Conferir escopo e validade.");
    await checklist
      .getByRole("button", {
        name: "Salvar documento e conferência",
        exact: true,
      })
      .click();
    await page
      .getByText("Esta exigência foi alterada. Recarregue antes de salvar.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Observações: Atestado de capacidade técnica", {
          exact: true,
        })
        .inputValue(),
      "Conferir escopo e validade.",
    );
    failSave = false;
    await checklist
      .getByRole("button", {
        name: "Salvar documento e conferência",
        exact: true,
      })
      .click();
    await checklist
      .getByText(
        "Atestado de capacidade técnica · Documento vinculado, aguardando conferência",
        { exact: true },
      )
      .waitFor();
    assert.equal(documents[0].document_id, "file-1");
    assert.equal(documents[0].notes, "Conferir escopo e validade.");
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
