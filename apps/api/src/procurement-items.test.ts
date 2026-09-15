import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchItems,
  itemPage,
  itemsUrl,
  normalizeItems,
} from "./procurement-items.js";
const canonical = "pncp:09203665000177-1-000031/2026";
const item = {
  numeroItem: 1,
  descricao: "Impressão monocromática",
  quantidade: 10000,
  unidadeMedida: "Página",
  valorUnitarioEstimado: 0.0345,
  valorTotal: 345,
  orcamentoSigiloso: false,
};
test("itens: precisão, ausência e sigilo não viram preço zero", () => {
  assert.equal(normalizeItems([item])[0].estimatedUnit, 0.0345);
  assert.equal(
    normalizeItems([{ ...item, valorUnitarioEstimado: 0 }])[0].estimatedUnit,
    0,
  );
  assert.equal(
    normalizeItems([
      { ...item, orcamentoSigiloso: true, temResultado: true },
    ])[0].estimatedUnit,
    null,
  );
  assert.equal(
    normalizeItems([
      { numeroItem: 1, descricao: "Sem orçamento", orcamentoSigiloso: false },
    ])[0].estimatedTotal,
    null,
  );
});
test("itens: rejeita duplicados, negativos e formatos não documentados", () => {
  assert.throws(() => normalizeItems([item, item]));
  assert.throws(() => normalizeItems([{ ...item, quantidade: -1 }]));
  assert.throws(() => normalizeItems({ items: [item] }));
  assert.throws(() =>
    normalizeItems([{ ...item, orcamentoSigiloso: undefined }]),
  );
});
test("itens: URL fixa e paginação limitada", () => {
  assert.equal(
    itemsUrl(canonical, 2),
    "https://pncp.gov.br/api/pncp/v1/orgaos/09203665000177/compras/2026/31/itens?pagina=2&tamanhoPagina=25",
  );
  assert.equal(itemsUrl("https://localhost/private", 1), null);
  assert.equal(itemsUrl(canonical + "?url=x", 1), null);
  for (const n of [0, -1, 401, 1.5])
    assert.equal(itemPage.safeParse(n).success, false);
});
test("itens: leitura limitada, paginação e ausência explícita", async () => {
  const mock = (body: string, status = 200) =>
    (async (_url: any, options: any) => {
      assert.equal(options.redirect, "error");
      assert.ok(options.signal);
      return new Response(status === 204 ? null : body, { status });
    }) as typeof fetch;
  const data = await fetchItems(
    canonical,
    1,
    mock(
      JSON.stringify(
        Array.from({ length: 25 }, (_, i) => ({ ...item, numeroItem: i + 1 })),
      ),
    ),
  );
  assert.equal(data.items.length, 25);
  assert.equal(data.hasMore, true);
  assert.equal((await fetchItems(canonical, 1, mock("", 204))).hasMore, false);
  await assert.rejects(() =>
    fetchItems(canonical, 1, mock("x".repeat(2_000_001))),
  );
  await assert.rejects(() => fetchItems(canonical, 1, mock("", 500)));
  await assert.rejects(() =>
    fetchItems(canonical, 1, mock("<html>Falha</html>")),
  );
});
