import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  createItemInterestMatcher,
  foldItemText,
  itemProfileTerms,
  type ItemSearchProfile,
} from "../item-interest";
const ProposalCatalogPicker = lazy(() => import("./ProposalCatalogPicker"));
const ProposalConflictReview = lazy(() => import("./ProposalConflictReview"));
import { ApiError, api, date, send, useResource } from "../api";
import { Button, ErrorNotice, Loading } from "../ui";
import {
  commercialTotals,
  decimalDisplay,
  decimalInput,
  moneyExact,
} from "../proposal-values";
import "./commercial-proposals.css";
import {DraftNavigationGuard} from '../DraftNavigationGuard';
import {useDeparture} from '../Departure';

type Line = {
  id: string;
  number: string;
  lot: string;
  description: string;
  unit: string;
  quantity: string | null;
  unitPrice: string | null;
  brand: string;
  model: string;
  solution: string;
  catalogId: string | null;
  catalogPriceApplied: boolean;
  sourceItem: { number: number; page: number; checkedAt: string } | null;
};
type EditableLine = Omit<Line, "quantity" | "unitPrice"> & {
  quantity: string;
  unitPrice: string;
};
type Checks = {
  selectionAllowed: boolean;
  itemsChecked: boolean;
  conditionsChecked: boolean;
  zeroPriceAllowed: boolean;
};
type Body = {
  name: string;
  state: "DRAFT" | "REVIEWED";
  items: Line[];
  conditions: {
    validity: string;
    payment: string;
    delivery: string;
    observations: string;
  };
  reviewChecks: Checks;
};
type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  revision: number;
  details: { legalName: string };
};
export type Context = {
  company: Company;
  sourceFingerprint: string;
  selectionNotice: string;
};
type Version = {
  catalogSnapshots?: { id: string; name: string }[];
  revision: number;
  body: Body;
  companySnapshot: Company;
  totals: ReturnType<typeof commercialTotals>;
  createdAt: string;
  author: string | null;
};
export type Saved = {
  id: string;
  currentRevision: number;
  isCurrent: boolean;
  version: Version;
  versions: { revision: number; state: string; created_at: string }[];
  versionsHasMore: boolean;
  stale: boolean;
  staleReasons: string[];
};
type Summary = {
  id: string;
  name: string;
  currentRevision: number;
  state: string;
  totals: { total: string; complete: boolean };
};
type Official = {
  number: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  confidential: boolean;
  estimatedUnit: number | null;
};
type ItemPage = {
  supported: boolean;
  items: Official[];
  page: number;
  hasMore: boolean;
  checkedAt?: string;
  stale?: boolean;
  notice?: string;
};
const emptyChecks = (): Checks => ({
  selectionAllowed: false,
  itemsChecked: false,
  conditionsChecked: false,
  zeroPriceAllowed: false,
});
const emptyConditions = () => ({
  validity: "",
  payment: "",
  delivery: "",
  observations: "",
});
const manualLine = (): EditableLine => ({
  id: crypto.randomUUID(),
  number: "",
  lot: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  brand: "",
  model: "",
  solution: "",
  catalogId: null,
  catalogPriceApplied: false,
  sourceItem: null,
});

