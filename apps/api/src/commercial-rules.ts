import { z } from "zod";
export const outcomeCategories = [
  "PRICE",
  "DOCUMENTATION",
  "TECHNICAL",
  "DEADLINE",
  "REGION",
  "STRATEGY",
  "COMPETITION",
  "OTHER",
] as const;
export const outcomeLabels: Record<string, string> = {
  PRICE: "Preço ou margem",
  DOCUMENTATION: "Documentação",
  TECHNICAL: "Capacidade técnica",
  DEADLINE: "Prazo",
  REGION: "Região ou atendimento",
  STRATEGY: "Decisão estratégica",
  COMPETITION: "Condições da concorrência",
  OTHER: "Outro motivo",
  UNCLASSIFIED: "Sem classificação",
};
export const commercialQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    ownerId: z.string().uuid().optional(),
    stage: z
      .enum([
        "IDENTIFIED",
        "IN_ANALYSIS",
        "WILL_PARTICIPATE",
        "PROPOSAL_SENT",
        "WON",
        "LOST",
        "DISCARDED",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "A data inicial deve ser anterior ou igual à final.",
  });
export function winRate(won: number, lost: number) {
  return won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null;
}
