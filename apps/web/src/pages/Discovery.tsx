import { lazy, Suspense, useEffect, useId, useState, type FormEvent } from "react";
const CommercialProposals = lazy(() => import('./CommercialProposals'));
import {EdictGuide} from './EdictGuide';
import {ProcurementItems} from './ProcurementItems';
import {SourceChanges} from './SourceChanges';
import {SavedSearches} from './SavedSearches';
import {ActivityItem} from '../ActivityItem';
import {HighlightedText} from '../HighlightedText';
import {textPreview,proposalDateNotice} from '../opportunity-reading';
import {searchFilterSummary,removeSearchFilter,clearSearchFilters} from '../search-filter-summary';
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
  highlightTerms = [],
}: {
  item: Opportunity;
  dense?: boolean;
  highlightTerms?: string[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [trackingId, setTrackingId] = useState(item.trackingId);
  const [objectExpanded,setObjectExpanded]=useState(false);
  const objectId=useId(),preview=textPreview(item.title.trim()||'Objeto não informado'),statusPreview=textPreview(item.status?.trim()||'Situação não informada pelo portal',120);
  const dateNotice=proposalDateNotice(item.opensAt,item.closesAt);
  useEffect(()=>setObjectExpanded(false),[item.id,item.title]);
  useEffect(() => setTrackingId(item.trackingId), [item.id, item.trackingId]);
  async function addToRadar() {
    if (adding) return;
    setAdding(true);
    try {
      const result = await send<Tracking>('/trackings', 'POST', { opportunityId: item.id });
      setTrackingId(result.id);
      window.dispatchEvent(new Event('radar-added'));
      toast('Oportunidade adicionada ao radar.');
      navigate(`/app/radar?highlight=${encodeURIComponent(result.id)}`);
    } catch (e) { toast((e as Error).message, true); }
    finally { setAdding(false); }
  }
  if (dense) return (
    <article className="opportunity-card discovery-card dense">
      <div className="opportunity-card-top"><div className="badge-row"><Badge color="blue">{item.modality || "Modalidade não informada"}</Badge>{trackingId&&<Badge color="purple"><Radio size={11}/> No radar</Badge>}</div><Score value={item.match.score} excluded={item.match.excluded}/></div>
      <Link data-tour="opportunity" className="opportunity-title-link" to={`/app/oportunidades/${item.id}`}><h3 title={item.title}>{item.title}</h3></Link>
      <p className="agency"><BriefcaseBusiness size={14}/>{item.agency}</p>
      <div className="opportunity-meta"><span><MapPin size={14}/>{[item.city,item.state].filter(Boolean).join(" · ")||"Local não informado"}</span><span><CalendarClock size={14}/><strong>Propostas até</strong> {date(item.closesAt,true)}</span></div>
      <div className="opportunity-card-bottom"><div><span className="overline">VALOR ESTIMADO</span><strong>{currency(item.value)}</strong></div><Link className="card-arrow" to={`/app/oportunidades/${item.id}`} aria-label={`Abrir ${item.title}`}><ArrowUpRight size={19}/></Link></div>
    </article>
  );
  return <article className="opportunity-card discovery-card discovery-list-card">
    <div className="discovery-location"><BriefcaseBusiness size={15}/><strong><HighlightedText text={item.agency||"Órgão não informado"} terms={highlightTerms}/></strong><span>{[item.city,item.state].filter(Boolean).join(" · ")||"Localidade não informada"}</span></div>
    <div className="discovery-tags"><Badge color={item.sourceCode==='pncp'?'green':'teal'}>{item.sourceName||item.sourceCode||'Portal não informado'}</Badge><Badge color="blue">{item.modality||'Modalidade não informada'}</Badge><Badge color={item.capag?'purple':'slate'}>{item.capag?`CAPAG ${item.capag}`:'CAPAG não disponível'}</Badge>{trackingId&&<Badge color="purple"><Radio size={11}/> No radar</Badge>}<Score value={item.match.score} excluded={item.match.excluded}/></div>
    <div className="discovery-object-label">OBJETO DA CONTRATAÇÃO</div>
    <Link id={objectId} data-tour="opportunity" className="opportunity-title-link discovery-object" to={`/app/oportunidades/${item.id}`}><h3><HighlightedText text={objectExpanded?item.title:preview.text} terms={highlightTerms}/></h3></Link>
    {preview.truncated&&<button type="button" className="discovery-object-toggle" aria-expanded={objectExpanded} aria-controls={objectId} onClick={()=>setObjectExpanded(value=>!value)}>{objectExpanded?'Recolher objeto':'Ler objeto completo'}</button>}
    <div className="discovery-facts">
      <div><span>Edital</span><strong>{item.editalNumber||'Não informado'}</strong></div>
      <div><span>UASG</span><strong>{item.uasg||'Não informada'}</strong></div>
      <div><span>Publicação</span><strong>{date(item.publishedAt)}</strong></div>
      <div><span>Abertura das propostas</span><strong>{date(item.opensAt,true)}</strong></div>
      <div><span>Encerramento das propostas</span><strong>{date(item.closesAt,true)}</strong></div>
      <div><span>Valor estimado do edital</span><strong>{currency(item.value)}</strong></div>
    </div>
    <div className="discovery-source-status"><span>Situação na última coleta</span><strong>{statusPreview.text}</strong>{dateNotice&&<small>{dateNotice}</small>}</div>
    <details className="discovery-source-context"><summary>Sobre os dados deste edital</summary>{statusPreview.truncated&&<p>Situação informada pelo portal: {item.status}</p>}<p>Datas e situação refletem a última coleta, não uma confirmação em tempo real. Confira mudanças e possibilidade de participação no portal oficial.</p><p>Abertura é o início informado para propostas, não necessariamente o horário da sessão de disputa. O valor exibido é a estimativa do órgão, não sua cotação nem o resultado da licitação. Horários de Brasília.</p></details>
    <div className="discovery-list-footer"><span className="licitaro-code"><small>CÓDIGO LICITARO</small>{item.publicCode?<button type="button" className="licitaro-copy" aria-label={`Copiar código Licitaro ${item.publicCode}`} onClick={async()=>{try{await navigator.clipboard.writeText(item.publicCode!);toast('Código Licitaro copiado.');}catch{toast('Não foi possível copiar. Selecione o código e copie manualmente.',true);}}}>{item.publicCode}</button>:<strong>Não disponível</strong>}<small>Consultado em {date(item.syncedAt,true)}</small></span>
      <div className="discovery-actions">{trackingId?<Link className="button primary radar-action" to={`/app/radar?highlight=${encodeURIComponent(trackingId)}`}><Radio size={15}/> Ver no quadro</Link>:<Button className="radar-action" onClick={addToRadar} busy={adding}><Radio size={15}/> Adicionar ao radar</Button>}<Link className="button secondary detail-action" to={`/app/oportunidades/${item.id}`}><FileText size={14}/> Ver edital</Link>{!item.isDemo&&safeUrl(item.url)&&<a className="button ghost source-action" href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Portal oficial</a>}</div>
    </div>
    {!!item.matchedSearchProfiles?.length&&<details className="discovery-relevance"><summary>Encontrado por {item.matchedSearchProfiles.length} {item.matchedSearchProfiles.length===1?'perfil':'perfis'} de busca</summary><ul>{item.matchedSearchProfiles.map(profile=><li key={profile.id}>{profile.name}</li>)}</ul><p>Correspondência aos filtros salvos. A aderência continua baseada no perfil comercial da empresa.</p></details>}
    <details className="discovery-relevance"><summary>Por que apareceu para mim?</summary><ul>{item.match.reasons.length?item.match.reasons.map((reason,index)=><li key={index}>{reason}</li>):<li>Resultado dos filtros atuais. Confira os requisitos antes de decidir participar.</li>}</ul><p>Aderência ao perfil não comprova conformidade técnica.</p></details>
  </article>;
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
                  <ActivityItem key={item.id} item={item}/>
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
  searchProfiles?: {id:string;name:string;revision:number}[];
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
  const appliedQuery=params.get('q')||'';
  useEffect(() => setQuery(appliedQuery), [appliedQuery]);
  useEffect(()=>{
    // A rapid Back/Forward can skip the intermediate router render. Restore
    // directly on a history traversal; normal filter pushes preserve the draft.
    const restore=()=>setQuery(new URLSearchParams(window.location.search).get('q')||'');
    window.addEventListener('popstate',restore);
    return()=>window.removeEventListener('popstate',restore);
  },[]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "state") next.delete("states");
    if (key === "modality") next.delete("modalities");
    if (key === "source") next.delete("sources");
    setParams(next);
  };
  const activeFilters=searchFilterSummary(params,data?.searchProfiles),count=activeFilters.length;
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
        actions={<div className="header-actions discovery-header-actions"><Link className="button secondary" to="/app/monitoramentos">Monitorar órgãos</Link><SavedSearches params={params} onApply={setParams}/><Link className="button secondary" to="/app/perfil"><SlidersHorizontal size={16}/> Ajustar perfil</Link></div>}
      />
      <div className="search-panel card">
        <form className="opportunity-search" onSubmit={search}>
          <Search size={21} />
          <input
            aria-label="Buscar oportunidades"
            placeholder="Busque por objeto, órgão ou código Licitaro (ex.: LC-00012345)"
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
        <div className="filter-bar compact-filter-bar">
          <button
            className={`filter-toggle ${advanced ? "selected" : ""}`}
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            <SlidersHorizontal size={15} /> Filtros adicionais
            {count > 0 && <span>{count}</span>}
          </button>
          {count > 0 && (
            <button
              className="clear-filters"
              onClick={() => setParams(clearSearchFilters(params))}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {!!count&&<section className="active-search-filters" aria-label="Filtros aplicados"><ul>{activeFilters.map(filter=><li key={filter.id}><span>{filter.label}: {filter.preview}</span><button type="button" aria-label={`Remover filtro: ${filter.label}`} onClick={()=>setParams(removeSearchFilter(params,filter))}><X size={13}/></button></li>)}</ul><details><summary>Ver filtros completos</summary><dl>{activeFilters.map(filter=><div key={filter.id}><dt>{filter.label}</dt><dd>{filter.value}</dd></div>)}</dl><p>Remover ou ajustar filtros nesta busca não altera o perfil salvo. Aderência é ao perfil comercial da empresa, não garantia de habilitação.</p></details></section>}
        {advanced && (
          <div className="advanced-filters">
            <Field label="Termos de interesse" hint="Qualquer termo, separado por vírgula."><input maxLength={2000} value={params.get('terms')||''} onChange={e=>update('terms',e.target.value)}/></Field>
            <Field label="Excluir termos" hint="Separe por vírgula."><input maxLength={2000} value={params.get('exclude')||''} onChange={e=>update('exclude',e.target.value)}/></Field>
            <Field label="Estado"><select aria-label="Filtrar por estado" value={params.get('states')?'__multi':params.get('state')||''} onChange={e=>update('state',e.target.value)}><option value="">Todos os estados</option>{params.get('states')&&<option value="__multi" disabled>Estados: {params.get('states')}</option>}{STATES.map(s=><option key={s}>{s}</option>)}</select></Field>
            <Field label="Modalidade"><select aria-label="Filtrar por modalidade" value={params.get('modalities')?'__multi':params.get('modality')||''} onChange={e=>update('modality',e.target.value)}><option value="">Todas as modalidades</option>{params.get('modalities')&&<option value="__multi" disabled>{params.get('modalities')}</option>}{['Pregão eletrônico','Concorrência','Dispensa','Credenciamento','Concurso','Leilão'].map(s=><option key={s}>{s}</option>)}</select></Field>
            <Field label="Aderência mínima"><select aria-label="Filtrar por compatibilidade" value={params.get('minScore')||''} onChange={e=>update('minScore',e.target.value)}><option value="">Qualquer compatibilidade</option><option value="60">A partir de 60%</option><option value="80">A partir de 80%</option>{params.has('minScore')&&!['60','80',''].includes(params.get('minScore')!)&&<option value={params.get('minScore')!}>A partir de {params.get('minScore')}%</option>}</select></Field>
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
                value={params.get('sources')?'__multi':params.get("source") || ""}
                onChange={(e) => update("source", e.target.value)}
              >
                <option value="">Todas as fontes</option>
                {params.get('sources')&&<option value="__multi" disabled>Portais: {params.get('sources')}</option>}
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
          <div className="opportunity-grid opportunity-list">
            {data.items.map((item) => (
              <OpportunityCard item={item} key={item.id} highlightTerms={[...(params.get('terms')||'').split(','),...(params.get('q')||'').split(/\s+/)]}/>
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
    [proposalDirty,setProposalDirty] = useState(false),
    [proposalBusy,setProposalBusy] = useState(false),
    [tab, setTab] = useState(['mudancas','propostas','itens'].includes(detailParams.get('tab')||'')?detailParams.get('tab')!:'analise'),
    [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  useEffect(()=>{if(['mudancas','propostas','itens'].includes(detailParams.get('tab')||''))setTab(detailParams.get('tab')!);},[detailParams,id]);
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
      window.dispatchEvent(new Event('radar-added'));
      navigate(`/app/radar?highlight=${encodeURIComponent(tracking.id)}`);
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
                { id: "propostas", label: "Cotações" },
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
                  disabled={proposalBusy&&tab!==t.id}
                  key={t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => {if(t.id===tab||!proposalDirty||window.confirm('Descartar as alterações ainda não salvas nesta cotação?'))setTab(t.id);}}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tab-content" role="tabpanel">
              {tab === "propostas" ? <Suspense fallback={<Loading/>}><CommercialProposals key={item.id} id={item.id} onDirtyChange={setProposalDirty} onBusyChange={setProposalBusy}/></Suspense> : tab === "mudancas" ? <SourceChanges key={item.id} id={item.id}/> : tab === "itens" ? <ProcurementItems key={item.id} id={item.id}/> : tab === "analise" ? <EdictGuide item={item}/> : tab === "resumo" ? (
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
                      <dd className="mono">{item.publicCode||'Não disponível'}</dd>
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
