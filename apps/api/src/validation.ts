import { z } from "zod";
import {normalizeCnpj} from './cnpj-profile.js';
import {outcomeCategories} from './commercial-rules.js';
export const uuid = z.uuid();
export const short = z.string().trim().min(1).max(200);
export const textList = z
  .array(z.string().trim().min(2).max(100))
  .max(50)
  .transform((values) => [...new Set(values)]);
const nullableDate = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .nullable();
export const dateValue = nullableDate;
export const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128);
export const email = z.email().trim().toLowerCase().max(254);
export const registerSchema = z
  .object({ name: short, email, password, organizationName: short })
  .strict();
export const loginSchema = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
export const profileSchema = z
  .object({
    organizationName: short,
    taxId: z.string().trim().max(24).refine(value=>{if(!value)return true;try{normalizeCnpj(value);return true;}catch{return false;}},'O número informado parece incompleto ou incorreto. Confira todos os caracteres, incluindo os dois números finais.').nullable().default(null),
    segments: textList.default([]),
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
      .default([]),
    cities: textList.default([]),
    keywords: textList.default([]),
    excludedKeywords: textList.default([]),
    modalities: textList.default([]),
    minValue: z.number().nonnegative().max(1e15).nullable().default(null),
    maxValue: z.number().nonnegative().max(1e15).nullable().default(null),
  })
  .strict()
  .refine(
    (p) =>
      p.minValue === null || p.maxValue === null || p.minValue <= p.maxValue,
    {
      message: "O valor mínimo não pode superar o valor máximo.",
      path: ["maxValue"],
    },
  );
export const catalogSchema = z
  .object({
    type: z.enum(["PRODUCT", "SERVICE"]),
    name: short,
    description: z.string().trim().max(5000).default(""),
    category: z.string().trim().max(150).default(""),
    keywords: textList.default([]),
    active: z.boolean().default(true),
  })
  .strict();
export const trackingSchema = z
  .object({
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
    ownerId: uuid.nullable().optional(),
    deadline: nullableDate.optional(),
    expectedValue: z.number().nonnegative().max(1e15).nullable().optional(),
    outcomeReason: z.string().max(3000).optional(),
    outcomeCategory: z.enum(outcomeCategories).nullable().optional(),
    notes: z.string().max(30_000).optional(),
  })
  .strict();
export const taskSchema = z
  .object({
    title: short,
    done: z.boolean().default(false),
    deadline: nullableDate.optional().default(null),
    ownerId: uuid.nullable().optional().default(null),
  })
  .strict();
export const searchSchema = z.object({
  q: z.string().trim().max(300).default(""),
  state: z.string().max(2).default(""),
  city: z.string().trim().max(150).default(""),
  agency: z.string().trim().max(200).default(""),
  modality: z.string().max(150).default(""),
  source: z.string().max(50).default(""),
  status: z.string().max(100).default(""),
  minValue: z.coerce.number().nonnegative().optional(),
  maxValue: z.coerce.number().nonnegative().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(["score", "newest", "deadline", "value"]).default("score"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
