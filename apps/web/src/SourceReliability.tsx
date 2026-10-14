import {date, safeUrl, useResource} from './api';
import {Badge, ErrorNotice, Loading} from './ui';
import './source-reliability.css';

type SourceObservation = {
  sourceCode: string;
  sourceName: string;
  sourceUrl: string | null;
  reportedUpdatedAt: string | null;
  consultedAt: string;
  decision: 'accepted' | 'rejected' | 'conflicting';
  reason: string;
  snapshot: unknown;
};

const decisions = {
  accepted: {label: 'Versão aplicada', color: 'green'},
  rejected: {label: 'Versão anterior preservada', color: 'slate'},
  conflicting: {label: 'Divergência para conferir', color: 'amber'},
};
const reasons: Record<string, string> = {
  initial_snapshot: 'Primeira versão registrada para esta oportunidade.',
  older_source_date: 'A fonte informou uma data anterior à versão já registrada; os dados existentes foram preservados.',
  same_known_fields: 'Os campos conhecidos coincidem com a versão registrada.',
  newer_source_date: 'A fonte informou uma atualização posterior. Campos ausentes preservam informações conhecidas, que podem ter origem anterior.',
  equal_source_date_divergence: 'As fontes informam a mesma data, mas os dados divergem. Confira a publicação oficial.',
  freshness_unverifiable: 'Os dados divergem e não há datas suficientes para confirmar qual versão é mais recente. Confira a publicação oficial.',
};

export function SourceReliability({opportunityId}: {opportunityId: string}) {
  const resource = useResource<SourceObservation[]>(`/opportunities/${encodeURIComponent(opportunityId)}/source-observations`);
  const observations = resource.data || [];
  const conflicts = observations.filter(item => item.decision === 'conflicting').length;
  return <section className="source-reliability" aria-label="Atualizações por fonte">
    {!resource.loading && !resource.error && conflicts > 0 && <p className="source-reliability-warning" role="status">
      Há divergências entre as versões consultadas. Os dados anteriores foram preservados; confira a publicação oficial antes de agir.
    </p>}
    <details>
      <summary>Atualizações por fonte{!resource.loading && !resource.error && <span className="muted"> ({observations.length})</span>}</summary>
      <p className="muted small">Registro das consultas realizadas, sem verificação em tempo real. A data da consulta não comprova uma atualização na fonte. Horários de Brasília.</p>
      {resource.loading ? <Loading label="Consultando registros das fontes…"/> : resource.error ? <ErrorNotice message={resource.error} onRetry={resource.reload}/> : observations.length === 0 ? <p className="muted">Ainda não há registros de consultas por fonte para esta oportunidade.</p> : <ul className="source-reliability-list">
        {observations.map((item, index) => {
          const link = safeUrl(item.sourceUrl);
          const decision = decisions[item.decision];
          return <li key={`${item.sourceCode}-${item.consultedAt}-${index}`}>
            <div className="source-reliability-heading"><strong>{item.sourceName || item.sourceCode}</strong><Badge color={decision.color}>{decision.label}</Badge></div>
            <dl><div><dt>Atualização informada pela fonte</dt><dd>{item.reportedUpdatedAt ? date(item.reportedUpdatedAt, true) : 'Não informada pela fonte'}</dd></div><div><dt>Consulta realizada</dt><dd>{date(item.consultedAt, true)}</dd></div></dl>
            <p>{reasons[item.reason] || 'Motivo não reconhecido nesta interface. Confira a publicação oficial.'}</p>
            {link && <a className="text-link" href={link} target="_blank" rel="noopener noreferrer">Abrir publicação em {item.sourceName || item.sourceCode} <span className="small">(nova aba)</span></a>}
          </li>;
        })}
      </ul>}
    </details>
  </section>;
}
