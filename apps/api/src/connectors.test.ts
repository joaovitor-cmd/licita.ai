import test from "node:test";
import assert from "node:assert/strict";
import type { CollectionCursor } from './connectors.js';
import {
  createConnectors,
  normalizeBrasiliaDate,
  normalizePncpOpportunity,
  normalizeComprasOpportunity,
  CollectionError,
  safeExternalUrl,
} from "./connectors.ts";

const control = "13031547000104-1-000062/2026";
const pncp = {
  numeroControlePNCP: control,
  objetoCompra: "Aquisição de computadores",
  valorTotalEstimado: 100_000,
  orgaoEntidade: {
    cnpj: "13031547000104",
    razaoSocial: "Órgão público",
    esferaId: "M",
  },
  unidadeOrgao: { ufSigla: "rs", municipioNome: "Porto Alegre" },
  dataEncerramentoProposta: "2026-09-15T09:00:00",
  situacaoCompraNome: "Divulgada no PNCP",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const fixedNow = () => new Date("2026-09-07T12:00:00Z");
test('coleta limitada retoma páginas pendentes sem reiniciar páginas concluídas',async()=>{
  let cursor:CollectionCursor|null=null;const pages:number[]=[];
  const api=createConnectors({now:fixedNow,retries:0,fetchImpl:async input=>{
    const url=new URL(String(input));if(url.pathname.endsWith('/atualizacao'))return new Response(null,{status:204});
    const page=Number(url.searchParams.get('pagina'));pages.push(page);return json({data:[pncp],totalPaginas:2});
  }});
  await assert.rejects(api.collectSource('pncp',{states:['RS'],maxPages:1,onCheckpoint:async c=>{cursor=c;}},async()=>{}),/Limite/);
  assert.ok(cursor);
  await api.collectSource('pncp',{states:['RS'],maxPages:10,cursor,onCheckpoint:async c=>{cursor=c;}},async()=>{});
  assert.deepEqual(pages,[1,2]);assert.equal(cursor,null);
});

test("normalizes public data without conflating unknown and zero budgets", () => {
  const normalized = normalizePncpOpportunity(pncp)!;
  assert.equal(normalized.canonicalKey, `pncp:${control}`);
  assert.equal(normalized.closesAt, "2026-09-15T12:00:00.000Z");
  assert.equal(normalized.state, "RS");
  assert.equal(normalized.sphere, "Municipal");
  assert.equal(normalized.status, "Divulgada no PNCP");
  assert.equal(
    normalizePncpOpportunity({ ...pncp, valorTotalEstimado: 0 })!.value,
    null,
  );
  assert.equal(
    normalizePncpOpportunity({ ...pncp, orcamentoSigilosoCodigo: 3 })!.value,
    null,
  );
  assert.equal(
    normalizePncpOpportunity({ ...pncp, valorTotalEstimado: null })!.value,
    null,
  );
  assert.equal(
    normalizePncpOpportunity({ ...pncp, numeroControlePNCP: "invalid" }),
    null,
  );
  assert.equal(
    normalizePncpOpportunity({ ...pncp, situacaoCompraNome: null })!.status,
    null,
  );
});

test("normalizes Brasília dates independent of host timezone and rejects unsafe URLs", () => {
  assert.equal(
    normalizeBrasiliaDate("2026-09-07 09:30:00"),
    "2026-09-07T12:30:00.000Z",
  );
  assert.equal(
    normalizeBrasiliaDate("2026-09-07T09:30:00Z"),
    "2026-09-07T09:30:00.000Z",
  );
  assert.equal(normalizeBrasiliaDate("2026-09-07"), "2026-09-07T03:00:00.000Z");
  assert.equal(normalizeBrasiliaDate("nonsense"), null);
  assert.equal(normalizeBrasiliaDate("2026-02-30T09:00:00"), null);
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("https://user:pass@example.com"), null);
});

test("Compras.gov shares PNCP identity but preserves original source ID", () => {
  const normalized = normalizeComprasOpportunity({
    numeroControlePNCP: control,
    idCompra: "123-5-2026",
    codigoModalidade: 5,
    modalidadeIdPncp: 6,
    modalidadeNome: "Pregão - Eletrônico",
    dataEncerramentoPropostaPncp: "2026-09-15 09:00:00",
    contratacaoExcluida: true,
  })!;
  assert.equal(
    normalized.canonicalKey,
    normalizePncpOpportunity(pncp)!.canonicalKey,
  );
  assert.equal(normalized.externalId, "123-5-2026");
  assert.equal(normalized.sourceCode, "comprasgov");
  assert.equal(normalized.status, "Excluída na fonte");
  assert.equal(normalized.value, null);
});

test("PNCP handles 204, paginates all partitions and deduplicates repeated records", async () => {
  const urls: URL[] = [],
    output: unknown[] = [];
  const api = createConnectors({
    now: fixedNow,
    retries: 0,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.endsWith("/atualizacao"))
        return new Response(null, { status: 204 });
      return json({
        data: [pncp],
        totalPaginas: 2,
        numeroPagina: Number(url.searchParams.get("pagina")),
      });
    },
  });
  const result = await api.collectSource(
    "pncp",
    { states: ["RS"], maxPages: 10 },
    async (items) => {
      output.push(...items);
    },
  );
  assert.equal(result.read, 2);
  assert.equal(result.pages, 7);
  assert.equal(output.length, 1);
  assert.equal(urls[0]!.searchParams.get("uf"), "RS");
  assert.ok(urls.some((url) => url.searchParams.get("pagina") === "2"));
});

