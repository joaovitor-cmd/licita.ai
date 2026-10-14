import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, rows, transaction, pool, type Database } from "./db.js";
import { current, HttpError, digest, type Auth } from "./security.js";
import { getOpportunity, addEvent } from "./data.js";
import { fingerprint } from "./analysis-rules.js";
import { companyDetailsSchema } from "./company-details.js";
import { normalize } from "./scoring.js";
import { entitlements } from "./entitlements.js";
import {
  opportunityIdentifiers,
  identifierMetadataSql,
} from "./opportunity-identifiers.js";
import {
  proposalBodySchema,
  proposalDecimal,
  proposalProblems,
  proposalTotals,
} from "./proposal-rules.js";

const requestSchema = z
  .object({
    requestId: z.uuid(),
    companyId: z.uuid(),
    companyRevision: z.number().int().positive(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    body: proposalBodySchema,
  })
  .strict();
const newSchema = requestSchema.extend({ opportunityId: z.uuid() });
const updateSchema = requestSchema.extend({
  expectedRevision: z.number().int().positive(),
});
type VersionRequest = z.infer<typeof requestSchema>;
const versionDto = (r: any) => ({
  revision: r.revision,
  body: r.body,
  companySnapshot: r.company_snapshot,
  sourceSnapshots: r.source_snapshots,
  catalogSnapshots: r.catalog_snapshots,
  opportunitySnapshot: r.opportunity_snapshot,
  sourceFingerprint: r.source_fingerprint,
  totals: r.totals,
  author: r.author ?? null,
  createdAt: r.created_at,
});
async function company(org: string, db: Database, lock = false) {
  const row = await one(
    `SELECT name,tax_id,company_details,company_revision FROM organizations WHERE id=$1 ${lock ? "FOR SHARE" : ""}`,
    [org],
    db,
  );
  return {
    id: org,
    name: row.name,
    cnpj: row.tax_id,
    revision: row.company_revision,
    details: companyDetailsSchema.parse(row.company_details),
  };
}
async function snapshots(
  db: Database,
  auth: Auth,
  oid: string,
  input: VersionRequest,
) {
  if (input.companyId !== auth.organization.id)
    throw new HttpError(
      409,
      "A empresa em uso mudou. Reabra a cotação antes de salvar.",
    );
  const supplier = await company(auth.organization.id, db, true);
  if (input.companyRevision !== supplier.revision)
    throw new HttpError(
      409,
      "Os dados da empresa mudaram. Atualize o contexto antes de salvar.",
    );
  const source = await one(
    `SELECT o.id,o.content_hash,o.documents,o.demo_org_id,o.title,o.agency,o.city,o.state,o.modality,o.canonical_key,o.public_code,o.source_code,o.source_name,o.published_at,o.opens_at,o.closes_at,o.value,o.url,${identifierMetadataSql} identifier_metadata FROM opportunities o WHERE o.id=$1 FOR SHARE OF o`,
    [oid],
    db,
  );
  if (fingerprint(source) !== input.sourceFingerprint)
    throw new HttpError(
      409,
      "O edital mudou durante a edição. Confira as alterações e atualize o contexto antes de salvar.",
    );
  const catalogIds = [
    ...new Set(
      input.body.items.flatMap((i) => (i.catalogId ? [i.catalogId] : [])),
    ),
  ];
  if (
    catalogIds.length &&
    !(await entitlements(auth.organization.id, db)).features.includes("catalog")
  )
    throw new HttpError(
      403,
      "O catálogo não está disponível no plano atual. Salve a cotação sem esse vínculo.",
    );
  // Deliberately omit unit_cost, margins and internal notes from commercial data.
  const catalog = catalogIds.length
    ? await rows(
        "SELECT id,name,unit,sale_price,price_basis,active FROM catalog WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR SHARE",
        [auth.organization.id, catalogIds],
        db,
      )
    : [];
  if (catalog.length !== catalogIds.length)
    throw new HttpError(
      404,
      "Item de catálogo indisponível para esta empresa.",
    );
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  for (const item of input.body.items) {
    if (!item.catalogId) continue;
    const c = catalogById.get(item.catalogId)!;
    if (!c.active)
      throw new HttpError(
        409,
        "Há item de catálogo inativo. Remova o vínculo ou reative o item antes de salvar.",
      );
    if (item.catalogPriceApplied) {
      const sale = proposalDecimal.safeParse(c.sale_price);
      if (
        c.price_basis !== "PER_UNIT" ||
        !c.unit ||
        normalize(c.unit) !== normalize(item.unit) ||
        !sale.success ||
        sale.data !== item.unitPrice
      )
        throw new HttpError(
          409,
          "Preço, unidade ou periodicidade do catálogo mudou ou não é compatível. Confira antes de aplicar o preço de venda.",
        );
    }
  }
  const pageNumbers = [
    ...new Set(
      input.body.items.flatMap((i) =>
        i.sourceItem ? [i.sourceItem.page] : [],
      ),
    ),
  ];
  if (source.demo_org_id && pageNumbers.length)
    throw new HttpError(
      400,
      "Demonstração permite cotação manual, sem atribuir itens fictícios ao PNCP.",
    );
  const pages = pageNumbers.length
    ? await rows(
        "SELECT page,payload,checked_at FROM opportunity_item_pages WHERE opportunity_id=$1 AND page=ANY($2::int[]) FOR SHARE",
        [oid, pageNumbers],
        db,
      )
    : [];
  const pagesByNumber = new Map(
    pages.map((p) => [
      p.page,
      {
        ...p,
        hash: digest(JSON.stringify(p.payload)),
        items: new Map(
          (p.payload.items ?? []).map((item: any) => [item.number, item]),
        ),
      },
    ]),
  );
  const sourceSnapshots = input.body.items.flatMap((i) => {
    if (!i.sourceItem) return [];
    const ref = i.sourceItem,
      page = pagesByNumber.get(ref.page),
      original: any = page?.items.get(ref.number);
    if (
      !page ||
      !original ||
      new Date(page.checked_at).getTime() !== Date.parse(ref.checkedAt)
    )
      throw new HttpError(
        409,
        "A consulta de itens mudou ou não está disponível. Atualize a página de origem antes de salvar.",
      );
    return [
      {
        lineId: i.id,
        number: original.number,
        page: ref.page,
        checkedAt: page.checked_at,
        pageHash: page.hash,
        description: String(original.description).slice(0, 5000),
        descriptionTruncated: String(original.description).length > 5000,
        quantity: original.quantity ?? null,
        unit: original.unit ?? null,
        confidential: original.confidential === true,
        estimatedUnit: original.confidential
          ? null
          : (original.estimatedUnit ?? null),
        estimatedTotal: original.confidential
          ? null
          : (original.estimatedTotal ?? null),
        source: "PNCP",
      },
    ];
  });
  const problems = proposalProblems(input.body);
  if (input.body.state === "REVIEWED") {
    if (!supplier.cnpj || !supplier.details.legalName)
      problems.push("Complete CNPJ e razão social da empresa proponente.");
    if (problems.length)
      throw new HttpError(
        400,
        `A cotação ainda precisa de conferência: ${problems.slice(0, 8).join(" ")}`,
      );
  }
  return {
    supplier,
    sourceSnapshots,
    opportunitySnapshot: {
      id: oid,
      ...opportunityIdentifiers(source),
      canonicalKey: source.canonical_key,
      title: source.title,
      agency: source.agency,
      city: source.city,
      state: source.state,
      modality: source.modality,
      sourceCode: source.source_code,
      sourceName: source.source_name,
      publishedAt: source.published_at,
      opensAt: source.opens_at,
      closesAt: source.closes_at,
      estimatedValue: source.value,
      url: source.url,
    },
    catalogSnapshots: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      unit: c.unit,
      salePrice: c.sale_price,
      priceBasis: c.price_basis,
    })),
    totals: proposalTotals(input.body.items),
  };
}
async function saveVersion(
  db: Database,
  auth: Auth,
  proposal: any,
  input: VersionRequest,
  inputHash: string,
) {
  const snapshot = await snapshots(db, auth, proposal.opportunity_id, input),
    revision = proposal.current_revision + 1;
  const version = await one(
    `INSERT INTO commercial_proposal_versions(proposal_id,revision,request_id,input_hash,body,company_snapshot,source_snapshots,source_fingerprint,totals,actor_id,catalog_snapshots,opportunity_snapshot)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      proposal.id,
      revision,
      input.requestId,
      inputHash,
      JSON.stringify(input.body),
      JSON.stringify(snapshot.supplier),
      JSON.stringify(snapshot.sourceSnapshots),
      input.sourceFingerprint,
      JSON.stringify(snapshot.totals),
      auth.user.id,
      JSON.stringify(snapshot.catalogSnapshots),
      JSON.stringify(snapshot.opportunitySnapshot),
    ],
    db,
  );
  await db.query(
    "UPDATE commercial_proposals SET name=$2,current_revision=$3,updated_at=now() WHERE id=$1",
    [proposal.id, input.body.name, revision],
  );
  await db.query(
    "INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)",
    [
      auth.organization.id,
      auth.user.id,
      "proposal.version.saved",
      proposal.id + ":" + revision,
    ],
  );
  const tracking = await one(
    "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
    [auth.organization.id, proposal.opportunity_id],
    db,
  );
  if (tracking)
    await addEvent(
      tracking.id,
      "PROPOSAL_VERSION_SAVED",
      "Versão da cotação salva",
      `Versão ${revision}: ${input.body.state === "REVIEWED" ? "revisada internamente" : "rascunho"}. Nenhuma proposta foi enviada ao portal oficial.`,
      auth.user.id,
      db,
    );
  return {
    proposalId: proposal.id,
    currentRevision: revision,
    version: versionDto({ ...version, author: auth.user.name }),
  };
}
async function ownedProposal(
  auth: Auth,
  id: string,
  db: Database,
  lock = false,
) {
  const proposal = await one(
    `SELECT * FROM commercial_proposals WHERE id=$1 AND organization_id=$2 ${lock ? "FOR UPDATE" : ""}`,
    [id, auth.organization.id],
    db,
  );
  if (!proposal) throw new HttpError(404, "Cotação não encontrada.");
  await getOpportunity(auth, proposal.opportunity_id, db);
  return proposal;
}
export function proposalRoutes(router: Router) {
  router.get("/proposals/catalog-options", async (req, res) => {
    const auth = current(req),
      query = z
        .object({
          q: z.string().trim().max(100).default(""),
          page: z.coerce.number().int().min(1).max(1000).default(1),
        })
        .strict()
        .parse(req.query);
    if (
      !(await entitlements(auth.organization.id)).features.includes("catalog")
    )
      throw new HttpError(
        403,
        "O catálogo não está disponível no plano atual.",
      );
    const values = await rows(
      `SELECT id,name,unit,sale_price,price_basis FROM catalog WHERE organization_id=$1 AND active AND name ILIKE $2 ORDER BY name,id LIMIT 26 OFFSET $3`,
      [
        auth.organization.id,
        "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%",
        (query.page - 1) * 25,
      ],
    );
    res.json({
      items: values.slice(0, 25).map((c) => ({
        id: c.id,
        name: c.name,
        unit: c.unit,
        salePrice: c.sale_price,
        priceBasis: c.price_basis,
      })),
      page: query.page,
      hasMore: values.length > 25,
    });
  });
  router.get("/opportunities/:id/proposal-context", async (req, res) => {
    const oid = z.uuid().parse(req.params.id),
      auth = current(req);
    await getOpportunity(auth, oid);
    const [supplier, source] = await Promise.all([
      company(auth.organization.id, pool),
      one("SELECT content_hash,documents FROM opportunities WHERE id=$1", [
        oid,
      ]),
    ]);
    res.json({
      company: supplier,
      sourceFingerprint: fingerprint(source),
      selectionNotice:
        "O agrupamento de lotes ainda não foi confirmado automaticamente. Confira a seleção no edital.",
    });
  });
  router.get("/opportunities/:id/proposals", async (req, res) => {
    const oid = z.uuid().parse(req.params.id),
      auth = current(req);
    await getOpportunity(auth, oid);
    const list = await rows(
      `SELECT p.id,p.name,p.current_revision,v.body->>'state' state,jsonb_build_object('total',v.totals->'total','complete',v.totals->'complete') totals,p.created_at,p.updated_at FROM commercial_proposals p JOIN commercial_proposal_versions v ON v.proposal_id=p.id AND v.revision=p.current_revision WHERE p.organization_id=$1 AND p.opportunity_id=$2 ORDER BY p.updated_at DESC,p.id LIMIT 50`,
      [auth.organization.id, oid],
    );
    res.json(
      list.map((p) => ({
        id: p.id,
        name: p.name,
        currentRevision: p.current_revision,
        state: p.state,
        totals: p.totals,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    );
  });
  router.post("/proposals", async (req, res) => {
    const input = newSchema.parse(req.body),
      auth = current(req),
      hash = digest(JSON.stringify(input));
    await getOpportunity(auth, input.opportunityId);
    const result = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `proposal-create:${auth.organization.id}`,
      ]);
      const old = await one(
        "SELECT * FROM commercial_proposals WHERE organization_id=$1 AND create_request_id=$2",
        [auth.organization.id, input.requestId],
        db,
      );
      if (old) {
        if (old.create_input_hash !== hash)
          throw new HttpError(
            409,
            "Esta solicitação já foi usada com outros dados.",
          );
        const version = await one(
          "SELECT v.*,u.name author FROM commercial_proposal_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE proposal_id=$1 AND revision=1",
          [old.id],
          db,
        );
        return {
          proposalId: old.id,
          currentRevision: old.current_revision,
          version: versionDto(version),
        };
      }
      if (
        (await one(
          "SELECT count(*)::int n FROM commercial_proposals WHERE organization_id=$1 AND opportunity_id=$2",
          [auth.organization.id, input.opportunityId],
          db,
        ))!.n >= 50
      )
        throw new HttpError(
          409,
          "Limite técnico de 50 cotações por oportunidade atingido. Crie novas versões das existentes.",
        );
      const proposal = await one(
        "INSERT INTO commercial_proposals(id,organization_id,opportunity_id,name,create_request_id,create_input_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          auth.organization.id,
          input.opportunityId,
          input.body.name,
          input.requestId,
          hash,
        ],
        db,
      );
      return saveVersion(db, auth, proposal, input, hash);
    });
    res.status(201).json(result);
  });
  router.put("/proposals/:id", async (req, res) => {
    const pid = z.uuid().parse(req.params.id),
      input = updateSchema.parse(req.body),
      auth = current(req),
      hash = digest(JSON.stringify(input));
    const result = await transaction(async (db) => {
      const proposal = await ownedProposal(auth, pid, db, true),
        old = await one(
          "SELECT v.*,u.name author FROM commercial_proposal_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE proposal_id=$1 AND request_id=$2",
          [pid, input.requestId],
          db,
        );
      if (old) {
        if (old.input_hash !== hash)
          throw new HttpError(
            409,
            "Esta solicitação já foi usada com outros dados.",
          );
        return {
          proposalId: pid,
          currentRevision: proposal.current_revision,
          version: versionDto(old),
        };
      }
      if (proposal.current_revision !== input.expectedRevision)
        throw new HttpError(
          409,
          "A cotação mudou. Recarregue a versão atual antes de salvar. Seu rascunho não foi aplicado.",
        );
      return saveVersion(db, auth, proposal, input, hash);
    });
    res.json(result);
  });
  router.get("/proposals/:id", async (req, res) => {
    const pid = z.uuid().parse(req.params.id),
      auth = current(req),
      query = z
        .object({
          revision: z.coerce.number().int().positive().max(1000000).optional(),
        })
        .strict()
        .parse(req.query);
    const db = pool,
      proposal = await ownedProposal(auth, pid, db),
      selected = query.revision ?? proposal.current_revision;
    const version = await one(
      "SELECT v.*,u.name author FROM commercial_proposal_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE proposal_id=$1 AND revision=$2",
      [pid, selected],
      db,
    );
    if (!version) throw new HttpError(404, "Versão não encontrada.");
    const [versions, supplier, source, pages] = await Promise.all([
      rows(
        "SELECT revision,body->>'state' state,created_at FROM commercial_proposal_versions WHERE proposal_id=$1 ORDER BY revision DESC LIMIT 51",
        [pid],
      ),
      company(auth.organization.id, db),
      one("SELECT content_hash,documents FROM opportunities WHERE id=$1", [
        proposal.opportunity_id,
      ]),
      rows(
        "SELECT page,payload FROM opportunity_item_pages WHERE opportunity_id=$1 AND page=ANY($2::int[])",
        [
          proposal.opportunity_id,
          [...new Set(version.source_snapshots.map((s: any) => s.page))],
        ],
      ),
    ]);
    const pageHashes = new Map(
      pages.map((p) => [p.page, digest(JSON.stringify(p.payload))]),
    );
    const staleReasons = [];
    if (fingerprint(source) !== version.source_fingerprint)
      staleReasons.push("O edital foi alterado após esta versão.");
    if (supplier.revision !== version.company_snapshot.revision)
      staleReasons.push("O cadastro da empresa foi alterado após esta versão.");
    if (
      version.source_snapshots.some((s: any) => {
        return pageHashes.get(s.page) !== s.pageHash;
      })
    )
      staleReasons.push("A consulta de itens foi atualizada após esta versão.");
    res.json({
      id: pid,
      opportunityId: proposal.opportunity_id,
      currentRevision: proposal.current_revision,
      isCurrent: selected === proposal.current_revision,
      version: versionDto(version),
      versions: versions.slice(0, 50),
      versionsHasMore: versions.length > 50,
      stale: staleReasons.length > 0,
      staleReasons,
      problems: proposalProblems(version.body),
    });
  });
}
