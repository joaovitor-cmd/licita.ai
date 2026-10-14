import { currency, date } from "./api";
import { textPreview } from "./opportunity-reading";
export type SearchFilterSummary = {
  id: string;
  label: string;
  value: string;
  preview: string;
  keys: string[];
};
export function searchFilterSummary(
  params: URLSearchParams,
  profiles?:{id:string;name:string}[],
): SearchFilterSummary[] {
  const result: SearchFilterSummary[] = [];
  const ids=[...new Set((params.get('searchProfiles')||'').split(',').map(id=>id.trim().toLowerCase()).filter(Boolean))];
  if(ids.length){const names=ids.map(id=>profiles?.find(profile=>profile.id.toLowerCase()===id)?.name);const value=names.every(Boolean)?names.join(', '):`${ids.length} selecionado(s)`;result.push({id:'searchProfiles',label:'Perfis de busca',value,preview:textPreview(value,64).text,keys:['searchProfiles']});}
  const get = (key: string) => {
    const value = params.get(key)?.trim() || "";
    // The API coerces a present empty numeric parameter to zero.
    return params.has(key) &&
      ["minValue", "maxValue", "minScore"].includes(key) &&
      !value
      ? "0"
      : value;
  };
  const list = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
  const dateFilter = (value: string) => {
    const parsed = new Date(value + "T12:00:00-03:00");
    return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? date(parsed.toISOString())
      : value;
  };
  function add(
    id: string,
    label: string,
    keys: string[],
    format = (value: string) => value,
  ) {
    const values = keys
      .map((key) => get(key))
      .filter(Boolean)
      .map(format)
      .filter(Boolean);
    if (!values.length) return;
    const value = values.join(" · e também: ");
    result.push({
      id,
      label,
      value,
      preview: textPreview(value, 64).text,
      keys,
    });
  }
  add("terms", "Interesses", ["terms"], list);
  add("exclude", "Exclusões", ["exclude"], list);
  add("states", "Estados", ["state", "states"], (value) =>
    value
      .split(",")
      .map((part) => part.trim().toUpperCase())
      .join(", "),
  );
  add("city", "Município", ["city"]);
  add("agency", "Órgão", ["agency"]);
  add("modalities", "Modalidades", ["modality", "modalities"], (value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .join(", "),
  );
  add("sources", "Portais", ["source", "sources"], (value) =>
    value
      .split(",")
      .map(
        (part) =>
          ({ pncp: "PNCP", comprasgov: "Compras.gov.br" })[part.trim()] ||
          part.trim(),
      )
      .join(", "),
  );
  add(
    "status",
    "Situação",
    ["status"],
    (value) =>
      ({
        open: "Prazo em curso nos dados coletados",
        recebendo_proposta: "Prazo em curso nos dados coletados",
        closed: "Prazo de propostas encerrado",
      })[value] || value,
  );
  add("minScore", "Aderência mínima", ["minScore"], (value) => `${value}%`);
  add("minValue", "Valor mínimo", ["minValue"], (value) =>
    Number.isFinite(Number(value)) ? currency(Number(value)) : value,
  );
  add("maxValue", "Valor máximo", ["maxValue"], (value) =>
    Number.isFinite(Number(value)) ? currency(Number(value)) : value,
  );
  add("from", "Publicação a partir de", ["from"], dateFilter);
  add("to", "Publicação até", ["to"], dateFilter);
  return result;
}
export function removeSearchFilter(
  params: URLSearchParams,
  filter: SearchFilterSummary,
) {
  const next = new URLSearchParams(params);
  for (const key of filter.keys) next.delete(key);
  next.delete("page");
  return next;
}
export function clearSearchFilters(params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ["q", "sort", "pageSize"])
    if (params.has(key)) next.set(key, params.get(key)!);
  return next;
}
