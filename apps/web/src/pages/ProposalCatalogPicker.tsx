import { useState } from "react";
import { useResource } from "../api";
import { decimalInput, moneyExact } from "../proposal-values";
import { Button, ErrorNotice, Loading } from "../ui";

type Option = {
  id: string;
  name: string;
  unit: string | null;
  salePrice: string | null;
  priceBasis: string | null;
};
type Result = { items: Option[]; page: number; hasMore: boolean };
const normalizeUnit = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export default function ProposalCatalogPicker({
  unit,
  price,
  onSelect,
  onClose,
}: {
  unit: string;
  price: string;
  onSelect: (id: string, price: string | null, name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const resource = useResource<Result>(
    `/proposals/catalog-options?q=${encodeURIComponent(search)}&page=${page}`,
  );
  function apply(option: Option) {
    const value =
      option.salePrice === null ? null : decimalInput(option.salePrice);
    if (value === null) return;
    let original: string | null;
    try {
      original = decimalInput(price);
    } catch {
      original = price;
    }
    if (
      original !== null &&
      original !== value &&
      !window.confirm(
        "Substituir o preço ofertado desta linha pelo preço de venda selecionado?",
      )
    )
      return;
    onSelect(option.id, value, option.name);
  }
  return (
    <section
      className="proposal-picker"
      aria-label="Catálogo comercial da linha"
    >
      <div className="proposal-heading">
        <h4>Escolher produto do catálogo</h4>
        <Button type="button" variant="ghost" onClick={onClose}>
          Fechar catálogo
        </Button>
      </div>
      <p className="muted">
        Somente preços de venda. Vincular um produto não comprova
        compatibilidade técnica e não altera sua descrição, quantidade ou
        unidade.
      </p>
      <label>
        Pesquisar produtos
        <input
          type="search"
          maxLength={100}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <Button
        type="button"
        onClick={() => {
          setSearch(query.trim());
          setPage(1);
        }}
      >
        Pesquisar catálogo
      </Button>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : (
        resource.data && (
          <>
            {!resource.data.items.length && (
              <p>Nenhum produto ativo encontrado.</p>
            )}
            {resource.data.items.map((option) => {
              let value: string | null = null;
              try {
                value =
                  option.salePrice === null
                    ? null
                    : decimalInput(option.salePrice);
              } catch {
                /* An unsupported commercial amount must not be applied. */
              }
              const compatible =
                !!normalizeUnit(unit) &&
                !!option.unit &&
                normalizeUnit(unit) === normalizeUnit(option.unit) &&
                option.priceBasis === "PER_UNIT" &&
                value !== null;
              return (
                <article key={option.id} className="proposal-catalog-option">
                  <strong>{option.name}</strong>
                  <p>
                    Unidade: {option.unit || "Não informada"} · Preço de venda:{" "}
                    {value === null ? "Não informado" : moneyExact(value)}
                  </p>
                  {!compatible && (
                    <p className="muted">
                      Não é possível aplicar este preço: confira unidade,
                      periodicidade e preço de venda no catálogo. Não haverá
                      conversão automática.
                    </p>
                  )}
                  <div className="proposal-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onSelect(option.id, null, option.name)}
                    >
                      Vincular sem aplicar preço
                    </Button>
                    <Button
                      type="button"
                      disabled={!compatible}
                      onClick={() => apply(option)}
                    >
                      Aplicar preço de venda
                    </Button>
                  </div>
                </article>
              );
            })}
            <div className="proposal-actions">
              <Button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Catálogo: página anterior
              </Button>
              <span>Página {page}</span>
              <Button
                type="button"
                disabled={!resource.data.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Catálogo: próxima página
              </Button>
            </div>
          </>
        )
      )}
    </section>
  );
}
