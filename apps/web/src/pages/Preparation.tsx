import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { date, safeUrl, send, useResource } from "../api";
import { Button, ErrorNotice, Field, useToast } from "../ui";
import { ChecklistTemplates } from "./ChecklistTemplates";
export const preparationChanged = () =>
  window.dispatchEvent(new Event("preparation-changed"));
type Evidence = {
  documentName: string;
  url: string;
  page: number;
  quote: string;
};
type Requirement = {
  id: string;
  title: string;
  notes: string;
  document_id: string | null;
  effective_state: string;
  revision: number;
  expires_at: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  source_evidence: Evidence[] | null;
};
type LibraryDoc = { id: string; name: string };
type Preparation = {
  tasks: { title: string }[];
  documents: Requirement[];
  trackingId: string | null;
  summary: {
    pendingTopics: number;
    pendingDocuments: number;
    documentCount: number;
    simulationCount: number;
    pendingTasks: number;
    incompleteAttachments: boolean;
    analysisStatus: string | null;
    stale: boolean;
    nextAction: string;
  };
};
const states: Record<string, string> = {
  MISSING: "Falta providenciar",
  LINKED: "Documento vinculado, aguardando conferência",
  REVIEWED: "Conferido pelo responsável",
  UPDATE: "Precisa atualizar",
};
export function DocumentChecklist({
  opportunityId,
}: {
  opportunityId: string;
}) {
  return <PreparationPanel opportunityId={opportunityId} checklistOnly />;
}
function PreparationPanel({
  opportunityId,
  checklistOnly = false,
}: {
  opportunityId: string;
  checklistOnly?: boolean;
}) {
  const resource = useResource<Preparation>(
    `/opportunities/${opportunityId}/preparation`,
  );
  const library = useResource<LibraryDoc[]>("/documents");
  const [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const refresh = () => resource.reload();
    const focus = () => {
      resource.reload();
      library.reload();
    };
    window.addEventListener("preparation-changed", refresh);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("preparation-changed", refresh);
      window.removeEventListener("focus", focus);
    };
  }, [resource.reload, library.reload]);
  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      await send(
        `/opportunities/${opportunityId}/preparation/documents`,
        "POST",
        { title },
      );
      setTitle("");
      resource.reload();
      toast("Exigência adicionada para conferência.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (resource.error)
    return <ErrorNotice message={resource.error} onRetry={resource.reload} />;
  if (!resource.data) return <p role="status">Carregando preparação…</p>;
  const { summary: s, documents, trackingId } = resource.data;
  const ChecklistBody = checklistOnly ? "div" : "details";
  return (
    <section
      className={
        checklistOnly ? "document-checklist" : "card preparation-panel"
      }
      aria-label={
        checklistOnly ? "Checklist documental" : "Preparação da oportunidade"
      }
    >
      {checklistOnly ? (
        <>
          <h2>Checklist documental</h2>
          <p className="muted">
            {documents.length} exigência(s) cadastrada(s). Confirme documentos e
            requisitos antes do envio.
          </p>
        </>
      ) : (
        <>
          <span className="overline">SEU PLANO DE PARTICIPAÇÃO</span>
          <h2>Preparação em andamento</h2>
          <p>
            {s.pendingTopics} temas aguardam revisão ·{" "}
            {s.documentCount
              ? `${s.pendingDocuments} de ${s.documentCount} itens documentais pendentes`
              : "Checklist documental ainda não definido"}{" "}
            ·{" "}
            {s.simulationCount
              ? `${s.simulationCount} simulação(ões) registrada(s)`
              : "Simulação ainda não registrada"}{" "}
            · {s.pendingTasks} tarefas pendentes
          </p>
          <p className="info-note">
            <strong>Próximo passo sugerido:</strong> {s.nextAction}
          </p>
          <p className="muted small">
            Este resumo retrata os registros da equipe, não habilitação ou
            chance de ganhar. Uma simulação salva não comprova viabilidade.
            {s.incompleteAttachments
              ? " A cobertura dos anexos ainda exige conferência manual."
              : ""}
            {s.stale ? " A leitura está desatualizada." : ""}
          </p>
          <div className="button-row">
            <Link to={`/app/simulador?opportunityId=${opportunityId}`}>
              Revisar simulação
            </Link>
            {trackingId && (
              <Link to={`/app/radar/${trackingId}`}>
                Abrir tarefas e responsáveis
              </Link>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                resource.reload();
                library.reload();
              }}
            >
              Atualizar preparação
            </Button>
          </div>
        </>
      )}
      <ChecklistTemplates
        opportunityId={opportunityId}
        onApplied={resource.reload}
      />
      <ChecklistBody id="checklist-documental">
        {!checklistOnly && (
          <summary>
            Checklist documental · {documents.length} exigência(s)
          </summary>
        )}
        <p>
          Cadastre apenas o que você identificou ao conferir o edital. Vincular
          um arquivo não significa que ele atende à exigência.
        </p>
        <Link to="/app/documentos">
          Abrir biblioteca para cadastrar ou atualizar arquivos
        </Link>
        {library.error && (
          <ErrorNotice message={library.error} onRetry={library.reload} />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="preparation-add"
        >
          <Field label="Exigência documental identificada">
            <input
              aria-label="Exigência documental identificada"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={240}
              required
              placeholder="Ex.: atestado técnico compatível com o objeto"
            />
          </Field>
          <Button type="submit" busy={busy}>
            Adicionar exigência
          </Button>
        </form>
        {!documents.length && (
          <p className="muted">
            Nenhuma exigência cadastrada. Isso não significa que o edital
            dispense documentos.
          </p>
        )}
        {documents.map((d) => (
          <DocumentRequirement
            key={`${d.id}-${d.revision}-${d.effective_state}`}
            item={d}
            opportunityId={opportunityId}
            library={library.data ?? []}
            onSaved={resource.reload}
          />
        ))}
      </ChecklistBody>
    </section>
  );
}
function DocumentRequirement({
  item,
  opportunityId,
  library,
  onSaved,
}: {
  item: Requirement;
  opportunityId: string;
  library: LibraryDoc[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item.title),
    [notes, setNotes] = useState(item.notes),
    [documentId, setDocumentId] = useState(item.document_id ?? ""),
    [state, setState] = useState(item.effective_state),
    [busy, setBusy] = useState(false);
  const toast = useToast(),
    base = `/opportunities/${opportunityId}/preparation/documents/${item.id}`;
  async function save() {
    setBusy(true);
    try {
      await send(base, "PUT", {
        title,
        notes,
        documentId: documentId || null,
        state,
        revision: item.revision,
      });
      onSaved();
      toast("Checklist documental atualizado.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Remover esta exigência do checklist? O arquivo da biblioteca será preservado.",
      )
    )
      return;
    setBusy(true);
    try {
      await send(base, "DELETE", { revision: item.revision });
      onSaved();
      toast("Exigência removida; arquivo preservado.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-topic">
      <summary>
        {item.title} · {states[item.effective_state]}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Descrição da exigência">
          <input
            aria-label={`Descrição: ${item.title}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={3}
            maxLength={240}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label="Arquivo da biblioteca">
            <select
              aria-label={`Arquivo: ${item.title}`}
              value={documentId}
              onChange={(e) => {
                setDocumentId(e.target.value);
                setState(e.target.value ? "LINKED" : "MISSING");
              }}
            >
              <option value="">Nenhum arquivo vinculado</option>
              {library.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado da conferência">
            <select
              aria-label={`Estado: ${item.title}`}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {Object.entries(states).map(([key, label]) => (
                <option
                  key={key}
                  value={key}
                  disabled={documentId ? key === "MISSING" : key !== "MISSING"}
                >
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Observações da conferência">
          <textarea
            aria-label={`Observações: ${item.title}`}
            value={notes}
            maxLength={3000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Confira validade, escopo, assinatura e condições exigidas."
          />
        </Field>
        {item.document_id && (
          <p>
            <a
              href={`/api/documents/${item.document_id}/download`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir arquivo vinculado
            </a>{" "}
            · Validade: {date(item.expires_at)}
          </p>
        )}
        {item.reviewed_at && (
          <p className="muted small">
            Última conferência registrada:{" "}
            {item.reviewer_name ?? "Responsável não disponível"} ·{" "}
            {date(item.reviewed_at, true)}. O estado atual acima prevalece se
            houver vencimento ou mudança de versão.
          </p>
        )}
        {!!item.source_evidence?.length && (
          <details>
            <summary>Origem da exigência — confira o contexto</summary>
            {item.source_evidence.map((e, i) => (
              <figure key={i}>
                <blockquote>{e.quote}</blockquote>
                <figcaption>
                  <a
                    href={`${safeUrl(e.url)?.split("#")[0] ?? ""}#page=${e.page}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {e.documentName} · página {e.page} do PDF
                  </a>
                </figcaption>
              </figure>
            ))}
          </details>
        )}
        <p className="muted small">
          “Conferido” é sua confirmação humana para este arquivo. Após nova
          leitura ou alteração detectada, confira novamente. Não é validação
          jurídica automática.
        </p>
        <div className="button-row">
          <Button type="submit" busy={busy}>
            Salvar documento e conferência
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={remove}
          >
            Remover exigência
          </Button>
        </div>
      </form>
    </details>
  );
}
export function TopicActions({
  opportunityId,
  analysisId,
  topic,
  title,
  disabled,
}: {
  opportunityId: string;
  analysisId: string;
  topic: string;
  title: string;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<"TASK" | "DOCUMENT">("TASK"),
    [actionTitle, setActionTitle] = useState(`Conferir ${title.toLowerCase()}`),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState("");
  const toast = useToast();
  async function create() {
    setBusy(true);
    try {
      await send(
        `/opportunities/${opportunityId}/preparation/actions`,
        "POST",
        { analysisId, topic, kind, title: actionTitle },
      );
      preparationChanged();
      setCreated(
        kind === "TASK"
          ? "Tarefa disponível na participação."
          : "Exigência disponível no checklist documental acima.",
      );
      toast(
        "Ação registrada. Repetir a mesma ação nesta versão não cria duplicatas.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="preparation-actions">
      <h4>Próxima ação</h4>
      <p className="muted small">
        Confirme o contexto antes de criar. Uma menção ao tema não é, por si só,
        uma exigência. Criar tarefa também inicia o acompanhamento no radar, se
        necessário.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="form-grid">
          <Field label="Tipo de ação">
            <select
              aria-label={`Ação: ${title}`}
              value={kind}
              onChange={(e) => setKind(e.target.value as "TASK" | "DOCUMENT")}
              disabled={disabled}
            >
              <option value="TASK">Criar tarefa de conferência</option>
              <option value="DOCUMENT">Cadastrar exigência documental</option>
            </select>
          </Field>
          <Field label="Descrição da próxima ação">
            <input
              aria-label={`Próxima ação: ${title}`}
              minLength={3}
              maxLength={240}
              required
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
        <div className="button-row">
          <Button type="submit" busy={busy} disabled={disabled}>
            Confirmar e criar ação
          </Button>
          <Link to={`/app/simulador?opportunityId=${opportunityId}`}>
            Revisar simulação
          </Link>
        </div>
      </form>
      {disabled && (
        <p className="muted small">
          Criar a partir de evidências exige uma leitura atual com trechos
          localizados. Você pode cadastrar uma exigência manual no checklist
          acima.
        </p>
      )}
      {created && <p role="status">{created}</p>}
    </section>
  );
}
