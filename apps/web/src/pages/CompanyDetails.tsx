import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, date, send, useResource } from "../api";
import { Link } from "react-router-dom";
import {
  Button,
  CheckRow,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  useSession,
  useToast,
} from "../ui";
import { CnpjInput } from "../CnpjInput";
import { STATES } from "../types";
const labels = {
  legalName: "Razão social",
  tradeName: "Nome fantasia",
  legalNature: "Natureza jurídica",
  companySize: "Porte informado",
  phone: "Telefone",
  email: "E-mail da empresa",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  zipCode: "CEP",
  stateRegistration: "Inscrição estadual",
  municipalRegistration: "Inscrição municipal",
};
type Key = keyof typeof labels;
type Details = Record<Key, string>;
type Company = {
  companyName: string;
  taxId: string;
  revision: number;
  details: Details;
};
type Lookup = {
  cnpj: string;
  details: Partial<Details>;
  source: string;
  consultedAt: string;
  notice: string;
};
const keys = Object.keys(labels) as Key[];
const groupOne: Key[] = [
  "legalName",
  "tradeName",
  "legalNature",
  "companySize",
  "stateRegistration",
  "municipalRegistration",
];
const groupContact: Key[] = ["phone", "email"];
const groupAddress: Key[] = [
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "zipCode",
];
export default function CompanyDetailsPage() {
  const resource = useResource<Company>("/company-details"),
    { session, refreshSession } = useSession(),
    toast = useToast();
  const [form, setForm] = useState<Company | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lookup, setLookup] = useState<Lookup | null>(null),
    [looking, setLooking] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [selected, setSelected] = useState<Key[]>([]);
  const controller = useRef<AbortController | null>(null);
  const admin = session.role === "ADMIN";
  useEffect(() => {
    if (resource.data)
      setForm({ ...resource.data, details: { ...resource.data.details } });
  }, [resource.data]);
  useEffect(() => () => controller.current?.abort(), []);
  const set = (key: Key, value: string) =>
    setForm(
      form ? { ...form, details: { ...form.details, [key]: value } } : null,
    );
  function changeTax(value: string) {
    controller.current?.abort();
    setLooking(false);
    setLookup(null);
    setSelected([]);
    setForm(form ? { ...form, taxId: value } : null);
  }
  async function consult() {
    if (!form || looking || busy) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLooking(true);
    setLookupError("");
    setLookup(null);
    setSelected([]);
    try {
      const result = await api<Lookup>("/company-details/cnpj-lookup", {
        method: "POST",
        body: JSON.stringify({ cnpj: form.taxId }),
        signal: active.signal,
      });
      if (!active.signal.aborted) setLookup(result);
    } catch (e) {
      if (!active.signal.aborted) setLookupError((e as Error).message);
    } finally {
      if (controller.current === active) setLooking(false);
    }
  }
  function apply() {
    if (!form || !lookup) return;
    const details = { ...form.details };
    for (const key of selected)
      if (lookup.details[key]) details[key] = lookup.details[key]!;
    setForm({ ...form, details });
    setLookup(null);
    setSelected([]);
    toast(
      "Campos escolhidos adicionados ao formulário. Revise e salve para confirmar.",
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await send<Company>("/company-details", "PUT", form);
      resource.setData(saved);
      await refreshSession();
      toast(
        "Dados da empresa salvos. O perfil comercial e os perfis de busca foram preservados.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function inputs(group: Key[]) {
    return group.map((key) => (
      <Field key={key} label={labels[key]}>
        {key === "state" ? (
          <select
            aria-label={labels[key]}
            value={form?.details[key] || ""}
            onChange={(e) => set(key, e.target.value)}
          >
            <option value="">Não informada</option>
            {[...STATES, "EX"].map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={labels[key]}
            value={form?.details[key] || ""}
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            maxLength={
              ["legalName", "tradeName", "street"].includes(key)
                ? 300
                : key === "email"
                  ? 254
                  : ["stateRegistration", "municipalRegistration"].includes(key)
                    ? 60
                    : key === "phone" || key === "number"
                      ? 40
                      : key === "zipCode"
                        ? 9
                        : key === "companySize"
                          ? 100
                          : 200
            }
            onChange={(e) => set(key, e.target.value)}
            placeholder={key === "zipCode" ? "00000-000" : undefined}
          />
        )}
      </Field>
    ));
  }
  return (
    <>
      <PageHeader
        eyebrow="CADASTRO EMPRESARIAL"
        title="Dados da empresa"
        description="Identificação, contatos e endereço para preparar sua operação e os documentos."
        actions={
          <Link className="button secondary" to="/app/perfil">
            Perfil comercial
          </Link>
        }
      />
      <p className="info-note">
        Este cadastro não define interesses ou filtros de busca. Razão social e
        dados cadastrais precisam de conferência antes de usar em documentos;
        não comprovam enquadramento, habilitação ou poderes de representação.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : (
        form && (
          <form onSubmit={save} className="company-details-form">
            {!admin && (
              <p className="info-note">
                Você pode consultar estes dados. Somente administradores da
                empresa podem editar ou consultar o CNPJ.
              </p>
            )}
            {error && (
              <>
                <ErrorNotice message={error} />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Recarregar substituirá este formulário pelos dados salvos. Deseja continuar?",
                      )
                    )
                      resource.reload();
                  }}
                >
                  Recarregar dados salvos
                </Button>
              </>
            )}
            <fieldset disabled={!admin || busy}>
              <section className="card form-section">
                <h2>Identificação</h2>
                <div className="form-grid">
                  <Field label="Nome exibido no portal" required>
                    <input
                      aria-label="Nome exibido no portal"
                      required
                      maxLength={200}
                      value={form.companyName}
                      onChange={(e) =>
                        setForm({ ...form, companyName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="CNPJ">
                    <CnpjInput
                      aria-label="CNPJ da empresa"
                      value={form.taxId}
                      onValueChange={changeTax}
                    />
                  </Field>
                </div>
                {admin && (
                  <>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={consult}
                      busy={looking}
                      disabled={!form.taxId.trim()}
                    >
                      Consultar cadastro pelo CNPJ
                    </Button>
                    {lookupError && <ErrorNotice message={lookupError} />}
                  </>
                )}
                {lookup && (
                  <section
                    className="company-lookup"
                    aria-label="Prévia da consulta CNPJ"
                  >
                    <h3>Confira os dados encontrados</h3>
                    <p className="muted small">
                      {lookup.source} · {date(lookup.consultedAt, true)}.{" "}
                      {lookup.notice}
                    </p>
                    {keys
                      .filter((key) => !!lookup.details[key])
                      .map((key) => (
                        <CheckRow
                          key={key}
                          checked={selected.includes(key)}
                          onChange={(checked) =>
                            setSelected(
                              checked
                                ? [...selected, key]
                                : selected.filter((k) => k !== key),
                            )
                          }
                        >
                          {labels[key]}: {lookup.details[key]}
                        </CheckRow>
                      ))}
                    <p className="muted small">
                      Os campos escolhidos substituem apenas estes valores no
                      formulário, inclusive se já preenchidos. Inscrições e
                      outros dados não retornados ficam preservados.
                    </p>
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={!selected.length}
                      onClick={apply}
                    >
                      Aplicar {selected.length} campos ao formulário
                    </Button>
                  </section>
                )}
                <div className="form-grid">{inputs(groupOne)}</div>
              </section>
              <section className="card form-section">
                <h2>Contatos</h2>
                <div className="form-grid">{inputs(groupContact)}</div>
              </section>
              <section className="card form-section">
                <h2>Endereço cadastral</h2>
                <div className="form-grid">{inputs(groupAddress)}</div>
              </section>
            </fieldset>
            {admin && (
              <div className="button-row">
                <Button type="submit" busy={busy}>
                  Salvar dados da empresa
                </Button>
                <p className="muted small">
                  Nenhum documento é gerado ou enviado ao salvar.
                </p>
              </div>
            )}
          </form>
        )
      )}
    </>
  );
}
