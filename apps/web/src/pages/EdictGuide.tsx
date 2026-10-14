import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { date, safeUrl, send, useResource } from "../api";
import { Button, ErrorNotice, Field, useToast } from "../ui";
import type { Opportunity } from "../types";
import {TopicActions,preparationChanged} from './Preparation';
type Review = { topic: string; state: string; notes: string };
type Topic = { key: string; title: string; help: string; action: string };
const progressLabels: Record<string,string> = {PREPARING:'Preparando os anexos…',CHECKING:'Conferindo origem e formato…',DOWNLOADING:'Baixando documento…',READING:'Extraindo texto do documento…',FINALIZING:'Salvando resultado…'};
type Doc = {
  name: string;
  url: string;
  status: string;
  message: string;
  readPages: number;
  totalPages: number | null;
  evidence: { topic: string; page: number; quote: string }[];
};
type Analysis = {
  id: string;
  status: string;
  stale: boolean;
  progress?: { phase?: string; processed?: number; total?: number; currentDocument?: string };
  error: string | null;
  finished_at: string | null;
  reviews: Review[];
  result: { method: string; warning: string; documents: Doc[] } | null;
};
export function ProcurementJourney({ item }: { item: Opportunity }) {
  return (
    <section className="card procurement-journey">
      <h2>Seu próximo passo, sem complicar</h2>
      <ol>
        <li>
          <strong>1. Entender</strong>
          <span>Conheça as regras e o que será entregue.</span>
        </li>
        <li>
          <strong>2. Avaliar</strong>
          <span>Confira capacidade, custos e riscos.</span>
        </li>
        <li>
          <strong>3. Preparar</strong>
          <span>Organize documentos, responsáveis e tarefas.</span>
          {item.trackingId ? (
            <Link to={`/app/radar/${item.trackingId}`}>Abrir participação</Link>
          ) : (
            <span className="muted">
              Use “Adicionar ao radar” para começar.
            </span>
          )}
        </li>
        <li>
          <strong>4. Acompanhar</strong>
          <span>Confira alterações e participe no portal oficial.</span>
          {safeUrl(item.url) && (
            <a href={safeUrl(item.url)} target="_blank" rel="noreferrer">
              Abrir portal oficial
            </a>
          )}
        </li>
      </ol>
      <details>
        <summary>Sou novo em licitações — por onde começo?</summary>
        <p>
          Pense no edital como as regras de uma concorrência comercial. O termo
          de referência detalha o que deve ser entregue. A proposta é sua
          oferta; a habilitação é a comprovação dos requisitos da empresa.
        </p>
        <p>
          Pregão é uma modalidade para bens e serviços comuns. Em linhas gerais,
          há publicação, propostas e lances quando cabíveis, julgamento,
          habilitação, recursos e homologação. A ordem pode variar conforme a
          regra aplicável e o edital. Ser classificado em primeiro não significa
          ter um contrato assinado.
        </p>
        <p>
          A jornada acima organiza seu trabalho; não substitui as fases legais.
          O Licitaro não envia propostas nem lances. Confira sempre o edital, as
          alterações e o portal indicado.
        </p>
        <a
          className="text-link"
          href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm"
          target="_blank"
          rel="noreferrer"
        >
          Consultar Lei 14.133: arts. 6º, 17 e 29
        </a>
      </details>
    </section>
  );
}
export function EdictGuide({ item }: { item: Opportunity }) {
  const [version,setVersion]=useState('');
  const resource = useResource<{ analysis: Analysis | null; topics: Topic[];versions:{id:string;status:string;created_at:string}[] }>(
    `/opportunities/${item.id}/analysis${version?`?version=${version}`:''}`,
  );
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const analysis = resource.data?.analysis;
  const running = analysis && ["PENDING", "RUNNING"].includes(analysis.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(resource.reload, 2500);
    return () => clearInterval(timer);
  }, [running, resource.reload]);
  async function start() {
    setBusy(true);
    try {
      await send(`/opportunities/${item.id}/analysis`, "POST", {});
      setVersion('');
      resource.reload();
      preparationChanged();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const docs = analysis?.result?.documents ?? [];
  const reviewed =
    analysis?.reviews.filter((r) => r.state === "REVIEWED").length ?? 0;
  return (
    <div className="edict-guide">
      <h2>Entenda este edital</h2>
      <p>
        Uma leitura assistida para localizar informações e orientar sua
        conferência, não um parecer de habilitação. Os trechos são encontrados
        por temas, sem interpretação por IA generativa.
      </p>
      <p className="info-note">
        Nesta versão: PDFs com texto e download direto do PNCP. Até 12 anexos
        por leitura, 10 MB e 150 páginas por PDF, com tempo total limitado. ZIP,
        planilhas, links externos e páginas escaneadas ficam pendentes. O
        contador mostra exatamente o que foi lido.
      </p>
      <div className="button-row">
        <Button onClick={start} busy={busy} disabled={!!running}>
          {running
            ? "Leitura em andamento…"
            : analysis
              ? "Refazer leitura dos anexos"
              : "Analisar anexos disponíveis"}
        </Button>
        <Button variant="secondary" onClick={resource.reload}>
          Atualizar resultado
        </Button>
      </div>
      {!!resource.data?.versions.length&&<Field label="Versão da leitura"><select aria-label="Versão da leitura" value={version} onChange={e=>setVersion(e.target.value)}><option value="">Mais recente</option>{resource.data.versions.slice(1).map(v=><option key={v.id} value={v.id}>{date(v.created_at,true)} · versão anterior</option>)}</select></Field>}
      <p className="muted small">Uma nova leitura preserva as versões anteriores, mas exige nova conferência. Refaça a leitura após retificações: um arquivo pode mudar mantendo o mesmo endereço.</p>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}
      {!analysis && !resource.loading && (
        <p className="muted">
          Comece pela leitura. Depois, abra as evidências e registre o que sua
          equipe já conferiu. Nenhum documento é considerado atendido
          automaticamente.
        </p>
      )}
      {running && (
        <p role="status">
          {analysis.status === "PENDING"
            ? "Na fila para leitura."
            : (progressLabels[analysis.progress?.phase ?? ''] ?? "Consultando e lendo os documentos…")}{" "}
          {analysis.status === 'RUNNING' && analysis.progress?.total !== undefined && <span>{analysis.progress.processed ?? 0} de {analysis.progress.total} anexos processados (não necessariamente lidos). </span>}
          {analysis.progress?.currentDocument && <span>Documento atual: {analysis.progress.currentDocument}. </span>}
          Você pode sair desta tela; o trabalho continua enquanto o servidor
          estiver ligado.
        </p>
      )}
      {analysis?.stale && (
        <p role="alert" className="error-notice">
          Esta leitura é anterior, os dados/anexos mudaram ou o mecanismo de leitura foi atualizado.
          Os registros abaixo são apenas para consulta; use a versão mais recente ou refaça a leitura.
        </p>
      )}
      {analysis?.error && <p className="error-notice">{analysis.error}</p>}
      {analysis?.result && (
        <>
          <section className="analysis-coverage">
            <h3>Cobertura da leitura</h3>
            <p>
              {docs.filter((d) => d.status === "READ").length} de {docs.length}{" "}
              anexos com texto lido em todas as páginas ·{" "}
              {docs.reduce((sum, d) => sum + d.readPages, 0)} páginas com texto
              ·{" "}
              {analysis.stale
                ? "revisão desatualizada"
                : `${reviewed} de ${resource.data!.topics.length} temas revisados por sua equipe`}
            </p>
            <p className="muted small">
              {analysis.result.warning} Leitura de texto não garante extração
              correta de tabelas ou compreensão de cláusulas.{" "}
              {date(analysis.finished_at, true)}
            </p>
            <details>
              <summary>Ver documento por documento</summary>
              <ul>
                {docs.map((d, i) => (
                  <li key={i}>
                    <strong>{d.name}</strong>
                    <p>
                      {d.status === "READ"
                        ? "Texto lido"
                        : d.status === "PARTIAL"
                          ? "Leitura parcial"
                          : "Pendente"}{" "}
                      · {d.readPages}/{d.totalPages ?? "?"} páginas com texto
                    </p>
                    <p>{d.message}</p>
                    {safeUrl(d.url) && (
                      <a
                        className="text-link"
                        href={safeUrl(d.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir original
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <p className="muted small">
            “Trecho localizado” significa apenas que há uma menção ao tema.
            “Revisado” é uma marcação humana, não aprovação automática. Compare
            edital, termo de referência, retificações e anexos; divergências
            precisam de esclarecimento.
          </p>
          {resource.data!.topics.map((topic) => (
            <TopicReview
              key={`${analysis.id}-${topic.key}`}
              topic={topic}
              item={item}
              analysis={analysis}
              docs={docs}
              onSaved={resource.reload}
            />
          ))}
        </>
      )}
    </div>
  );
}
function TopicReview({
  topic,
  item,
  analysis,
  docs,
  onSaved,
}: {
  topic: Topic;
  item: Opportunity;
  analysis: Analysis;
  docs: Doc[];
  onSaved: () => void;
}) {
  const review = analysis.reviews.find((r) => r.topic === topic.key);
  const [state, setState] = useState(review?.state ?? "PENDING"),
    [notes, setNotes] = useState(review?.notes ?? ""),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  const excerpts = docs.flatMap((d) =>
    d.evidence
      .filter((e) => e.topic === topic.key)
      .map((e) => ({ ...e, doc: d })),
  );
  async function save() {
    setBusy(true);
    try {
      await send(
        `/opportunities/${item.id}/analysis/${analysis.id}/review`,
        "PUT",
        { topic: topic.key, state, notes },
      );
      onSaved();
      preparationChanged();
      toast("Conferência salva para esta versão.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-topic">
      <summary><h3>{topic.title}</h3><span className="muted small">{review?.state==='REVIEWED'?'Revisado pela equipe':review?.state==='ATTENTION'?'Precisa de atenção':'Ainda vou conferir'} · {excerpts.length?`${excerpts.length} trecho(s)`:'Sem trecho localizado'}</span></summary>
      <p className="muted small">
        {excerpts.length
          ? `${excerpts.length} trecho(s) localizado(s) — confira o contexto.`
          : "Não localizado nesta leitura — não significa que a exigência não existe."}
      </p>
      <details>
        <summary>O que isso significa — me explique</summary>
        <p>{topic.help}</p>
      </details>
      <p>
        <strong>O que você precisa conferir:</strong> {topic.action}
      </p>
      {excerpts.length > 0 && (
        <details>
          <summary>Ver evidências e páginas</summary>
          <h4>O que encontramos</h4>
          {excerpts.map((e, i) => (
            <figure key={i}>
              <blockquote>{e.quote}</blockquote>
              <figcaption>
                <a
                  className="text-link"
                  href={`${safeUrl(e.doc.url)?.split("#")[0] ?? ""}#page=${e.page}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.doc.name} · página {e.page} do PDF
                </a>
              </figcaption>
            </figure>
          ))}
          <p className="muted small">
            A página é a posição no arquivo PDF; pode diferir da numeração
            impressa. Confira o original, especialmente tabelas e exceções.
          </p>
        </details>
      )}
      <TopicActions opportunityId={item.id} analysisId={analysis.id} topic={topic.key} title={topic.title} disabled={analysis.stale||!excerpts.length}/>
      <div className="form-grid">
        <Field label={`Conferência: ${topic.title}`}>
          <select
            aria-label={`Conferência: ${topic.title}`}
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={analysis.stale}
          >
            <option value="PENDING">Ainda vou conferir</option>
            <option value="ATTENTION">Precisa de atenção</option>
            <option value="REVIEWED">Revisei este tema</option>
          </select>
        </Field>
        <Field label={`Notas: ${topic.title}`}>
          <textarea
            aria-label={`Notas: ${topic.title}`}
            maxLength={3000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={analysis.stale}
            placeholder="Registre dúvidas, divergências ou o que confirmou."
          />
        </Field>
      </div>
      <Button
        variant="secondary"
        onClick={save}
        busy={busy}
        disabled={analysis.stale}
      >
        Salvar conferência
      </Button>
    </details>
  );
}
