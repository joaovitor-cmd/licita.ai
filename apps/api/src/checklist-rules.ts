import { z } from "zod";
export const checklistItem = z
  .object({
    kind: z.enum(["TASK", "DOCUMENT"]),
    title: z.string().trim().min(3).max(200),
  })
  .strict();
export const checklistSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    items: z.array(checklistItem).min(1).max(60),
  })
  .strict();
export type ChecklistItem = z.infer<typeof checklistItem>;
export const itemKey = (item: ChecklistItem) =>
  `${item.kind}:${item.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()}`;
export const starterTemplates = [
  {
    id: "participacao-inicial",
    name: "Primeira participação — roteiro de conferência",
    revision: 1,
    builtin: true,
    items: [
      {
        kind: "TASK",
        title: "Ler edital, anexos e retificações e registrar dúvidas",
      },
      { kind: "TASK", title: "Confirmar prazo e portal de envio da proposta" },
      { kind: "TASK", title: "Conferir documentos e certidões" },
      { kind: "TASK", title: "Revisar proposta técnica e preços" },
      {
        kind: "TASK",
        title: "Validar decisão de participar com o responsável",
      },
    ],
  },
  {
    id: "outsourcing-impressao",
    name: "Outsourcing de impressão — preparação comercial",
    revision: 1,
    builtin: true,
    items: [
      {
        kind: "TASK",
        title: "Conferir equipamentos, volumes e locais de instalação",
      },
      { kind: "TASK", title: "Validar franquias e cobrança de excedentes" },
      {
        kind: "TASK",
        title: "Conferir software, bilhetagem e impressão segura",
      },
      {
        kind: "TASK",
        title: "Validar cobertura técnica e prazos de atendimento",
      },
      { kind: "TASK", title: "Simular custos, tributos e margem do contrato" },
      {
        kind: "TASK",
        title: "Identificar no edital os documentos técnicos exigidos",
      },
      {
        kind: "TASK",
        title: "Conferir condições de pagamento e duração do contrato",
      },
    ],
  },
] as const;
