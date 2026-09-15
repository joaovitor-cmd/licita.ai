import { useEffect, useState, type FormEvent } from "react";
import {EdictGuide,ProcurementJourney} from './EdictGuide';
import {PreparationPanel} from './Preparation';
import {ProcurementItems} from './ProcurementItems';
import {SourceChanges} from './SourceChanges';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { currency, date, safeUrl, send, useResource } from "../api";
import type { DashboardData, Opportunity, Tracking } from "../types";
import { STATES } from "../types";
import {
  BackLink,
  Badge,
  Button,
  CardLink,
  Deadline,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  Score,
  StageBadge,
  useSession,
  useToast,
} from "../ui";
export function OpportunityCard({
  item,
  dense = false,
}: {
  item: Opportunity;
  dense?: boolean;
}) {
  return (
    <Link
      className={`opportunity-card ${dense ? "dense" : ""}`}
      data-tour="opportunity"
      to={`/app/oportunidades/${item.id}`}
    >
      <div className="opportunity-card-top">
        <div className="badge-row">
          <Badge color="blue">
            {item.modality || "Modalidade não informada"}
          </Badge>
          {item.trackingId && (
            <Badge color="purple">
              <Radio size={11} /> No radar
            </Badge>
          )}
          {item.isDemo && <Badge>Demonstração</Badge>}
        </div>
        <Score value={item.match.score} excluded={item.match.excluded} />
      </div>
      <h3>{item.title}</h3>
      <p className="agency">
        <BriefcaseBusiness size={14} />
        {item.agency}
      </p>
      <div className="opportunity-meta">
        <span>
          <MapPin size={14} />
          {[item.city, item.state].filter(Boolean).join(" · ") ||
            "Local não informado"}
        </span>
        <span>
          <CalendarClock size={14} />
          <Deadline value={item.closesAt} />
        </span>
      </div>
      <div className="opportunity-card-bottom">
        <div>
          <span className="overline">VALOR ESTIMADO</span>
          <strong>{currency(item.value)}</strong>
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={19} />
        </span>
      </div>
    </Link>
  );
}
export function DashboardPage() {
  const { data, loading, error, reload } =
    useResource<DashboardData>("/dashboard");
  const { session } = useSession();
  const [distributionMode, setDistributionMode] = useState("state");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!data) return null;
  const distribution =
    distributionMode === "state" ? data.byState : data.byModality;
  const metrics = [
    {
      label: "Oportunidades disponíveis",
      value: data.stats.opportunities.toLocaleString("pt-BR"),
      icon: CompassIcon,
      className: "blue",
      detail: "Abertas para propostas na última informação da fonte",
      link: "/app/oportunidades?status=open",
    },
    {
      label: "Recomendadas para você",
      value: data.stats.recommended.toLocaleString("pt-BR"),
      icon: Target,
      className: "purple",
      detail: `Abertas · aderência a partir de ${data.recommendationMinScore}%`,
      link: `/app/oportunidades?status=open&minScore=${data.recommendationMinScore}`,
    },
    {
      label: "Negócios no radar",
      value: data.stats.tracked.toLocaleString("pt-BR"),
      icon: Radio,
      className: "blue",
      detail: "Participações acompanhadas",
      link: "/app/radar",
    },
    {
      label: "Prazos próximos",
      value: data.stats.urgent.toLocaleString("pt-BR"),
      icon: Clock3,
      className: "amber",
      detail: `Próximos 7 dias · ${data.stats.overdue} prazo(s) vencido(s) à parte`,
      link: "/app/radar",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="SEU CENTRO DE DECISÕES"
        title="Visão geral"
        description={`Olá, ${session.user.name.split(" ")[0]}. Veja o que merece sua atenção hoje.`}
        actions={
          <Link className="button primary" to="/app/oportunidades">
            <Search size={16} /> Explorar oportunidades
          </Link>
        }
      />
      <div className="metrics-grid">
        {metrics.map((m) => (
          <Link className="metric-card" to={m.link} key={m.label}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={`metric-icon ${m.className}`}>
                <m.icon size={18} />
              </span>
            </div>
            <strong className="metric-value">{m.value}</strong>
            <span className="metric-detail">
              {m.detail}
              <ArrowUpRight size={14} />
            </span>
          </Link>
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="focus-banner">
            <div className="focus-icon">
              <TrendingUp size={27} />
            </div>
            <div>
              <span className="eyebrow">TRANSFORME INFORMAÇÃO EM AÇÃO</span>
              <h2>Seu próximo contrato começa aqui.</h2>
              <p>
                {data.stats.tracked
                  ? `${currency(data.stats.potentialValue, true)} em valor potencial no radar. Organize as próximas etapas da sua equipe.`
                  : "Defina seu perfil, descubra oportunidades e prepare sua primeira participação."}
              </p>
              <Link to={data.stats.tracked ? "/app/radar" : "/app/perfil"}>
                {data.stats.tracked
                  ? "Acompanhar meu radar"
                  : "Ajustar meu perfil"}{" "}
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="focus-decoration">
              <span />
              <span />
              <span />
            </div>
          </section>
          <div className="section-heading">
            <div>
              <h2>Oportunidades em destaque</h2>
              <p>Mais relevantes para o perfil da sua empresa</p>
            </div>
            <CardLink to="/app/oportunidades?sort=score">Ver todas</CardLink>
          </div>
          {data.recommended.length ? (
            <div className="opportunity-grid dashboard-opportunities">
              {data.recommended.slice(0, 4).map((item) => (
                <OpportunityCard item={item} key={item.id} dense />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty
                title="Vamos encontrar seu próximo negócio"
                description="Complete seu perfil comercial e sincronize as fontes oficiais para descobrir editais aderentes."
                action={
                  <Link className="button secondary" to="/app/fontes">
                    Ver fontes de dados <ArrowRight size={15} />
                  </Link>
                }
              />
            </div>
          )}
          <section className="card coverage-panel">
            <div className="section-heading">
              <div>
                <h2>
                  {distributionMode === "state"
                    ? "Onde estão as oportunidades"
                    : "Modalidades em destaque"}
                </h2>
                <p>Distribuição dos editais na base consultável</p>
              </div>
              <select
                aria-label="Distribuir oportunidades por"
                value={distributionMode}
                onChange={(e) => setDistributionMode(e.target.value)}
              >
                <option value="state">Estado</option>
                <option value="modality">Modalidade</option>
              </select>
            </div>
            {distribution.length ? (
              <div
                className={`distribution ${distributionMode === "modality" ? "distribution-modalities" : ""}`}
              >
                {distribution.slice(0, 6).map((item) => (
                  <div className="distribution-row" key={item.label}>
                    <span>{item.label || "N/I"}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(3, (item.count / Math.max(...distribution.map((v) => v.count), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{item.count.toLocaleString("pt-BR")}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                A distribuição aparecerá após a primeira coleta.
              </p>
            )}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="card deadline-panel">
            <div className="section-heading">
              <div>
                <h2>Na sua agenda</h2>
                <p>Pendências vencidas e próximos prazos do radar</p>
              </div>
              <CalendarClock size={19} />
            </div>
            {data.deadlines.length ? (
              <div className="agenda-list">
                {data.deadlines.slice(0, 5).map((item) => (
                  <Link
                    className="agenda-item"
                    to={`/app/radar/${item.id}`}
                    key={item.id}
                  >
                    <div className="agenda-date">
                      <strong>
                        {new Date(
                          item.deadline ||
                            item.opportunity.closesAt ||
                            item.createdAt,
                        )
                          .toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit'})}
                      </strong>
                      <span>
                        {new Date(
                          item.deadline ||
                            item.opportunity.closesAt ||
                            item.createdAt,
                        )
                          .toLocaleString("pt-BR", { month: "short",timeZone:'America/Sao_Paulo' })
                          .replace(".", "")}
                      </span>
                    </div>
                    <div>
                      <h3>{item.opportunity.title}</h3>
                      <StageBadge stage={item.stage} />
                      <p className="muted">{item.deadline ? 'Prazo interno' : 'Encerramento das propostas'} · {date(item.deadline || item.opportunity.closesAt,true)}{new Date(item.deadline || item.opportunity.closesAt || '').getTime()<Date.now() ? ' · Vencido' : ''}</p>
                    </div>
                    <ChevronRight size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <CalendarClock size={27} />
                <strong>Agenda livre por enquanto</strong>
                <p>Os prazos das suas participações aparecerão aqui.</p>
              </div>
            )}
            <CardLink to="/app/radar">Abrir meu radar</CardLink>
          </section>
          <section className="card activity-panel">
            <div className="section-heading">
              <div>
                <h2>Últimos movimentos</h2>
                <p>O que aconteceu no workspace</p>
              </div>
            </div>
            {data.activity.length ? (
              <div className="activity-list">
                {data.activity.slice(0, 5).map((item) => (
                  <div className="activity-item" key={item.id}>
                    <span className="activity-node" />
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <time>{date(item.createdAt, true)}</time>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Suas ações serão registradas aqui para acompanhar a evolução da
                operação.
              </p>
            )}
          </section>
          <Link to="/app/fontes" className="data-health">
            <span className={`health-dot ${data.lastSync ? "" : "waiting"}`} />
            <div>
              <strong>
                {data.lastSync
                  ? "Dados sincronizados"
                  : "Configure sua primeira coleta"}
              </strong>
              <span>
                {data.lastSync
                  ? `Última coleta: ${date(data.lastSync, true)}`
                  : "Conecte as fontes oficiais do seu mercado"}
              </span>
            </div>
            <ArrowUpRight size={16} />
          </Link>
        </aside>
      </div>
    </>
  );
}
function CompassIcon({ size }: { size?: number }) {
  return <BriefcaseBusiness size={size} />;
}
type OpportunityResult = {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};
export function OpportunitiesPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || ""),
    [advanced, setAdvanced] = useState(false);
  const { data, loading, error, reload } = useResource<OpportunityResult>(
    `/opportunities?${params.toString()}`,
  );
  useEffect(() => setQuery(params.get("q") || ""), [params]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const count = [...params.keys()].filter(
    (k) => !["q", "sort", "page", "pageSize"].includes(k),
  ).length;
  function search(e: FormEvent) {
    e.preventDefault();
    update("q", query);
  }
  return (
    <>
      <PageHeader
        eyebrow="DESCOBERTA INTELIGENTE"
        title="Oportunidades"
        description="Encontre os editais que fazem sentido para o seu negócio."
        actions={
          <Link className="button secondary" to="/app/perfil">
            <SlidersHorizontal size={16} /> Ajustar perfil
          </Link>
        }
      />
      <div className="search-panel card">
        <form className="opportunity-search" onSubmit={search}>
          <Search size={21} />
          <input
            aria-label="Buscar oportunidades"
            placeholder="Busque por objeto, palavra-chave ou órgão público"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label="Limpar busca"
              onClick={() => {
                setQuery("");
                update("q", "");
              }}
            >
              <X size={16} />
            </button>
          )}
          <Button type="submit">Buscar</Button>
        </form>
        <div className="filter-bar">
          <select
            aria-label="Filtrar por estado"
            value={params.get("state") || ""}
            onChange={(e) => update("state", e.target.value)}
          >
            <option value="">Todos os estados</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por modalidade"
            value={params.get("modality") || ""}
            onChange={(e) => update("modality", e.target.value)}
          >
            <option value="">Todas as modalidades</option>
            {[
              "Pregão eletrônico",
              "Concorrência",
              "Dispensa",
              "Credenciamento",
              "Concurso",
              "Leilão",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por compatibilidade"
            value={params.get("minScore") || ""}
            onChange={(e) => update("minScore", e.target.value)}
          >
            <option value="">Qualquer compatibilidade</option>
            <option value="60">A partir de 60%</option>
            <option value="80">A partir de 80%</option>
            {params.has('minScore') && !['60','80',''].includes(params.get('minScore')!) && <option value={params.get('minScore')!}>A partir de {params.get('minScore')}%</option>}
          </select>
          <button
            className={`filter-toggle ${advanced ? "selected" : ""}`}
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            <SlidersHorizontal size={15} /> Mais filtros
            {count > 0 && <span>{count}</span>}
          </button>
          {count > 0 && (
            <button
              className="clear-filters"
              onClick={() => setParams(query ? { q: query } : {})}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {advanced && (
          <div className="advanced-filters">
            <Field label="Município">
              <input
                value={params.get("city") || ""}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Nome do município"
              />
            </Field>
            <Field label="Órgão">
              <input
                value={params.get("agency") || ""}
                onChange={(e) => update("agency", e.target.value)}
                placeholder="Nome do órgão"
              />
            </Field>
            <Field label="Fonte">
              <select
                value={params.get("source") || ""}
                onChange={(e) => update("source", e.target.value)}
              >
                <option value="">Todas as fontes</option>
                <option value="pncp">PNCP</option>
                <option value="comprasgov">Compras.gov.br</option>
              </select>
            </Field>
            <Field label="Situação das propostas">
              <select
                value={params.get("status") || ""}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="">Todas as situações</option>
                <option value="open">Recebendo propostas</option>
                <option value="closed">Prazo encerrado</option>
              </select>
            </Field>
            <Field label="Valor mínimo (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={params.get("minValue") || ""}
                onChange={(e) => update("minValue", e.target.value)}
              />
            </Field>
            <Field label="Valor máximo (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={params.get("maxValue") || ""}
                onChange={(e) => update("maxValue", e.target.value)}
              />
            </Field>
            <Field label="Publicado a partir de">
              <input
                type="date"
                value={params.get("from") || ""}
                onChange={(e) => update("from", e.target.value)}
              />
            </Field>
            <Field label="Publicado até">
              <input
                type="date"
                value={params.get("to") || ""}
                onChange={(e) => update("to", e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
      <div className="results-toolbar">
        <p>
          <strong>{data?.total.toLocaleString("pt-BR") || "0"}</strong>{" "}
          oportunidades encontradas
          {params.get("q") && (
            <>
              {" "}
              para <strong>“{params.get("q")}”</strong>
            </>
          )}
        </p>
        <div>
          <span>Ordenar por</span>
          <select
            aria-label="Ordenar oportunidades"
            value={params.get("sort") || "score"}
            onChange={(e) => update("sort", e.target.value)}
          >
            <option value="score">Maior compatibilidade</option>
            <option value="newest">Mais recentes</option>
            <option value="deadline">Prazo mais próximo</option>
            <option value="value">Maior valor</option>
          </select>
        </div>
      </div>
      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : loading ? (
        <Loading label="Buscando oportunidades…" />
      ) : data?.items.length ? (
        <>
          <div className="opportunity-grid">
            {data.items.map((item) => (
              <OpportunityCard item={item} key={item.id} />
            ))}
          </div>
          <div className="pagination">
            <span>
              Página {data.page} de {Math.max(1, data.pages)} · {data.total}{" "}
              resultados
            </span>
            <div>
              <Button
                variant="secondary"
                disabled={data.page <= 1}
                onClick={() => update("page", `${data.page - 1}`)}
              >
                <ChevronLeft size={16} /> Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={data.page >= data.pages}
                onClick={() => update("page", `${data.page + 1}`)}
              >
                Próxima <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <Empty
            title="Nenhum edital por aqui ainda"
            description={
              params.toString()
                ? "Experimente ajustar os termos ou ampliar os filtros para encontrar outras oportunidades."
                : "A base está pronta para receber dados. Configure seu perfil e inicie uma coleta nas fontes oficiais."
            }
            action={
              <Link className="button secondary" to="/app/fontes">
                Gerenciar fontes <ArrowRight size={16} />
              </Link>
            }
          />
        </div>
      )}
      <p className="page-note">
        <CircleHelp size={14} /> A compatibilidade é uma análise por regras do
        perfil e catálogo, não uma garantia de habilitação.
      </p>
    </>
  );
}
export function OpportunityPage() {
  const [detailParams]=useSearchParams();
  const { id } = useParams(),
    navigate = useNavigate();
  const {
    data: item,
    loading,
    error,
    reload,
  } = useResource<Opportunity>(`/opportunities/${id}`);
  const [busy, setBusy] = useState(false),
    [tab, setTab] = useState(detailParams.get('tab')==='mudancas'?'mudancas':'analise'),
    [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  useEffect(()=>{if(detailParams.get('tab')==='mudancas')setTab('mudancas');},[detailParams,id]);
  useEffect(()=>{if(item&&!loading&&!error)window.dispatchEvent(new Event('opportunity-viewed'));},[item?.id,loading,error]);
  async function refreshOfficial() {
    if (!item) return;
    setRefreshing(true);
    try {
      await send(`/opportunities/${item.id}/refresh`, "POST", {});
      reload();
      toast("Dados e anexos conferidos na fonte.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setRefreshing(false);
    }
  }
  async function track() {
    if (!item) return;
    setBusy(true);
    try {
      const tracking = await send<Tracking>("/trackings", "POST", {
        opportunityId: item.id,
      });
      toast("Oportunidade adicionada ao seu radar.");
      navigate(`/app/radar/${tracking.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!item) return null;
  return (
    <>
      <BackLink to="/app/oportunidades">Todas as oportunidades</BackLink>
      <div className="detail-heading">
        <div className="badge-row">
          <Badge color="blue">
            {item.modality || "Modalidade não informada"}
          </Badge>
          <Badge>{item.sourceName}</Badge>
          {item.isDemo && <Badge color="amber">Dados de demonstração</Badge>}
        </div>
        <h1>{item.title}</h1>
        <p className="agency">
          <BriefcaseBusiness size={16} />
          {item.agency}
        </p>
      </div>
      <PreparationPanel opportunityId={item.id}/>
      <ProcurementJourney item={item}/>
      <div className="detail-layout">
        <div>
          <div className="detail-summary-grid">
            <div className="card">
              <span className="overline">VALOR ESTIMADO</span>
              <strong>{currency(item.value)}</strong>
            </div>
            <div className="card">
              <span className="overline">ENCERRAMENTO DAS PROPOSTAS</span>
              <strong>
                <Deadline value={item.closesAt} />
              </strong>
            </div>
            <div className="card">
              <span className="overline">LOCALIZAÇÃO</span>
              <strong>
                {[item.city, item.state].filter(Boolean).join(" / ") ||
                  "Não informada"}
              </strong>
            </div>
          </div>
          <section className="card detail-body">
            <div
              className="tabs"
              role="tablist"
              aria-label="Informações do edital"
            >
              {[
                { id: "analise", label: "Entender e conferir" },
                { id: "resumo", label: "Visão do edital" },
                { id: "itens", label: "Itens e valores" },
                { id: "mudancas", label: "Mudanças e relações" },
                {
                  id: "documentos",
                  label: `Anexos (${item.documents.length})`,
                },
                { id: "aderencia", label: "Compatibilidade" },
              ].map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t.id}
                  key={t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tab-content" role="tabpanel">
              {tab === "mudancas" ? <SourceChanges key={item.id} id={item.id}/> : tab === "itens" ? <ProcurementItems key={item.id} id={item.id}/> : tab === "analise" ? <EdictGuide item={item}/> : tab === "resumo" ? (
                <>
                  <h2>Objeto da contratação</h2>
                  <p className="long-copy">{item.description || item.title}</p>
                  <h2>Informações da publicação</h2>
                  <dl className="detail-fields">
                    <div>
                      <dt>Órgão contratante</dt>
                      <dd>{item.agency}</dd>
                    </div>
                    <div>
                      <dt>Esfera</dt>
                      <dd>{item.sphere || "Não informada"}</dd>
                    </div>
                    <div>
                      <dt>Modalidade</dt>
                      <dd>{item.modality || "Não informada"}</dd>
                    </div>
                    <div>
                      <dt>Situação na fonte</dt>
                      <dd>{item.status || "Não informada"}</dd>
                    </div>
                    <div>
                      <dt>Publicação</dt>
                      <dd>{date(item.publishedAt)}</dd>
                    </div>
                    <div>
                      <dt>Abertura das propostas</dt>
                      <dd>{date(item.opensAt, true)}</dd>
                    </div>
                    <div>
                      <dt>Encerramento das propostas</dt>
                      <dd>{date(item.closesAt, true)}</dd>
                    </div>
                    <div>
                      <dt>Identificador de origem</dt>
                      <dd className="mono">{item.canonicalKey}</dd>
                    </div>
                  </dl>
                </>
              ) : tab === "documentos" ? (
                <>
                  <h2>Documentos publicados</h2>
                  {item.attachmentWarning && <p role="status" className="info-note">{item.attachmentWarning}</p>}
                  <p className="muted">
                    Arquivos disponibilizados pelo órgão no portal de origem.
                  </p>
                  {item.documents.length ? (
                    <div className="document-links">
                      {item.documents.map((doc, i) => (
                        <a
                          key={`${doc.url}-${i}`}
                          href={safeUrl(doc.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="file-icon">
                            <FileText size={21} />
                          </span>
                          <div>
                            <strong>{doc.name}</strong>
                            <span>Abrir documento na fonte oficial</span>
                          </div>
                          <ExternalLink size={17} />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Nenhum anexo retornado pela fonte"
                      description="Confira diretamente o portal de origem. A ausência de anexos na plataforma não significa que o edital não tenha documentos."
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="match-heading">
                    <div>
                      <h2>Por que este edital aparece para você?</h2>
                      <p>Análise transparente, baseada em regras.</p>
                    </div>
                    <Score
                      value={item.match.score}
                      excluded={item.match.excluded}
                    />
                  </div>
                  <ul className="reason-list">
                    {item.match.reasons.map((reason, i) => (
                      <li key={i}>
                        <Check size={17} />
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {!item.match.reasons.length && (
                    <p className="muted">
                      Nenhum critério positivo identificado. Complete o perfil e
                      o catálogo para melhorar a recomendação.
                    </p>
                  )}
                  <div className="info-note">
                    <CircleHelp size={17} />
                    <p>
                      A pontuação considera seu perfil comercial e catálogo. Não
                      é uma análise jurídica nem substitui a conferência de
                      requisitos técnicos, habilitação e documentos.
                    </p>
                  </div>
                  <Link className="text-link" to="/app/perfil">
                    Revisar critérios do perfil <ArrowRight size={15} />
                  </Link>
                </>
              )}
            </div>
          </section>
        </div>
        <aside className="detail-aside">
          <section className="card next-step-card">
            <span className="eyebrow">PRÓXIMA AÇÃO</span>
            <h2>Transforme em uma participação.</h2>
            <p>
              Organize análise, documentos, tarefas e prazos em um workspace
              dedicado a este edital.
            </p>
            <Score value={item.match.score} excluded={item.match.excluded} />
            <p className="muted small">Aderência é a afinidade com seu perfil comercial, não a comprovação de que sua empresa atende ao edital.</p>
            <Link className="button secondary full-width" to={`/app/simulador?opportunityId=${item.id}`}>Simular viabilidade</Link>
            {item.trackingId ? (
              <Link
                className="button primary full-width"
                to={`/app/radar/${item.trackingId}`}
              >
                <Radio size={17} /> Abrir no meu radar
              </Link>
            ) : (
              <Button data-tour="track" className="full-width" onClick={track} busy={busy}>
                <Radio size={17} /> Adicionar ao radar
              </Button>
            )}
            {safeUrl(item.url) ? (
              <a
                className="button secondary full-width"
                href={safeUrl(item.url)}
                target="_blank"
                rel="noreferrer"
              >
                Ver no portal oficial <ExternalLink size={15} />
              </a>
            ) : (
              <p className="muted small">
                A fonte não informou um endereço oficial.
              </p>
            )}
          </section>
          <div className="info-note">
            <ShieldNotice />
            <p>
              O envio de propostas e documentos acontece no portal oficial, após
              revisão da sua equipe.
            </p>
          </div>
          <section className="source-footnote">
            <span className="overline">ORIGEM E ATUALIZAÇÃO</span>
            <strong>{item.sourceName}</strong>
            {!item.isDemo && (
              <Button
                variant="secondary"
                busy={refreshing}
                onClick={refreshOfficial}
              >
                Atualizar dados e anexos
              </Button>
            )}
            <p>
              Última sincronização
              <br />
              {date(item.syncedAt, true)}
            </p>
            <Link to="/app/fontes">
              Consultar saúde das fontes <ArrowUpRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
function ShieldNotice() {
  return <FileText size={19} />;
}
