/**
 * Public, read-only official adapters. No supplier credentials or submission APIs.
 * Contracts checked 2026-09-07:
 * https://pncp.gov.br/api/consulta/v3/api-docs
 * https://pncp.gov.br/api/pncp/v3/api-docs
 * https://dadosabertos.compras.gov.br/v3/api-docs
 */
export type SourceCode = "pncp" | "comprasgov";

export interface ExternalOpportunity {
  canonicalKey: string;
  externalId: string;
  title: string;
  description: string | null;
  agency: string;
  state: string | null;
  city: string | null;
  modality: string | null;
  sphere: string | null;
  value: number | null;
  publishedAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
  status: string | null;
  url: string | null;
  sourceCode: SourceCode;
  sourceName: string;
  documents: Array<{ name: string; url: string }>;
  raw?: unknown;
}

export interface CollectionOptions {
  states: string[];
  days?: number;
  maxPages?: number;
  signal?: AbortSignal;
  cursor?: CollectionCursor | null;
  onCheckpoint?: (cursor: CollectionCursor | null) => Promise<void>;
}
export interface CollectionCursor { code:string; states:string[]; pending:Partition[]; }

export const SOURCE_DEFINITIONS = [
  {
    code: "pncp",
    name: "PNCP",
    status: "ready",
    url: "https://pncp.gov.br/app/editais",
    description:
      "Fonte nacional: União, estados e municípios que publicam no PNCP. Busca propostas abertas até 90 dias e atualizações de pregões eletrônicos, concorrências, dispensas e credenciamentos. Editais no radar são revisados individualmente. Coleta paginada, sujeita aos limites informados em cada execução.",
  },
  {
    code: "comprasgov",
    name: "Compras.gov.br",
    status: "ready",
    url: "https://dadosabertos.compras.gov.br/swagger-ui/index.html",
    description:
      "Dados abertos de contratações da Lei 14.133: pregão, dispensa e concorrência na janela de publicação. Pode repetir registros do PNCP; a plataforma consolida o número de controle. Não substitui todas as publicações do portal.",
  },
  {
    code: "regional-sul",
    name: "Portais regionais · RS, SC e PR",
    status: "planned",
    url: "https://pncp.gov.br/app/editais",
    description:
      "Conectores independentes ainda não implementados. Publicações dessas UFs já podem ser consultadas quando disponíveis no PNCP ou Compras.gov.br.",
  },
  {
    code: "regional-pa",
    name: "Portais regionais · Pará",
    status: "planned",
    url: "https://pncp.gov.br/app/editais",
    description:
      "Conector regional independente planejado. A cobertura atual do Pará depende dos registros publicados nas fontes nacionais conectadas.",
  },
] as const;

const PNCP_QUERY = "https://pncp.gov.br/api/consulta";
const PNCP_DETAIL = "https://pncp.gov.br/api/pncp";
const COMPRAS = "https://dadosabertos.compras.gov.br";
const VALID_STATES = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  ),
);
const PNCP_UPDATE_MODALITIES = [6, 8, 4, 5, 12];
// Compras.gov legacy codes are NOT PNCP codes: 5=>PNCP6, 6=>PNCP8, 3=>PNCP4/5.
const COMPRAS_MODALITIES = [5, 6, 3];
type JsonObject = Record<string, unknown>;
type Fetcher = typeof fetch;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value)
    .replace(/\u0000/g, "")
    .trim();
  return result || null;
}

export function safeExternalUrl(value: unknown): string | null {
  const input = text(value);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** PNCP documents proposal times in Brasília, not the runtime machine timezone. */
export function normalizeBrasiliaDate(value: unknown): string | null {
  const input = text(value);
  if (!input) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(
      input,
    )
  )
    return null;
  const [year, month, day] = input.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month! - 1 ||
    calendar.getUTCDate() !== day
  )
    return null;
  let normalized = input.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += "T00:00:00-03:00";
  else if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) normalized += "-03:00";
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function amount(value: unknown, confidential: unknown): number | null {
  if (
    confidential === true ||
    confidential === 2 ||
    confidential === 3 ||
    confidential === "2" ||
    confidential === "3"
  )
    return null;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  // Zero commonly represents undisclosed data; do not turn unknown budgets into R$0.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validControl(value: unknown): string | null {
  const match = text(value)?.match(/^(\d{14})-1-(\d{1,8})\/(\d{4})$/);
  return match
    ? `${match[1]}-1-${match[2].padStart(6, "0")}/${match[3]}`
    : null;
}

