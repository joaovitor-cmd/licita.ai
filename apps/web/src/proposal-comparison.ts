import { decimalInput, decimalDisplay } from "./proposal-values";
type CommercialLine = {
  id: string;
  number: string;
  lot: string;
  description: string;
  unit: string;
  quantity: string | null;
  unitPrice: string | null;
  brand: string;
  model: string;
  solution: string;
  catalogId: string | null;
  catalogPriceApplied: boolean;
};
export type CommercialDraft = {
  name: string;
  items: CommercialLine[];
  conditions: {
    validity: string;
    payment: string;
    delivery: string;
    observations: string;
  };
};
export type CommercialDifference = {
  label: string;
  mine: string;
  current: string;
};
const lineFields = {
  number: "Número",
  lot: "Lote",
  description: "Descrição comercial",
  unit: "Unidade",
  quantity: "Quantidade",
  unitPrice: "Preço unitário ofertado",
  brand: "Marca",
  model: "Modelo",
  solution: "Solução ofertada",
  catalogPriceApplied: "Origem do preço",
} as const;
const conditionFields = {
  validity: "Validade",
  payment: "Pagamento",
  delivery: "Entrega / execução",
  observations: "Observações comerciais",
} as const;
const text = (value: unknown) => String(value ?? "").trim();
function decimalText(value: string | null) {
  try {
    return decimalDisplay(decimalInput(value ?? ""));
  } catch {
    return value;
  }
}
function lineValue(line: CommercialLine, key: keyof typeof lineFields) {
  if (key === "quantity" || key === "unitPrice") {
    try {
      const value = decimalInput(line[key] ?? "");
      return value === null ? null : decimalDisplay(value);
    } catch {
      return line[key];
    }
  }
  if (key === "catalogPriceApplied")
    return line.catalogPriceApplied
      ? "Preço de venda aplicado"
      : "Preço manual";
  return text(line[key]);
}
const display = (value: string | null) =>
  value === null || value === "" ? "Não informado" : value;
const summary = (line: CommercialLine) =>
  `${line.description || "Descrição pendente"} · ${decimalText(line.quantity) || "Quantidade pendente"} ${line.unit} · Preço ofertado: ${decimalText(line.unitPrice) || "Não informado"}`;
/** Whitelist commercial fields only; never serialize internal costs or arbitrary objects. */
export function compareCommercialDrafts(
  mine: CommercialDraft,
  current: CommercialDraft,
): CommercialDifference[] {
  const changes: CommercialDifference[] = [];
  const add = (label: string, a: string | null, b: string | null) => {
    if (a !== b) changes.push({ label, mine: display(a), current: display(b) });
  };
  add("Nome da cotação", text(mine.name), text(current.name));
  for (const key of Object.keys(
    conditionFields,
  ) as (keyof typeof conditionFields)[])
    add(
      conditionFields[key],
      text(mine.conditions[key]),
      text(current.conditions[key]),
    );
  const oldLines = new Map(mine.items.map((line) => [line.id, line])),
    newLines = new Map(current.items.map((line) => [line.id, line]));
  for (const [index, line] of mine.items.entries()) {
    const other = newLines.get(line.id),
      prefix = `Item ${line.number || index + 1}`;
    if (!other) {
      changes.push({
        label: `${prefix}: somente no seu rascunho`,
        mine: summary(line),
        current: "Não incluído",
      });
      continue;
    }
    for (const key of Object.keys(lineFields) as (keyof typeof lineFields)[])
      add(
        `${prefix} · ${lineFields[key]}`,
        lineValue(line, key),
        lineValue(other, key),
      );
    if (line.catalogId !== other.catalogId)
      changes.push({
        label: `${prefix} · Produto vinculado`,
        mine: line.catalogId ? "Vínculo diferente no rascunho" : "Sem vínculo",
        current: other.catalogId
          ? "Vínculo diferente na versão atual"
          : "Sem vínculo",
      });
  }
  for (const [index, line] of current.items.entries())
    if (!oldLines.has(line.id))
      changes.push({
        label: `Item ${line.number || index + 1}: somente na versão atual`,
        mine: "Não incluído",
        current: summary(line),
      });
  return changes;
}
