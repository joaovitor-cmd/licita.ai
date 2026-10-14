// User-facing summaries are derived from known fields, not external JSON or URLs.
const labels: Record<string, string> = {
  title: "Objeto",
  description: "Descrição",
  agency: "Órgão",
  state: "Estado",
  city: "Município",
  modality: "Modalidade",
  sphere: "Esfera",
  value: "Valor estimado",
  publishedAt: "Publicação",
  opensAt: "Abertura das propostas",
  closesAt: "Encerramento das propostas",
  status: "Situação",
};
const dates = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
function text(value: unknown, key: string): string {
  if (value == null || value === "") return "Não informado";
  if (["publishedAt", "opensAt", "closesAt"].includes(key)) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
      return "Data não informada";
    return `${dates.format(new Date(value))} (Brasília)`;
  }
  if (key === "value")
    return typeof value === "number" && Number.isFinite(value)
      ? money.format(value)
      : "Não informado";
  if (typeof value !== "string") return "Informação atualizada";
  const clean = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean
    ? clean.slice(0, 180) + (clean.length > 180 ? "…" : "")
    : "Informação atualizada";
}
export function sourceChangeSummary(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      lines.push(
        `${label}: ${text(before[key], key)} → ${text(after[key], key)}.`,
      );
  }
  if (JSON.stringify(before.documents) !== JSON.stringify(after.documents)) {
    const previous = Array.isArray(before.documents)
      ? before.documents.length
      : 0;
    const current = Array.isArray(after.documents) ? after.documents.length : 0;
    lines.push(
      `Lista de documentos atualizada: ${previous} antes, ${current} agora. Confira nomes e referências no histórico; isso não comprova mudança no conteúdo dos arquivos.`,
    );
  }
  if (before.url !== after.url)
    lines.push("O endereço da publicação oficial foi atualizado.");
  return lines.length
    ? lines.join("\n")
    : "Dados da publicação atualizados. Confira o histórico e os documentos oficiais.";
}
