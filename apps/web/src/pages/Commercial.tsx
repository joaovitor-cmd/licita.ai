import { useState } from "react";
import { Link } from "react-router-dom";
import { currency, date, dateInput, useResource } from "../api";
import {
  Button,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  StageBadge,
} from "../ui";
import { STAGES, type Stage, type Member } from "../types";
type Summary = {
  total: number;
  won: number;
  lost: number;
  discarded: number;
  active: number;
  without_owner: number;
  unclassified: number;
  active_value_missing: number;
  active_value: string;
  won_value_missing: number;
  won_value: string;
  pending_tasks: number;
  win_rate: number | null;
};
type Report = {
  summary: Summary;
  reasonLabels: Record<string, string>;
  reasons: { stage: Stage; category: string; count: number }[];
  stages: { stage: Stage; count: number }[];
  months: {
    month: string;
    entered: number;
    won: number;
    lost: number;
    discarded: number;
  }[];
  items: {
    id: string;
    title: string;
    agency: string;
    stage: Stage;
    owner_name: string | null;
    expected_value: string | null;
    outcome_reason: string;
    outcome_category: string | null;
    created_at: string;
  }[];
  total: number;
  pages: number;
};
export function CommercialPage() {
  const initial = {
    from: dateInput(new Date(Date.now() - 90 * 86400000).toISOString()),
    to: dateInput(new Date().toISOString()),
    ownerId: "",
    stage: "",
  };
  const [draft, setDraft] = useState(initial),
    [filters, setFilters] = useState(initial),
    [page, setPage] = useState(1);
  const members = useResource<Member[]>("/members");
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters))
    if (value) query.set(key, value);
  const resource = useResource<Report>(`/commercial-report?${query}`),
    r = resource.data,
    s = r?.summary;
  return (
    <>
      <PageHeader
        eyebrow="APRENDA COM SUA OPERAÇÃO"
        title="Histórico comercial"
        description="Acompanhe suas participações e entenda os resultados registrados pela equipe."
        actions={
          <Link className="button secondary" to="/app/radar">
            Abrir radar
          </Link>
        }
      />
      <section className="card form-section">
        <h2>Período de entrada no radar</h2>
        <p>
          Os filtros de data selecionam quando as oportunidades foram
          adicionadas ao radar. Os indicadores mostram o estado atual desse
          grupo, não a data em que cada resultado ocorreu.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft });
            setPage(1);
          }}
        >
          <div className="commercial-filters">
            <Field label="Entrada a partir de">
              <input
                aria-label="Entrada a partir de"
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, from: e.target.value }))
                }
              />
            </Field>
            <Field label="Entrada até">
              <input
                aria-label="Entrada até"
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, to: e.target.value }))
                }
              />
            </Field>
            <Field label="Responsável">
              <select
                aria-label="Responsável pelo acompanhamento"
                value={draft.ownerId}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, ownerId: e.target.value }))
                }
              >
                <option value="">Toda a equipe</option>
                {members.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Etapa — somente a lista">
              <select
                aria-label="Etapa da lista"
                value={draft.stage}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, stage: e.target.value }))
                }
              >
                <option value="">Todas as etapas</option>
                {STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="button-row">
            <Button type="submit">Aplicar filtros</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const all = { from: "", to: "", ownerId: "", stage: "" };
                setDraft(all);
                setFilters(all);
                setPage(1);
              }}
            >
              Ver todo o histórico
            </Button>
            <Button type="button" variant="secondary" onClick={resource.reload}>
              Atualizar indicadores
            </Button>
          </div>
        </form>
        {members.error && (
          <ErrorNotice message={members.error} onRetry={members.reload} />
        )}
      </section>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        r &&
        s && (
          <>
            <section
              className="commercial-metrics"
              aria-label="Indicadores comerciais"
            >
              <div className="card">
                <h2>No grupo selecionado</h2>
                <strong>{s.total}</strong>
                <p>
                  {s.active} em andamento · {s.discarded} descartadas
                </p>
              </div>
              <div className="card">
                <h2>Resultados registrados</h2>
                <strong>
                  {s.won} ganhas · {s.lost} perdidas
                </strong>
                <p>Marcações da equipe; não comprovam contrato assinado.</p>
              </div>
              <div className="card">
                <h2>Taxa de ganhos registrada</h2>
                <strong>
                  {s.win_rate === null
                    ? "Sem base de cálculo"
                    : `${s.win_rate.toLocaleString("pt-BR")}%`}
                </strong>
                <p>
                  Ganhos ÷ (ganhos + perdas). Base: {s.won + s.lost} resultados.
                  Não inclui descartadas nem etapas abertas; não prevê vitórias
                  futuras.
                </p>
              </div>
              <div className="card">
                <h2>Valor previsto em andamento</h2>
                <strong>
                  {s.active - s.active_value_missing
                    ? currency(Number(s.active_value))
                    : "Não informado"}
                </strong>
                <p>
                  {s.active_value_missing} oportunidade(s) em andamento sem
                  valor informado. Não usa o orçamento do órgão como receita.
                </p>
              </div>
              <div className="card">
                <h2>Valor previsto nas ganhas</h2>
                <strong>
                  {s.won - s.won_value_missing
                    ? currency(Number(s.won_value))
                    : "Não informado"}
                </strong>
                <p>
                  {s.won_value_missing} ganho(s) sem valor informado. Valor
                  previsto não equivale a contratado ou recebido.
                </p>
              </div>
              <div className="card">
                <h2>Pontos para organizar</h2>
                <strong>{s.pending_tasks} tarefas pendentes</strong>
                <p>
                  {s.without_owner} acompanhamento(s) ativo(s) sem responsável ·{" "}
                  {s.unclassified} resultado(s) sem motivo classificado.
                </p>
              </div>
            </section>
            <section className="card form-section">
              <h2>Motivos por resultado</h2>
              <p>
                Classificação informada pela equipe na participação. Textos
                livres antigos não são interpretados automaticamente.
              </p>
              {!r.reasons.length ? (
                <p>Nenhum resultado encerrado neste grupo.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Resultado</th>
                        <th>Motivo principal</th>
                        <th>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.reasons.map((row) => (
                        <tr key={`${row.stage}-${row.category}`}>
                          <td>
                            <StageBadge stage={row.stage} />
                          </td>
                          <td>
                            {r.reasonLabels[row.category] ?? row.category}
                          </td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card form-section">
              <h2>Resultado atual por mês de entrada</h2>
              <p>
                Até 24 meses com entradas. Não representa o faturamento ou os
                resultados ocorridos em cada mês.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês de entrada</th>
                      <th>Adicionadas</th>
                      <th>Hoje ganhas</th>
                      <th>Hoje perdidas</th>
                      <th>Hoje descartadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.months.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month.split("-").reverse().join("/")}</td>
                        <td>{m.entered}</td>
                        <td>{m.won}</td>
                        <td>{m.lost}</td>
                        <td>{m.discarded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!r.months.length && (
                <p>Nenhuma entrada no período selecionado.</p>
              )}
            </section>
            <section className="card form-section">
              <h2>Participações registradas</h2>
              <p>
                {r.total} registros na lista. O filtro de etapa afeta somente
                esta lista; os indicadores acima mantêm a base completa do
                período e responsável.
              </p>
              <div className="table-wrap">
                <table className="commercial-history">
                  <thead>
                    <tr>
                      <th>Oportunidade</th>
                      <th>Entrada no radar</th>
                      <th>Etapa atual</th>
                      <th>Responsável</th>
                      <th>Valor previsto</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link to={`/app/radar/${item.id}`}>{item.title}</Link>
                          <p className="muted small">{item.agency}</p>
                        </td>
                        <td>{date(item.created_at)}</td>
                        <td>
                          <StageBadge stage={item.stage} />
                        </td>
                        <td>{item.owner_name ?? "Não definido"}</td>
                        <td>
                          {currency(
                            item.expected_value === null
                              ? null
                              : Number(item.expected_value),
                          )}
                        </td>
                        <td>
                          {
                            r.reasonLabels[
                              item.outcome_category ?? "UNCLASSIFIED"
                            ]
                          }
                          {item.outcome_reason && (
                            <details>
                              <summary>Ver observação</summary>
                              <p>{item.outcome_reason}</p>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!r.items.length && (
                <p>Nenhuma participação encontrada com esses filtros.</p>
              )}
              <div className="button-row">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {page} de {r.pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= r.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
