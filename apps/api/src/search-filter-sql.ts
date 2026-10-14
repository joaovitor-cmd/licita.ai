import { normalize, smartNormalize } from "./scoring.js";
import { openOpportunitySql } from "./availability.js";
export type OpportunityFilters = {
  q?: string;
  terms?: string;
  exclude?: string;
  state?: string;
  states?: string;
  city?: string;
  agency?: string;
  modality?: string;
  modalities?: string;
  source?: string;
  sources?: string;
  status?: string;
  minValue?: number;
  maxValue?: number;
  from?: string;
  to?: string;
};
// One rule builder for free search and every saved profile. Values are always bound.
export function opportunityFilterSql(
  q: OpportunityFilters,
  bind: (value: unknown) => string,
): string[] {
  const where: string[] = [];
  if (q.state) where.push(`o.state=${bind(q.state.toUpperCase())}`);
  if (q.states)
    where.push(
      `o.state=ANY(${bind(q.states.split(",").map((s) => s.trim().toUpperCase()))}::text[])`,
    );
  if (q.minValue !== undefined) where.push(`o.value>=${bind(q.minValue)}`);
  if (q.maxValue !== undefined) where.push(`o.value<=${bind(q.maxValue)}`);
  if (q.from) where.push(`o.published_at>=${bind(q.from)}`);
  if (q.to) where.push(`o.published_at<${bind(q.to)}::date+interval '1 day'`);
  if (q.source) {
    const p = bind(q.source);
    where.push(
      `(o.source_code=${p} OR EXISTS(SELECT 1 FROM opportunity_sources s WHERE s.opportunity_id=o.id AND s.source_code=${p}))`,
    );
  }
  if (q.sources) {
    const p = bind(q.sources.split(",").map((s) => s.trim()));
    where.push(
      `(o.source_code=ANY(${p}::text[]) OR EXISTS(SELECT 1 FROM opportunity_sources s WHERE s.opportunity_id=o.id AND s.source_code=ANY(${p}::text[])))`,
    );
  }
  if (q.status === "open" || q.status === "recebendo_proposta")
    where.push(`(${openOpportunitySql})`);
  else if (q.status === "closed") where.push("o.closes_at<now()");
  else if (q.status)
    where.push(
      `o.status ILIKE ${bind("%" + q.status.replace(/[\\%_]/g, "\\$&") + "%")}`,
    );
  const code = (q.q || "").trim().match(/^LC-?(\d{1,18})$/i);
  const validCode = code && BigInt(code[1]) <= 9223372036854775807n;
  const tokens = smartNormalize(q.q || "")
    .split(" ")
    .filter(Boolean);
  if (validCode) where.push(`o.public_code=${bind(code[1])}::bigint`);
  else if (tokens.length)
    where.push(`o.search_tokens @> ${bind(tokens)}::text[]`);
  const termTokens = (value: string) =>
    value
      .split(",")
      .map((term) => smartNormalize(term).split(" ").filter(Boolean))
      .filter((term) => term.length);
  const includes = termTokens(q.terms || "");
  if (includes.length)
    where.push(
      `(${includes.map((term) => `o.search_tokens @> ${bind(term)}::text[]`).join(" OR ")})`,
    );
  for (const term of termTokens(q.exclude || ""))
    where.push(
      `NOT (coalesce(o.search_tokens,ARRAY[]::text[]) @> ${bind(term)}::text[])`,
    );
  if (q.city)
    where.push(`position(${bind(normalize(q.city))} in o.city_search)>0`);
  if (q.agency)
    where.push(`position(${bind(normalize(q.agency))} in o.agency_search)>0`);
  const modality = (value: string) => {
    const p = bind(normalize(value));
    return `(o.modality_search=${p} OR left(o.modality_search,length(${p})+1)=${p}||' ')`;
  };
  if (q.modality) where.push(modality(q.modality));
  if (q.modalities) {
    const choices = q.modalities
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (choices.length) where.push(`(${choices.map(modality).join(" OR ")})`);
  }
  return where;
}
