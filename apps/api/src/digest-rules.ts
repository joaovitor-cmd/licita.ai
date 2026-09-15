import { z } from "zod";
export const digestSchema = z
  .object({
    enabled: z.boolean(),
    sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recipientIds: z
      .array(z.string().uuid())
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    revision: z.number().int().min(0),
  })
  .strict();
export function brazilClock(now: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${p("year")}-${p("month")}-${p("day")}`,
    time: `${p("hour")}:${p("minute")}`,
  };
}
export type DigestItem = {
  id: string;
  title: string;
  agency: string;
  state: string | null;
  score: number;
};
export function digestText(
  items: DigestItem[],
  day: string,
  url: string,
  remaining: boolean,
) {
  return `Licitaro — boletim de ${day}\n\n${items.length} oportunidades aderentes identificadas desde a última verificação do boletim.\n\n${items
    .slice(0, 20)
    .map(
      (i) =>
        `• ${i.title}\n${i.agency} · ${i.state ?? "UF não informada"} · aderência ${i.score}%`,
    )
    .join(
      "\n\n",
    )}\n\n${items.length > 20 ? "Veja a lista completa no portal.\n" : ""}${url}\n\n${remaining ? "A consulta atingiu o limite de 2.000 registros. Os registros restantes serão avaliados no próximo boletim.\n" : ""}Aderência é afinidade comercial, não habilitação. Confira prazos e documentos oficiais. Altere horário ou desative o boletim em Configurações.`;
}
