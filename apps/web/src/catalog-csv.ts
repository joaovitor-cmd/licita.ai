export type CatalogColumn =
  | "type"
  | "name"
  | "description"
  | "category"
  | "keywords"
  | "unit"
  | "unitCost"
  | "salePrice"
  | "priceBasis";
export const catalogColumns: Record<CatalogColumn, string> = {
  type: "Tipo",
  name: "Nome",
  description: "Descrição",
  category: "Categoria",
  keywords: "Palavras-chave",
  unit: "Unidade",
  unitCost: "Custo interno unitário",
  salePrice: "Preço de venda unitário",
  priceBasis: "Periodicidade dos valores",
};
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
export function readCatalogCsv(text: string, separator: string) {
  if (text.length > 1_000_000)
    throw new Error("O CSV deve ter no máximo 1 MB de texto.");
  if (text.includes("\uFFFD"))
    throw new Error(
      "O arquivo contém caracteres que não puderam ser lidos. Exporte o CSV em UTF-8.",
    );
  if (![",", ";", "\t"].includes(separator))
    throw new Error("Separador inválido.");
  const rows: string[][] = [],
    row: string[] = [];
  let cell = "",
    quoted = false,
    closed = false;
  const addCell = () => {
    if (cell.length > 5000)
      throw new Error("Uma célula excede 5.000 caracteres.");
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 30) throw new Error("Limite de 30 colunas por arquivo.");
  };
  const addRow = () => {
    addCell();
    if (row.some((c) => c.trim())) rows.push([...row]);
    row.length = 0;
    if (rows.length > 201)
      throw new Error("Importe até 200 itens por arquivo.");
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === separator) {
      addCell();
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      addRow();
      continue;
    }
    if (closed) {
      if (!/\s/.test(c))
        throw new Error("Caractere inesperado após uma célula entre aspas.");
      continue;
    }
    if (c === '"') {
      if (cell) throw new Error("Aspas devem começar no início da célula.");
      quoted = true;
    } else cell += c;
  }
  if (quoted) throw new Error("Há uma célula com aspas não fechadas.");
  if (cell || row.length || closed) addRow();
  if (rows.length < 2)
    throw new Error("Inclua cabeçalho e pelo menos um item.");
  const headers = rows.shift()!;
  if (rows.some((r) => r.length !== headers.length))
    throw new Error(
      "As linhas precisam ter a mesma quantidade de colunas do cabeçalho. Confira o separador e as aspas.",
    );
  return { headers, rows };
}
export function suggestCatalogMapping(headers: string[]) {
  const aliases: Record<CatalogColumn, string[]> = {
    type: ["tipo", "type"],
    name: ["nome", "name", "produto", "servico", "item"],
    description: ["descricao", "description"],
    category: ["categoria", "category"],
    keywords: ["palavras chave", "palavras-chave", "keywords"],
    unit: ["unidade", "unit"],
    unitCost: [
      "custo",
      "custo interno",
      "custo unitario",
      "custo interno unitario",
      "unitcost",
    ],
    salePrice: [
      "preco de venda",
      "preco venda",
      "preco de venda unitario",
      "saleprice",
    ],
    priceBasis: ["periodicidade", "periodicidade dos valores", "pricebasis"],
  };
  return Object.fromEntries(
    Object.keys(aliases).map((key) => [
      key,
      headers.findIndex((h) => aliases[key as CatalogColumn].includes(fold(h))),
    ]),
  ) as Record<CatalogColumn, number>;
}
export function catalogDecimal(value: string, decimal: "," | ".") {
  value = value.trim().replace(/^R\$\s*/, "");
  if (!value) return null;
  const pattern =
    decimal === ","
      ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/
      : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/;
  if (!pattern.test(value)) return value; // Preserve invalid data for row-level validation, never convert it to zero.
  return Number(
    decimal === ","
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, ""),
  );
}
export function mappedCatalogRows(
  rows: string[][],
  mapping: Record<CatalogColumn, number>,
  decimal: "," | ".",
) {
  return rows.map((row) => {
    const cell = (key: CatalogColumn) =>
      mapping[key] >= 0 ? row[mapping[key]].trim() : "";
    const rawType = fold(cell("type")),
      basis = fold(cell("priceBasis"));
    const type =
      rawType === "" || ["produto", "product"].includes(rawType)
        ? "PRODUCT"
        : ["servico", "service"].includes(rawType)
          ? "SERVICE"
          : cell("type");
    const basisCodes: Record<string, string> = {
      "por unidade": "PER_UNIT",
      per_unit: "PER_UNIT",
      unico: "ONE_TIME",
      one_time: "ONE_TIME",
      mensal: "MONTHLY",
      monthly: "MONTHLY",
      anual: "YEARLY",
      yearly: "YEARLY",
    };
    return {
      type,
      name: cell("name"),
      description: cell("description"),
      category: cell("category"),
      keywords: cell("keywords")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      active: true,
      unit: cell("unit") || null,
      unitCost: catalogDecimal(cell("unitCost"), decimal),
      salePrice: catalogDecimal(cell("salePrice"), decimal),
      priceBasis: basis ? basisCodes[basis] || cell("priceBasis") : null,
    };
  });
}
