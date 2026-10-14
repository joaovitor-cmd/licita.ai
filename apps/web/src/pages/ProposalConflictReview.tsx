import { useState } from "react";
import { useResource, date } from "../api";
import { Button, ErrorNotice, Loading } from "../ui";
import {
  compareCommercialDrafts,
  type CommercialDraft,
} from "../proposal-comparison";
import type { Context, Saved } from "./CommercialProposals";
export default function ProposalConflictReview({
  id,
  proposalId,
  draft,
  originalContext,
  onClose,
  onAdopt,
}: {
  id: string;
  proposalId: string | null;
  draft: CommercialDraft;
  originalContext: Context;
  onClose: () => void;
  onAdopt?: (context: Context) => void;
}) {
  const context = useResource<Context>(`/opportunities/${id}/proposal-context`);
  const [confirmed, setConfirmed] = useState<Context | null>(null);
  const available = !context.loading && !context.error && context.data;
  const checked = !!available && confirmed === available;
  const sameCompany =
    available && available.company.id === originalContext.company.id;
  return (
    <section
      aria-label="Conferir conflito da cotação"
      className="proposal-picker"
    >
      <div className="proposal-heading">
        <h3>Conferir antes de tentar salvar</h3>
        <Button type="button" variant="ghost" onClick={onClose}>
          Fechar conferência
        </Button>
      </div>
      <p className="info-note">
        Consultar não altera seu rascunho nem grava versões. Aplicar referências
        exige confirmação abaixo e mantém os campos comerciais. A versão-base
        não muda; a proteção contra alterações concorrentes continua ativa.
      </p>
      {context.loading ? (
        <Loading />
      ) : context.error ? (
        <ErrorNotice message={context.error} onRetry={context.reload} />
      ) : (
        context.data && (
          <>
            <dl className="proposal-conditions-view">
              <div>
                <dt>Empresa no início da edição</dt>
                <dd>
                  {originalContext.company.details.legalName ||
                    originalContext.company.name}{" "}
                  · CNPJ {originalContext.company.cnpj || "não informado"} ·
                  revisão {originalContext.company.revision}
                </dd>
              </div>
              <div>
                <dt>Empresa consultada agora</dt>
                <dd>
                  {context.data.company.details.legalName ||
                    context.data.company.name}{" "}
                  · CNPJ {context.data.company.cnpj || "não informado"} ·
                  revisão {context.data.company.revision}
                </dd>
              </div>
            </dl>
            {context.data.company.revision !==
              originalContext.company.revision && (
              <p className="info-note">
                O cadastro da empresa mudou desde que esta edição começou.
                Confira os dados em Dados da empresa antes de atualizar as
                referências deste rascunho.
              </p>
            )}
            {context.data.sourceFingerprint !==
              originalContext.sourceFingerprint && (
              <p className="info-note">
                O edital mudou desde que esta edição começou. Confira o
                histórico de mudanças e os anexos; o contexto antigo não será
                trocado automaticamente.
              </p>
            )}
          </>
        )
      )}
      <p className="muted">
        Abra{" "}
        <a href="/app/empresa" target="_blank" rel="noopener noreferrer">
          Dados da empresa em outra aba
        </a>{" "}
        e{" "}
        <a
          href={`/app/oportunidades/${encodeURIComponent(id)}?tab=mudancas`}
          target="_blank"
          rel="noopener noreferrer"
        >
          mudanças do edital em outra aba
        </a>{" "}
        para conferir sem sair desta cotação.
      </p>
      {onAdopt && (
        <div className="info-note">
          <p>
            Atualizar referências não atualiza quantidades, descrições, itens,
            preços nem condições. Itens oficiais e vínculos de catálogo ainda
            podem exigir nova conferência. Nenhuma revisão de outra pessoa será
            incorporada automaticamente.
          </p>
          {!sameCompany && available && (
            <p role="alert">
              A empresa consultada não é a mesma desta edição. Reabra a cotação
              no contexto correto; não é permitido transferir referências entre
              empresas.
            </p>
          )}
          <label className="proposal-reference-confirmation">
            <input
              type="checkbox"
              checked={checked}
              disabled={!sameCompany}
              onChange={(event) =>
                setConfirmed(
                  event.target.checked && available ? available : null,
                )
              }
            />{" "}
            Conferi os dados da empresa e as alterações do edital para este
            rascunho
          </label>
          <Button
            type="button"
            disabled={!checked || !sameCompany}
            onClick={() => {
              if (available && sameCompany) onAdopt(available);
            }}
          >
            Usar referências conferidas
          </Button>
        </div>
      )}
      {proposalId ? (
        <CurrentProposalDifferences proposalId={proposalId} draft={draft} />
      ) : (
        <p className="muted">
          Ainda não há uma versão identificada desta nova cotação para comparar.
          Confira o contexto e preserve os valores do formulário.
        </p>
      )}
    </section>
  );
}
function CurrentProposalDifferences({
  proposalId,
  draft,
}: {
  proposalId: string;
  draft: CommercialDraft;
}) {
  const latest = useResource<Saved>(`/proposals/${proposalId}`),
    [limit, setLimit] = useState(30);
  const current = !latest.loading && !latest.error ? latest.data : null;
  const changes = current
    ? compareCommercialDrafts(draft, current.version.body)
    : [];
  return (
    <>
      {latest.loading ? (
        <Loading />
      ) : latest.error ? (
        <ErrorNotice message={latest.error} onRetry={latest.reload} />
      ) : current ? (
        <>
          <p>
            Versão atual salva: <strong>{current.currentRevision}</strong> ·{" "}
            {current.version.author || "Autor não disponível"} ·{" "}
            {date(current.version.createdAt, true)}
          </p>
          {current.staleReasons.map((reason) => (
            <p className="muted" key={reason}>
              {reason}
            </p>
          ))}
          {!changes.length ? (
            <p>
              Não há diferenças nos campos comerciais comparados. Referências de
              fonte e conferências ainda podem exigir atualização.
            </p>
          ) : (
            <>
              <p>
                {changes.length} diferenças comerciais em relação ao seu
                rascunho.
              </p>
              <div className="proposal-lines">
                {changes.slice(0, limit).map((change, index) => (
                  <article key={index}>
                    <h4>{change.label}</h4>
                    <dl className="proposal-conditions-view">
                      <div>
                        <dt>Seu rascunho</dt>
                        <dd>{change.mine}</dd>
                      </div>
                      <div>
                        <dt>Versão atual salva</dt>
                        <dd>{change.current}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              {changes.length > limit && (
                <Button
                  type="button"
                  onClick={() => setLimit((value) => value + 30)}
                >
                  Mostrar mais diferenças
                </Button>
              )}
            </>
          )}
          <p className="muted">
            Para substituir o rascunho, abra a cotação salva e confirme o
            descarte das alterações. Para preservar seu trabalho, mantenha este
            formulário; mesclagem assistida ainda não está disponível.
          </p>
        </>
      ) : (
        <p className="muted">
          Ainda não há uma versão identificada desta nova cotação para comparar.
          Confira o contexto e preserve os valores do formulário.
        </p>
      )}
    </>
  );
}
