import { createHash } from "node:crypto";
export const topics = [
  {
    key: "scope",
    title: "O que precisa ser entregue",
    help: "Confira objeto, itens e lotes. Um lote pode reunir várias entregas.",
    terms: ["objeto", "lote", "item", "outsourcing", "locacao"],
    action:
      "Leia a descrição completa e confirme quais itens sua empresa consegue atender.",
  },
  {
    key: "equipment",
    title: "Equipamentos e volumes",
    help: "Quantidade de equipamentos não é o mesmo que quantidade de páginas.",
    terms: [
      "impressora",
      "multifuncional",
      "paginas",
      "monocrom",
      "colorid",
      "equipamento",
    ],
    action:
      "Confira unidades, período, locais e tabelas antes de dimensionar a operação.",
  },
  {
    key: "billing",
    title: "Franquias e cobrança",
    help: "Franquia é o volume incluído no preço fixo; excedente é o que passa desse limite, conforme o contrato.",
    terms: [
      "franquia",
      "excedente",
      "bilhetagem",
      "contador",
      "contabilizacao",
    ],
    action:
      "Confira se as franquias são por equipamento, compartilhadas ou compensáveis entre períodos.",
  },
  {
    key: "software",
    title: "Software e segurança",
    help: "O serviço pode incluir funcionalidades além da impressão.",
    terms: [
      "software",
      "impressao segura",
      "autenticacao",
      "cotas",
      "politicas de impressao",
      "duplex",
    ],
    action:
      "Compare cada funcionalidade com sua solução; confira integrações e licenças.",
  },
  {
    key: "service",
    title: "Manutenção e atendimento",
    help: "Prazo de atendimento e prazo de solução podem ser diferentes.",
    terms: [
      "manutencao",
      "assistencia tecnica",
      "atendimento",
      "sla",
      "toner",
      "suprimento",
      "instalacao",
    ],
    action:
      "Confira cobertura geográfica, peças, insumos, horários e prazos de atendimento.",
  },
  {
    key: "commercial",
    title: "Custos, pagamento e duração",
    help: "O preço total publicado não equivale necessariamente à sua receita mensal.",
    terms: [
      "pagamento",
      "vigencia",
      "reajuste",
      "garantia contratual",
      "multa",
      "sancoes",
    ],
    action:
      "Confirme prazo de pagamento, duração, garantias e custos antes de usar o simulador.",
  },
  {
    key: "qualification",
    title: "Comprovações da empresa",
    help: "Habilitação é a conferência dos requisitos e documentos para contratar.",
    terms: [
      "habilitacao",
      "atestado",
      "capacidade tecnica",
      "certidao",
      "balanco",
      "qualificacao",
    ],
    action:
      "Relacione as exigências aos documentos da empresa; veja validade e escopo dos atestados.",
  },
  {
    key: "deadlines",
    title: "Prazos e regras da disputa",
    help: "Pregão é uma modalidade; edital é o documento de regras. A disputa ocorre no portal oficial indicado.",
    terms: [
      "esclarecimento",
      "impugnacao",
      "abertura",
      "sessao publica",
      "proposta",
      "lance",
      "recurso",
    ],
    action:
      "Confira datas atualizadas, credenciamento e forma de envio no portal oficial.",
  },
] as const;
export const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const fingerprint = (row: any) =>
  createHash("sha256")
    .update(JSON.stringify([row.content_hash, row.documents]))
    .digest("hex");
export type Evidence = { topic: string; page: number; quote: string };
export function findEvidence(
  pages: { page: number; text: string }[],
): Evidence[] {
  const results: Evidence[] = [];
  for (const topic of topics) {
    for (const page of pages) {
      const text = page.text.replace(/\s+/g, " ").trim();
      const norm = normalized(text);
      const indexes = topic.terms
        .map((term) => norm.indexOf(term))
        .filter((i) => i >= 0);
      if (!indexes.length) continue;
      const index = Math.min(...indexes),
        start = Math.max(0, index - 130),
        end = Math.min(text.length, index + 390);
      results.push({
        topic: topic.key,
        page: page.page,
        quote:
          (start ? "…" : "") +
          text.slice(start, end) +
          (end < text.length ? "…" : ""),
      });
      if (results.filter((r) => r.topic === topic.key).length >= 4) break;
    }
  }
  return results;
}
// Only the fixed official PNCP download endpoint is fetched. Other sources stay visible as pending.
export function officialPdfUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "pncp.gov.br" ||
      u.port ||
      u.username ||
      u.password ||
      u.search
    )
      return null;
    if (
      !/^\/(?:api\/pncp|pncp-api)\/v1\/orgaos\/\d{14}\/compras\/\d{4}\/\d+\/arquivos\/\d+$/.test(
        u.pathname,
      )
    )
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
