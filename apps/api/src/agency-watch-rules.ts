import { z } from "zod";
import { normalizeCnpj } from "./cnpj-profile.js";
import { normalize } from "./scoring.js";

const terms = z
  .array(
    z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine((v) => !!normalize(v), "Informe palavras, não apenas símbolos."),
  )
  .max(30)
  .transform((v) => [...new Map(v.map((t) => [normalize(t), t])).values()]);
export const agencyWatchSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((v) => !!normalize(v), "Informe um nome com letras ou números."),
    agencyCnpj: z
      .string()
      .trim()
      .max(24)
      .transform((v, ctx) => {
        try {
          return normalizeCnpj(v);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Informe um CNPJ válido do órgão.",
          });
          return z.NEVER;
        }
      }),
    terms: terms.default([]),
    excludedTerms: terms.default([]),
    states: z
      .array(
        z.enum([
          "AC",
          "AL",
          "AP",
          "AM",
          "BA",
          "CE",
          "DF",
          "ES",
          "GO",
          "MA",
          "MT",
          "MS",
          "MG",
          "PA",
          "PB",
          "PR",
          "PE",
          "PI",
          "RJ",
          "RN",
          "RS",
          "RO",
          "RR",
          "SC",
          "SP",
          "SE",
          "TO",
        ]),
      )
      .max(27)
      .transform((v) => [...new Set(v)])
      .default([]),
  })
  .strict();

// Only explicit PNCP control identifiers supported by the existing connectors.
// Never infer the agency's CNPJ from its name, UASG, supplier or company's profile.
export function agencyCnpj(item: { canonicalKey?: string }) {
  const value = /^pncp:([A-Z0-9]{12}\d{2})-1-\d+\/\d{4}$/.exec(
    item.canonicalKey ?? "",
  )?.[1];
  if (!value) return null;
  try {
    return normalizeCnpj(value);
  } catch {
    return null;
  }
}
export function watchText(item: {
  title: string;
  description?: string | null;
}) {
  return ` ${normalize(`${item.title} ${item.description ?? ""}`)} `;
}
export function watchTermMatches(term: string, text: string) {
  return text.includes(` ${normalize(term)} `);
}
export function watchMatch(
  watch: { terms: string[]; excluded_terms: string[]; states: string[] },
  item: { title: string; description?: string | null; state?: string | null },
  text = watchText(item),
) {
  const contains = (term: string) => watchTermMatches(term, text);
  if (watch.states.length && !watch.states.includes(item.state ?? ""))
    return false;
  if (watch.excluded_terms.some(contains)) return false;
  return !watch.terms.length || watch.terms.some(contains);
}