test("truncation is explicit after preserving completed batches", async () => {
  let saved = 0;
  const api = createConnectors({
    now: fixedNow,
    retries: 0,
    fetchImpl: async () => json({ data: [pncp], totalPaginas: 5 }),
  });
  await assert.rejects(
    api.collectSource(
      "pncp",
      { states: ["RS"], maxPages: 1 },
      async (items) => {
        saved += items.length;
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof CollectionError);
      assert.equal(error.read, 1);
      assert.equal(error.pages, 1);
      assert.match(error.message, /Limite de 1 páginas/);
      return true;
    },
  );
  assert.equal(saved, 1);
});

test("retry is bounded and a failed partition never becomes success", async () => {
  let calls = 0;
  const api = createConnectors({
    now: fixedNow,
    retries: 1,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return json({}, 503);
    },
  });
  await assert.rejects(
    api.collectSource("comprasgov", { states: ["PA"] }, async () => {}),
    /Coleta incompleta/,
  );
  assert.equal(calls, 6);
});

test("Compras.gov uses its own modality codes and date format", async () => {
  const urls: URL[] = [];
  const api = createConnectors({
    now: fixedNow,
    retries: 0,
    fetchImpl: async (input) => {
      urls.push(new URL(String(input)));
      return json({ resultado: [], totalPaginas: 0, paginasRestantes: 0 });
    },
  });
  await api.collectSource(
    "comprasgov",
    { states: ["SC"], days: 7 },
    async () => {},
  );
  assert.deepEqual(
    urls.map((url) => url.searchParams.get("codigoModalidade")),
    ["5", "6", "3"],
  );
  assert.equal(
    urls[0]!.searchParams.get("dataPublicacaoPncpInicial"),
    "2026-09-01",
  );
  assert.equal(urls[0]!.searchParams.get("unidadeOrgaoUfSigla"), "SC");
});

test("refresh uses fixed official detail endpoint and loads safe active documents", async () => {
  const urls: URL[] = [];
  const api = createConnectors({
    retries: 0,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return url.pathname.endsWith("/arquivos")
        ? json([
            {
              titulo: "Edital.pdf",
              url: "https://pncp.gov.br/pncp-api/v1/arquivo/1",
              statusAtivo: true,
            },
            { titulo: "Inválido", url: "javascript:alert(1)" },
            {
              titulo: "Excluído",
              url: "https://pncp.gov.br/arquivo/2",
              statusAtivo: false,
            },
          ])
        : json(pncp);
    },
  });
  const refreshed = await api.refreshOpportunity({
    canonicalKey: `pncp:${control}`,
    sourceCode: "comprasgov",
    externalId: "original",
    url: "http://localhost/private",
  });
  assert.equal(refreshed!.documents.length, 1);
  assert.equal(refreshed!.sourceCode, "comprasgov");
  assert.equal(refreshed!.externalId, "original");
  assert.ok(urls.every((url) => url.hostname === "pncp.gov.br"));
  assert.match(
    urls[0]!.pathname,
    /\/orgaos\/13031547000104\/compras\/2026\/62$/,
  );
});

test("invalid sources, invalid UFs and malformed identities cannot request arbitrary hosts", async () => {
  let calls = 0;
  const api = createConnectors({
    fetchImpl: async () => {
      calls += 1;
      return json({});
    },
  });
  await assert.rejects(
    api.collectSource("https://example.com", { states: [] }, async () => {}),
    /não possui conector/,
  );
  await assert.rejects(
    api.collectSource("pncp", { states: ["XX"] }, async () => {}),
    /UFs/,
  );
  assert.equal(
    await api.refreshOpportunity({ canonicalKey: "pncp:http://localhost" }),
    null,
  );
  assert.equal(calls, 0);
});

test("external cancellation and request timeout both stop with honest partial errors", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const cancelled = createConnectors({
    fetchImpl: async () => {
      calls += 1;
      return json({});
    },
  });
  await assert.rejects(
    cancelled.collectSource(
      "pncp",
      { states: ["RS"], signal: controller.signal },
      async () => {},
    ),
    /cancelamento/,
  );
  assert.equal(calls, 0);
  const timed = createConnectors({
    retries: 0,
    requestTimeoutMs: 5,
    fetchImpl: async (_input, init) => {
      await new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("timeout")),
          { once: true },
        ),
      );
      return json({});
    },
  });
  await assert.rejects(
    timed.collectSource(
      "comprasgov",
      { states: ["RS"], maxPages: 1 },
      async () => {},
    ),
    /Coleta incompleta/,
  );
});

test("refresh paginates documents and reports inconsistent detail identities", async () => {
  let documentPages = 0;
  const api = createConnectors({
    retries: 0,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/arquivos")) return json(pncp);
      documentPages += 1;
      const page = Number(url.searchParams.get("pagina"));
      return json(
        Array.from({ length: page === 1 ? 50 : 1 }, (_, index) => ({
          titulo: `Documento ${page}-${index}`,
          url: `https://pncp.gov.br/arquivo/${page}-${index}`,
        })),
      );
    },
  });
  const value = await api.refreshOpportunity({
    canonicalKey: `pncp:${control}`,
  });
  assert.equal(value!.documents.length, 51);
  assert.equal(documentPages, 2);
  const wrong = createConnectors({
    retries: 0,
    fetchImpl: async () =>
      json({ ...pncp, numeroControlePNCP: "13031547000104-1-000999/2026" }),
  });
  await assert.rejects(
    wrong.refreshOpportunity({ canonicalKey: `pncp:${control}` }),
    /difere do edital/,
  );
});
