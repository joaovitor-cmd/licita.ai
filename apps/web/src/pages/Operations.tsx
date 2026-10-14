import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import {HomePreference} from './UserPreferences';
const CatalogImport=lazy(()=>import('./CatalogImport').then(module=>({default:module.CatalogImport})));
import {
  Bell,
  Building2,
  Check,
  CircleHelp,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  Wrench,
} from "lucide-react";
import { Link,useSearchParams } from "react-router-dom";
import {downloadDocumentsZip} from '../document-download';
import {DocumentTemplates} from "../DocumentTemplates";
import {DocumentDeadline} from "../DocumentDeadline";
import {
  api,
  date,
  dateInput,
  safeUrl,
  send,
  splitTerms,
  useResource,
} from "../api";
import type {
  DocumentItem,
  Member,
  Notification,
  Offering,
  Profile,
  SourceData,
} from "../types";
import { STATES } from "../types";
import {EmailHistory} from './EmailHistory';
import {CnpjProfileSuggestion} from './CnpjProfileSuggestion';
import {CnpjInput} from '../CnpjInput';
import {DigestSettingsPanel} from './Digests';
import {ChangeAlertSettings} from './SourceChanges';
import {
  Badge,
  Button,
  CheckRow,
  Confirm,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeader,
  useSession,
  useToast,
} from "../ui";

