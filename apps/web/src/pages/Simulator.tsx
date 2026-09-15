import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { currency, send, useResource } from "../api";
import { Button, Field, PageHeader, ErrorNotice, useToast } from "../ui";
import {
  initialInputs,
  calculateViability,
  type ViabilityInputs,
} from "../viability";
const fields: [keyof ViabilityInputs, string][] = [
  ["monoPages", "Páginas P&B por mês"],
  ["colorPages", "Páginas coloridas por mês"],
  ["monoPrice", "Preço por página P&B (R$)"],
  ["colorPrice", "Preço por página colorida (R$)"],
  ["monoCost", "Custo variável por página P&B (R$)"],
  ["colorCost", "Custo variável por página colorida (R$)"],
  ["fixedRevenue", "Receita fixa mensal adicional (R$)"],
  ["equipment", "Custo mensal dos equipamentos (R$)"],
  ["operations", "Outros custos fixos mensais (R$)"],
  ["taxPercent", "Tributos sobre receita (%)"],
  ["targetMargin", "Margem operacional desejada (%)"],
  ["months", "Duração do contrato (meses)"],
];
fields.splice(
  2,
  0,
  ["monoIncluded", "Páginas P&B incluídas na franquia mensal"],
  ["colorIncluded", "Páginas coloridas incluídas na franquia mensal"],
);
export function SimulatorPage() {
  const [params, setParams] = useSearchParams();
  const opportunityId = params.get("opportunityId");
  const [inputs, setInputs] = useState<ViabilityInputs>({ ...initialInputs });
  const [name, setName] = useState("Simulação de outsourcing"),
    [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const saved =
    useResource<
      {
        id: string;
        name: string;
        inputs: ViabilityInputs;
        opportunity_id: string | null;
        opportunity_title: string | null;
      }[]
    >("/simulations");
  const toast = useToast();
  const scenarios =
    saved.data?.filter(
      (s) => !opportunityId || s.opportunity_id === opportunityId,
    ) ?? [];
  const result = calculateViability(inputs);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/simulations", "POST", { name, inputs, opportunityId });
      saved.reload();
      toast("Cenário salvo na sua empresa.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="DECISÃO COMERCIAL"
        title="Simulador de viabilidade"
        description="Estime a operação mensal de outsourcing de impressão e compare cenários da sua empresa."
      />
      {opportunityId ? (
        <SimulationContext
          id={opportunityId}
          onRemove={() => {
            setParams({});
            setCompare([]);
          }}
        />
      ) : (
        <p className="info-note">
          Cenário independente. Para vincular a um edital, use “Simular
          viabilidade” nos detalhes da oportunidade ou no radar.
        </p>
      )}
      <div className="settings-grid">
        <form className="card form-section" onSubmit={save}>
          <h2>Premissas do cenário</h2>
          <Field label="Nome do cenário">
            <input
              required
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            {fields.map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  required
                  min={key === "months" ? 1 : 0}
                  max={
                    key === "months"
                      ? 120
                      : key === "taxPercent" || key === "targetMargin"
                        ? 99
                        : undefined
                  }
                  step={key === "months" || key.endsWith("Pages") || key.endsWith('Included') ? 1 : 0.0001}
                  value={inputs[key]}
                  onChange={(e) =>
                    setInputs((v) => ({ ...v, [key]: Number(e.target.value) }))
                  }
                />
              </Field>
            ))}
          </div>
          <Button type="submit" busy={busy}>
            Salvar cenário
          </Button>
        </form>
        <section className="card form-section">
          <h2>Resultado estimado</h2>
          <dl className="detail-fields">
            {[
              ["Receita mensal", currency(result.revenue)],
              ["Custo mensal com tributos", currency(result.totalCost)],
              ["Resultado operacional mensal", currency(result.profit)],
              [
                "Margem sobre a receita",
                result.margin === null
                  ? "Informe a receita"
                  : `${result.margin.toFixed(2)}%`,
              ],
              [
                "Receita mensal para margem desejada",
                result.targetRevenue === null
                  ? "Tributos + margem devem ser menores que 100%"
                  : currency(result.targetRevenue),
              ],
              ["Resultado no período", currency(result.contractProfit)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="info-note">
            {result.revenue === 0
              ? "Preencha os volumes e preços para analisar o cenário."
              : result.profit < 0
                ? "Atenção: as premissas indicam resultado operacional negativo."
                : "Confira custos, volumes e exigências antes de decidir participar."}
          </p>
          <p className="info-note">
            Páginas faturadas por unidade:{" "}
            {result.monoBillable.toLocaleString("pt-BR")} P&B e{" "}
            {result.colorBillable.toLocaleString("pt-BR")} coloridas. Com
            franquia, são apenas os excedentes.
          </p>
          <p className="muted small">
            Receita = valor fixo mensal da franquia/locação + páginas acima da
            franquia × preço unitário. Sem franquia, deixe as páginas incluídas
            em zero. O custo variável considera todas as páginas utilizadas,
            inclusive as incluídas. A franquia P&B não compensa a colorida e não
            acumula entre meses. Informe a mensalidade em “Receita fixa mensal
            adicional”. Informe locação ou depreciação mensal dos equipamentos,
            não a compra inteira. Não inclui fluxo de caixa, reajustes,
            financiamento ou franquias compartilhadas. Evite contar o mesmo
            custo duas vezes. Nenhuma alíquota é presumida.
          </p>
          <h2>Cenários salvos{opportunityId ? " deste edital" : ""}</h2>
          <p className="muted small">
            Abra um cenário para ajustar as premissas e salvar uma nova versão.
            Selecione até três para comparar; nenhuma premissa é alterada
            automaticamente.
          </p>
          {saved.error && (
            <ErrorNotice message={saved.error} onRetry={saved.reload} />
          )}
          <div className="agenda-list">
            {scenarios.map((s) => (
              <div key={s.id}>
                <button
                  className="button secondary"
                  onClick={() => {
                    setName(s.name);
                    setInputs({...initialInputs,...s.inputs});
                    setParams(
                      s.opportunity_id
                        ? { opportunityId: s.opportunity_id }
                        : {},
                    );
                    setCompare([]);
                  }}
                >
                  {s.name}
                </button>
                <p className="muted small">
                  {s.opportunity_title ?? "Cenário independente"}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={compare.includes(s.id)}
                    disabled={!compare.includes(s.id) && compare.length >= 3}
                    onChange={(e) =>
                      setCompare((v) =>
                        e.target.checked
                          ? [...v, s.id]
                          : v.filter((id) => id !== s.id),
                      )
                    }
                  />{" "}
                  Comparar {s.name}
                </label>
              </div>
            ))}
          </div>
          {scenarios.length === 0 && (
            <p className="muted">
              Salve sua primeira simulação para recuperá-la depois.
            </p>
          )}
        </section>
      </div>
      {compare.length > 0 && (
        <section className="card form-section">
          <h2>Comparação de cenários</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cenário</th>
                  <th>Receita mensal</th>
                  <th>Custo mensal</th>
                  <th>Resultado mensal</th>
                  <th>Margem</th>
                  <th>Meses</th>
                  <th>Resultado no período</th>
                </tr>
              </thead>
              <tbody>
                {scenarios
                  .filter((s) => compare.includes(s.id))
                  .map((s) => {
                    const r = calculateViability(s.inputs);
                    return (
                      <tr key={s.id}>
                        <th scope="row">{s.name}</th>
                        <td>{currency(r.revenue)}</td>
                        <td>{currency(r.totalCost)}</td>
                        <td>{currency(r.profit)}</td>
                        <td>
                          {r.margin === null
                            ? "Sem receita"
                            : `${r.margin.toFixed(2)}%`}
                        </td>
                        <td>{s.inputs.months}</td>
                        <td>{currency(r.contractProfit)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Compare cenários com o mesmo escopo e duração. Os valores são
            estimativas baseadas nas premissas informadas, não garantias de
            resultado.
          </p>
        </section>
      )}
    </>
  );
}
function SimulationContext({
  id,
  onRemove,
}: {
  id: string;
  onRemove: () => void;
}) {
  const resource = useResource<{
    id: string;
    title: string;
    agency: string;
    value: number | null;
  }>(`/simulation-context/${encodeURIComponent(id)}`);
  return (
    <section className="card form-section" style={{ marginBottom: 24 }}>
      <h2>Edital vinculado</h2>
      {resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : resource.data ? (
        <>
          <Link to={`/app/oportunidades/${id}`}>{resource.data.title}</Link>
          <p>{resource.data.agency}</p>
          <p className="muted small">
            Valor estimado publicado:{" "}
            {resource.data.value === null
              ? "Não informado"
              : currency(resource.data.value)}
            . Esse valor não é preenchido como receita: pode abranger outros
            itens, lotes ou períodos.
          </p>
        </>
      ) : (
        <p>Carregando dados do edital…</p>
      )}
      <Button variant="secondary" onClick={onRemove}>
        Usar como cenário independente
      </Button>
    </section>
  );
}
