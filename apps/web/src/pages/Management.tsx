import { useEffect, useState, type FormEvent } from "react";
import { date, send, useResource } from "../api";
import {useDeparture} from '../Departure';
import {
  Badge,
  Button,
  CheckRow,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  useSession,
  useToast,
} from "../ui";
type Plan = {
  code: string;
  name: string;
  description: string;
  planned_features: string[];
  revision: number;
  max_companies: number;
  enforce_features: boolean;
};
type Plans = { plans: Plan[]; features: string[]; enforced: boolean };
type Company = {
  id: string;
  name: string;
  active: boolean;
  plan_code: string;
  plan_name: string;
  access_revision: number;
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export function WorkspaceSelector() {
  const departure=useDeparture();
  const { session } = useSession(),
    r = useResource<{ id: string; name: string }[]>("/workspaces"),
    rights = useResource<{ multiCompany: boolean }>("/entitlements"),
    [busy, setBusy] = useState(false),
    toast = useToast();
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === "licitaro-workspace-change") window.location.assign("/app");
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  async function change(id: string) {
    if (id === session.organization.id||busy||departure.departing) return;
    try {
      await departure.run(async commit=>{
      setBusy(true);
      await send("/workspaces/switch", "POST", { organizationId: id });
      commit();
      // A browser storage failure must not restore the old company after a
      // successful server switch. This tab still reloads the confirmed context.
      try{localStorage.setItem("licitaro-workspace-change", String(Date.now()));}catch{/* Other tabs may need a manual refresh when browser storage is disabled. */}
      window.location.assign("/app");
      },'Trocar de empresa? As outras abas também serão atualizadas.',true);
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }
  if (!rights.data?.multiCompany) return null;
  return (
    <div className="company-selector">
      <label htmlFor="active-company">Empresa ativa</label>
      <select
        id="active-company"
        value={session.organization.id}
        disabled={busy || r.loading||departure.departing}
        onChange={(e) => change(e.target.value)}
      >
        {(r.data?.length ? r.data : [session.organization]).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {r.error && <span>Não foi possível listar suas empresas.</span>}
    </div>
  );
}
export function AdminPage({
  section = "companies",
}: {
  section?: "companies" | "plans";
}) {
  const { session } = useSession();
  return session.isPlatformAdmin ? (
    <Management section={section} />
  ) : (
    <ErrorNotice message="Gestão restrita ao administrador da plataforma configurado no servidor." />
  );
}
function Management({ section }: { section: "companies" | "plans" }) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [activation, setActivation] = useState(""),
    [busy, setBusy] = useState(false);
  const plans = useResource<Plans>("/management/plans"),
    list = useResource<{ items: Company[]; total: number; pages: number }>(
      `/management/companies?page=${page}&q=${encodeURIComponent(query)}`,
    ),
    toast = useToast();
  const [create, setCreate] = useState({
    name: "",
    taxId: "",
    planCode: "complete",
    ownerName: "",
    ownerEmail: "",
  });
  async function provision(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActivation("");
    try {
      const result = await send<{ id: string; activationUrl: string | null }>(
        "/management/companies",
        "POST",
        create,
      );
      setActivation(result.activationUrl || "");
      setSelected(result.id);
      list.reload();
      toast(
        result.activationUrl
          ? "Empresa criada. Entregue o link de definição de senha ao responsável."
          : "Empresa criada e vinculada ao usuário existente.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="GESTÃO LICITARO"
        title={
          section === "companies"
            ? "Ambientes e acessos"
            : "Planos e funcionalidades"
        }
        description="Administração comercial e operacional do Licitaro, separada do portal dos clientes."
      />
      <p className="info-note">
        Cada ambiente representa um cliente e reúne as empresas permitidas pelo
        plano. Os dados são isolados no banco compartilhado. A aplicação dos
        recursos pode ser ativada por plano; cobrança ainda não está integrada.
      </p>
      {activation && (
        <ActivationLink value={activation} onClose={() => setActivation("")} />
      )}
      {section === "companies" && (
        <div className="management-layout">
          <section className="card management-panel">
            <h2>Ambientes clientes</h2>
            <Field label="Buscar empresa">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            {list.loading ? (
              <Loading />
            ) : list.error ? (
              <ErrorNotice message={list.error} onRetry={list.reload} />
            ) : (
              <>
                <p>{list.data?.total} empresa(s)</p>
                <div className="management-list">
                  {list.data?.items.map((c) => (
                    <button
                      key={c.id}
                      className={`company-row ${selected === c.id ? "selected" : ""}`}
                      onClick={() => {
                        setSelected(c.id);
                        setActivation("");
                      }}
                    >
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.plan_name}</small>
                      </span>
                      <Badge color={c.active ? "green" : "slate"}>
                        {c.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </button>
                  ))}
                </div>
                <div className="item-pagination">
                  <Button
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>Página {page}</span>
                  <Button
                    variant="secondary"
                    disabled={page >= (list.data?.pages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </>
            )}
            <details>
              <summary>Criar empresa e acesso inicial</summary>
              <form onSubmit={provision} className="management-panel">
                <Field label="Nome da empresa">
                  <input
                    required
                    value={create.name}
                    onChange={(e) =>
                      setCreate({ ...create, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="CNPJ (opcional)">
                  <CnpjInput value={create.taxId} onValueChange={value=>setCreate({...create,taxId:value})}/>
                </Field>
                <Field label="Plano inicial">
                  <select
                    value={create.planCode}
                    onChange={(e) =>
                      setCreate({ ...create, planCode: e.target.value })
                    }
                  >
                    {plans.data?.plans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nome do responsável">
                  <input
                    required
                    value={create.ownerName}
                    onChange={(e) =>
                      setCreate({ ...create, ownerName: e.target.value })
                    }
                  />
                </Field>
                <Field label="E-mail do responsável">
                  <input
                    required
                    type="email"
                    value={create.ownerEmail}
                    onChange={(e) =>
                      setCreate({ ...create, ownerEmail: e.target.value })
                    }
                  />
                </Field>
                <p className="muted">
                  E-mail já cadastrado recebe vínculo com esta empresa; a senha
                  existente não muda. Novo usuário recebe link para definir
                  senha, exibido uma única vez aqui.
                </p>
                <Button type="submit" busy={busy}>
                  Criar empresa
                </Button>
              </form>
            </details>
          </section>
          <section>
            {selected ? (
              <CompanyDetail
                key={selected}
                id={selected}
                plans={plans.data?.plans ?? []}
                changed={list.reload}
                onActivation={setActivation}
              />
            ) : (
              <div className="card management-panel">
                <h2>Selecione um ambiente</h2>
                <p>
                  Consulte acessos, plano e registros de gestão. Bloquear
                  preserva o histórico.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {section === "plans" && (
        <section className="card management-panel">
          <h2>Configuração dos planos</h2>
          <p className="muted">
            O limite de empresas sempre é aplicado. Ative “Aplicar
            funcionalidades” para fazer a seleção de recursos valer no servidor.
            Mudanças afetam os ambientes vinculados ao plano.
          </p>
          {plans.error ? (
            <ErrorNotice message={plans.error} onRetry={plans.reload} />
          ) : (
            <div className="plan-drafts">
              {plans.data?.plans.map((p) => (
                <PlanEditor
                  key={p.code + ":" + p.revision}
                  plan={p}
                  features={plans.data!.features}
                  reload={plans.reload}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
function ActivationLink({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  return (
    <section className="card management-panel">
      <h2>Link privado para definir senha</h2>
      <p>
        Válido por 30 minutos. Compartilhe apenas com o titular, por canal
        seguro. Não enviamos e-mail automaticamente. Se expirar, o usuário pode
        solicitar recuperação após o SMTP estar configurado.
      </p>
      <input
        aria-label="Link de definição de senha"
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
      />
      <Button variant="secondary" onClick={onClose}>
        Ocultar link
      </Button>
    </section>
  );
}
function CompanyDetail({
  id,
  plans,
  changed,
  onActivation,
}: {
  id: string;
  plans: Plan[];
  changed: () => void;
  onActivation: (s: string) => void;
}) {
  const r = useResource<{
      company: Company;
      entitlements: {max_companies:number; company_count:number};
      companies: {id:string;name:string;active:boolean}[];
      members: Member[];
      audit: { action: string; occurred_at: string }[];
    }>(`/management/companies/${id}`),
    [form, setForm] = useState<Company | null>(null),
    [busy, setBusy] = useState(false),
    toast = useToast();
  const [member, setMember] = useState({ name: "", email: "", role: "MEMBER" });
  const [companyName,setCompanyName]=useState('');
  async function toggleCompany(c:{id:string;name:string;active:boolean}){
    if(!window.confirm(`${c.active?'Inativar':'Reativar'} ${c.name}? Os dados serão preservados.`))return;
    setBusy(true);try{await send(`/management/environments/${id}/companies/${c.id}`,'PATCH',{active:!c.active});r.reload();changed();toast('Empresa atualizada.');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}
  }
  async function addCompany(e:FormEvent){
    e.preventDefault();setBusy(true);
    try{await send(`/management/environments/${id}/companies`,'POST',{name:companyName});setCompanyName('');r.reload();changed();toast('Empresa adicionada ao ambiente.');}
    catch(e){toast((e as Error).message,true);}finally{setBusy(false);}
  }
  useEffect(() => {
    if (r.data) setForm(r.data.company);
  }, [r.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (
      !form.active &&
      !window.confirm(
        "Inativar esta empresa encerrará seus acessos e cancelará e-mails pendentes. Os dados serão preservados. Continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      await send(`/management/companies/${id}`, "PATCH", {
        name: form.name,
        active: form.active,
        planCode: form.plan_code,
        revision: form.access_revision,
      });
      r.reload();
      changed();
      toast("Empresa atualizada.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(m: Member) {
    if (
      !window.confirm(
        `${m.active ? "Inativar" : "Reativar"} o acesso de ${m.name} a esta empresa?`,
      )
    )
      return;
    setBusy(true);
    try {
      await send(`/management/companies/${id}/members/${m.id}`, "PATCH", {
        active: !m.active,
        role: m.role,
      });
      r.reload();
      toast("Acesso atualizado.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function grant(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await send<{ activationUrl: string | null }>(
        `/management/companies/${id}/members`,
        "POST",
        member,
      );
      onActivation(result.activationUrl || "");
      r.reload();
      toast("Acesso concedido.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (r.loading && !form) return <Loading />;
  if (r.error) return <ErrorNotice message={r.error} onRetry={r.reload} />;
  if (!form) return null;
  return (
    <div className="card management-panel">
      <h2>Gerenciar {r.data?.company.name}</h2>
      <form className="management-panel" onSubmit={save}>
        <Field label="Nome da empresa selecionada">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Plano atribuído">
          <select
            value={form.plan_code}
            onChange={(e) => setForm({ ...form, plan_code: e.target.value })}
          >
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <CheckRow
          checked={form.active}
          onChange={(v) => setForm({ ...form, active: v })}
        >
          Ambiente com acesso liberado
        </CheckRow>
        <Button type="submit" busy={busy}>
          Salvar ambiente
        </Button>
      </form>
      <h3>Empresas deste ambiente</h3>
      <p>{r.data?.entitlements.company_count} de {r.data?.entitlements.max_companies} empresas ativas permitidas pelo plano.</p>
      {r.data?.companies.map(c=><div className="company-row" key={c.id}><span>{c.name} · {c.active?'Ativa':'Inativa'}{c.id===id?' (principal)':''}</span>{c.id!==id&&<Button variant="secondary" disabled={busy} onClick={()=>toggleCompany(c)}>{c.active?'Inativar empresa':'Reativar empresa'}</Button>}</div>)}
      {r.data && r.data.entitlements.company_count<r.data.entitlements.max_companies && form.active && <form onSubmit={addCompany} className="management-panel"><Field label="Nome da nova empresa"><input required minLength={2} value={companyName} onChange={e=>setCompanyName(e.target.value)}/></Field><Button type="submit" busy={busy}>Adicionar empresa ao ambiente</Button><small>Os usuários ativos deste ambiente receberão acesso à nova empresa.</small></form>}
      <h3>Acessos concedidos</h3>
      {r.data?.members.map((m) => (
        <div className="company-row" key={m.id}>
          <span>
            <strong>{m.name}</strong>
            <small>
              {m.email} · {m.role === "ADMIN" ? "Administrador" : "Membro"}
            </small>
            <Badge color={m.active ? "green" : "slate"}>
              {m.active ? "Ativo" : "Inativo"}
            </Badge>
          </span>
          <Button variant="secondary" disabled={busy} onClick={() => toggle(m)}>
            {m.active ? "Inativar" : "Reativar"}
          </Button>
        </div>
      ))}
      <details>
        <summary>Conceder acesso a outra pessoa</summary>
        <form className="management-panel" onSubmit={grant}>
          <Field label="Nome da pessoa">
            <input
              required
              value={member.name}
              onChange={(e) => setMember({ ...member, name: e.target.value })}
            />
          </Field>
          <Field label="E-mail da pessoa">
            <input
              required
              type="email"
              value={member.email}
              onChange={(e) => setMember({ ...member, email: e.target.value })}
            />
          </Field>
          <Field label="Papel nesta empresa">
            <select
              value={member.role}
              onChange={(e) => setMember({ ...member, role: e.target.value })}
            >
              <option value="MEMBER">Membro</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </Field>
          <Button type="submit" busy={busy}>
            Conceder acesso
          </Button>
        </form>
      </details>
      <details>
        <summary>Últimas ações de gestão</summary>
        {r.data?.audit.map((a, i) => (
          <p key={i}>
            {date(a.occurred_at, true)} · {a.action}
          </p>
        ))}
      </details>
    </div>
  );
}
const featureLabels: Record<string, string> = {
  discovery: "Busca",
  radar: "Radar",
  catalog: "Catálogo",
  documents: "Biblioteca",
  analysis: "Leitura assistida",
  simulator: "Simulador",
  digest: "Boletim",
  changeAlerts: "Avisos de mudanças",
  commercialHistory: "Histórico comercial",
};
function PlanEditor({
  plan,
  features,
  reload,
}: {
  plan: Plan;
  features: string[];
  reload: () => void;
}) {
  const [form, setForm] = useState(plan),
    [busy, setBusy] = useState(false),
    toast = useToast();
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send(`/management/plans/${plan.code}`, "PUT", {
        name: form.name,
        description: form.description,
        plannedFeatures: form.planned_features,
        maxCompanies: form.max_companies,
        enforceFeatures: form.enforce_features,
        revision: form.revision,
      });
      reload();
      toast("Plano atualizado.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="management-panel plan-draft" onSubmit={save}>
      <Badge>{form.enforce_features ? 'Funcionalidades controladas pelo plano' : 'Todas as funcionalidades liberadas'}</Badge>
      <Field label="Limite de empresas por ambiente"><input type="number" min={1} max={100} required value={form.max_companies} onChange={e=>setForm({...form,max_companies:Number(e.target.value)})}/></Field>
      <CheckRow checked={form.enforce_features} onChange={v=>setForm({...form,enforce_features:v})}>Liberar apenas as funcionalidades selecionadas abaixo</CheckRow>
      <Field label={`Nome do plano ${plan.code}`}>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Descrição comercial">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      {features.map((f) => (
        <CheckRow
          key={f}
          checked={form.planned_features.includes(f)}
          onChange={(v) =>
            setForm({
              ...form,
              planned_features: v
                ? [...form.planned_features, f]
                : form.planned_features.filter((x) => x !== f),
            })
          }
        >
          {featureLabels[f] || f}
        </CheckRow>
      ))}
      <Button variant="secondary" type="submit" busy={busy}>
        Salvar plano
      </Button>
    </form>
  );
}
import {CnpjInput} from '../CnpjInput';
