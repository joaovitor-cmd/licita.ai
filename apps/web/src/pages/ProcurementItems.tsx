import { useMemo, useState } from "react";
import { date, safeUrl, useResource } from "../api";
import { HighlightedText } from "../HighlightedText";
import { Button, ErrorNotice, Loading } from "../ui";
import {foldItemText as fold,itemWords as words,createItemInterestMatcher} from '../item-interest';

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
type Profile = {
  id: string;
  name: string;
  active: boolean;
  filters: Record<string, string | number>;
};
const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4,
});
const moneyFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const amount = (n: number | null, money = false) =>
  n == null ? "Não informado" : (money ? moneyFormat : numberFormat).format(n);

export function ProcurementItems({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [profileId, setProfileId] = useState(""),
    [interestsOnly, setInterestsOnly] = useState(false);
  const resource = useResource<Result>(
    `/opportunities/${id}/items?page=${page}`,
  );
  const profiles = useResource<Profile[]>("/search-profiles");
  const profile = profiles.data?.find((p) => p.id === profileId && p.active);
  const terms = String(profile?.filters.terms || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const exclusions = String(profile?.filters.exclude || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const data = resource.data;
  const matchInterest=useMemo(()=>createItemInterestMatcher(terms,exclusions),[profile]);
  const rows = useMemo(
    () =>
      (data?.items || []).map((item) => {
        const interest = matchInterest(item.description);
        return {
          item,
          searchable: fold(`${item.number} ${item.description} ${item.unit || ""}`),
          matched: interest.matched,
          excluded: interest.excluded,
        };
      }),
    [data, profile],
  );
  const interested = rows.filter(
    (row) => row.matched.length > 0 && !row.excluded,
  );
  const queryText = fold(query);
  const visible = rows.filter(
    (row) =>
      (!queryText || row.searchable.includes(queryText)) &&
      (!interestsOnly || !profile || (row.matched.length > 0 && !row.excluded)),
  );
  const highlight = [...terms.flatMap(words), ...words(query)];
  return (
    <section aria-label="Itens da contratação" className="procurement-panel">
      <h2>Itens e valores do edital</h2>
      <p className="muted">
        Quantidades e estimativas publicadas no PNCP. Não representam preço
        vencedor, custo da sua empresa ou proposta enviada.
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
                <div className="procurement-toolbar">
                  <label>
                    Pesquisar nesta página
                    <input
                      aria-label="Pesquisar itens nesta página"
                      type="search"
                      maxLength={200}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Descrição, número ou unidade"
                    />
                  </label>
                  <label>
                    Interesses de um perfil
                    <select
                      aria-label="Interesses de um perfil"
                      value={profile?.id || ""}
                      onChange={(e) => {
                        setProfileId(e.target.value);
                        setInterestsOnly(false);
                      }}
                      disabled={profiles.loading || !!profiles.error}
                    >
                      <option value="">Sem perfil — mostrar todos</option>
                      {(profiles.data || [])
                        .filter((p) => p.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {profile && (
                    <Button
                      variant="secondary"
                      aria-pressed={interestsOnly}
                      onClick={() => setInterestsOnly((v) => !v)}
                      disabled={!terms.length}
                    >
                      {interestsOnly
                        ? "Mostrar todos"
                        : "Só itens de interesse"}
                    </Button>
                  )}
                </div>
                {profiles.error && (
                  <ErrorNotice
                    message="Não foi possível carregar os perfis. Você ainda pode consultar e pesquisar todos os itens."
                    onRetry={profiles.reload}
                  />
                )}
                {profile && (
                  <p className="muted small">
                    {terms.length
                      ? `${interested.length} itens de interesse nesta página. Correspondência de palavras dos interesses; exclusões do perfil são respeitadas.`
                      : "Este perfil não tem termos de interesse. Estados, modalidade e portal filtram editais, não especificações dos itens."}{" "}
                    Esta sinalização não comprova compatibilidade técnica.
                  </p>
                )}
                <p role="status" className="muted small">
                  {visible.length} de {data.items.length} itens desta página ·
                  Consulta em {date(data.checkedAt, true)}
                  {data.stale ? " · Consulta antiga" : " · Cache de até 1 hora"}
                  .{" "}
                  {safeUrl(data.sourceUrl) && (
                    <a
                      href={safeUrl(data.sourceUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Consultar fonte
                    </a>
                  )}
                </p>
                <p className="muted small">
                  Pesquisa e interesses cobrem apenas a página carregada.
                  Percorra as páginas para conferir a contratação completa.
                  Lotes e condições técnicas devem ser confirmados nos anexos.
                </p>
                {!data.items.length ? (
                  <p>
                    Nenhum item retornado nesta página. Isso não confirma
                    ausência de exigências no edital.
                  </p>
                ) : !visible.length ? (
                  <div className="info-note">
                    Nenhum item desta página corresponde ao filtro.{" "}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setQuery("");
                        setInterestsOnly(false);
                      }}
                    >
                      Limpar filtro dos itens
                    </Button>
                  </div>
                ) : (
                  <table className="procurement-table">
                    <caption className="sr-only">
                      Itens oficiais da página {page}, com estimativas e
                      unidades publicadas
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Descrição</th>
                        <th scope="col">Quantidade</th>
                        <th scope="col">Unidade</th>
                        <th scope="col">Estimativa unitária</th>
                        <th scope="col">Estimativa total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(({ item, matched, excluded }) => (
                        <tr key={item.number}>
                          <th scope="row" data-label="Item">
                            {item.number}
                          </th>
                          <td
                            data-label="Descrição"
                            className="procurement-description"
                          >
                            {item.description.length > 320 ? (
                              <details>
                                <summary>
                                  <HighlightedText
                                    text={item.description.slice(0, 200)}
                                    terms={highlight}
                                  />
                                  … <span>Ver descrição completa</span>
                                </summary>
                                <p>
                                  <HighlightedText
                                    text={item.description}
                                    terms={highlight}
                                  />
                                </p>
                              </details>
                            ) : (
                              <HighlightedText
                                text={item.description}
                                terms={highlight}
                              />
                            )}
                            {profile && matched.length > 0 && !excluded && (
                              <small className="item-interest">
                                Interesse: {matched.join(", ")}
                              </small>
                            )}
                            {profile && excluded && (
                              <small className="muted">
                                Contém termo excluído no perfil
                              </small>
                            )}
                            <small className="muted">
                              Situação na fonte:{" "}
                              {item.status || "Não informada"}
                            </small>
                            {item.hasResult && (
                              <small className="muted">
                                Resultado indicado na fonte; valores abaixo
                                ainda são estimativas.
                              </small>
                            )}
                          </td>
                          <td data-label="Quantidade">
                            {amount(item.quantity)}
                          </td>
                          <td data-label="Unidade">
                            {item.unit || "Não informada"}
                          </td>
                          <td data-label="Estimativa unitária">
                            {item.confidential
                              ? "Orçamento sigiloso"
                              : amount(item.estimatedUnit, true)}
                          </td>
                          <td data-label="Estimativa total">
                            {item.confidential
                              ? "Orçamento sigiloso"
                              : amount(item.estimatedTotal, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="item-pagination">
                  <Button
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Página anterior
                  </Button>
                  <span>Página {page} · até 25 itens</span>
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
                <details className="procurement-help">
                  <summary>Como interpretar quantidades e valores</summary>
                  <p>
                    Uma unidade pode representar página, equipamento, mês ou
                    serviço. Confira franquias, insumos, duração e atendimento
                    nos anexos antes de comparar ou simular preços. Valores
                    ausentes ou sigilosos não equivalem a zero.
                  </p>
                </details>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