function controlParts(control: string) {
  const match = control.match(/^(\d{14})-1-(\d{1,8})\/(\d{4})$/);
  if (!match || Number(match[2]) < 1) return null;
  return {
    cnpj: match[1]!,
    sequence: Number(match[2]),
    year: Number(match[3]),
  };
}

function fallbackControl(
  cnpj: unknown,
  year: unknown,
  sequence: unknown,
): string | null {
  const cnpjString = text(cnpj)?.replace(/\D/g, "");
  const parsedYear = Number(year),
    parsedSequence = Number(sequence);
  if (
    !cnpjString ||
    cnpjString.length !== 14 ||
    !Number.isInteger(parsedYear) ||
    parsedYear < 2000 ||
    parsedYear > 2200 ||
    !Number.isInteger(parsedSequence) ||
    parsedSequence < 1
  )
    return null;
  return `${cnpjString}-1-${String(parsedSequence).padStart(6, "0")}/${parsedYear}`;
}

function portalUrl(control: string): string | null {
  const parts = controlParts(control);
  return parts
    ? `https://pncp.gov.br/app/editais/${parts.cnpj}/${parts.year}/${parts.sequence}`
    : null;
}

function state(value: unknown): string | null {
  const code = text(value)?.toUpperCase();
  return code && VALID_STATES.has(code) ? code : null;
}

function sphere(value: unknown): string | null {
  const code = text(value);
  const names: Record<string, string> = {
    F: "Federal",
    E: "Estadual",
    M: "Municipal",
    D: "Distrital",
  };
  return code ? names[code] || code : null;
}

function sourceName(code: SourceCode): string {
  return code === "pncp" ? "PNCP" : "Compras.gov.br";
}

export function normalizePncpOpportunity(
  input: unknown,
  origin: SourceCode = "pncp",
): ExternalOpportunity | null {
  const raw = object(input),
    agency = object(raw.orgaoEntidade),
    unit = object(raw.unidadeOrgao);
  const control =
    validControl(raw.numeroControlePNCP) ||
    fallbackControl(agency.cnpj, raw.anoCompra, raw.sequencialCompra);
  if (!control || !controlParts(control)) return null;
  const title =
    text(raw.objetoCompra) ||
    `Contratação ${text(raw.numeroCompra) || control}`;
  return {
    canonicalKey: `pncp:${control}`,
    externalId: control,
    title,
    description: text(raw.informacaoComplementar),
    agency: text(agency.razaoSocial) || "Órgão não informado",
    state: state(unit.ufSigla),
    city: text(unit.municipioNome),
    modality: text(raw.modalidadeNome),
    sphere: sphere(agency.esferaId),
    value: amount(
      raw.valorTotalEstimado,
      raw.orcamentoSigilosoCodigo ?? raw.orcamentoSigiloso,
    ),
    publishedAt: normalizeBrasiliaDate(raw.dataPublicacaoPncp),
    opensAt: normalizeBrasiliaDate(raw.dataAberturaProposta),
    closesAt: normalizeBrasiliaDate(raw.dataEncerramentoProposta),
    status: text(raw.situacaoCompraNome),
    url: safeExternalUrl(raw.linkSistemaOrigem) || portalUrl(control),
    sourceCode: origin,
    sourceName: sourceName(origin),
    documents: [],
    raw,
  };
}