export function CatalogPage() {
  const [importOpen,setImportOpen]=useState(false);
  const resource = useResource<Offering[]>("/catalog"),
    toast = useToast();
  const [modal, setModal] = useState<Offering | "new" | null>(null),
    [remove, setRemove] = useState<Offering | null>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState("");
  const items = (resource.data || []).filter(
    (o) =>
      (!filter || o.type === filter) &&
      `${o.name} ${o.category} ${o.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function deleteItem() {
    if (!remove) return;
    setBusy(true);
    try {
      await send(`/catalog/${remove.id}`, "DELETE");
      setRemove(null);
      resource.reload();
      toast("Item excluído do catálogo.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="O QUE SUA EMPRESA OFERECE"
        title="Catálogo de soluções"
        description="Um catálogo bem definido torna suas recomendações mais relevantes."
        actions={
          <><Button variant="secondary" onClick={()=>setImportOpen(true)}>Importar CSV</Button>
          <Button onClick={() => setModal("new")}>
            <Plus size={17} /> Adicionar item
          </Button></>
        }
      />
      {importOpen&&<Suspense fallback={<Loading label="Abrindo importação…"/>}><CatalogImport onClose={()=>setImportOpen(false)} onSaved={()=>{setImportOpen(false);resource.reload();}}/></Suspense>}
      <div className="mini-metrics">
        <div>
          <span className="metric-icon blue">
            <Package size={20} />
          </span>
          <div>
            <strong>
              {resource.data?.filter((i) => i.type === "PRODUCT").length || 0}
            </strong>
            <span>Produtos cadastrados</span>
          </div>
        </div>
        <div>
          <span className="metric-icon purple">
            <Wrench size={20} />
          </span>
          <div>
            <strong>
              {resource.data?.filter((i) => i.type === "SERVICE").length || 0}
            </strong>
            <span>Serviços cadastrados</span>
          </div>
        </div>
        <div>
          <span className="metric-icon green">
            <Check size={20} />
          </span>
          <div>
            <strong>
              {resource.data?.filter((i) => i.active).length || 0}
            </strong>
            <span>Itens ativos no matching</span>
          </div>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="segment-control">
          {[
            ["", "Todos"],
            ["PRODUCT", "Produtos"],
            ["SERVICE", "Serviços"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="input-with-icon">
          <Search size={16} />
          <input
            aria-label="Buscar no catálogo"
            placeholder="Buscar item ou categoria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : resource.loading ? (
        <Loading />
      ) : items.length ? (
        <div className="catalog-grid">
          {items.map((item) => (
            <article
              className={`card catalog-card ${item.active ? "" : "inactive"}`}
              key={item.id}
            >
              <div className="catalog-card-top">
                <span
                  className={`solution-icon ${item.type === "SERVICE" ? "purple" : "blue"}`}
                >
                  {item.type === "SERVICE" ? (
                    <Wrench size={22} />
                  ) : (
                    <Package size={22} />
                  )}
                </span>
                <Badge color={item.active ? "green" : "slate"} dot>
                  {item.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <span className="overline">
                {item.type === "PRODUCT" ? "PRODUTO" : "SERVIÇO"} ·{" "}
                {item.category || "SEM CATEGORIA"}
              </span>
              <h2>{item.name}</h2>
              <p>
                {item.description ||
                  "Adicione uma descrição para contextualizar sua solução."}
              </p>
              <div className="tag-list">
                {item.keywords.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </div>
              <div className="catalog-card-footer">
                <span>Atualizado em {date(item.updatedAt)}</span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setModal(item)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${item.name}`}
                    onClick={() => setRemove(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty
            icon={<Package size={30} />}
            title={
              query || filter
                ? "Nenhum item neste filtro"
                : "Apresente suas soluções"
            }
            description="Cadastre seus produtos e serviços. Os itens ativos e suas palavras-chave ajudam a identificar editais relevantes."
            action={
              <Button onClick={() => setModal("new")}>
                <Plus size={16} /> Cadastrar item
              </Button>
            }
          />
        </div>
      )}
      <p className="page-note">
        <CircleHelp size={14} /> A análise usa palavras-chave e características
        do catálogo. Não há uso de IA paga.
      </p>
      {modal && (
        <OfferingModal
          item={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            resource.reload();
          }}
        />
      )}
      {remove && (
        <Confirm
          title="Excluir item do catálogo?"
          message={`“${remove.name}” deixará de contribuir para as recomendações. Esta exclusão é permanente. Você também pode editar o item e desativá-lo.`}
          busy={busy}
          onClose={() => !busy && setRemove(null)}
          onConfirm={deleteItem}
        />
      )}
    </>
  );
}
function OfferingModal({
  item,
  onClose,
  onSaved,
}: {
  item?: Offering;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name || ""),
    [type, setType] = useState(item?.type || "PRODUCT"),
    [description, setDescription] = useState(item?.description || ""),
    [category, setCategory] = useState(item?.category || ""),
    [keywords, setKeywords] = useState(item?.keywords.join(", ") || ""),
    [active, setActive] = useState(item?.active ?? true),
    [unit,setUnit]=useState(item?.unit||''),
    [unitCost,setUnitCost]=useState(item?.unitCost==null?'':String(item.unitCost)),
    [salePrice,setSalePrice]=useState(item?.salePrice==null?'':String(item.salePrice)),
    [priceBasis,setPriceBasis]=useState(item?.priceBasis||''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        `/catalog${item ? `/${item.id}` : ""}`,
        item ? "PATCH" : "POST",
        {
          name,
          type,
          description,
          category,
          keywords: splitTerms(keywords),
          active,
          unit:unit.trim()||null,
          unitCost:unitCost===''?null:Number(unitCost),
          salePrice:salePrice===''?null:Number(salePrice),
          priceBasis:priceBasis||null,
        },
      );
      toast(item ? "Item atualizado." : "Item cadastrado.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item ? "Editar solução" : "Adicionar ao catálogo"}
      description="Descreva o que você vende para encontrar oportunidades com mais contexto."
      onClose={() => !busy && onClose()}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        <Field label="Tipo de solução">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Offering["type"])}
          >
            <option value="PRODUCT">Produto</option>
            <option value="SERVICE">Serviço</option>
          </select>
        </Field>
        <Field label="Nome do item" required>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex.: notebooks corporativos"
          />
        </Field>
        <Field label="Categoria">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={150}
            placeholder="Ex.: Tecnologia da informação"
          />
        </Field>
        <Field label="Descrição">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Características, aplicações e diferenciais da solução"
          />
        </Field>
        <Field
          label="Palavras-chave relacionadas"
          hint="Separe por vírgulas. Use nomes e termos presentes nos editais."
        >
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="notebooks, computadores, equipamentos"
          />
        </Field>
        <CheckRow checked={active} onChange={setActive}>
          Item ativo nas recomendações
        </CheckRow>
        <details className="catalog-pricing"><summary>Custos, preço de venda e unidade (opcional)</summary><p className="muted small">Valores de referência do seu catálogo. Custo interno não é preço ofertado. Estes campos não preenchem propostas nem simulações automaticamente.</p><div className="form-grid">
          <Field label="Unidade"><input aria-label="Unidade do catálogo" value={unit} maxLength={80} onChange={e=>setUnit(e.target.value)} placeholder="Ex.: página, equipamento, hora"/></Field>
          <Field label="Periodicidade dos valores"><select aria-label="Periodicidade dos valores" value={priceBasis} onChange={e=>setPriceBasis(e.target.value as typeof priceBasis)}><option value="">Não informada</option><option value="PER_UNIT">Por unidade</option><option value="ONE_TIME">Único</option><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></Field>
          <Field label="Custo interno unitário (R$)"><input aria-label="Custo interno unitário" type="number" min="0" max="1000000000000" step="0.0001" value={unitCost} onChange={e=>setUnitCost(e.target.value)}/></Field>
          <Field label="Preço de venda unitário (R$)"><input aria-label="Preço de venda unitário" type="number" min="0" max="1000000000000" step="0.0001" value={salePrice} onChange={e=>setSalePrice(e.target.value)}/></Field>
        </div></details>
        <div className="modal-footer">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            {item ? "Salvar item" : "Cadastrar item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const calendarDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Sem prazo";
function expiry(value: string | null) {
  if (!value) return { label: "Sem prazo definido", color: "slate" };
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const days=Math.round((Date.parse(value.slice(0,10)+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  return days < 0
    ? { label: "Prazo ultrapassado", color: "red" }
    : days <= 15
      ? {
          label: days===0?"Prazo hoje":`Revisar em ${days} dia${days === 1 ? "" : "s"}`,
          color: "amber",
        }
      : { label: "Prazo definido", color: "green" };
}
export function DocumentsPage() {
  const [params]=useSearchParams();
  const {session}=useSession();
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[downloading,setDownloading]=useState(false);
  const selectAllRef=useRef<HTMLInputElement>(null),downloadController=useRef<AbortController|null>(null);
  const highlight=params.get('highlight');
  const [templatesOpen,setTemplatesOpen]=useState(false),[draftName,setDraftName]=useState(''),[deadlineDocument,setDeadlineDocument]=useState<DocumentItem|null>(null);
  const resource = useResource<DocumentItem[]>("/documents"),
    toast = useToast();
  const [modal, setModal] = useState(false),
    [remove, setRemove] = useState<DocumentItem | null>(null),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState("");
  const items = (resource.data || []).filter((d) =>
    (!highlight||d.id===highlight)&&`${d.name} ${d.category}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selectedDocuments=items.filter(item=>selectedIds.includes(item.id));
  const allSelected=items.length>0&&selectedDocuments.length===items.length;
  const partialSelected=selectedDocuments.length>0&&!allSelected;
  useEffect(()=>{if(selectAllRef.current)selectAllRef.current.indeterminate=partialSelected;},[partialSelected,resource.loading,items.length]);
  useEffect(()=>{setSelectedIds([]);},[q,highlight]);
  useEffect(()=>()=>downloadController.current?.abort(),[]);
  async function downloadSelected(){
    if(downloading||!selectedDocuments.length)return;
    const controller=new AbortController();downloadController.current=controller;setDownloading(true);
    try{await downloadDocumentsZip(selectedDocuments,session.organization.id,controller.signal);if(!controller.signal.aborted)toast('ZIP dos documentos selecionados preparado.');}
    catch(error){if(!controller.signal.aborted)toast((error as Error).message,true);}
    finally{if(!controller.signal.aborted){setDownloading(false);downloadController.current=null;}}
  }
  async function deleteItem() {
    if (!remove) return;
    setBusy(true);
    try {
      await send(`/documents/${remove.id}`, "DELETE");
      resource.reload();
      setRemove(null);
      toast("Documento excluído.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="BIBLIOTECA DA EMPRESA"
        title="Documentos e certidões"
        description="Mantenha os arquivos de habilitação organizados e acompanhe a validade."
        actions={
<><Button variant="secondary" onClick={()=>setTemplatesOpen(true)}><FileText size={17}/> Modelos de declarações</Button><Button onClick={()=>{setDraftName('');setModal(true);}}><Upload size={17}/> Adicionar documento</Button></>
        }
      />
      <div className="info-note">
        <ShieldCheck size={22} />
        <p>
          Os arquivos são privados da sua empresa. O envio ao edital é feito no
          portal oficial. A plataforma não valida autenticidade nem substitui a
          conferência dos requisitos.
        </p>
      </div>
      <div className="list-toolbar">
        <p className="muted">
          {resource.data?.length || 0} documentos · alertas 15 dias antes do prazo
        </p>
        <div className="input-with-icon">
          <Search size={16} />
          <input
            aria-label="Buscar documentos"
            value={q}
            disabled={downloading} onChange={(e) => {setQ(e.target.value);setSelectedIds([]);}}
            placeholder="Buscar documento…"
          />
        </div>
      </div>
      <div className="document-selection-toolbar">
        <label className="check-row"><input ref={selectAllRef} type="checkbox" aria-label="Selecionar todos os documentos visíveis" checked={allSelected} disabled={downloading||resource.loading||!!resource.error||!items.length} onChange={e=>setSelectedIds(e.target.checked?items.map(item=>item.id):[])}/> Selecionar todos os visíveis</label>
        <span className="muted small" role="status" aria-live="polite">{selectedDocuments.length} selecionado{selectedDocuments.length===1?'':'s'}</span>
        <div className="button-row"><Button variant="ghost" disabled={downloading||!selectedDocuments.length} onClick={()=>setSelectedIds([])}>Limpar seleção</Button><Button variant="secondary" disabled={!selectedDocuments.length||resource.loading||!!resource.error} busy={downloading} onClick={downloadSelected}><Download size={16}/> Baixar selecionados (ZIP)</Button></div>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : items.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Selecionar</th>
                <th>Documento</th>
                <th>Categoria</th>
                <th>Prazo</th>
                <th>Situação</th>
                <th>Arquivo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><input type="checkbox" aria-label={`Selecionar ${item.name}`} checked={selectedIds.includes(item.id)} disabled={downloading} onChange={e=>setSelectedIds(previous=>e.target.checked?[...previous,item.id]:previous.filter(id=>id!==item.id))}/></td>
                  <td>
                    <span className="document-table-name">
                      <span className="file-icon">
                        <FileText size={21} />
                      </span>
                      <strong>{item.name}</strong>
                    </span>
                  </td>
                  <td>{item.category}</td>
                  <td className="nowrap">{calendarDate(item.expiresAt)}</td>
                  <td>
                    <Badge color={expiry(item.expiresAt).color}>
                      {expiry(item.expiresAt).label}
                    </Badge>
                  </td>
                  <td>
                    <span className="table-subtitle">{item.fileName}</span>
                    <span className="small muted">
                      {Math.max(1, Math.round(item.size / 1024))} KB
                    </span>
                  </td>
                  <td>
                    <div className="button-row">
                      <Button variant="ghost" onClick={()=>setDeadlineDocument(item)}>Editar prazo</Button>
                      <a
                        className="icon-button"
                        href={`/api/documents/${item.id}/download`}
                        aria-label={`Baixar ${item.name}`}
                      >
                        <Download size={17} />
                      </a>
                      <button
                        className="icon-button"
                        aria-label={`Excluir ${item.name}`}
                        onClick={() => setRemove(item)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <Empty
            icon={<FileCheck2 size={31} />}
            title={
              q ? "Nenhum documento encontrado" : "Sua biblioteca começa aqui"
            }
            description="Adicione certidões, documentos societários e arquivos recorrentes. Defina o vencimento para não perder a validade de vista."
            action={
              <Button onClick={() => setModal(true)}>
                <Plus size={16} /> Adicionar primeiro documento
              </Button>
            }
          />
        </div>
      )}
      <p className="page-note">
        Aceita PDF, DOCX, XLSX, PNG e JPG, até 10 MB por arquivo. Arquivos não
        passam por análise antivírus nesta versão local.
      </p>
      {highlight&&<Link className="text-link" to="/app/documentos">Mostrar todos os documentos</Link>}
      <DocumentTemplates open={templatesOpen} onClose={()=>setTemplatesOpen(false)} onRegister={name=>{setTemplatesOpen(false);setDraftName(name);setModal(true);}}/>
      {deadlineDocument&&<DocumentDeadline document={deadlineDocument} onClose={()=>setDeadlineDocument(null)} onSaved={()=>{setDeadlineDocument(null);resource.reload();}}/>}
      {modal && (
        <DocumentModal initialName={draftName} onBackToTemplate={draftName?()=>{setModal(false);setTemplatesOpen(true);}:undefined}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            resource.reload();
          }}
        />
      )}
      {remove && (
        <Confirm
          title="Excluir documento?"
          message={`O arquivo “${remove.name}” será removido permanentemente desta biblioteca. O original no seu computador não será alterado.`}
          busy={busy}
          onClose={() => !busy && setRemove(null)}
          onConfirm={deleteItem}
        />
      )}
    </>
  );
}
function DocumentModal({
  initialName = "",
  onBackToTemplate,
  onClose,
  onSaved,
}: {
  initialName?: string;
  onBackToTemplate?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName),
    [category, setCategory] = useState(initialName?"Declaração":"Certidão"),
    [expires, setExpires] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("O arquivo deve ter até 10 MB.");
      if(initialName&&(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf')))throw new Error('Envie a declaração preenchida e assinada em PDF.');
      const data = new FormData();
      data.append("file", file);
      data.append("name", name);
      data.append("category", category);
      if (expires) data.append("expiresAt", expires);
      await api("/documents", { method: "POST", body: data });
      toast("Documento adicionado à biblioteca.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Adicionar documento"
      description="Armazene uma cópia privada para a operação da sua empresa."
      onClose={() => !busy && onClose()}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        <Field label="Nome do documento" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex.: certidão de regularidade fiscal"
          />
        </Field>
        <div className="form-grid">
          <Field label="Categoria">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {[
                "Certidão",
                "Declaração",
                "Societário",
                "Habilitação técnica",
                "Financeiro",
                "Proposta",
                "Outros",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Vencimento ou próxima revisão" hint="Defina o prazo real ou uma data interna de revisão. Sem data, não há alerta automático.">
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Arquivo"
          required
          hint={initialName?"Declaração preenchida e assinada em PDF. Máximo 10 MB.":"PDF, DOCX, XLSX, PNG ou JPG. Máximo 10 MB."}
        >
          <input
            className="file-input"
            type="file"
            required
            accept={initialName?".pdf,application/pdf":".pdf,.docx,.xlsx,.png,.jpg,.jpeg"}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <div className="modal-footer">
          {onBackToTemplate&&<Button type="button" variant="secondary" disabled={busy} onClick={onBackToTemplate}>Voltar ao modelo</Button>}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" busy={busy} disabled={!file}>
            <Upload size={16} /> Salvar documento
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ProfilePage() {
  const resource = useResource<Profile>("/profile");
  const { session, refreshSession } = useSession();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (resource.data) setProfile(resource.data);
  }, [resource.data]);
  const admin = session.role === "ADMIN";
  const set = (key: keyof Profile, value: unknown) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved=await send<Profile>("/profile", "PUT", profile);
      if(saved?.organizationName)setProfile(saved);
      window.dispatchEvent(new Event('profile-saved'));
      await refreshSession();
      toast("Perfil salvo. A compatibilidade já considera os novos critérios.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorNotice message={resource.error} onRetry={resource.reload} />;
  if (!profile) return null;
  return (
    <>
      <PageHeader
        eyebrow="A INTELIGÊNCIA COMEÇA COM CONTEXTO"
        title="Perfil comercial"
        description="Conte onde sua empresa atua e quais oportunidades deseja encontrar."
      />
      {!admin && (
        <div className="info-note">
          <ShieldCheck size={20} />
          <p>
            Você pode consultar o perfil. A edição é reservada aos
            administradores da empresa.
          </p>
        </div>
      )}
      <form onSubmit={submit} className="profile-layout">
        <div className="profile-main">
          {error && <ErrorNotice message={error} />}
          <fieldset disabled={!admin || busy}>
            <section className="card form-section">
              <div className="section-heading">
                <div>
                  <span className="step-label">01 · EMPRESA</span>
                  <h2>Seu posicionamento comercial</h2>
                  <p>Informações compartilhadas pelo seu workspace.</p>
                </div>
                <Building2 size={22} />
              </div>
              <div className="form-grid">
                <Field label="Nome da empresa" required>
                  <input
                    required
                    value={profile.organizationName}
                    onChange={(e) => set("organizationName", e.target.value)}
                    maxLength={200}
                  />
                </Field>
                <Field label="CNPJ (opcional)">
                  <CnpjInput
                    aria-label="CNPJ (opcional)"
                    data-tour="cnpj"
                    value={profile.taxId || ""}
                    onValueChange={(value) => set("taxId", value || null)}
                  />
                </Field>
              </div>
              <TermsField
                label="Segmentos de atuação"
                value={profile.segments}
                onChange={(v) => set("segments", v)}
                placeholder="Tecnologia, engenharia, saúde…"
              />
              {admin&&<CnpjProfileSuggestion profile={profile} onApply={p=>{setProfile(p);toast('Sugestões adicionadas. Revise os campos e salve o perfil para confirmar.');}}/>}
            </section>
            <section className="card form-section">
              <div className="section-heading">
                <div>
                  <span className="step-label">02 · ÁREA DE ATUAÇÃO</span>
                  <h2>Onde estão seus próximos clientes?</h2>
                  <p>
                    Selecione UFs prioritárias. Nenhuma seleção significa todo o
                    Brasil.
                  </p>
                </div>
                <SlidersHorizontal size={22} />
              </div>
              <div className="state-grid">
                {STATES.map((state) => (
                  <button
                    type="button"
                    aria-pressed={profile.states.includes(state)}
                    className={profile.states.includes(state) ? "selected" : ""}
                    key={state}
                    onClick={() =>
                      set(
                        "states",
                        profile.states.includes(state)
                          ? profile.states.filter((s) => s !== state)
                          : [...profile.states, state],
                      )
                    }
                  >
                    {state}
                    {profile.states.includes(state) && <Check size={12} />}
                  </button>
                ))}
              </div>
              <div className="button-row region-shortcuts">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    set("states", [
                      ...new Set([...profile.states, "RS", "SC", "PR", "PA"]),
                    ])
                  }
                >
                  Selecionar Sul + Pará
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => set("states", [])}
                >
                  Limpar seleção
                </Button>
              </div>
              <TermsField
                label="Municípios prioritários (opcional)"
                value={profile.cities}
                onChange={(v) => set("cities", v)}
                placeholder="Porto Alegre, Curitiba, Belém…"
              />
            </section>
            <section className="card form-section">
              <div className="section-heading">
                <div>
                  <span className="step-label">03 · INTERESSES</span>
                  <h2>O que devemos procurar?</h2>
                  <p>
                    Prefira termos que costumam aparecer no objeto dos editais.
                  </p>
                </div>
                <Search size={22} />
              </div>
              <TermsField
                label="Palavras-chave de interesse"
                value={profile.keywords}
                onChange={(v) => set("keywords", v)}
                placeholder="notebooks, suporte técnico, equipamentos…"
              />
              <TermsField
                label="Termos a excluir"
                value={profile.excludedKeywords}
                onChange={(v) => set("excludedKeywords", v)}
                placeholder="usados, sucata…"
              />
              <TermsField
                label="Modalidades de interesse"
                value={profile.modalities}
                onChange={(v) => set("modalities", v)}
                placeholder="Pregão eletrônico, dispensa…"
              />
              <div className="form-grid">
                <Field label="Valor mínimo (R$)">
                  <input
                    type="number"
                    min="0"
                    max="1000000000000000"
                    step="0.01"
                    value={profile.minValue ?? ""}
                    onChange={(e) =>
                      set(
                        "minValue",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </Field>
                <Field label="Valor máximo (R$)">
                  <input
                    type="number"
                    min="0"
                    max="1000000000000000"
                    step="0.01"
                    value={profile.maxValue ?? ""}
                    onChange={(e) =>
                      set(
                        "maxValue",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </Field>
              </div>
            </section>
          </fieldset>
          <div className="save-bar">
            <span>As alterações valem para toda a empresa.</span>
            <Button data-tour="save-profile" type="submit" busy={busy} disabled={!admin}>
              <Check size={17} /> Salvar perfil comercial
            </Button>
          </div>
        </div>
        <aside className="profile-aside">
          <div className="card guidance-card">
            <span className="metric-icon purple">
              <Settings2 size={22} />
            </span>
            <h2>Relevância que você entende.</h2>
            <p>
              O perfil orienta uma pontuação transparente, calculada por regras.
            </p>
            <ul>
              <li>Palavras-chave e soluções do catálogo.</li>
              <li>UFs, municípios e modalidades de interesse.</li>
              <li>Faixa de valor e termos excluídos.</li>
            </ul>
            <div className="divider" />
            <p>
              O catálogo complementa os critérios. Mantenha suas soluções e
              palavras-chave atualizadas.
            </p>
            <Link className="text-link" to="/app/catalogo">
              Revisar meu catálogo →
            </Link>
          </div>
          <p className="page-note">
            Esta análise não utiliza LLMs nem atesta a habilitação da empresa.
            Valide os requisitos de cada edital.
          </p>
        </aside>
      </form>
    </>
  );
}
function TermsField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState(value.join(", "));
  useEffect(() => setInput(value.join(", ")), [value.join("|")]);
  return (
    <Field
      label={label}
      hint="Separe os termos por vírgulas. Até 50 termos, mínimo de 2 caracteres."
    >
      <textarea
        rows={2}
        value={input}
        placeholder={placeholder}
        onChange={(e) => setInput(e.target.value)}
        onBlur={() => onChange(splitTerms(input))}
      />
    </Field>
  );
}

const runLabels: Record<string, string> = {
  PENDING: "Na fila",
  RUNNING: "Em andamento",
  SUCCEEDED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
};
export function SourcesPage() {
  const resource = useResource<SourceData>("/sources");
  const { session } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null),
    [queued, setQueued] = useState(false);
  const running = resource.data?.runs.some((r) =>
    ["RUNNING", "PENDING"].includes(r.status),
  );
  useEffect(() => {
    if (!running && !queued) return;
    const timer = setInterval(resource.reload, 4000);
    return () => clearInterval(timer);
  }, [running, queued, resource.reload]);
  useEffect(() => {
    if (queued && resource.data?.runs.length) setQueued(false);
  }, [resource.data]);
  async function sync(code: string) {
    setBusy(code);
    try {
      const response = await send<{ message: string }>(
        "/sources/sync",
        "POST",
        { sourceCode: code },
      );
      toast(response.message);
      setQueued(true);
      resource.reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ORIGEM E CONFIABILIDADE"
        title="Fontes de dados"
        description="Conheça a cobertura, execute coletas e acompanhe o que foi atualizado."
        actions={
          <Button variant="secondary" onClick={resource.reload}>
            <RefreshCw size={16} /> Atualizar status
          </Button>
        }
      />
      <div className="source-intro card">
        <span className="source-intro-icon">
          <Building2 size={30} />
        </span>
        <div>
          <h2>Cobertura nacional. Foco no seu mercado.</h2>
          <p>
            O PNCP reúne publicações federais, estaduais e municipais. RS, SC,
            PR e PA entram pelos filtros do seu perfil; portais regionais
            independentes ainda são uma próxima etapa.
          </p>
          <Link className="text-link" to="/app/perfil">
            Configurar minha área de atuação →
          </Link>
        </div>
      </div>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}{" "}
      {!resource.data && resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <>
            <div className="sources-grid">
              {resource.data.sources.map((source) => (
                <section className="card source-card" key={source.code}>
                  <div className="source-card-heading">
                    <span className="source-monogram">
                      {source.code === "pncp"
                        ? "P"
                        : source.code === "comprasgov"
                          ? "C"
                          : "R"}
                    </span>
                    <div>
                      <h2>{source.name}</h2>
                      <Badge
                        color={
                          source.status === "ready"
                            ? "green"
                            : source.status === "planned"
                              ? "slate"
                              : "amber"
                        }
                        dot
                      >
                        {source.status === "ready"
                          ? "Conector disponível"
                          : source.status === "planned"
                            ? "Planejado"
                            : "Última coleta falhou"}
                      </Badge>
                    </div>
                  </div>
                  <p>{source.description}</p>
                  <dl className="source-stats">
                    <div>
                      <dt>Registros nesta fonte</dt>
                      <dd>{source.records.toLocaleString("pt-BR")}</dd>
                    </div>
                    <div>
                      <dt>Última execução</dt>
                      <dd>
                        {source.lastRun
                          ? date(source.lastRun, true)
                          : "Ainda não executada"}
                      </dd>
                    </div>
                  </dl>
                  <div className="source-actions">
                    {source.status !== "planned" && (
                      <Button
                        variant="secondary"
                        busy={busy === source.code}
                        disabled={
                          session.organization.isDemo ||
                          session.role !== "ADMIN" ||
                          resource.data?.runs.some(
                            (r) =>
                              r.sourceCode === source.code &&
                              ["PENDING", "RUNNING"].includes(r.status),
                          )
                        }
                        onClick={() => sync(source.code)}
                      >
                        <RefreshCw size={15} /> Sincronizar
                      </Button>
                    )}
                    <a
                      className="text-link"
                      href={safeUrl(source.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Fonte oficial <ExternalLink size={13} />
                    </a>
                  </div>
                </section>
              ))}
            </div>
            <div className="scheduler-strip">
              <span
                className={`health-dot ${resource.data.scheduler.enabled ? "" : "waiting"}`}
              />
              <div>
                <strong>
                  {resource.data.scheduler.enabled
                    ? `Monitoramento a cada ${resource.data.scheduler.intervalMinutes} minutos`
                    : "Coleta automática pausada neste ambiente"}
                </strong>
                <p>
                  {resource.data.scheduler.enabled
                    ? "A execução depende de o servidor estar ligado. Editais no radar também passam por revisão individual."
                    : "A coleta manual está disponível para contas reais. A ativação recorrente é feita na configuração do servidor."}
                </p>
              </div>
              <Badge
                color={resource.data.scheduler.enabled ? "green" : "slate"}
              >
                {resource.data.scheduler.enabled ? "Ativo" : "Manual"}
              </Badge>
            </div>
            {session.organization.isDemo && (
              <div className="info-note">
                <CircleHelp size={20} />
                <p>
                  A demonstração usa dados fictícios e não dispara coletas
                  reais. Crie sua conta para sincronizar as fontes oficiais.
                </p>
                <Link className="text-link" to="/cadastro">
                  Criar conta →
                </Link>
              </div>
            )}
            <section className="card sync-history">
              <div className="section-heading">
                <div>
                  <h2>Histórico de sincronização</h2>
                  <p>
                    Execuções, registros importados e falhas retornadas pelas
                    fontes.
                  </p>
                </div>
                {running && (
                  <Badge color="blue" dot>
                    Coleta em andamento
                  </Badge>
                )}
              </div>
              {resource.data.runs.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fonte / início</th>
                        <th>Resultado</th>
                        <th>Lidos</th>
                        <th>Novos</th>
                        <th>Atualizados</th>
                        <th>Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resource.data.runs.map((run) => (
                        <tr key={run.id}>
                          <td>
                            <strong>
                              {run.sourceCode === "pncp"
                                ? "PNCP"
                                : "Compras.gov.br"}
                            </strong>
                            <span className="table-subtitle">
                              {date(run.startedAt, true)}
                            </span>
                          </td>
                          <td>
                            <Badge
                              color={
                                run.status === "SUCCEEDED"
                                  ? "green"
                                  : run.status === "FAILED"
                                    ? "red"
                                    : run.status === "PARTIAL"
                                      ? "amber"
                                      : "blue"
                              }
                            >
                              {runLabels[run.status] || run.status}
                            </Badge>
                          </td>
                          <td>{run.read}</td>
                          <td>{run.created}</td>
                          <td>{run.updated}</td>
                          <td className="sync-error">
                            {run.error ? (
                              <details>
                                <summary>Ver detalhes</summary>
                                <p>{run.error}</p>
                              </details>
                            ) : run.status === "RUNNING" ? (
                              "Consultando a fonte…"
                            ) : run.status === "PENDING" ? (
                              "Aguardando processamento"
                            ) : (
                              "Sem erros registrados"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Nenhuma execução neste workspace"
                  description="Uma sincronização busca editais, consolida duplicidades e registra alterações. O resultado aparecerá aqui."
                />
              )}
            </section>
            <p className="page-note">
              Uma coleta parcial preserva os lotes já importados, mas não
              comprova cobertura completa. Confira as observações antes de
              interpretar ausência de resultados.
            </p>
          </>
        )
      )}
    </>
  );
}

export function NotificationsPage() {
  const resource = useResource<Notification[]>("/notifications"),
    toast = useToast();
  const [busy, setBusy] = useState(false);
  async function mark(id?: string) {
    setBusy(true);
    try {
      await send(
        id ? `/notifications/${id}` : "/notifications/read-all",
        id ? "PATCH" : "POST",
        id ? { read: true } : {},
      );
      resource.reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="FIQUE POR DENTRO"
        title="Notificações"
        description="Atualizações de editais, prazos e movimentos importantes da sua operação."
        actions={
          <Button
            variant="secondary"
            busy={busy}
            disabled={!resource.data?.some((n) => !n.read)}
            onClick={() => mark()}
          >
            <Check size={16} /> Marcar todas como lidas
          </Button>
        }
      />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : resource.data?.length ? (
        <div className="card notifications-list">
          {resource.data.map((n) => (
            <article
              className={`notification-row ${n.read ? "" : "unread"}`}
              key={n.id}
            >
              <span className="notice-icon">
                <Bell size={20} />
              </span>
              <div>
                <div className="notification-title">
                  <h2>{n.title}</h2>
                  {!n.read && <Badge color="blue">Nova</Badge>}
                </div>
                <p>{n.description}</p>
                <time>{date(n.createdAt, true)}</time>
                <div className="button-row">
                  <Link
                    className="text-link"
                    to={n.url.startsWith("/app") ? n.url : "/app"}
                    onClick={() => void mark(n.id)}
                  >
                    Ver no workspace →
                  </Link>
                  {!n.read && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => mark(n.id)}
                    >
                      Marcar como lida
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty
            icon={<Bell size={30} />}
            title="Tudo em dia por aqui"
            description="Quando houver novas informações relevantes, seus avisos aparecerão nesta central."
          />
        </div>
      )}
    </>
  );
}
export function SettingsPage() {
  const members = useResource<Member[]>("/members"),
    prefs = useResource<{ inApp: boolean; email: boolean; minScore?: number }>("/preferences"),
    sources = useResource<SourceData>("/sources");
  const { session } = useSession();
  const [preferences, setPreferences] = useState({ inApp: true, email: false, minScore: 60 }),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (prefs.data) setPreferences({...prefs.data, minScore: prefs.data.minScore ?? 60});
  }, [prefs.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/preferences", "PUT", preferences);
      toast("Preferências atualizadas.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="SEU WORKSPACE"
        title="Configurações"
        description="Pessoas, canais de comunicação e informações da sua conta."
      />
      <p className="info-note">O serviço de envio de e-mail é gerenciado pelo Licitaro. Configure abaixo somente as preferências de notificação da sua empresa.</p>
      {session.role === 'ADMIN' && <DigestSettingsPanel/>}
      {session.role === 'ADMIN' && <ChangeAlertSettings/>}
      {session.role === 'ADMIN' && <EmailHistory/>}
      <div className="settings-grid">
        <section className="card form-section">
          <div className="section-heading">
            <div>
              <h2>Sua conta</h2>
              <p>Identidade e acesso</p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <dl className="detail-fields">
            <div>
              <dt>Nome</dt>
              <dd>{session.user.name}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{session.user.email}</dd>
            </div>
            <div>
              <dt>Empresa</dt>
              <dd>{session.organization.name}</dd>
            </div>
            <div>
              <dt>Papel</dt>
              <dd>
                {session.role === "ADMIN"
                  ? "Administrador da empresa"
                  : "Membro"}
              </dd>
            </div>
          </dl>
          <p className="page-note">
            Precisa redefinir a senha? Saia e use a recuperação de acesso na
            tela de login. O envio depende da configuração de e-mail.
          </p>
          <HomePreference/>
        </section>
        <form className="card form-section" onSubmit={save}>
          <div className="section-heading">
            <div>
              <h2>Notificações da empresa</h2>
              <p>Como sua equipe acompanha os avisos</p>
            </div>
            <Bell size={22} />
          </div>
          {prefs.error && (
            <ErrorNotice message={prefs.error} onRetry={prefs.reload} />
          )}
          <CheckRow
            checked={preferences.inApp}
            disabled={session.role !== "ADMIN"}
            onChange={(v) => setPreferences((p) => ({ ...p, inApp: v }))}
          >
            Destacar novos avisos dentro da plataforma
          </CheckRow>
          <CheckRow
            checked={preferences.email}
            disabled={
              session.role !== "ADMIN" ||
              !sources.data?.scheduler.emailConfigured
            }
            onChange={(v) => setPreferences((p) => ({ ...p, email: v }))}
          >
            Enviar e-mails aos administradores da empresa
          </CheckRow>
          <p className="muted small">
            {sources.data?.scheduler.emailConfigured
              ? "Serviço de e-mail disponível para os alertas desta empresa."
              : "O envio de e-mail ainda não está disponível. Os avisos continuam disponíveis no portal."}
          </p>
          <Field label="Aderência mínima para alertas de novos editais (%)">
            <input type="number" min="0" max="100" step="1" required value={preferences.minScore} disabled={session.role !== "ADMIN"} onChange={e => setPreferences(p => ({...p, minScore: Number(e.target.value)}))} />
          </Field>
          <p className="muted small">Aplica-se aos próximos editais coletados, nos avisos do portal e por e-mail. Não reenvia editais antigos. Alterações e prazos do radar continuam sendo avisados independentemente desta porcentagem.</p>
          <div className="settings-form-footer">
            <Button
              type="submit"
              busy={busy}
              disabled={session.role !== "ADMIN" || prefs.loading}
            >
              Salvar preferências
            </Button>
          </div>
        </form>
      </div>
      <section className="card members-panel">
        <div className="section-heading">
          <div>
            <h2>Pessoas da empresa</h2>
            <p>
              Administradores gerenciam perfil, pessoas e coletas. Membros
              operam catálogo e participações.
            </p>
          </div>
          {session.role === "ADMIN" && (
            <Button variant="secondary" onClick={() => setModal(true)}>
              <Plus size={16} /> Adicionar pessoa
            </Button>
          )}
        </div>
        {members.loading ? (
          <Loading />
        ) : members.error ? (
          <ErrorNotice message={members.error} onRetry={members.reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                </tr>
              </thead>
              <tbody>
                {members.data?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="member-name">
                        <span className="avatar">{m.name.slice(0, 1)}</span>
                        <strong>{m.name}</strong>
                        {m.id === session.user.id && <Badge>Você</Badge>}
                      </div>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <Badge color={m.role === "ADMIN" ? "purple" : "slate"}>
                        {m.role === "ADMIN" ? "Administrador" : "Membro"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="info-note">
        <CircleHelp size={20} />
        <p>
          Licitaro — identidade visual em evolução. Esta versão não envia
          propostas, não realiza lances nem usa agentes de IA pagos. A automação
          atual concentra-se na coleta e nas regras de compatibilidade.
        </p>
      </div>
      {session.isPlatformAdmin && (
        <Link className="button secondary" to="/app/admin">
          <ShieldCheck size={16} /> Administração da plataforma
        </Link>
      )}
      {modal && (
        <MemberModal
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            members.reload();
          }}
        />
      )}
    </>
  );
}
function MemberModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("MEMBER"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("/members", "POST", { name, email, password, role });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Adicionar pessoa à empresa"
      description="Crie um acesso local. Não será enviado convite por e-mail nesta etapa."
      onClose={() => !busy && onClose()}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        <Field label="Nome completo" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label="E-mail" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Senha inicial"
          required
          hint="No mínimo 8 caracteres. Compartilhe diretamente com a pessoa por um canal seguro."
        >
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Papel">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="MEMBER">Membro</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </Field>
        <div className="modal-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Criar acesso
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function AdminPage() {
  const resource = useResource<{
    stats: Record<string, number>;
    organizations: { id: string; name: string; isDemo: boolean }[];
    users: Member[];
    runs: unknown[];
  }>("/admin");
  return (
    <>
      <PageHeader
        eyebrow="ACESSO RESTRITO"
        title="Administração da plataforma"
        description="Visão operacional global. Exclusiva do administrador autorizado no servidor."
      />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} />
      ) : (
        resource.data && (
          <>
            <div className="mini-metrics">
              {Object.entries(resource.data.stats).map(([label, value]) => (
                <div key={label}>
                  <div>
                    <strong>{value}</strong>
                    <span>
                      {(
                        {
                          organizations: "Empresas",
                          users: "Usuários",
                          opportunities: "Editais reais",
                        } as Record<string, string>
                      )[label] || label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <section className="card members-panel">
              <h2>Empresas cadastradas</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Ambiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.organizations.map((o) => (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>
                          <Badge>
                            {o.isDemo ? "Demonstração" : "Conta real"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card members-panel">
              <h2>Usuários</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Papel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <Link className="button secondary" to="/app/fontes">
              Consultar fontes e execuções
            </Link>
          </>
        )
      )}
    </>
  );
}
