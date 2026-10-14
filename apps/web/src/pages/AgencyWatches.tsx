import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { date, send, useResource } from "../api";
import {
  Badge,
  Button,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeader,
  useSession,
  useToast,
} from "../ui";

type Watch = {
  id: string;
  name: string;
  agencyCnpj: string;
  terms: string[];
  excludedTerms: string[];
  states: string[];
  active: boolean;
  revision: number;
  activeSince: string;
  hitCount: number;
};
const split = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export default function AgencyWatchesPage() {
  const resource = useResource<Watch[]>("/agency-watches"),
    { session } = useSession(),
    toast = useToast();
  const [editor, setEditor] = useState<Partial<Watch> | null>(null),
    [history, setHistory] = useState<Watch | null>(null),
    [busy, setBusy] = useState("");
  const admin = session.role === "ADMIN";
  async function toggle(w: Watch) {
    setBusy(w.id);
    try {
      await send(`/agency-watches/${w.id}/active`, "PATCH", {
        active: !w.active,
        revision: w.revision,
      });
      resource.reload();
      toast(
        w.active
          ? "Monitoramento pausado."
          : "Monitoramento retomado para novas publicações.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        title="Órgãos monitorados"
        eyebrow="BUSCA DIRECIONADA"
        description="Acompanhe novas publicações de órgãos por CNPJ, sem precisar repetir a busca."
        actions={
          <>
            {admin && (
              <Button onClick={() => setEditor({})}>Novo monitoramento</Button>
            )}
            <Link className="button secondary" to="/app/oportunidades">
              Voltar à busca
            </Link>
          </>
        }
      />
      <p className="info-note">
        Os avisos dependem da coleta e da cobertura das fontes: não são em tempo
        real nem garantem antecedência. Nesta versão, identificadores PNCP
        presentes nas fontes integradas. Publicações precisam ter data posterior
        à criação, edição ou retomada da regra. Datas ausentes não geram aviso
        automático. Não há busca retroativa nem inclusão automática no radar.
      </p>
      {resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : resource.loading ? (
        <Loading />
      ) : !resource.data?.length ? (
        <section className="card">
          <h2>Nenhum órgão monitorado</h2>
          <p>
            Cadastre o CNPJ do órgão e, se necessário, restrinja os assuntos e a
            UF. Não use o CNPJ da sua empresa.
          </p>
        </section>
      ) : (
        <div className="agency-watch-list">
          {resource.data.map((w) => (
            <article className="card" key={w.id}>
              <div className="badge-row">
                <Badge color={w.active ? "green" : "slate"}>
                  {w.active ? "Ativo" : "Pausado"}
                </Badge>
                <Badge>{w.hitCount} publicações identificadas</Badge>
              </div>
              <h2>{w.name}</h2>
              <p>CNPJ do órgão: {w.agencyCnpj}</p>
              <p>
                Assuntos: {w.terms.length ? w.terms.join(", ") : "Todos"} · UF
                da unidade do órgão:{" "}
                {w.states.length ? w.states.join(", ") : "Todas"}
              </p>
              {!!w.excludedTerms.length && (
                <p>Excluir: {w.excludedTerms.join(", ")}</p>
              )}
              <p className="muted small">
                Marco da regra atual: {date(w.activeSince, true)} (Brasília).
                Histórico anterior preservado.
              </p>
              <div className="button-row">
                <Button variant="secondary" onClick={() => setHistory(w)}>
                  Ver publicações
                </Button>
                {admin && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => setEditor(w)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!!busy}
                      busy={busy === w.id}
                      onClick={() => toggle(w)}
                    >
                      {w.active ? "Pausar" : "Retomar"}
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editor && (
        <WatchEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            resource.reload();
          }}
        />
      )}
      {history && (
        <WatchHistory watch={history} onClose={() => setHistory(null)} />
      )}
    </>
  );
}
function WatchEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<Watch>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name ?? ""),
    [cnpj, setCnpj] = useState(initial.agencyCnpj ?? ""),
    [terms, setTerms] = useState(initial.terms?.join(", ") ?? ""),
    [excluded, setExcluded] = useState(initial.excludedTerms?.join(", ") ?? ""),
    [states, setStates] = useState(initial.states?.join(", ") ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send(
        `/agency-watches${initial.id ? `/${initial.id}` : ""}`,
        initial.id ? "PUT" : "POST",
        {
          name,
          agencyCnpj: cnpj,
          terms: split(terms),
          excludedTerms: split(excluded),
          states: split(states).map((v) => v.toUpperCase()),
          ...(initial.id ? { revision: initial.revision } : {}),
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial.id ? "Editar monitoramento" : "Novo monitoramento"}
      onClose={() => {
        if (!busy) onClose();
      }}
      description="Regras da empresa, independentes do perfil comercial e dos perfis de busca."
    >
      <form className="modal-form" onSubmit={save}>
        {error && <ErrorNotice message={error} />}
        <Field label="Nome do monitoramento" required>
          <input
            aria-label="Nome do monitoramento"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="CNPJ do órgão" required>
          <input
            aria-label="CNPJ do órgão"
            required
            maxLength={24}
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="Informe o CNPJ do órgão, não da sua empresa"
          />
        </Field>
        <Field label="Assuntos (opcional)">
          <textarea
            aria-label="Assuntos (opcional)"
            maxLength={3030}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="impressão, locação de equipamentos"
          />
          <small>
            Separe por vírgulas. Até 30 termos; basta um deles aparecer no
            objeto ou descrição. Correspondência por palavras/frases, sem
            análise semântica.
          </small>
        </Field>
        <Field label="Excluir palavras (opcional)">
          <textarea
            aria-label="Excluir palavras (opcional)"
            maxLength={3030}
            value={excluded}
            onChange={(e) => setExcluded(e.target.value)}
          />
          <small>
            Qualquer exclusão bloqueia o aviso, mesmo se um assunto
            corresponder.
          </small>
        </Field>
        <Field label="UFs da unidade do órgão (opcional)">
          <input
            aria-label="UFs da unidade do órgão (opcional)"
            maxLength={100}
            value={states}
            onChange={(e) => setStates(e.target.value)}
            placeholder="RS, SC"
          />
          <small>
            Não representa a área de entrega ou execução. Em branco: todas as
            UFs.
          </small>
        </Field>
        <p className="info-note">
          Salvar inicia um novo marco para publicações futuras; não procura
          publicações antigas. Retomar uma regra pausada também reinicia o
          marco. Avisos aparecem no portal quando habilitados nas preferências
          gerais. Histórico de regras anteriores é preservado nas publicações
          identificadas.
        </p>
        <div className="button-row">
          <Button busy={busy} type="submit">
            Salvar monitoramento
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
type Hit = {
  opportunity_id: string;
  title: string;
  agency: string;
  state: string | null;
  source_name: string;
  public_code: string;
  published_at: string;
  detected_at: string;
  rule_snapshot: {
    name: string;
    revision: number;
    agencyCnpj: string;
    terms: string[];
    states: string[];
    excludedTerms?: string[];
    matchingTerms?: string[];
    objectAtCollection?: string;
  };
};
function WatchHistory({
  watch,
  onClose,
}: {
  watch: Watch;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    r = useResource<{ items: Hit[]; total: number; pages: number }>(
      `/agency-watches/${watch.id}/hits?page=${page}`,
    );
  return (
    <Modal title={`Publicações: ${watch.name}`} onClose={onClose} wide>
      <div className="modal-form agency-watch-history">
        <p>
          Registros identificados pela coleta, inclusive sob regras anteriores.
          Não indicam aprovação nem participação no edital.
        </p>
        {r.error ? (
          <ErrorNotice message={r.error} onRetry={r.reload} />
        ) : r.loading ? (
          <Loading />
        ) : (
          r.data && (
            <>
              <p>
                {r.data.total}{" "}
                {r.data.total === 1
                  ? "publicação registrada"
                  : "publicações registradas"}
                .
              </p>
              {r.data.items.map((h) => (
                <article className="card" key={h.opportunity_id}>
                  <Badge>{h.source_name}</Badge>
                  <h3>{h.title}</h3>
                  <p>
                    {h.agency} · {h.state ?? "UF não informada"} · LC-
                    {String(h.public_code).padStart(8, "0")}
                  </p>
                  <p className="small">
                    Publicação: {date(h.published_at, true)} · Identificação na
                    coleta: {date(h.detected_at, true)} (Brasília).
                  </p>
                  <details>
                    <summary>Por que apareceu aqui?</summary>
                    {h.rule_snapshot.objectAtCollection && (
                      <p>
                        Objeto na coleta (trecho):{" "}
                        {h.rule_snapshot.objectAtCollection}
                      </p>
                    )}
                    {!!h.rule_snapshot.matchingTerms?.length && (
                      <p>
                        Assuntos encontrados:{" "}
                        {h.rule_snapshot.matchingTerms.join(", ")}.
                      </p>
                    )}
                    <p>
                      Regra “{h.rule_snapshot.name}”, revisão{" "}
                      {h.rule_snapshot.revision}, CNPJ{" "}
                      {h.rule_snapshot.agencyCnpj}.
                    </p>
                    <p>
                      Assuntos: {h.rule_snapshot.terms.join(", ") || "Todos"}.
                      UFs: {h.rule_snapshot.states.join(", ") || "Todas"}.
                    </p>
                    {!!h.rule_snapshot.excludedTerms?.length && (
                      <p>
                        Exclusões vigentes:{" "}
                        {h.rule_snapshot.excludedTerms.join(", ")}.
                      </p>
                    )}
                  </details>
                  <Link
                    className="button secondary"
                    to={`/app/oportunidades/${h.opportunity_id}`}
                  >
                    Abrir oportunidade
                  </Link>
                </article>
              ))}
              <div className="button-row">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Página anterior
                </Button>
                <span>
                  Página {page} de {r.data.pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= r.data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima página
                </Button>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
