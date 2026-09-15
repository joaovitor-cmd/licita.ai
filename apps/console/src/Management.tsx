import {useEffect,useState,type FormEvent} from 'react';
import {Plus, Pencil, LockKeyhole, Archive, RotateCcw} from 'lucide-react';
import {date,send,useResource} from './api';
import {Badge,Button,CheckRow,Empty,ErrorNotice,Field,Loading,Modal,PageHeader,useToast} from '../../web/src/ui';
import {useCanManage} from './session';
type Plan={code:string;name:string;description:string;planned_features:string[];revision:number;max_companies:number;enforce_features:boolean};
type Plans={plans:Plan[];features:string[];enforced:boolean};
type Company={id:string;name:string;tax_id:string|null;active:boolean;archived_at:string|null;plan_code:string;plan_name:string;access_revision:number;created_at?:string};
type Member={id:string;name:string;email:string;role:string;active:boolean};
export function Management({section}:{section:'companies'|'plans'}){
 const canManage=useCanManage(),toast=useToast();
 const [page,setPage]=useState(1),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState(''),[adding,setAdding]=useState(false),[activation,setActivation]=useState(''),[busy,setBusy]=useState(false);
 const plans=useResource<Plans>('/management/plans'),list=useResource<{items:Company[];total:number;pages:number}>(`/management/companies?page=${page}&q=${encodeURIComponent(query)}&archived=${archived}`);
 const [create,setCreate]=useState({name:'',taxId:'',planCode:'complete',ownerName:'',ownerEmail:''});
 async function provision(e:FormEvent){e.preventDefault();setBusy(true);try{const result=await send<{id:string;activationUrl:string|null}>('/management/companies','POST',create);setActivation(result.activationUrl||'');setSelected(result.id);setAdding(false);list.reload();toast('Ambiente criado.');setCreate({name:'',taxId:'',planCode:'complete',ownerName:'',ownerEmail:''});}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}
 async function action(c:Company,kind:'toggle'|'archive'|'restore'){
  const message=kind==='archive'?`Excluir/arquivar o ambiente "${c.name}"? Os acessos serão bloqueados e os dados preservados para histórico e restauração.`:kind==='restore'?`Restaurar "${c.name}"? O ambiente permanecerá bloqueado até ser liberado.`:`${c.active?'Bloquear':'Liberar'} o ambiente "${c.name}"?${c.active?' Os acessos ativos serão encerrados.':''}`;
  if(!window.confirm(message))return;setBusy(true);
  try{if(kind==='archive')await send(`/management/companies/${c.id}`,'DELETE',{revision:c.access_revision});else if(kind==='restore')await send(`/management/companies/${c.id}/restore`,'POST',{revision:c.access_revision});else await send(`/management/companies/${c.id}`,'PATCH',{name:c.name,taxId:c.tax_id||'',active:!c.active,planCode:c.plan_code,revision:c.access_revision});list.reload();toast(kind==='archive'?'Ambiente arquivado. Os dados foram preservados.':'Ambiente atualizado.');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}
 }
 return <><PageHeader eyebrow="OPERAÇÃO DA PLATAFORMA" title={section==='companies'?'Ambientes de clientes':'Personalização de planos'} description={section==='companies'?'Crie e organize os ambientes, acompanhe seu status e controle a liberação de acesso.':'Defina o limite de empresas e os recursos disponíveis em cada plano.'} actions={section==='companies'&&canManage?<Button onClick={()=>setAdding(true)}><Plus size={17}/>Adicionar novo ambiente</Button>:undefined}/>
 {activation&&<ActivationLink value={activation} onClose={()=>setActivation('')}/>}
 {section==='companies'?<><form className="card management-panel console-environment-filters" onSubmit={e=>{e.preventDefault();setQuery(search);setPage(1);}}><Field label="Buscar ambiente"><input placeholder="Nome ou CNPJ" value={search} onChange={e=>setSearch(e.target.value)}/></Field><Field label="Visualização"><select value={archived?'archived':'current'} onChange={e=>{setArchived(e.target.value==='archived');setPage(1);}}><option value="current">Ambientes atuais</option><option value="archived">Arquivados</option></select></Field><Button variant="secondary" type="submit">Buscar</Button></form>
 {list.loading?<Loading/>:list.error?<ErrorNotice message={list.error} onRetry={list.reload}/>:list.data?.items.length?<><p className="muted">{list.data.total} ambiente(s) {archived?'arquivado(s)':'encontrado(s)'}</p><div className="card console-table-wrap"><table className="console-table console-environments"><thead><tr><th>Ambiente / empresa principal</th><th>Plano</th><th>Status</th><th>Ações</th></tr></thead><tbody>{list.data.items.map(c=><tr key={c.id}><td><strong>{c.name}</strong><small>{c.tax_id||'CNPJ não informado'}</small>{c.created_at&&<small>Criado em {date(c.created_at)}</small>}</td><td>{c.plan_name}</td><td><Badge color={c.archived_at?'slate':c.active?'green':'amber'}>{c.archived_at?'Arquivado':c.active?'Liberado':'Bloqueado'}</Badge></td><td><div className="console-row-actions">{!c.archived_at&&<Button variant="secondary" onClick={()=>setSelected(c.id)}><Pencil size={14}/>{canManage?'Editar':'Visualizar'}</Button>}{canManage&&(c.archived_at?<Button variant="secondary" disabled={busy} onClick={()=>action(c,'restore')}><RotateCcw size={14}/>Restaurar</Button>:<><Button variant="secondary" disabled={busy} onClick={()=>action(c,'toggle')}><LockKeyhole size={14}/>{c.active?'Bloquear':'Liberar'}</Button><Button variant="danger" disabled={busy} onClick={()=>action(c,'archive')}><Archive size={14}/>Excluir/arquivar</Button></>)}</div></td></tr>)}</tbody></table></div><div className="item-pagination"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page} de {Math.max(1,list.data.pages)}</span><Button variant="secondary" disabled={page>=list.data.pages} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div></>:<Empty title={archived?'Nenhum ambiente arquivado':'Nenhum ambiente encontrado'} description={archived?'Ambientes excluídos de forma recuperável aparecerão aqui.':'Adicione um ambiente ou ajuste a busca.'}/>}
 <p className="info-note">Um ambiente representa um cliente e reúne as empresas permitidas pelo plano. Bloquear encerra o acesso; excluir/arquivar também o remove da lista principal, sem apagar o histórico.</p></>:plans.error?<ErrorNotice message={plans.error} onRetry={plans.reload}/>:plans.loading?<Loading/>:<><p className="info-note">Alterações afetam todos os ambientes vinculados ao plano. O limite de empresas sempre é aplicado. Cobrança automática ainda não está integrada.</p><div className="plan-drafts">{plans.data?.plans.map(p=><PlanEditor key={p.code+':'+p.revision} plan={p} features={plans.data!.features} reload={plans.reload}/>)}</div></>}
 {adding&&<Modal title="Adicionar novo ambiente" description="Cadastre a empresa principal e o acesso inicial do responsável." onClose={()=>!busy&&setAdding(false)}><form onSubmit={provision} className="management-panel"><Field label="Nome da empresa principal"><input required minLength={2} value={create.name} onChange={e=>setCreate({...create,name:e.target.value})}/></Field><Field label="CNPJ"><CnpjInput value={create.taxId} onValueChange={value=>setCreate({...create,taxId:value})}/></Field><Field label="Plano inicial"><select value={create.planCode} onChange={e=>setCreate({...create,planCode:e.target.value})}>{plans.data?.plans.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></Field><Field label="Nome do responsável"><input required minLength={2} value={create.ownerName} onChange={e=>setCreate({...create,ownerName:e.target.value})}/></Field><Field label="E-mail do responsável"><input required type="email" value={create.ownerEmail} onChange={e=>setCreate({...create,ownerEmail:e.target.value})}/></Field><p className="muted">Se o e-mail já estiver cadastrado no portal do cliente, será vinculado sem alteração de senha. Para novo usuário, um link privado de ativação será exibido.</p><Button type="submit" busy={busy} disabled={plans.loading||!!plans.error}>Criar ambiente</Button></form></Modal>}
 {selected&&<Modal title={canManage?'Editar ambiente':'Visualizar ambiente'} wide onClose={()=>setSelected('')}><CompanyDetail key={selected} id={selected} plans={plans.data?.plans||[]} changed={list.reload} onActivation={value=>{setActivation(value);if(value)setSelected('');}}/></Modal>}
 </>;
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
  const canManage=useCanManage();
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
        taxId: form.tax_id || '',
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
      <fieldset disabled={!canManage || busy} className="console-fieldset">
      <form className="management-panel" onSubmit={save}>
        <Field label="Nome da empresa selecionada">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="CNPJ"><CnpjInput value={form.tax_id || ""} onValueChange={value=>setForm({...form,tax_id:value})}/></Field>
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
      </fieldset>
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
  const canManage=useCanManage();
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
    <form className="management-panel plan-draft" onSubmit={save}><fieldset className="console-fieldset" disabled={!canManage || busy}>
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
      </fieldset>
    </form>
  );
}
import {CnpjInput} from '../../web/src/CnpjInput';
