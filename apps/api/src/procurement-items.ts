import { z } from "zod";

export const itemPage = z.coerce.number().int().min(1).max(400).default(1);
const numeric = z.number().finite().nonnegative().nullable().optional();
const sourceItem = z.object({
  numeroItem: z.number().int().positive(),
  descricao: z.string().max(100000),
  quantidade: numeric,
  unidadeMedida: z.string().max(1000).nullable().optional(),
  valorUnitarioEstimado: numeric,
  valorTotal: numeric,
  orcamentoSigiloso: z.boolean(),
  temResultado: z.boolean().optional(),
  situacaoCompraItemNome: z.string().max(1000).nullable().optional(),
});
export function normalizeItems(input: unknown) {
  const parsed = z.array(sourceItem).max(25).parse(input);
  if (new Set(parsed.map((x) => x.numeroItem)).size !== parsed.length)
    throw new Error("Itens duplicados na fonte.");
  return parsed.map((x) => ({
    number: x.numeroItem,
    description: x.descricao,
    quantity: x.quantidade ?? null,
    unit: x.unidadeMedida ?? null,
    confidential: x.orcamentoSigiloso,
    // Confidential zero is not a zero-price benchmark. Do not infer disclosure from result presence.
    estimatedUnit: x.orcamentoSigiloso
      ? null
      : (x.valorUnitarioEstimado ?? null),
    estimatedTotal: x.orcamentoSigiloso ? null : (x.valorTotal ?? null),
    hasResult: x.temResultado === true,
    status: x.situacaoCompraItemNome ?? null,
  }));
}
export function itemsUrl(canonical: string, page: number) {
  const match = /^pncp:(\d{14})-1-(\d{1,8})\/(\d{4})$/.exec(canonical);
  if (!match || Number(match[2]) < 1) return null;
  return `https://pncp.gov.br/api/pncp/v1/orgaos/${match[1]}/compras/${Number(match[3])}/${Number(match[2])}/itens?pagina=${itemPage.parse(page)}&tamanhoPagina=25`;
}
export async function fetchItems(
  canonical: string,
  page: number,
  fetcher: typeof fetch = fetch,
) {
  const url = itemsUrl(canonical, page);
  if (!url) throw new Error("Identificador PNCP inválido.");
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(15000),
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (response.status === 204)
    return { items: [], hasMore: false, sourceUrl: url };
  if (!response.ok || !response.body) throw new Error("Fonte indisponível.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("Resposta excede o limite.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const items = normalizeItems(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  return { items, hasMore: items.length === 25 && page < 400, sourceUrl: url };
}