export default function CommercialProposals({
  id,
  onDirtyChange,
  onBusyChange,
}: {
  id: string;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const {departing}=useDeparture();
  const context = useResource<Context>(`/opportunities/${id}/proposal-context`);
  const list = useResource<Summary[]>(`/opportunities/${id}/proposals`);
  const [editing, setEditing] = useState(false),
    [catalogLine, setCatalogLine] = useState<string | null>(null),
    [catalogNames, setCatalogNames] = useState<Record<string, string>>({}),
    [name, setName] = useState(""),
    [items, setItems] = useState<EditableLine[]>([]);
  const [conditions, setConditions] = useState(emptyConditions),
    [checks, setChecks] = useState(emptyChecks);
  const [saved, setSaved] = useState<Saved | null>(null),
    [versionNumber, setVersionNumber] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false),
    [reviewConflict, setReviewConflict] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [picker, setPicker] = useState(false);
  const [editContext, setEditContext] = useState<Context | null>(null);
  const attempt = useRef<{ key: string; requestId: string } | null>(null),
    openRequest = useRef(0);
  useEffect(
    () => () => {
      openRequest.current++;
    },
    [],
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(()=>{onBusyChange?.(busy||departing);return()=>onBusyChange?.(false);},[busy,departing,onBusyChange]);
  function changed() {
    setDirty(true);
    setChecks(emptyChecks());
    setError("");
    setMessage("");
  }
  function setLine(lineId: string, key: keyof EditableLine, value: string) {
    changed();
    setItems((previous) =>
      previous.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [key]: value,
              ...(key === "unitPrice" || key === "unit"
                ? { catalogPriceApplied: false }
                : {}),
            }
          : line,
      ),
    );
  }
  function leave() {
    if(busy||loading||departing)return false;
    return (
      !dirty ||
      window.confirm("Descartar as alterações ainda não salvas nesta cotação?")
    );
  }
  function start() {
    if (!context.data || context.loading || context.error || !leave()) return;
    openRequest.current++;
    setConflict(false);
    setReviewConflict(false);
    setCatalogLine(null);
    setCatalogNames({});
    setEditContext(context.data);
    setSaved(null);
    setEditing(true);
    setName("Nova cotação");
    setItems([]);
    setConditions(emptyConditions());
    setChecks(emptyChecks());
    setDirty(false);
    setError("");
    setMessage("");
    setPicker(false);
    attempt.current = null;
  }
  async function open(pid: string, revision?: number) {
    if (!leave()) return;
    const request = ++openRequest.current;
    setLoading(true);
    setError("");
    try {
      const value = await api<Saved>(
        `/proposals/${pid}${revision ? `?revision=${revision}` : ""}`,
      );
      if (request !== openRequest.current) return;
      setSaved(value);
      setConflict(false);
      setReviewConflict(false);
      setVersionNumber(String(value.version.revision));
      setEditing(false);
      setDirty(false);
      setMessage("");
      setPicker(false);
    } catch (e) {
      if (request === openRequest.current) setError((e as Error).message);
    } finally {
      if (request === openRequest.current) setLoading(false);
    }
  }
  function revise() {
    if (!saved || !context.data || context.loading || context.error) return;
    if (!saved.isCurrent) {
      setError("Abra a versão atual para criar uma nova revisão.");
      return;
    }
    setEditContext(context.data);
    setConflict(false);
    setReviewConflict(false);
    setCatalogLine(null);
    setCatalogNames(
      Object.fromEntries(
        (saved.version.catalogSnapshots || []).map((item) => [
          item.id,
          item.name,
        ]),
      ),
    );
    setName(saved.version.body.name);
    setItems(
      saved.version.body.items.map((line) => ({
        ...line,
        quantity: decimalDisplay(line.quantity),
        unitPrice: decimalDisplay(line.unitPrice),
      })),
    );
    setConditions({ ...saved.version.body.conditions });
    setChecks(emptyChecks());
    setEditing(true);
    setDirty(false);
    setError("");
    setMessage("");
    attempt.current = null;
  }
  async function save(state: Body["state"]) {
    if (!editContext) return;
    setError("");
    setMessage("");
    try {
      if (!items.length) throw new Error("Adicione pelo menos um item.");
      const lines = items.map((line, index) => {
        try {
          const quantity = decimalInput(line.quantity),
            unitPrice = decimalInput(line.unitPrice);
          if (quantity === "0")
            throw new Error("A quantidade precisa ser maior que zero.");
          return { ...line, quantity, unitPrice };
        } catch (e) {
          throw new Error(
            `Item ${line.number || index + 1}: ${(e as Error).message}`,
          );
        }
      });
      const body: Body = {
        name,
        state,
        items: lines,
        conditions,
        reviewChecks: checks,
      };
      const base = {
        companyId: editContext.company.id,
        companyRevision: editContext.company.revision,
        sourceFingerprint: editContext.sourceFingerprint,
        body,
        ...(saved
          ? { expectedRevision: saved.currentRevision }
          : { opportunityId: id }),
      };
      const key = JSON.stringify(base);
      if (attempt.current?.key !== key)
        attempt.current = { key, requestId: crypto.randomUUID() };
      setBusy(true);
      const result = await send<{
        proposalId: string;
        currentRevision: number;
        version: Version;
      }>(
        saved ? `/proposals/${saved.id}` : "/proposals",
        saved ? "PUT" : "POST",
        { ...base, requestId: attempt.current.requestId },
      );
      setDirty(false);
      setEditing(false);
      setPicker(false);
      attempt.current = null;
      list.reload();
      setSaved({
        id: result.proposalId,
        currentRevision: result.currentRevision,
        isCurrent: result.version.revision === result.currentRevision,
        version: result.version,
        versions: [],
        versionsHasMore: false,
        stale: false,
        staleReasons: [],
      });
      setMessage(
        `Versão ${result.version.revision} salva. Nada foi enviado ao portal oficial.`,
      );
      // Read authoritative metadata after saving; a failed read does not erase the confirmed save.
      try {
        setSaved(
          await api<Saved>(
            `/proposals/${result.proposalId}?revision=${result.version.revision}`,
          ),
        );
      } catch {
        setMessage(
          `Versão ${result.version.revision} salva. Não foi possível atualizar o histórico; abra a cotação novamente. Nada foi enviado ao portal oficial.`,
        );
      }
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(
        (e as Error).message +
          (e instanceof ApiError && e.status === 409
            ? " O formulário foi preservado; confira os dados antes de tentar novamente."
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  let preview: ReturnType<typeof commercialTotals> | null = null,
    invalidPreview = false;
  try {
    preview = commercialTotals(
      items.map((line) => ({
        id: line.id,
        quantity: decimalInput(line.quantity),
        unitPrice: decimalInput(line.unitPrice),
      })),
    );
  } catch {
    invalidPreview = true;
  }
  return (
    <section className="commercial-proposals" aria-label="Cotações comerciais">
      <DraftNavigationGuard dirty={dirty} busy={busy}/>
      <div className="proposal-heading">
        <div>
          <h2>Cotações e propostas</h2>
          <p className="muted">
            Prepare os preços ofertados e mantenha um histórico de versões.
            Revisão interna não significa envio ou aprovação jurídica.
          </p>
        </div>
        <Button
          onClick={start}
          disabled={busy || loading || context.loading || !!context.error}
        >
          Nova cotação
        </Button>
      </div>
      {context.loading ? (
        <Loading />
      ) : context.error ? (
        <ErrorNotice message={context.error} onRetry={context.reload} />
      ) : null}
      {list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <Loading />
      ) : (
        <div className="proposal-saved-list" aria-label="Cotações salvas">
          {!list.data?.length ? (
            <p className="muted">
              Nenhuma cotação salva para esta oportunidade.
            </p>
          ) : (
            list.data.map((row) => (
              <button
                key={row.id}
                disabled={busy || loading}
                onClick={() => open(row.id)}
              >
                <strong>{row.name}</strong>
                <span>
                  Versão {row.currentRevision} ·{" "}
                  {row.state === "REVIEWED"
                    ? "Revisada internamente"
                    : "Rascunho"}{" "}
                  · {row.totals.complete ? "Total" : "Parcial"}:{" "}
                  {moneyExact(row.totals.total)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : !editing && saved ? (
        <>
          <div className="proposal-heading">
            <h3>
              {saved.version.body.name} · versão {saved.version.revision}
            </h3>
            <Button
              disabled={
                busy || !saved.isCurrent || context.loading || !!context.error
              }
              onClick={revise}
            >
              Criar nova versão
            </Button>
          </div>
          <p className="muted">
            {saved.version.body.state === "REVIEWED"
              ? "Revisada internamente"
              : "Rascunho"}{" "}
            · {saved.version.author || "Autor não disponível"} ·{" "}
            {date(saved.version.createdAt, true)}
          </p>
          <p>
            Empresa nesta versão:{" "}
            <strong>
              {saved.version.companySnapshot.details.legalName ||
                saved.version.companySnapshot.name}
            </strong>{" "}
            · CNPJ {saved.version.companySnapshot.cnpj || "não informado"}
          </p>
          {saved.stale && (
            <div role="status" className="info-note">
              {saved.staleReasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              <p>
                Os dados desta versão foram preservados. Confira as fontes antes
                de preparar outra.
              </p>
            </div>
          )}
          <label>
            Versão salva
            <select
              value={saved.version.revision}
              onChange={(e) => open(saved.id, Number(e.target.value))}
            >
              {!saved.versions.some(
                (v) => v.revision === saved.version.revision,
              ) && (
                <option value={saved.version.revision}>
                  Versão {saved.version.revision}
                </option>
              )}
              {saved.versions.map((version) => (
                <option value={version.revision} key={version.revision}>
                  Versão {version.revision} ·{" "}
                  {version.state === "REVIEWED" ? "Revisada" : "Rascunho"}
                </option>
              ))}
            </select>
          </label>
          {saved.versionsHasMore && (
            <div className="proposal-version-lookup">
              <p className="muted">
                A lista mostra as 50 versões recentes. Para consultar uma
                anterior, informe o número. A consulta não altera a versão
                atual.
              </p>
              <label>
                Número da versão
                <input
                  inputMode="numeric"
                  maxLength={7}
                  value={versionNumber}
                  onChange={(event) => setVersionNumber(event.target.value)}
                />
              </label>
              <Button
                type="button"
                disabled={
                  !/^[1-9]\d{0,6}$/.test(versionNumber) ||
                  Number(versionNumber) >
                    Math.min(saved.currentRevision, 1000000)
                }
                onClick={() => open(saved.id, Number(versionNumber))}
              >
                Consultar versão pelo número
              </Button>
              <p className="muted">Versão atual: {saved.currentRevision}</p>
            </div>
          )}
          {!saved.isCurrent && (
            <div className="info-note">
              <p>
                Você está consultando uma versão anterior. Para editar, abra a
                versão atual; as anteriores permanecem preservadas.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => open(saved.id)}
              >
                Abrir versão atual
              </Button>
            </div>
          )}
          <div className="proposal-lines">
            {saved.version.body.items.map((line, index) => (
              <article key={line.id}>
                <h4>
                  Item {line.number || index + 1}
                  {line.lot ? ` · Lote ${line.lot}` : ""}
                </h4>
                <p className="proposal-description">
                  {line.description || "Descrição pendente"}
                </p>
                {line.catalogId && (
                  <p className="muted">
                    Catálogo nesta versão:{" "}
                    {saved.version.catalogSnapshots?.find(
                      (item) => item.id === line.catalogId,
                    )?.name || "Produto vinculado"}{" "}
                    ·{" "}
                    {line.catalogPriceApplied
                      ? "preço de venda aplicado"
                      : "preço manual"}
                  </p>
                )}
                <p>
                  {decimalDisplay(line.quantity) || "Quantidade pendente"}{" "}
                  {line.unit} · Preço ofertado:{" "}
                  {line.unitPrice === null
                    ? "Não informado"
                    : moneyExact(line.unitPrice)}{" "}
                  · Subtotal:{" "}
                  {saved.version.totals.lines.find((t) => t.id === line.id)
                    ?.total === null
                    ? "Não informado"
                    : moneyExact(
                        saved.version.totals.lines.find((t) => t.id === line.id)
                          ?.total || "0.00",
                      )}
                </p>
                {(line.brand || line.model || line.solution) && (
                  <p>
                    {[line.brand, line.model, line.solution]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </article>
            ))}
          </div>
          <dl className="proposal-conditions-view">
            {Object.entries(saved.version.body.conditions).map(
              ([key, value]) => (
                <div key={key}>
                  <dt>
                    {
                      {
                        validity: "Validade",
                        payment: "Pagamento",
                        delivery: "Entrega / execução",
                        observations: "Observações comerciais",
                      }[key]
                    }
                  </dt>
                  <dd>{value || "Não informado"}</dd>
                </div>
              ),
            )}
          </dl>
          <p className="proposal-total">
            {saved.version.totals.complete ? "Total" : "Total parcial"}:{" "}
            {moneyExact(saved.version.totals.total)}
          </p>
        </>
      ) : editing && editContext ? (
        <fieldset disabled={busy||departing} className="proposal-editor">
          <legend>Preparar {saved ? "nova versão" : "cotação"}</legend>
          {saved&&<p className="muted">Esta edição partiu da versão {saved.currentRevision}. Uma nova gravação não altera versões anteriores.</p>}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviewConflict((value) => !value)}
            >
              {conflict?'Conferir versão atual sem descartar rascunho':'Conferir referências da empresa e do edital'}
            </Button>
          {reviewConflict && (
            <Suspense fallback={<Loading />}>
              <ProposalConflictReview
                id={id}
                proposalId={saved?.id || null}
                draft={{ name, items, conditions }}
                originalContext={editContext}
                onClose={() => setReviewConflict(false)}
                onAdopt={next=>{
                  if(busy||departing||next.company.id!==editContext.company.id)return;
                  setEditContext(next);changed();setConflict(false);setReviewConflict(false);attempt.current=null;
                  setMessage('Referências atualizadas no rascunho. Preços e condições preservados; confira novamente os itens e requisitos antes de salvar. A versão-base não foi alterada.');
                }}
              />
            </Suspense>
          )}
          <p>
            Empresa proponente:{" "}
            <strong>
              {editContext.company.details.legalName ||
                editContext.company.name}
            </strong>{" "}
            · CNPJ {editContext.company.cnpj || "não informado"}
          </p>
          <label>
            Nome da cotação
            <input
              value={name}
              maxLength={100}
              onChange={(e) => {
                changed();
                setName(e.target.value);
              }}
            />
          </label>
          <p className="info-note">
            {editContext.selectionNotice} Preço ofertado começa vazio; a
            estimativa publicada não é aplicada à sua proposta.
          </p>
          <div className="proposal-actions">
            <Button type="button" onClick={() => setPicker(!picker)}>
              {picker ? "Fechar seleção" : "Selecionar itens do edital"}
            </Button>
            <Button
              type="button"
              disabled={items.length >= 100}
              onClick={() => {
                changed();
                setItems((previous) => [...previous, manualLine()]);
              }}
            >
              Adicionar item manual
            </Button>
          </div>
          {picker && (
            <OfficialPicker
              id={id}
              page={page}
              query={query}
              setPage={setPage}
              setQuery={setQuery}
              items={items}
              onChange={(lines) => {
                changed();
                setItems(lines);
              }}
            />
          )}
          <p className="muted">
            {items.length} de 100 itens · Vírgula ou ponto decimal, até quatro
            casas, sem separador de milhar. Vazio significa não informado.
          </p>
          <div className="proposal-lines">
            {items.map((line, index) => (
              <article
                key={line.id}
                aria-label={`Linha da proposta ${index + 1}`}
              >
                <div className="proposal-heading">
                  <h4>
                    Item {line.number || index + 1}
                    {line.sourceItem ? " · Fonte PNCP" : " · Manual"}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      changed();
                      setItems((previous) =>
                        previous.filter((item) => item.id !== line.id),
                      );
                    }}
                  >
                    Remover item {line.number || index + 1}
                  </Button>
                </div>
                <div className="proposal-fields">
                  <label>
                    Número
                    <input
                      value={line.number}
                      maxLength={40}
                      onChange={(e) =>
                        setLine(line.id, "number", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Lote (conferir no edital)
                    <input
                      value={line.lot}
                      maxLength={80}
                      onChange={(e) => setLine(line.id, "lot", e.target.value)}
                    />
                  </label>
                  <label>
                    Unidade
                    <input
                      value={line.unit}
                      maxLength={80}
                      onChange={(e) => setLine(line.id, "unit", e.target.value)}
                    />
                  </label>
                  <label>
                    Quantidade
                    <input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        setLine(line.id, "quantity", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Preço unitário ofertado (R$)
                    <input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLine(line.id, "unitPrice", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Marca
                    <input
                      value={line.brand}
                      maxLength={120}
                      onChange={(e) =>
                        setLine(line.id, "brand", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Modelo
                    <input
                      value={line.model}
                      maxLength={120}
                      onChange={(e) =>
                        setLine(line.id, "model", e.target.value)
                      }
                    />
                  </label>
                </div>
                <label>
                  Descrição comercial
                  <textarea
                    value={line.description}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) =>
                      setLine(line.id, "description", e.target.value)
                    }
                  />
                </label>
                <label>
                  Solução / especificação ofertada
                  <textarea
                    value={line.solution}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) =>
                      setLine(line.id, "solution", e.target.value)
                    }
                  />
                </label>
                <div className="proposal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setCatalogLine(catalogLine === line.id ? null : line.id)
                    }
                  >
                    Escolher no catálogo
                  </Button>
                  {line.catalogId && (
                    <>
                      <span className="muted">
                        {line.catalogPriceApplied
                          ? "Preço de venda aplicado"
                          : "Produto vinculado · preço manual"}
                      </span>
                      <span>
                        {catalogNames[line.catalogId] ||
                          "Produto do catálogo salvo nesta versão"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          changed();
                          setItems((previous) =>
                            previous.map((item) =>
                              item.id === line.id
                                ? {
                                    ...item,
                                    catalogId: null,
                                    catalogPriceApplied: false,
                                  }
                                : item,
                            ),
                          );
                        }}
                      >
                        Remover vínculo do catálogo
                      </Button>
                    </>
                  )}
                </div>
                {catalogLine === line.id && (
                  <Suspense fallback={<Loading />}>
                    <ProposalCatalogPicker
                      unit={line.unit}
                      price={line.unitPrice}
                      onClose={() => setCatalogLine(null)}
                      onSelect={(catalogId, price, name) => {
                        changed();
                        setCatalogNames((previous) => ({
                          ...previous,
                          [catalogId]: name,
                        }));
                        setItems((previous) =>
                          previous.map((item) =>
                            item.id === line.id
                              ? {
                                  ...item,
                                  catalogId,
                                  catalogPriceApplied: price !== null,
                                  ...(price !== null
                                    ? { unitPrice: decimalDisplay(price) }
                                    : {}),
                                }
                              : item,
                          ),
                        );
                        setCatalogLine(null);
                      }}
                    />
                  </Suspense>
                )}
              </article>
            ))}
          </div>
          <h3>Condições comerciais</h3>
          <div className="proposal-fields">
            {(["validity", "payment", "delivery"] as const).map((key) => (
              <label key={key}>
                {
                  {
                    validity: "Validade da proposta",
                    payment: "Condição de pagamento",
                    delivery: "Prazo de entrega / execução",
                  }[key]
                }
                <input
                  maxLength={key === "validity" ? 300 : 500}
                  value={conditions[key]}
                  onChange={(e) => {
                    changed();
                    setConditions((previous) => ({
                      ...previous,
                      [key]: e.target.value,
                    }));
                  }}
                />
              </label>
            ))}
          </div>
          <label>
            Observações comerciais (aparecem na proposta)
            <textarea
              rows={3}
              maxLength={1500}
              value={conditions.observations}
              onChange={(e) => {
                changed();
                setConditions((previous) => ({
                  ...previous,
                  observations: e.target.value,
                }));
              }}
            />
          </label>
          <h3>Conferência antes de revisar</h3>
          <div className="proposal-checks">
            {(Object.keys(checks) as (keyof Checks)[]).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) => {
                    setDirty(true);
                    setChecks((previous) => ({
                      ...previous,
                      [key]: e.target.checked,
                    }));
                  }}
                />
                {
                  {
                    selectionAllowed:
                      "Conferi que a seleção de itens/lotes é permitida no edital.",
                    itemsChecked:
                      "Conferi quantidades, unidades e especificações no original.",
                    conditionsChecked:
                      "Conferi as condições comerciais no edital.",
                    zeroPriceAllowed:
                      "Se houver preço zero, conferi que é permitido.",
                  }[key]
                }
              </label>
            ))}
          </div>
          {invalidPreview ? (
            <p role="status">Corrija os números para calcular o total.</p>
          ) : (
            preview && (
              <p className="proposal-total">
                {preview.complete ? "Total" : "Total parcial"}:{" "}
                {moneyExact(preview.total)}
              </p>
            )
          )}
          <div className="proposal-actions">
            <Button
              onClick={() => save("DRAFT")}
              disabled={busy || invalidPreview || !name.trim() || !items.length}
            >
              {busy ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => save("REVIEWED")}
              disabled={busy || invalidPreview || !name.trim() || !items.length}
            >
              Salvar como revisada
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (leave()) {
                  setEditing(false);
                  setDirty(false);
                  setPicker(false);
                }
              }}
            >
              Cancelar edição
            </Button>
          </div>
        </fieldset>
      ) : null}
    </section>
  );
}

function OfficialPicker({
  id,
  page,
  query,
  setPage,
  setQuery,
  items,
  onChange,
}: {
  id: string;
  page: number;
  query: string;
  setPage: (value: number) => void;
  setQuery: (value: string) => void;
  items: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
}) {
  const resource = useResource<ItemPage>(
      `/opportunities/${id}/items?page=${page}`,
    ),
    [error, setError] = useState(""),
    [profileId, setProfileId] = useState(""),
    [interestsOnly, setInterestsOnly] = useState(false);
  const profiles = useResource<ItemSearchProfile[]>("/search-profiles");
  const profile =
    !profiles.loading && !profiles.error
      ? profiles.data?.find(
          (profile) => profile.id === profileId && profile.active,
        )
      : undefined;
  const terms = itemProfileTerms(profile?.filters.terms),
    exclusions = itemProfileTerms(profile?.filters.exclude);
  const matchInterest = useMemo(
    () => createItemInterestMatcher(terms, exclusions),
    [profile],
  );
  const data = resource.data;
  const rows = useMemo(
    () =>
      (data?.items || []).map((item) => ({
        item,
        ...matchInterest(item.description),
        searchable: foldItemText(
          `${item.number} ${item.description} ${item.unit || ""}`,
        ),
      })),
    [data, matchInterest],
  );
  const normalizedQuery = foldItemText(query);
  const visible = rows
    .filter(
      (row) =>
        (!normalizedQuery || row.searchable.includes(normalizedQuery)) &&
        (!interestsOnly || !profile || row.interested),
    )
    .map((row) => row.item);
  const selectedNumbers = new Set(
    items.flatMap((item) => (item.sourceItem ? [item.sourceItem.number] : [])),
  );
  function select(sources: Official[]) {
    setError("");
    const pending = sources.filter(
      (source) => !selectedNumbers.has(source.number),
    );
    if (!pending.length) return;
    try {
      if (items.length + pending.length > 100)
        throw new Error(
          "A seleção ultrapassa 100 itens. Nenhum item novo foi adicionado; reduza a seleção.",
        );
      if (resource.loading || resource.error || !data?.checkedAt || data.stale)
        throw new Error("Atualize a consulta de itens antes de selecioná-los.");
      const lines = pending.map((source) => {
        if (source.description.length > 2000)
          throw new Error(
            `Item ${source.number}: descrição maior que 2.000 caracteres. Prepare uma linha manual após conferir o original; o texto não será cortado.`,
          );
        if ((source.unit || "").length > 80)
          throw new Error(
            `Item ${source.number}: unidade fora do formato aceito. Confira o original e prepare uma linha manual.`,
          );
        let quantity: string | null;
        try {
          quantity =
            source.quantity === null
              ? null
              : decimalInput(String(source.quantity));
          if (quantity === "0") throw new Error("zero");
        } catch {
          throw new Error(
            `Item ${source.number}: quantidade fora do formato aceito. Confira o original e prepare uma linha manual.`,
          );
        }
        return {
          ...manualLine(),
          number: String(source.number),
          description: source.description,
          unit: source.unit || "",
          quantity: decimalDisplay(quantity),
          sourceItem: {
            number: source.number,
            page,
            checkedAt: data.checkedAt!,
          },
        };
      });
      onChange([...items, ...lines]);
    } catch (e) {
      setError(`${(e as Error).message} A seleção anterior foi preservada.`);
    }
  }
  function remove(sources: Official[]) {
    const numbers = new Set(sources.map((source) => source.number));
    const removed = items.filter(
      (item) => item.sourceItem && numbers.has(item.sourceItem.number),
    );
    if (!removed.length) return;
    if (
      removed.some(
        (item) =>
          item.unitPrice.trim() ||
          item.brand ||
          item.model ||
          item.solution ||
          item.catalogId,
      ) &&
      !window.confirm(
        "Remover os itens selecionados desta página e os preços/dados comerciais preenchidos neles? As demais páginas serão preservadas.",
      )
    )
      return;
    setError("");
    onChange(
      items.filter(
        (item) => !item.sourceItem || !numbers.has(item.sourceItem.number),
      ),
    );
  }
  return (
    <section
      className="proposal-picker"
      aria-label="Selecionar itens do edital"
    >
      <h3>Itens publicados · página {page}</h3>
      <p className="muted">
        Nenhum item é selecionado automaticamente. A seleção permanece ao mudar
        de página. Lotes e regras de participação exigem conferência no edital.
      </p>
      <label>
        Pesquisar nesta página
        <input
          type="search"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        Interesses de um perfil
        <select
          aria-label="Interesses de um perfil"
          value={profile?.id || ""}
          disabled={profiles.loading || !!profiles.error}
          onChange={(event) => {
            setProfileId(event.target.value);
            setInterestsOnly(false);
          }}
        >
          <option value="">Sem perfil — mostrar todos</option>
          {(profiles.data || [])
            .filter((profile) => profile.active)
            .map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.name}
              </option>
            ))}
        </select>
      </label>
      {profile && (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={!terms.length}
            aria-pressed={interestsOnly}
            onClick={() => setInterestsOnly((value) => !value)}
          >
            {interestsOnly ? "Mostrar todos" : "Só itens de interesse"}
          </Button>
          <p className="muted">
            {terms.length
              ? `${rows.filter((row) => row.interested).length} itens de interesse nesta página; palavras excluídas têm prioridade.`
              : "Este perfil não tem termos de interesse. Estados, modalidade e portal filtram editais, não especificações dos itens."}{" "}
            A correspondência de palavras não comprova compatibilidade técnica.
            Alterar o filtro não altera sua seleção.
          </p>
        </>
      )}
      {profiles.error && (
        <ErrorNotice
          message="Não foi possível carregar os perfis. Você ainda pode pesquisar e selecionar todos os itens."
          onRetry={profiles.reload}
        />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : (
        data && (
          <>
            {data.notice && <p className="info-note">{data.notice}</p>}
            {data.stale && (
              <Button onClick={resource.reload}>
                Atualizar consulta de itens
              </Button>
            )}
            {data.supported && (
              <>
                <p className="muted">
                  {
                    visible.filter((source) =>
                      selectedNumbers.has(source.number),
                    ).length
                  }{" "}
                  de {visible.length} itens exibidos selecionados ·{" "}
                  {items.length} na cotação
                </p>
                <div className="proposal-actions">
                  <Button
                    type="button"
                    disabled={
                      !!data.stale ||
                      !data.checkedAt ||
                      !visible.some(
                        (source) => !selectedNumbers.has(source.number),
                      )
                    }
                    onClick={() => select(visible)}
                  >
                    Selecionar itens exibidos nesta página
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      !visible.some((source) =>
                        selectedNumbers.has(source.number),
                      )
                    }
                    onClick={() => remove(visible)}
                  >
                    Limpar seleção dos itens exibidos
                  </Button>
                </div>
              </>
            )}
            {data.supported &&
              visible.map((source) => (
                <label className="proposal-source-item" key={source.number}>
                  <input
                    type="checkbox"
                    disabled={!!data.stale || !data.checkedAt}
                    checked={selectedNumbers.has(source.number)}
                    onChange={(e) =>
                      e.target.checked ? select([source]) : remove([source])
                    }
                  />
                  <span>
                    <strong>Item {source.number}</strong>
                    <span className="proposal-description">
                      {source.description}
                    </span>
                    <small>
                      Quantidade: {source.quantity ?? "Não informada"}{" "}
                      {source.unit} · Estimativa unitária:{" "}
                      {source.confidential
                        ? "Sigilosa"
                        : source.estimatedUnit === null
                          ? "Não informada"
                          : new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                              maximumFractionDigits: 4,
                            }).format(source.estimatedUnit)}
                    </small>
                  </span>
                </label>
              ))}
            {data.supported && !visible.length && (
              <p>Nenhum item nesta página corresponde à pesquisa.</p>
            )}
            <div className="proposal-actions">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Página anterior
              </Button>
              <span>Página {page}</span>
              <Button
                disabled={!data.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Próxima página
              </Button>
            </div>
          </>
        )
      )}
    </section>
  );
}
