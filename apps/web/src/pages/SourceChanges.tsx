import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {currency,date,safeUrl,send,useResource} from '../api';
import {Badge,Button,CheckRow,ErrorNotice,Loading,useToast} from '../ui';
type Settings={inApp:boolean;email:boolean;types:string[];revision:number;labels:Record<string,string>};
export function ChangeAlertSettings(){
 const r=useResource<Settings>('/change-alert-settings'),[form,setForm]=useState<Settings|null>(null),[busy,setBusy]=useState(false),toast=useToast();
 useEffect(()=>{if(r.data)setForm(r.data);},[r.data]);
 async function save(){if(!form)return;setBusy(true);try{const {labels,...body}=form;setForm(await send<Settings>('/change-alert-settings','PUT',body));toast('Avisos de mudanças atualizados.');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}
 return <section className="card source-change-panel"><h2>Acompanhamento de mudanças</h2>
 <p className="muted">Para editais no seu radar, independentemente da aderência. Os canais abaixo respeitam também as preferências gerais do portal e de e-mail. Destinatários: administradores atuais da empresa.</p>
 {r.error?<ErrorNotice message={r.error} onRetry={r.reload}/>:!form?<Loading/>:<>
 <CheckRow checked={form.inApp} onChange={v=>setForm({...form,inApp:v})}>Permitir avisos de mudanças no portal</CheckRow>
 <CheckRow checked={form.email} onChange={v=>setForm({...form,email:v})}>Permitir avisos de mudanças por e-mail</CheckRow>
 <fieldset><legend>Quais mudanças deseja acompanhar?</legend>{Object.entries(form.labels).map(([type,label])=><CheckRow key={type} checked={form.types.includes(type)} onChange={v=>setForm({...form,types:v?[...form.types,type]:form.types.filter(t=>t!==type)})}>{label}</CheckRow>)}</fieldset>
 <p className="info-note">Possíveis republicações exigem conferência e começam com avisos desativados. Desativar avisos não apaga o histórico. Envios já em andamento podem não ser cancelados. A detecção depende da sincronização e dos dados publicados; não interpreta automaticamente impugnações dentro de PDFs.</p>
 <Button variant="secondary" busy={busy} onClick={save}>Salvar avisos de mudanças</Button></>}
 </section>;
}
type Relation={id:string;previous_id:string;new_id:string;previous_title:string;new_title:string;state:string;revision:number;reviewer:string|null;reviewed_at:string|null;evidence:{reasons:string[];warning:string;titleSimilarity:number}};
type Change={id:string;types:string[];before_data:Record<string,unknown>;after_data:Record<string,unknown>;detected_at:string};
type History={items:Change[];total:number;page:number;pages:number;relations:Relation[];labels:Record<string,string>};
const fields:Record<string,string>={title:'Objeto',description:'Descrição',agency:'Órgão',state:'UF',city:'Município',modality:'Modalidade',sphere:'Esfera',value:'Valor estimado',publishedAt:'Publicação',opensAt:'Abertura das propostas',closesAt:'Encerramento das propostas',status:'Situação',url:'Portal de origem',documents:'Lista de anexos'};
function printable(value:unknown,key:string){
 if(value==null)return 'Não informado';
 if(['publishedAt','opensAt','closesAt'].includes(key)&&typeof value==='string'&&Number.isFinite(Date.parse(value)))return `${date(value,true)} (Brasília)`;
 if(key==='value'&&typeof value==='number')return currency(value);
 if(key==='documents'&&Array.isArray(value))return value.length?value.map((d:any)=>`${d.name || 'Arquivo sem nome'}\n${d.url || 'Sem endereço'}`).join('\n\n'):'Nenhum anexo na lista';
 return typeof value==='string'?value:JSON.stringify(value,null,2);
}
export function SourceChanges({id}:{id:string}){
 const [page,setPage]=useState(1),r=useResource<History>(`/opportunities/${id}/changes?page=${page}`),[busy,setBusy]=useState(''),toast=useToast();
 async function review(relation:Relation,state:string){setBusy(relation.id);try{await send(`/opportunity-relations/${relation.id}`,'PATCH',{state,revision:relation.revision});r.reload();toast('Conferência da relação registrada.');}catch(e){toast((e as Error).message,true);}finally{setBusy('');}}
 const data=r.data;
 return <section className="source-change-panel"><h2>Mudanças e possíveis relações</h2><p className="muted">Histórico registrado a partir da ativação deste recurso. Não recupera retroativamente versões antigas nem preserva os bytes dos anexos. Uma mudança na lista de arquivos não confirma o conteúdo de uma retificação ou impugnação.</p>
 {r.loading?<Loading/>:r.error?<ErrorNotice message={r.error} onRetry={r.reload}/>:data&&<>
 <h3>Publicações possivelmente relacionadas</h3><p className="muted">Até 20 relações recentes da sua empresa. Candidatos são procurados na coleta de novos identificadores, entre editais anteriormente acompanhados. Não é uma busca exaustiva ou retroativa.</p>
 {!data.relations.length?<p>Nenhuma relação identificada até agora. Isso não prova ausência de republicação.</p>:data.relations.map(relation=><article className="card" key={relation.id}>
 <Badge color={relation.state==='CONFIRMED'?'green':relation.state==='REJECTED'?'slate':'amber'}>{relation.state==='CONFIRMED'?'Relação confirmada pela equipe':relation.state==='REJECTED'?'Relação descartada pela equipe':'Possível republicação · conferir'}</Badge>
 <p>Anterior: <Link className="source-change-link" to={`/app/oportunidades/${relation.previous_id}?tab=mudancas`}>{relation.previous_title}</Link></p>
 <p>Nova: <Link className="source-change-link" to={`/app/oportunidades/${relation.new_id}?tab=mudancas`}>{relation.new_title}</Link></p>
 <ul>{relation.evidence.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul><p className="info-note">{relation.evidence.warning} Confirmar aqui registra a avaliação da sua equipe; não une as oportunidades nem inclui a nova no radar.</p>
 {relation.reviewed_at&&<p className="muted">Última conferência: {relation.reviewer||'Membro removido'} · {date(relation.reviewed_at,true)}</p>}
 <div className="item-pagination"><Button variant="secondary" disabled={!!busy||relation.state==='CONFIRMED'} onClick={()=>review(relation,'CONFIRMED')}>Confirmar relação</Button><Button variant="secondary" disabled={!!busy||relation.state==='REJECTED'} onClick={()=>review(relation,'REJECTED')}>Descartar relação</Button><Button variant="secondary" disabled={!!busy||relation.state==='PENDING'} onClick={()=>review(relation,'PENDING')}>Reabrir conferência</Button></div>
 </article>)}
 <h3>Alterações neste identificador</h3><p>{data.total} alteração(ões) registrada(s).</p>
 {data.items.map(change=><article className="card" key={change.id}><div className="badge-row">{change.types.map(type=><Badge key={type} color={type==='CANCELLATION'?'red':type==='SUSPENSION'?'amber':type==='REOPENING'?'green':'blue'}>{data.labels[type]||type}</Badge>)}</div><p>Detectado em {date(change.detected_at,true)} · horário de Brasília.</p>
 {safeUrl(change.after_data.url as string)&&<a className="source-change-link" href={safeUrl(change.after_data.url as string)} target="_blank" rel="noreferrer">Conferir publicação oficial</a>}
 <details><summary>Ver o que mudou: antes e depois</summary>{Object.keys(change.after_data).filter(k=>JSON.stringify(change.before_data[k])!==JSON.stringify(change.after_data[k])).map(key=><div className="change-diff" key={key}><h4>{fields[key]||key}</h4><p>Antes</p><pre>{printable(change.before_data[key],key)}</pre><p>Depois</p><pre>{printable(change.after_data[key],key)}</pre></div>)}</details></article>)}
 {!data.items.length&&<p>Nenhuma mudança registrada neste período de acompanhamento.</p>}
 <div className="item-pagination"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Mudanças anteriores</Button><span>Página {page} de {data.pages}</span><Button variant="secondary" disabled={page>=data.pages} onClick={()=>setPage(p=>p+1)}>Mais mudanças</Button></div>
 </>}
 </section>;
}