export function normalizeComprasOpportunity(
  input: unknown,
): ExternalOpportunity | null {
  const raw = object(input);
  const control =
    validControl(raw.numeroControlePNCP) ||
    fallbackControl(
      raw.orgaoEntidadeCnpj,
      raw.anoCompraPncp,
      raw.sequencialCompraPncp,
    );
  if (!control || !controlParts(control)) return null;
  return {
    canonicalKey: `pncp:${control}`,
    externalId: text(raw.idCompra) || control,
    title:
      text(raw.objetoCompra) ||
      `Contratação ${text(raw.numeroCompra) || control}`,
    description: text(raw.informacaoComplementar),
    agency: text(raw.orgaoEntidadeRazaoSocial) || "Órgão não informado",
    state: state(raw.unidadeOrgaoUfSigla),
    city: text(raw.unidadeOrgaoMunicipioNome),
    modality: text(raw.modalidadeNome),
    sphere: sphere(raw.orgaoEntidadeEsferaId),
    value: amount(raw.valorTotalEstimado, raw.orcamentoSigilosoCodigo),
    publishedAt: normalizeBrasiliaDate(raw.dataPublicacaoPncp),
    opensAt: normalizeBrasiliaDate(raw.dataAberturaPropostaPncp),
    closesAt: normalizeBrasiliaDate(raw.dataEncerramentoPropostaPncp),
    status:
      raw.contratacaoExcluida === true
        ? "Excluída na fonte"
        : text(raw.situacaoCompraNomePncp),
    url: portalUrl(control),
    sourceCode: "comprasgov",
    sourceName: "Compras.gov.br",
    documents: [],
    raw,
  };
}

export class CollectionError extends Error {
  readonly read: number;
  readonly pages: number;
  readonly partial: boolean;
  constructor(message: string, read = 0, pages = 0) {
    super(message);
    this.name = "CollectionError";
    this.read = read;
    this.pages = pages;
    this.partial = pages > 0;
  }
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`A fonte pública respondeu HTTP ${status}.`);
    this.status = status;
  }
}

function bounded(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(1, Math.floor(value)))
    : fallback;
}

function dateAt(now: Date, days: number, compact = true): string {
  const shifted = new Date(now.getTime() + days * 86_400_000);
  const value = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
  return compact ? value.replace(/-/g, "") : value;
}

async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const finished = () => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    };
    const timer = setTimeout(finished, ms);
    const aborted = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(signal?.reason || new Error("Coleta cancelada."));
    };
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

interface ConnectorDependencies {
  fetchImpl?: Fetcher;
  now?: () => Date;
  requestTimeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

interface Partition {
  base: string;
  path: string;
  params: Record<string, string>;
  page: number;
  label: string;
}

/** Injection is for deterministic tests; production uses only the three official fixed hosts. */
export function createConnectors(dependencies: ConnectorDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || (() => new Date());
  const timeout = dependencies.requestTimeoutMs ?? 15_000;
  const retries = Math.max(0, Math.min(3, dependencies.retries ?? 1));
  let nextRequestAt=0;

  async function getJson(
    base: string,
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (
      ![PNCP_QUERY, PNCP_DETAIL, COMPRAS].includes(base) ||
      !path.startsWith("/") ||
      path.includes("..") ||
      path.includes("?")
    )
      throw new Error("Endpoint público inválido.");
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(
        () =>
          controller.abort(
            new Error("A fonte pública excedeu o tempo de resposta."),
          ),
        timeout,
      );
      let retryAfterMs = 0;
      try {
        const nowMs=Date.now(), waitMs=Math.max(0,nextRequestAt-nowMs);
        nextRequestAt=Math.max(nowMs,nextRequestAt)+(dependencies.fetchImpl?0:700);
        await pause(waitMs,controller.signal);
        const response = await fetchImpl(url.href, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
          redirect: "error",
        });
        if (response.status === 204) return null;
        if (!response.ok) {
          retryAfterMs = Math.min(
            120_000,
            Math.max(
              0,
              Number(response.headers.get("retry-after")) * 1_000 || (response.status===429?15_000:0),
            ),
          );
          throw new HttpError(response.status);
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > 20_000_000)
          throw new Error("Resposta pública acima do limite seguro.");
        return await response.json();
      } catch (error) {
        lastError = error;
        if (signal?.aborted)
          throw signal.reason || new Error("Coleta cancelada.");
        const retryable =
          !(error instanceof HttpError) ||
          error.status === 429 ||
          error.status >= 500;
        if (!retryable || attempt === retries) throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
      await pause(
        Math.max(
          retryAfterMs,
          (dependencies.retryDelayMs ?? 500) * 2 ** attempt,
        ),
        signal,
      );
    }
    throw lastError;
  }

