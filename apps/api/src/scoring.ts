export type Profile = {
  organizationName: string;
  taxId: string | null;
  segments: string[];
  states: string[];
  cities: string[];
  keywords: string[];
  excludedKeywords: string[];
  modalities: string[];
  minValue: number | null;
  maxValue: number | null;
};
export const defaultProfile: Profile = {
  organizationName: "",
  taxId: null,
  segments: [],
  states: [],
  cities: [],
  keywords: [],
  excludedKeywords: [],
  modalities: [],
  minValue: null,
  maxValue: null,
};
export const normalize = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const wordVariants: Record<string,string> = {impressoes:"impressao", impressoras:"impressora", copiadoras:"copiadora", contadores:"contador", paginas:"pagina", copias:"copia", equipamentos:"equipamento", servicos:"servico", sistemas:"sistema", solucoes:"solucao", multifuncionais:"multifuncional", cotas:"cota", quotas:"cota", quota:"cota"};
const synonymGroups = [
  ["outsourcing de impressão", "terceirização de impressão", "impressão gerenciada"],
  ["locação de impressoras", "aluguel de impressoras"],
  ["gestão de impressão", "gerenciamento de impressão"],
  ["sistema de bilhetagem", "software de bilhetagem", "bilhetagem de impressão"],
];
const foldWords = (value: unknown) => normalize(value).split(" ").map(w => wordVariants[w] ?? w).filter(w => !["de","da","do","das","dos"].includes(w)).join(" ");
export function smartNormalize(value: unknown): string {
  let text = ` ${foldWords(value)} `;
  for (const group of synonymGroups) for (const term of group) text = text.split(` ${foldWords(term)} `).join(` ${foldWords(group[0])} `);
  return text.trim();
}
const contains = (haystack: string, needle: string) =>
  !!smartNormalize(needle) && ` ${smartNormalize(haystack)} `.includes(` ${smartNormalize(needle)} `);
export function matchesSearch(text: unknown, query: unknown) {
  const normalized = smartNormalize(query);
  if (!normalized) return true;
  const haystack = ` ${smartNormalize(text)} `;
  return normalized.split(" ").every(term => haystack.includes(` ${term} `));
}
export function matchesModality(actual: unknown, selected: unknown): boolean {
  const value = normalize(actual);
  const filter = normalize(selected);
  return !!filter && (value === filter || value.startsWith(`${filter} `));
}
export {wordVariants,synonymGroups,stopWords};
const stopWords = new Set([
  "de",
  "da",
  "do",
  "e",
  "a",
  "o",
  "para",
  "com",
  "em",
  "dos",
  "das",
  "um",
  "uma",
  "servico",
  "servicos",
  "produto",
  "produtos",
]);
export function scoreOpportunity(
  opportunity: any,
  profile: Profile,
  offerings: any[],
) {
  const haystack = normalize(`${opportunity.title} ${opportunity.description}`);
  const excluded = profile.excludedKeywords.filter((term) =>
    contains(haystack, normalize(term)),
  );
  if (excluded.length)
    return {
      score: 0,
      reasons: [`Termos excluídos encontrados: ${excluded.join(", ")}.`],
      excluded: true,
    };
  const reasons: string[] = [];
  let score = 0;
  const terms = profile.keywords.filter((term) =>
    contains(haystack, normalize(term)),
  );
  if (terms.length) {
    score += Math.min(60, 40 + new Set(terms.map(smartNormalize)).size * 10);
    reasons.push(`Palavras-chave (incluindo variações e equivalências cadastradas): ${terms.join(", ")}.`);
  }
  const matchedOfferings = offerings.filter((offering) => {
    if (offering.active === false) return false;
    const tokens = [
      ...(offering.keywords ?? []),
      ...normalize(offering.name)
        .split(" ")
        .filter((t: string) => t.length > 3 && !stopWords.has(t)),
    ];
    return tokens.some((term: string) => contains(haystack, normalize(term)));
  });
  if (matchedOfferings.length) {
    score += terms.length ? 20 : 60;
    reasons.push(
      `Compatível com o catálogo: ${matchedOfferings
        .slice(0, 3)
        .map((o) => o.name)
        .join(", ")}.`,
    );
  }
  if (profile.states.length) {
    if (profile.states.includes(opportunity.state)) {
      score += 10;
      reasons.push(`UF ${opportunity.state} está na área de atuação.`);
    } else
      reasons.push(
        opportunity.state
          ? `UF ${opportunity.state} fora da área de atuação.`
          : "UF não informada pela fonte.",
      );
  }
  if (profile.cities.length) {
    if (
      profile.cities.some((c) => normalize(c) === normalize(opportunity.city))
    ) {
      score += 5;
      reasons.push("Município prioritário.");
    } else reasons.push("Município não listado nas prioridades.");
  }
  if (
    profile.modalities.length &&
    profile.modalities.some((m) => matchesModality(opportunity.modality, m))
  ) {
    score += 5;
    reasons.push("Modalidade selecionada no perfil.");
  }
  if (profile.minValue !== null || profile.maxValue !== null) {
    if (opportunity.value === null || opportunity.value === undefined)
      reasons.push("Valor estimado não informado.");
    else if (
      (profile.minValue === null || opportunity.value >= profile.minValue) &&
      (profile.maxValue === null || opportunity.value <= profile.maxValue)
    ) {
      score += 5;
      reasons.push("Valor dentro da faixa de interesse.");
    } else {
      score = Math.max(0, score - 20);
      reasons.push("Valor fora da faixa de interesse.");
    }
  }
  if (
    profile.states.length &&
    opportunity.state &&
    !profile.states.includes(opportunity.state)
  )
    score = Math.round(score * 0.45);
  if (!terms.length && !matchedOfferings.length)
    reasons.unshift(
      "Nenhuma correspondência comercial encontrada nos termos e no catálogo.",
    );
  if (!profile.keywords.length && !offerings.length)
    reasons.unshift(
      "Preencha palavras-chave ou catálogo para personalizar a aderência.",
    );
  return { score: Math.min(100, Math.max(0, score)), reasons, excluded: false };
}
