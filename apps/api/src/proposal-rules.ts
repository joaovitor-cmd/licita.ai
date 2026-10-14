import { z } from "zod";

export function scaledDecimal(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export const proposalDecimal = z
  .string()
  .regex(
    /^\d{1,13}(?:\.\d{1,4})?$/,
    "Use número sem sinal, com ponto decimal e até quatro casas, sem separador de milhar.",
  )
  .transform((value) => {
    const n = scaledDecimal(value),
      whole = n / 10000n,
      frac = String(n % 10000n)
        .padStart(4, "0")
        .replace(/0+$/, "");
    return `${whole}${frac ? "." + frac : ""}`;
  });
const text = (max: number) => z.string().trim().max(max);
const lineSchema = z
  .object({
    id: z.uuid(),
    number: text(40),
    lot: text(80).default(""),
    description: text(2000),
    unit: text(80),
    quantity: proposalDecimal
      .nullable()
      .refine(
        (v) => v === null || scaledDecimal(v) > 0n,
        "Quantidade deve ser maior que zero.",
      ),
    unitPrice: proposalDecimal.nullable(),
    brand: text(120).default(""),
    model: text(120).default(""),
    solution: text(1000).default(""),
    catalogId: z.uuid().nullable().default(null),
    catalogPriceApplied: z.boolean().default(false),
    sourceItem: z
      .object({
        number: z.number().int().positive(),
        page: z.number().int().min(1).max(400),
        checkedAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export const proposalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    state: z.enum(["DRAFT", "REVIEWED"]).default("DRAFT"),
    items: z.array(lineSchema).min(1).max(100),
    conditions: z
      .object({
        validity: text(300),
        payment: text(500),
        delivery: text(500),
        observations: text(1500),
      })
      .strict(),
    reviewChecks: z
      .object({
        selectionAllowed: z.boolean(),
        itemsChecked: z.boolean(),
        conditionsChecked: z.boolean(),
        zeroPriceAllowed: z.boolean().default(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (new Set(body.items.map((i) => i.id)).size !== body.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Não repita identificadores de linha.",
      });
    const sourceNumbers = body.items.flatMap((i) =>
      i.sourceItem ? [i.sourceItem.number] : [],
    );
    if (new Set(sourceNumbers).size !== sourceNumbers.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Um item da fonte foi selecionado mais de uma vez.",
      });
    if (body.items.some((i) => i.catalogPriceApplied && !i.catalogId))
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Preço de catálogo precisa estar vinculado ao item correspondente.",
      });
  });
export type ProposalBody = z.infer<typeof proposalBodySchema>;
export function proposalTotals(items: ProposalBody["items"]) {
  let total = 0n,
    complete = true;
  const lines = items.map((item) => {
    if (item.quantity === null || item.unitPrice === null) {
      complete = false;
      return { id: item.id, total: null };
    }
    // Round each commercial line to cents, then sum. Never use IEEE floats for calculations.
    const cents =
      (scaledDecimal(item.quantity) * scaledDecimal(item.unitPrice) + 500000n) /
      1000000n;
    total += cents;
    return {
      id: item.id,
      total: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
    };
  });
  return {
    total: `${total / 100n}.${String(total % 100n).padStart(2, "0")}`,
    complete,
    lines,
  };
}
export function proposalProblems(body: ProposalBody) {
  const problems: string[] = [];
  for (const [index, i] of body.items.entries()) {
    const prefix = `Item ${i.number || index + 1}`;
    if (!i.description) problems.push(`${prefix}: descreva o fornecimento.`);
    if (!i.unit) problems.push(`${prefix}: informe a unidade.`);
    if (i.quantity === null)
      problems.push(`${prefix}: quantidade não informada.`);
    if (i.unitPrice === null)
      problems.push(`${prefix}: preço ofertado não informado.`);
  }
  if (!body.reviewChecks.selectionAllowed)
    problems.push("Confira se a seleção de itens/lotes é permitida no edital.");
  if (!body.reviewChecks.itemsChecked)
    problems.push(
      "Confira quantidades, unidades e especificações no original.",
    );
  if (!body.reviewChecks.conditionsChecked)
    problems.push("Confira as condições comerciais no edital.");
  if (
    !body.conditions.validity ||
    !body.conditions.payment ||
    !body.conditions.delivery
  )
    problems.push("Informe validade, pagamento e entrega/execução.");
  if (
    body.items.some(
      (i) => i.unitPrice !== null && scaledDecimal(i.unitPrice) === 0n,
    ) &&
    !body.reviewChecks.zeroPriceAllowed
  )
    problems.push("Há preço zero: confirme se é permitido antes de revisar.");
  return problems;
}