  async function collectSource(
    code: string,
    options: CollectionOptions,
    onBatch: (items: ExternalOpportunity[]) => Promise<void>,
  ): Promise<{ read: number; pages: number }> {
    if (code !== "pncp" && code !== "comprasgov")
      throw new CollectionError("Esta fonte não possui conector implementado.");
    const days = bounded(options.days, 7, 90),
      maxPages = bounded(options.maxPages, 40, 200);
    const deadline = AbortSignal.timeout(120_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    const selectedStates = [
      ...new Set(
        (options.states || []).map((value) => value.trim().toUpperCase()),
      ),
    ];
    if (selectedStates.some((value) => !VALID_STATES.has(value)))
      throw new CollectionError("Uma ou mais UFs de coleta são inválidas.");
    const states = selectedStates.length ? selectedStates : [""];
    const current = now(),
      partitions: Partition[] = [];
    if (code === "pncp") {
      for (const uf of states)
        partitions.push({
          base: PNCP_QUERY,
          path: "/v1/contratacoes/proposta",
          params: { dataFinal: dateAt(current, 90), ...(uf ? { uf } : {}) },
          page: 1,
          label: `Propostas abertas ${uf || "Brasil"}`,
        });
      for (const modality of PNCP_UPDATE_MODALITIES) {
        for (const uf of states)
          partitions.push({
            base: PNCP_QUERY,
            path: "/v1/contratacoes/atualizacao",
            params: {
              dataInicial: dateAt(current, -days + 1),
              dataFinal: dateAt(current, 0),
              codigoModalidadeContratacao: String(modality),
              ...(uf ? { uf } : {}),
            },
            page: 1,
            label: `Atualizações ${uf || "Brasil"} / modalidade ${modality}`,
          });
      }
    } else {
      for (const modality of COMPRAS_MODALITIES) {
        for (const uf of states)
          partitions.push({
            base: COMPRAS,
            path: "/modulo-contratacoes/1_consultarContratacoes_PNCP_14133",
            params: {
              dataPublicacaoPncpInicial: dateAt(current, -days + 1, false),
              dataPublicacaoPncpFinal: dateAt(current, 0, false),
              codigoModalidade: String(modality),
              ...(uf ? { unidadeOrgaoUfSigla: uf } : {}),
            },
            page: 1,
            label: `Publicações ${uf || "Brasil"} / modalidade ${modality}`,
          });
      }
    }
    if(options.cursor?.code===code && JSON.stringify([...options.cursor.states].sort())===JSON.stringify([...selectedStates].sort())) {
      partitions.splice(0,partitions.length,...options.cursor.pending);
    }
    const deferred:Partition[]=[];
    const checkpoint=async()=>options.onCheckpoint?.(partitions.length||deferred.length?{code,states:selectedStates,pending:[...partitions,...deferred]}:null);
    await checkpoint();
    let read = 0,
      pages = 0,
      invalid = 0;
    const failures: string[] = [],
      seen = new Map<string, string>();
    while (partitions.length > 0 && pages < maxPages) {
      if (signal.aborted)
        throw new CollectionError(
          "Coleta interrompida por cancelamento ou limite de dois minutos; os lotes já importados foram preservados.",
          read,
          pages,
        );
      const partition = partitions.shift()!;
      let payload: unknown;
      try {
        payload = await getJson(
          partition.base,
          partition.path,
          {
            ...partition.params,
            pagina: String(partition.page),
            tamanhoPagina: "50",
          },
          signal,
        );
      } catch (error) {
        deferred.push(partition);
        await checkpoint();
        if(error instanceof HttpError&&error.status===429)throw new CollectionError('A fonte aplicou limite temporário de requisições (HTTP 429). Os lotes e o ponto de retomada foram preservados. Aguarde a próxima execução.',read,pages);
        if (signal.aborted)
          throw new CollectionError(
            "Coleta interrompida por cancelamento ou limite de dois minutos; os lotes já importados foram preservados.",
            read,
            pages,
          );
        pages += 1;
        failures.push(
          `${partition.label}: ${error instanceof Error ? error.message : "consulta indisponível"}`,
        );
        continue;
      }
      pages += 1;
      if (payload === null) {await checkpoint();continue;}
      const envelope = object(payload),
        rawItems = code === "pncp" ? envelope.data : envelope.resultado;
      if (!Array.isArray(rawItems)) {
        failures.push(`${partition.label}: formato de resposta inesperado.`);
        deferred.push(partition);await checkpoint();
        continue;
      }
      read += rawItems.length;
      const items: ExternalOpportunity[] = [];
      for (const raw of rawItems) {
        const normalized =
          code === "pncp"
            ? normalizePncpOpportunity(raw)
            : normalizeComprasOpportunity(raw);
        if (!normalized) {
          invalid += 1;
          continue;
        }
        const hashable = JSON.stringify(normalized);
        if (seen.get(normalized.canonicalKey) === hashable) continue;
        seen.set(normalized.canonicalKey, hashable);
        items.push(normalized);
      }
      // Storage exceptions must stop processing; never present lost batches as successful collection.
      if (items.length > 0) {
        try{await onBatch(items);}catch(error){partitions.unshift(partition);await checkpoint();throw error;}
      }
      const totalPages =
        envelope.totalPaginas == null ? NaN : Number(envelope.totalPaginas);
      const remaining =
        envelope.paginasRestantes == null
          ? NaN
          : Number(envelope.paginasRestantes);
      const hasMore =
        Number.isFinite(totalPages) && totalPages > 0
          ? partition.page < totalPages
          : Number.isFinite(remaining)
            ? remaining > 0
            : rawItems.length === 50;
      if (hasMore && rawItems.length === 0)
        failures.push(`${partition.label}: paginação inconsistente na fonte.`);
      else if (hasMore)
        partitions.push({ ...partition, page: partition.page + 1 });
      await checkpoint();
    }
    if (partitions.length > 0)
      failures.push(
        `Limite de ${maxPages} páginas atingido; ${partitions.length} consultas ainda têm páginas pendentes. A próxima execução retoma do ponto salvo.`,
      );
    if (invalid > 0)
      failures.push(
        `${invalid} registro(s) sem identificação válida não foram importados.`,
      );
    if (failures.length)
      throw new CollectionError(
        `Coleta incompleta. ${failures.slice(0, 4).join(" ")}${failures.length > 4 ? ` Mais ${failures.length - 4} consulta(s) com falha.` : ""}`,
        read,
        pages,
      );
    return { read, pages };
  }

  async function refreshOpportunity(
    opportunity: Pick<ExternalOpportunity, "canonicalKey"> &
      Partial<ExternalOpportunity>,
  ): Promise<ExternalOpportunity | null> {
    const signal=AbortSignal.timeout(45_000);
    if (!opportunity.canonicalKey.startsWith("pncp:")) return null;
    const control = validControl(opportunity.canonicalKey.slice(5));
    const parts = control && controlParts(control);
    if (!parts) return null;
    const path = `/v1/orgaos/${parts.cnpj}/compras/${parts.year}/${parts.sequence}`;
    let raw: unknown;
    try {
      raw = await getJson(PNCP_QUERY, path, {},signal);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
    if (!raw) return null;
    const origin =
      opportunity.sourceCode === "comprasgov" ? "comprasgov" : "pncp";
    const normalized = normalizePncpOpportunity(raw, origin);
    if (!normalized || normalized.canonicalKey !== `pncp:${control}`)
      throw new Error(
        "A identificação retornada pela fonte difere do edital solicitado.",
      );
    if (opportunity.externalId) normalized.externalId = opportunity.externalId;
    const documents = new Map<string, { name: string; url: string }>();
    for (let page = 1; page <= 20; page += 1) {
      const payload = await getJson(PNCP_DETAIL, `${path}/arquivos`, {
        pagina: String(page),
        tamanhoPagina: "50",
      },signal);
      if (payload === null) break;
      if (!Array.isArray(payload))
        throw new Error(
          "A lista de documentos públicos retornou um formato inesperado.",
        );
      for (const value of payload) {
        const doc = object(value),
          url = safeExternalUrl(doc.url ?? doc.uri);
        if (!url || doc.statusAtivo === false) continue;
        documents.set(url, {
          name:
            text(doc.titulo) ||
            text(doc.tipoDocumentoNome) ||
            "Documento do edital",
          url,
        });
      }
      if (payload.length < 50) break;
      if (page === 20)
        throw new Error(
          "Lista de anexos ultrapassou 1.000 documentos; atualização parcial não aplicada.",
        );
    }
    normalized.documents = [...documents.values()];
    return normalized;
  }

  return { collectSource, refreshOpportunity };
}

const defaultConnectors = createConnectors();
export const collectSource = defaultConnectors.collectSource;
export const refreshOpportunity = defaultConnectors.refreshOpportunity;
