import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Columns3,
  Download,
  ExternalLink,
  FileStack,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { currency, date, dateInput, dateTimeInput, safeUrl, send, useResource } from "../api";
import type { Member, Stage, Task, Tracking } from "../types";
import { STAGES } from "../types";
import {
  BackLink,
  Badge,
  Button,
  CheckRow,
  Deadline,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeader,
  Score,
  StageBadge,
  useToast,
} from "../ui";
export function RadarPage() {
  const { data, loading, error, reload } =
    useResource<Tracking[]>("/trackings");
  const members = useResource<Member[]>("/members");
  const [view, setView] = useState("board"),
    [q, setQ] = useState(""),
    [owner, setOwner] = useState(""),
    [archived, setArchived] = useState(false);
  const items = (data || []).filter(
    (t) =>
      (!q ||
        `${t.opportunity.title} ${t.opportunity.agency}`
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (!owner || t.ownerId === owner),
  );
  const active = (data || []).filter(
    (t) => !["WON", "LOST", "DISCARDED"].includes(t.stage),
  );
  const stages = archived ? STAGES : STAGES.slice(0, 5);
  return (
    <>
      <PageHeader
        eyebrow="GESTÃO DE PARTICIPAÇÕES"
        title="Meu radar"
        description="Da primeira análise ao resultado. Tudo o que sua equipe precisa acompanhar."
        actions={
          <Link className="button primary" to="/app/oportunidades">
            <Plus size={17} /> Adicionar oportunidade
          </Link>
        }
      />
      <div className="radar-summary">
        <div>
          <span className="overline">EM ANDAMENTO</span>
          <strong>
            {active.length} <small>participações</small>
          </strong>
        </div>
        <div>
          <span className="overline">VALOR POTENCIAL EM ANDAMENTO</span>
          <strong>
            {currency(
              active.reduce(
                (sum, t) => sum + (t.expectedValue ?? t.opportunity.value ?? 0),
                0,
              ),
              true,
            )}
          </strong>
        </div>
        <div>
          <span className="overline">TAREFAS PENDENTES</span>
          <strong>
            {active.reduce(
              (sum, t) => sum + t.tasks.filter((task) => !task.done).length,
              0,
            )}{" "}
            <small>próximas ações</small>
          </strong>
        </div>
      </div>
      <div className="radar-toolbar">
        <div className="input-with-icon">
          <Search size={16} />
          <input
            aria-label="Buscar no radar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar no radar…"
          />
        </div>
        <select
          aria-label="Filtrar responsável"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">Todos os responsáveis</option>
          {members.data?.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <CheckRow checked={archived} onChange={setArchived}>
          Incluir perdidas e descartadas
        </CheckRow>
        <div className="view-toggle">
          <button
            aria-label="Visualização em quadro"
            aria-pressed={view === "board"}
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <Columns3 size={17} />
          </button>
          <button
            aria-label="Visualização em lista"
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data?.length ? (
        <div className="card">
          <Empty
            icon={<Radio size={31} />}
            title="Dê o primeiro passo para um novo contrato"
            description="Adicione um edital ao radar para acompanhar a análise, distribuir tarefas e preparar sua participação."
            action={
              <Link className="button primary" to="/app/oportunidades">
                Descobrir oportunidades <ArrowRight size={16} />
              </Link>
            }
          />
        </div>
      ) : view === "board" ? (
        <div className="kanban" aria-label="Quadro de participações por etapa">
          {stages.map((stage) => {
            const column = items.filter((t) => t.stage === stage.value);
            return (
              <section
                className={`kanban-column column-${stage.color}`}
                key={stage.value}
              >
                <div className="column-heading">
                  <h2>
                    <span />
                    {stage.short}
                    <i>{column.length}</i>
                  </h2>
                  <span>
                    {currency(
                      column.reduce(
                        (sum, t) =>
                          sum + (t.expectedValue ?? t.opportunity.value ?? 0),
                        0,
                      ),
                      true,
                    )}
                  </span>
                </div>
                <div className="kanban-cards">
                  {column.map((t) => (
                    <Link
                      className="kanban-card"
                      key={t.id}
                      to={`/app/radar/${t.id}`}
                    >
                      <div className="kanban-card-top">
                        <Badge>{t.opportunity.state || "BR"}</Badge>
                        <span>{t.opportunity.modality || "Edital"}</span>
                      </div>
                      <h3>{t.opportunity.title}</h3>
                      <p>{t.opportunity.agency}</p>
                      <strong>
                        {currency(t.expectedValue ?? t.opportunity.value)}
                      </strong>
                      <div className="kanban-deadline">
                        <CalendarClock size={13} />
                        <Deadline
                          value={t.deadline || t.opportunity.closesAt}
                        />
                      </div>
                      <div className="kanban-card-footer">
                        <span>
                          <CheckCircle2 size={14} />
                          {t.tasks.filter((task) => task.done).length}/
                          {t.tasks.length} tarefas
                        </span>
                        <span
                          className="owner-mini"
                          title={
                            members.data?.find((m) => m.id === t.ownerId)
                              ?.name || "Sem responsável"
                          }
                        >
                          {t.ownerId ? (
                            members.data?.find((m) => m.id === t.ownerId)
                              ?.name[0] || "?"
                          ) : (
                            <UserRound size={13} />
                          )}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {!column.length && (
                    <div className="column-empty">
                      Nenhuma participação nesta etapa
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Oportunidade</th>
                <th>Etapa</th>
                <th>Responsável</th>
                <th>Prazo</th>
                <th>Valor previsto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items
                .filter((t) => stages.some((s) => s.value === t.stage))
                .map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link className="table-title" to={`/app/radar/${t.id}`}>
                        {t.opportunity.title}
                      </Link>
                      <span className="table-subtitle">
                        {t.opportunity.agency}
                      </span>
                    </td>
                    <td>
                      <StageBadge stage={t.stage} />
                    </td>
                    <td>
                      {members.data?.find((m) => m.id === t.ownerId)?.name ||
                        "Não definido"}
                    </td>
                    <td>
                      <Deadline value={t.deadline || t.opportunity.closesAt} />
                    </td>
                    <td className="nowrap">
                      {currency(t.expectedValue ?? t.opportunity.value)}
                    </td>
                    <td>
                      <Link
                        to={`/app/radar/${t.id}`}
                        aria-label={`Abrir ${t.opportunity.title}`}
                      >
                        <ChevronRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="page-note">
        As etapas são atualizadas pela sua equipe. “Proposta enviada” registra
        um envio já realizado no portal oficial.
      </p>
    </>
  );
}
export function TrackingPage() {
  const categoryOptions=useResource<Record<string,string>>('/commercial-options');
  const { id } = useParams();
  const resource = useResource<Tracking>(`/trackings/${id}`),
    members = useResource<Member[]>("/members");
  const item = resource.data;
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("IDENTIFIED"),
    [ownerId, setOwner] = useState(""),
    [deadline, setDeadline] = useState(""),
    [automaticDeadline,setAutomaticDeadline] = useState(true),
    [value, setValue] = useState(""),
    [outcomeReason, setOutcome] = useState(""),
    [outcomeCategory,setOutcomeCategory]=useState(''),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("tarefas"),
    [taskModal, setTaskModal] = useState<Task | "new" | null>(null),
    [comment, setComment] = useState(""),
    [commentBusy, setCommentBusy] = useState(false),
    [taskBusy, setTaskBusy] = useState<string | null>(null);
  useEffect(() => {
    if (item) {
      setStage(item.stage);
      setOwner(item.ownerId || "");
      setDeadline(dateTimeInput(item.deadline));
      setAutomaticDeadline(!item.deadline);
      setValue(item.expectedValue == null ? "" : `${item.expectedValue}`);
      setOutcome(item.outcomeReason || "");
      setOutcomeCategory(item.outcomeCategory||'');
      setNotes(item.notes || "");
    }
  }, [item]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await send<Tracking>(`/trackings/${id}`, "PATCH", {
        stage,
        ownerId: ownerId || null,
        deadline: !automaticDeadline && deadline ? `${deadline}${deadline.length===16?':00':''}-03:00` : null,
        expectedValue: value === "" ? null : Number(value),
        outcomeReason,
        outcomeCategory: outcomeCategory || null,
        notes,
      });
      resource.setData(result);
      toast("Participação atualizada.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function toggleTask(task: Task, done: boolean) {
    setTaskBusy(task.id);
    try {
      const result = await send<Task>(
        `/trackings/${id}/tasks/${task.id}`,
        "PATCH",
        { done },
      );
      resource.setData((previous) =>
        previous
          ? {
              ...previous,
              tasks: previous.tasks.map((t) => (t.id === task.id ? result : t)),
            }
          : previous,
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setTaskBusy(null);
    }
  }
  async function addComment(e: FormEvent) {
    e.preventDefault();
    setCommentBusy(true);
    try {
      await send(`/trackings/${id}/events`, "POST", { description: comment });
      setComment("");
      resource.reload();
      toast("Comentário registrado no histórico.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setCommentBusy(false);
    }
  }
  if (resource.loading && !item) return <Loading />;
  if (resource.error)
    return <ErrorNotice message={resource.error} onRetry={resource.reload} />;
  if (!item) return null;
  const done = item.tasks.filter((t) => t.done).length;
  return (
    <>
      <BackLink to="/app/radar">Meu radar</BackLink>
      <div className="detail-heading">
        <div className="badge-row">
          <StageBadge stage={item.stage} />
          <Badge>{item.opportunity.modality || "Edital"}</Badge>
          <Badge>{item.opportunity.state || "Brasil"}</Badge>
        </div>
        <h1>{item.opportunity.title}</h1>
        <p className="agency">{item.opportunity.agency}</p>
      </div>
        <div className="workspace-actions">
          <Link className="button secondary" to={`/app/simulador?opportunityId=${item.opportunityId}`}>Simular viabilidade</Link>
        <Link
          className="button secondary"
          to={`/app/oportunidades/${item.opportunityId}`}
        >
          Consultar edital <ArrowRight size={15} />
        </Link>
        <a className="button secondary" href={`/api/trackings/${id}/export`}>
          <Download size={16} /> Exportar dossiê
        </a>
        {safeUrl(item.opportunity.url) && (
          <a
            className="button secondary"
            href={safeUrl(item.opportunity.url)}
            target="_blank"
            rel="noreferrer"
          >
            Portal oficial <ExternalLink size={15} />
          </a>
        )}
      </div>
      <div className="detail-layout tracking-layout">
        <div>
          <section className="card preparation-card">
            <div>
              <span className="eyebrow">PREPARAÇÃO DA PARTICIPAÇÃO</span>
              <h2>Uma boa proposta começa com organização.</h2>
              <p>
                {done} de {item.tasks.length} tarefas concluídas. A conclusão do
                checklist não atesta habilitação.
              </p>
            </div>
            <div
              className="progress-ring"
              style={
                {
                  "--progress": `${item.tasks.length ? (done / item.tasks.length) * 100 : 0}%`,
                } as React.CSSProperties
              }
            >
              <span>
                {item.tasks.length
                  ? Math.round((done / item.tasks.length) * 100)
                  : 0}
                <small>%</small>
              </span>
            </div>
          </section>
          <section className="card detail-body">
            <div
              className="tabs"
              role="tablist"
              aria-label="Workspace da participação"
            >
              {[
                { id: "tarefas", label: `Tarefas (${item.tasks.length})` },
                { id: "historico", label: "Histórico e comentários" },
                { id: "documentos", label: "Documentação" },
              ].map((t) => (
                <button
                  role="tab"
                  key={t.id}
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tab-content">
              {tab === "tarefas" ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>Checklist de preparação</h2>
                      <p>Distribua tarefas e acompanhe cada etapa.</p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setTaskModal("new")}
                    >
                      <Plus size={15} /> Nova tarefa
                    </Button>
                  </div>
                  {item.tasks.length ? (
                    <div className="task-list">
                      {item.tasks.map((task) => (
                        <div
                          className={`task-item ${task.done ? "task-done" : ""}`}
                          key={task.id}
                        >
                          <CheckRow
                            checked={task.done}
                            onChange={(done) => toggleTask(task, done)}
                            disabled={taskBusy === task.id}
                          >
                            {task.title}
                          </CheckRow>
                          <div className="task-meta">
                            {task.deadline && (
                              <span>
                                <CalendarClock size={13} />
                                <Deadline value={task.deadline} />
                              </span>
                            )}
                            {task.ownerId && (
                              <span>
                                <UserRound size={13} />
                                {members.data?.find(
                                  (m) => m.id === task.ownerId,
                                )?.name || "Responsável"}
                              </span>
                            )}
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Editar tarefa ${task.title}`}
                            onClick={() => setTaskModal(task)}
                          >
                            <Pencil size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Planeje as próximas ações"
                      description="Adicione tarefas como revisar o edital, conferir certidões e preparar a proposta técnica."
                      action={
                        <Button onClick={() => setTaskModal("new")}>
                          <Plus size={16} /> Criar primeira tarefa
                        </Button>
                      }
                    />
                  )}
                </>
              ) : tab === "historico" ? (
                <>
                  <form className="comment-form" onSubmit={addComment}>
                    <Field label="Registrar uma decisão ou comentário">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        required
                        maxLength={5000}
                        rows={3}
                        placeholder="Compartilhe uma observação importante para a equipe…"
                      />
                    </Field>
                    <Button
                      type="submit"
                      busy={commentBusy}
                      disabled={!comment.trim()}
                    >
                      <MessageSquare size={15} /> Registrar comentário
                    </Button>
                  </form>
                  <div className="activity-list tracking-history">
                    {item.events.length ? (
                      item.events.map((event) => (
                        <div className="activity-item" key={event.id}>
                          <span className="activity-node" />
                          <div>
                            <h3>{event.title || event.type}</h3>
                            <p className="preserve-lines">
                              {event.description}
                            </p>
                            <time>{date(event.createdAt, true)}</time>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Os movimentos desta participação aparecerão aqui.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="info-note">
                    <FileStack size={21} />
                    <p>
                      Os documentos da sua empresa ficam na biblioteca central.
                      Confira as exigências deste edital e a validade dos
                      arquivos antes de enviar no portal oficial.
                    </p>
                  </div>
                  <div className="document-workflow">
                    <h2>Preparação documental</h2>
                    <p>
                      1. Leia os requisitos de habilitação e os anexos do
                      edital.
                    </p>
                    <p>
                      2. Confira os documentos e certidões na biblioteca da
                      empresa.
                    </p>
                    <p>
                      3. Registre pendências como tarefas desta participação.
                    </p>
                    <p>4. Faça o envio e a conferência no portal oficial.</p>
                  </div>
                  <div className="button-row">
                    <Link className="button primary" to="/app/documentos">
                      <FileStack size={16} /> Abrir biblioteca
                    </Link>
                    <Link
                      className="button secondary"
                      to={`/app/oportunidades/${item.opportunityId}`}
                    >
                      Ver anexos do edital <ArrowRight size={15} />
                    </Link>
                  </div>
                  <p className="page-note">
                    O dossiê exportado contém o resumo, tarefas, notas e links.
                    Não inclui o envio de proposta nem atesta conformidade.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
        <aside className="detail-aside">
          <form className="card tracking-form" onSubmit={save}>
            <div className="section-heading">
              <div>
                <h2>Gestão da participação</h2>
                <p>Mantenha a equipe alinhada</p>
              </div>
            </div>
            <Field label="Etapa atual">
              <select
                value={stage}
                onChange={(e) => {setStage(e.target.value as Stage);setOutcomeCategory('');}}
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {stage === "PROPOSAL_SENT" && (
              <p className="field-help">
                Selecione esta etapa somente após enviar a proposta no portal
                oficial.
              </p>
            )}
            <Field label="Responsável">
              <select
                value={ownerId}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">Não definido</option>
                {members.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <CheckRow checked={automaticDeadline} onChange={checked=>{
              setAutomaticDeadline(checked);
              if(!checked && !deadline) setDeadline(dateTimeInput(item.opportunity.closesAt));
            }}>Usar prazo oficial automaticamente</CheckRow>
            <Field label={automaticDeadline ? 'Prazo acompanhado (Brasília)' : 'Prazo interno (Brasília)'}
              hint={automaticDeadline ? 'Usa o encerramento das propostas e acompanha alterações importadas da fonte. Não é uma confirmação da data da sessão do pregão.' : 'Prioridade na agenda e nos alertas. Alterar este prazo não muda o encerramento oficial.'}>
              <input type="datetime-local" step="1" disabled={automaticDeadline} required={!automaticDeadline}
                value={automaticDeadline ? dateTimeInput(item.opportunity.closesAt) : deadline}
                onChange={e=>setDeadline(e.target.value)}/>
            </Field>
            {automaticDeadline && !item.opportunity.closesAt && <p className="info-note">Prazo oficial não informado. Defina um prazo interno para incluir esta participação na agenda.</p>}
            {!automaticDeadline && deadline && item.opportunity.closesAt && new Date(`${deadline}${deadline.length===16?':00':''}-03:00`).getTime()>new Date(item.opportunity.closesAt).getTime() && <p className="info-note">Atenção: seu prazo interno está depois do encerramento das propostas. Isso não prorroga a participação no portal oficial.</p>}
            <Field label="Valor previsto da proposta (R$)">
              <input
                type="number"
                min="0"
                max="999999999999"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  item.opportunity.value == null
                    ? "Não definido"
                    : String(item.opportunity.value)
                }
              />
            </Field>
            {["WON", "LOST", "DISCARDED"].includes(stage) && <Field label="Classificação do motivo"><select aria-label="Classificação do motivo" value={outcomeCategory} onChange={e=>setOutcomeCategory(e.target.value)}><option value="">Ainda não classificado</option>{Object.entries(categoryOptions.data??{}).filter(([key])=>key!=='UNCLASSIFIED').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><p className="muted small">Sua classificação alimenta os indicadores. Não é inferida automaticamente.</p>{categoryOptions.error&&<ErrorNotice message={categoryOptions.error} onRetry={categoryOptions.reload}/>}</Field>}
            {["WON", "LOST", "DISCARDED"].includes(stage) && (
              <Field label="Motivo / resultado">
                <textarea
                  rows={2}
                  value={outcomeReason}
                  onChange={(e) => setOutcome(e.target.value)}
                  maxLength={3000}
                />
              </Field>
            )}
            <Field label="Notas internas">
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={10000}
                placeholder="Estratégia, pontos de atenção, condições…"
              />
            </Field>
            <Button className="full-width" type="submit" busy={busy}>
              <Save size={16} /> Salvar alterações
            </Button>
          </form>
          <div className="card official-deadline">
            <CalendarClock size={19} />
            <div>
              <span className="overline">ENCERRAMENTO DAS PROPOSTAS · BRASÍLIA</span>
              <strong>
                {date(item.opportunity.closesAt, true)}
              </strong>
              <p>Confirme eventuais alterações na fonte.</p>
            </div>
          </div>
        </aside>
      </div>
      {taskModal && (
        <TaskModal
          trackingId={item.id}
          task={taskModal === "new" ? undefined : taskModal}
          members={members.data || []}
          onClose={() => setTaskModal(null)}
          onSaved={() => {
            setTaskModal(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
function TaskModal({
  trackingId,
  task,
  members,
  onClose,
  onSaved,
}: {
  trackingId: string;
  task?: Task;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title || ""),
    [deadline, setDeadline] = useState(dateInput(task?.deadline)),
    [owner, setOwner] = useState(task?.ownerId || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        `/trackings/${trackingId}/tasks${task ? `/${task.id}` : ""}`,
        task ? "PATCH" : "POST",
        {
          title,
          deadline: deadline ? `${deadline}T23:59:59-03:00` : null,
          ownerId: owner || null,
        },
      );
      toast(task ? "Tarefa atualizada." : "Tarefa criada.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await send(`/trackings/${trackingId}/tasks/${task?.id}`, "DELETE");
      toast("Tarefa excluída.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Editar tarefa" : "Nova tarefa"}
      description="Transforme pendências em próximos passos claros."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="modal-form">
        {error && <ErrorNotice message={error} />}
        <Field label="O que precisa ser feito?" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={2}
            maxLength={250}
            placeholder="Ex.: conferir validade das certidões"
          />
        </Field>
        <div className="form-grid">
          <Field label="Prazo">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <Field label="Responsável">
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Não definido</option>
              {members.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {deleting && (
          <div className="error-notice">
            Excluir esta tarefa permanentemente?
            <Button variant="danger" type="button" busy={busy} onClick={remove}>
              Confirmar exclusão
            </Button>
          </div>
        )}
        <div className="modal-footer">
          {task && (
            <Button
              type="button"
              variant="ghost"
              className="text-red push-right"
              onClick={() => setDeleting((v) => !v)}
              disabled={busy}
            >
              <Trash2 size={15} /> Excluir
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            {task ? "Salvar tarefa" : "Criar tarefa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
