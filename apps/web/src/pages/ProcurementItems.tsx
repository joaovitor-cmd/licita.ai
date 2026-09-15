import { useState } from "react";
import { date, safeUrl, useResource } from "../api";
import { Button, ErrorNotice, Loading } from "../ui";

type Item = {
  number: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  confidential: boolean;
  estimatedUnit: number | null;
  estimatedTotal: number | null;
  hasResult: boolean;
  status: string | null;
};
type Result = {
  supported: boolean;
  items: Item[];
  page: number;
  hasMore: boolean;
  checkedAt?: string;
  stale?: boolean;
  notice?: string;
  sourceUrl?: string;
};
const amount = (n: number | null, money = false) =>
  n == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 4,
        ...(money
          ? { style: "currency", currency: "BRL", minimumFractionDigits: 2 }
          : {}),
      }).format(n);
export function ProcurementItems({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Result>(
    `/opportunities/${id}/items?page=${page}`,
  );
  const data = resource.data;
  return (
    <section aria-label="Itens da contratação">
      <h2>O que o órgão pretende contratar</h2>
      <p className="muted">
        Quantidades, unidades e estimativas publicadas no PNCP. Estimativa é uma
        referência do órgão, não o preço vencedor nem o seu custo.
      </p>
      <p className="info-note">
        Em impressão, uma “unidade” pode representar página, equipamento ou mês.
        Confira franquias, insumos, prazo e atendimento nos anexos antes de
        comparar preços ou simular sua proposta.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : (
        data && (
          <>
            {data.notice && (
              <p role="status" className="info-note">
                {data.notice}
              </p>
            )}
            {data.supported && (
              <>
                <p className="muted">
                  Consulta desta página: {date(data.checkedAt, true)}.
                  Reutilizada por até 1 hora.{" "}
                  {safeUrl(data.sourceUrl) && (
                    <a
                    href={safeUrl(data.sourceUrl)}
                    style={{ textDecoration: 'underline' }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Consultar dados na fonte
                    </a>
                  )}
                </p>
                {!data.items.length ? (
                  <p>
                    Nenhum item retornado nesta página. Isso não confirma
                    ausência de exigências no edital.
                  </p>
                ) : (
                  <div className="procurement-items">
                    {data.items.map((item) => (
                      <article className="card" key={item.number}>
                        <h3>Item {item.number}</h3>
                        <p className="long-copy">{item.description}</p>
                        <dl className="detail-fields">
                          <div>
                            <dt>Quantidade</dt>
                            <dd>{amount(item.quantity)}</dd>
                          </div>
                          <div>
                            <dt>Unidade publicada</dt>
                            <dd>{item.unit || "Não informada"}</dd>
                          </div>
                          <div>
                            <dt>Estimativa por unidade</dt>
                            <dd>
                              {item.confidential
                                ? "Orçamento sigiloso"
                                : amount(item.estimatedUnit, true)}
                            </dd>
                          </div>
                          <div>
                            <dt>Estimativa total do item</dt>
                            <dd>
                              {item.confidential
                                ? "Orçamento sigiloso"
                                : amount(item.estimatedTotal, true)}
                            </dd>
                          </div>
                          <div>
                            <dt>Situação na fonte</dt>
                            <dd>{item.status || "Não informada"}</dd>
                          </div>
                        </dl>
                        {item.hasResult && (
                          <p className="info-note">
                            A fonte indica resultado publicado. Os valores acima
                            continuam sendo estimativas; a consulta de
                            resultados homologados ainda não está integrada.
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              <div className="item-pagination">
                  <Button
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Página anterior
                  </Button>
                  <span>Página {page} · até 25 itens por página</span>
                  <Button
                    variant="secondary"
                    disabled={!data.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima página
                  </Button>
                </div>
                {page === 400 && (
                  <p className="info-note">
                    Limite de consulta de 10.000 itens atingido. Confira a
                    publicação completa na fonte.
                  </p>
                )}
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
