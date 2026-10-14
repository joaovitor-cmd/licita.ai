import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testProposals({ a, b, anon, db, sa, opportunityId }) {
  await anon("/proposals/" + randomUUID(), "GET", undefined, 401);
  const context = await a(`/opportunities/${opportunityId}/proposal-context`);
  const tracking=await a('/trackings','POST',{opportunityId},201);
  const saleCatalog = await a(
    "/catalog",
    "POST",
    {
      type: "SERVICE",
      name: "Preço de venda QA",
      description: "Serviço",
      unit: "Página",
      unitCost: 987.6543,
      salePrice: 0.075,
      priceBasis: "PER_UNIT",
    },
    201,
  );
  const options = await a("/proposals/catalog-options?q=Preço");
  assert.ok(options.items.some((i) => i.id === saleCatalog.id));
  assert.doesNotMatch(JSON.stringify(options), /unitCost|unit_cost|987\.6543/);
  const checkedAt = "2026-10-06T12:00:00Z",
    sourcePayload = {
      items: [
        {
          number: 1,
          description: "Impressão de documentos",
          quantity: 10,
          unit: "Página",
          confidential: true,
          estimatedUnit: 987,
          estimatedTotal: 9870,
        },
      ],
      hasMore: false,
    };
  await db.query(
    "INSERT INTO opportunity_item_pages(opportunity_id,page,payload,checked_at) VALUES($1,1,$2,$3)",
    [opportunityId, JSON.stringify(sourcePayload), checkedAt],
  );
  const item = {
    id: randomUUID(),
    number: "1",
    lot: "",
    description: "Impressão de documentos",
    unit: "Página",
    quantity: "10",
    unitPrice: null,
    brand: "Marca QA",
    model: "Modelo QA",
    solution: "",
    catalogId: null,
    catalogPriceApplied: false,
    sourceItem: { number: 1, page: 1, checkedAt },
  };
  const body = {
    name: "Cotação QA",
    state: "DRAFT",
    items: [item],
    conditions: { validity: "", payment: "", delivery: "", observations: "" },
    reviewChecks: {
      selectionAllowed: false,
      itemsChecked: false,
      conditionsChecked: false,
      zeroPriceAllowed: false,
    },
  };
  const request = {
    requestId: randomUUID(),
    opportunityId,
    companyId: context.company.id,
    companyRevision: context.company.revision,
    sourceFingerprint: context.sourceFingerprint,
    body,
  };
  const created = await Promise.all([
    a("/proposals", "POST", request, 201),
    a("/proposals", "POST", request, 201),
  ]);
  assert.equal(created[0].proposalId, created[1].proposalId);
  assert.equal(created[0].currentRevision, 1);
  const pid = created[0].proposalId,
    p = "/proposals/" + pid;
  assert.equal(created[0].version.totals.complete, false);
  assert.equal(created[0].version.totals.lines[0].total, null);
  assert.equal(created[0].version.sourceSnapshots[0].estimatedUnit, null);
  assert.equal(created[0].version.sourceSnapshots[0].estimatedTotal, null);
  assert.equal(
    (await a(`/opportunities/${opportunityId}/proposals`)).length,
    1,
  );
  await b(p, "GET", undefined, 404);
  await a(
    "/proposals",
    "POST",
    { ...request, body: { ...body, name: "Dados diferentes" } },
    409,
  );
  await a(
    "/proposals",
    "POST",
    { ...request, requestId: randomUUID(), companyId: randomUUID() },
    409,
  );
  await a(
    "/proposals",
    "POST",
    {
      ...request,
      requestId: randomUUID(),
      body: { ...body, items: [{ ...item, unitCost: 9 }] },
    },
    400,
  );
  await a(
    "/proposals",
    "POST",
    {
      ...request,
      requestId: randomUUID(),
      body: {
        ...body,
        items: [
          {
            ...item,
            sourceItem: {
              ...item.sourceItem,
              checkedAt: "2026-10-06T13:00:00Z",
            },
          },
        ],
      },
    },
    409,
  );
  assert.equal(
    (await a(`/opportunities/${opportunityId}/proposals`)).length,
    1,
    "Rejected creations roll back their parent row",
  );
  const updateBase = {
    companyId: context.company.id,
    companyRevision: context.company.revision,
    sourceFingerprint: context.sourceFingerprint,
    expectedRevision: 1,
  };
  await a(
    p,
    "PUT",
    {
      ...updateBase,
      requestId: randomUUID(),
      body: { ...body, state: "REVIEWED" },
    },
    400,
  );
  assert.equal((await a(p)).currentRevision, 1);
  const reviewedBody = {
    ...body,
    state: "REVIEWED",
    items: [
      {
        ...item,
        unitPrice: "0.0750",
        catalogId: saleCatalog.id,
        catalogPriceApplied: true,
      },
    ],
    conditions: {
      validity: "60 dias conforme conferência",
      payment: "Condições conferidas pela equipe",
      delivery: "Prazo conferido pela equipe",
      observations: "Somente observações comerciais",
    },
    reviewChecks: {
      selectionAllowed: true,
      itemsChecked: true,
      conditionsChecked: true,
      zeroPriceAllowed: false,
    },
  };
  const update = { ...updateBase, requestId: randomUUID(), body: reviewedBody };
  const updated = await Promise.all([a(p, "PUT", update), a(p, "PUT", update)]);
  assert.equal(updated[0].version.revision, 2);
  assert.equal(updated[1].version.revision, 2);
  assert.equal(updated[0].version.totals.total, "0.75");
  assert.equal(updated[0].version.body.items[0].unitPrice, "0.075");
  assert.equal(updated[0].version.catalogSnapshots[0].salePrice, "0.0750");
  assert.doesNotMatch(
    JSON.stringify(updated[0]),
    /unitCost|unit_cost|987\.6543/,
  );
  const original = await a(p + "?revision=1");
  assert.equal(original.version.body.state, "DRAFT");
  assert.equal(original.version.body.items[0].unitPrice, null);
  assert.equal(original.isCurrent, false);
  await a(p, "PUT", { ...update, requestId: randomUUID() }, 409);
  await a(
    p,
    "PUT",
    {
      ...update,
      body: { ...reviewedBody, name: "Alterado sem novo identificador" },
    },
    409,
  );
  await a(
    p,
    "PUT",
    {
      ...update,
      requestId: randomUUID(),
      expectedRevision: 2,
      body: {
        ...reviewedBody,
        items: [{ ...reviewedBody.items[0], unitPrice: "0.08" }],
      },
    },
    409,
  );
  await a(
    p,
    "PUT",
    {
      ...update,
      requestId: randomUUID(),
      expectedRevision: 2,
      body: {
        ...reviewedBody,
        items: [{ ...reviewedBody.items[0], unit: "Mês" }],
      },
    },
    409,
  );
  const otherContext = await b(
    `/opportunities/${opportunityId}/proposal-context`,
  );
  await b(
    "/proposals",
    "POST",
    {
      ...request,
      requestId: randomUUID(),
      companyId: otherContext.company.id,
      companyRevision: otherContext.company.revision,
      body: { ...body, items: [{ ...item, catalogId: saleCatalog.id }] },
    },
    404,
  );
  await db.query("UPDATE members SET role='MEMBER' WHERE user_id=$1", [
    sa.user.id,
  ]);
  const third = await a(p, "PUT", {
    ...updateBase,
    expectedRevision: 2,
    requestId: randomUUID(),
    body: {
      ...reviewedBody,
      state: "DRAFT",
      items: [{ ...item, unitPrice: "0", catalogPriceApplied: false }],
    },
  });
  assert.equal(third.currentRevision, 3);
  assert.equal(third.version.totals.total, "0.00");
  await a(
    p,
    "PUT",
    {
      ...updateBase,
      expectedRevision: 3,
      requestId: randomUUID(),
      body: { ...reviewedBody, items: [{ ...item, unitPrice: "0" }] },
    },
    400,
  );
  const concurrentEdits = await Promise.all(
    ["Versão concorrente A", "Versão concorrente B"].map((name) =>
      a(
        p,
        "PUT",
        {
          ...updateBase,
          expectedRevision: 3,
          requestId: randomUUID(),
          body: { ...body, name, items: [{ ...item, unitPrice: "1" }] },
        },
        [200, 409],
      ),
    ),
  );
  assert.equal(
    concurrentEdits.filter((x) => x.version?.revision === 4).length,
    1,
  );
  assert.equal(
    concurrentEdits.filter((x) => x.error?.includes("cotação mudou")).length,
    1,
  );
  await db.query("UPDATE members SET role='ADMIN' WHERE user_id=$1", [
    sa.user.id,
  ]);
  await a("/catalog/" + saleCatalog.id, "PATCH", {
    unitCost: 999,
    salePrice: 12,
  });
  const unchanged = await a(p + "?revision=2");
  assert.equal(unchanged.version.catalogSnapshots[0].salePrice, "0.0750");
  assert.equal(unchanged.version.body.items[0].unitPrice, "0.075");
  const oldCompanyName = unchanged.version.companySnapshot.details.legalName;
  await db.query(
    "UPDATE organizations SET company_details=jsonb_set(company_details,'{legalName}','\"Nome atualizado QA\"'),company_revision=company_revision+1 WHERE id=$1",
    [context.company.id],
  );
  const companyStale = await a(p);
  assert.equal(companyStale.stale, true);
  assert.ok(companyStale.staleReasons.some((s) => s.includes("empresa")));
  assert.equal(
    companyStale.version.companySnapshot.details.legalName,
    oldCompanyName,
  );
  const companyConflict = await a(
    p,
    "PUT",
    { ...updateBase, expectedRevision: 4, requestId: randomUUID(), body },
    409,
  );
  assert.match(companyConflict.error, /empresa mudaram/);
  const capturedTitle = companyStale.version.opportunitySnapshot.title;
  await db.query(
    "UPDATE opportunities SET title='Objeto atualizado',content_hash='proposal-source-updated' WHERE id=$1",
    [opportunityId],
  );
  assert.ok((await a(p)).staleReasons.some((s) => s.includes("edital")));
  assert.equal((await a(p)).version.opportunitySnapshot.title, capturedTitle);
  await db.query(
    "UPDATE opportunity_item_pages SET payload=$2,checked_at=now() WHERE opportunity_id=$1",
    [
      opportunityId,
      JSON.stringify({
        ...sourcePayload,
        items: [{ ...sourcePayload.items[0], quantity: 20 }],
      }),
    ],
  );
  const sourceStale = await a(p);
  assert.ok(sourceStale.staleReasons.some((s) => s.includes("itens")));
  assert.equal(sourceStale.version.sourceSnapshots[0].quantity, 10);
  assert.equal(sourceStale.versions.length, 4);
  const participation=await a('/trackings/'+tracking.id);assert.equal(participation.stage,'IDENTIFIED');assert.equal(participation.events.filter(e=>e.type==='PROPOSAL_VERSION_SAVED').length,4);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM audit_logs WHERE action='proposal.version.saved' AND target LIKE $1",
        [pid + ":%"],
      )
    ).rows[0].n,
    4,
  );
  await a(p + "?revision=100", "GET", undefined, 404);
  await a(p + "?revision=0", "GET", undefined, 400);
  // Updating company/source context does not authorize rebasing a stale version
  // or accepting an old official item-page reference.
  const refreshedContext=await a(`/opportunities/${opportunityId}/proposal-context`);
  const refreshedRequest={...updateBase,requestId:randomUUID(),companyRevision:refreshedContext.company.revision,sourceFingerprint:refreshedContext.sourceFingerprint,body,expectedRevision:3};
  await a(p,'PUT',refreshedRequest,409);
  const itemConflict=await a(p,'PUT',{...refreshedRequest,requestId:randomUUID(),expectedRevision:4},409);
  assert.match(itemConflict.error,/consulta de itens mudou/);
  assert.equal((await a(p)).currentRevision,4);
  assert.equal((await a(p+'?revision=1')).version.companySnapshot.details.legalName,oldCompanyName);
  console.log(
    "PASS: commercial proposal precision, immutable snapshots/versions, protected references, zero versus unknown, review checks, tenant isolation, idempotency, optimistic conflicts and stale source/company/item detection.",
  );
}
