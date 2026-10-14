import {useEffect,useRef,useState} from 'react';
import {downloadDeclarationModels} from './declaration-download';
import {api} from './api';
import {Button,Field,Modal} from './ui';
import {declarationTemplates,declarationDraft} from './declaration-templates';
export function DocumentTemplates({open=true,onClose,onRegister}:{open?:boolean;onClose:()=>void;onRegister:(name:string)=>void}){
 const [company,setCompany]=useState<{companyName:string;taxId:string}|null>(null);
 const [selected,setSelected]=useState(''),[drafts,setDrafts]=useState<Record<string,{content:string;reviewed:boolean}>>({}),[error,setError]=useState('');
 useEffect(()=>{
  if(!open||company)return;
  const controller=new AbortController();
  api<{companyName:string;taxId:string}>('/company-details',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setCompany(data);}).catch(()=>{});
  return ()=>controller.abort();
 },[open,company]);
 const [modelIds,setModelIds]=useState<string[]>([]),[downloading,setDownloading]=useState(false);
 const modelDownload=useRef<AbortController|null>(null);
 useEffect(()=>()=>modelDownload.current?.abort(),[]);
 async function downloadModels(){if(downloading)return;const controller=new AbortController();modelDownload.current=controller;setDownloading(true);setError('');try{await downloadDeclarationModels(modelIds,controller.signal);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setDownloading(false);}}
 const template=declarationTemplates.find(t=>t.id===selected);
 const content=drafts[selected]?.content||'',reviewed=drafts[selected]?.reviewed||false;
 const missing=/\{\{[^}]+\}\}/.test(content);
 const empty=!content.trim();
 const canUse=reviewed&&!missing&&!empty;
 function choose(id:string){const t=declarationTemplates.find(t=>t.id===id);setSelected(id);setError('');if(t)setDrafts(previous=>previous[id]?previous:{...previous,[id]:{content:declarationDraft(t.title,t.body,company?.companyName,company?.taxId),reviewed:false}});}
 function edit(content:string){setDrafts(previous=>({...previous,[selected]:{content,reviewed:false}}));setError('');}
 function print(){
  if(!canUse)return;
  const popup=window.open('','_blank','width=800,height=900');if(!popup){setError('Permita a janela de impressão para salvar o PDF.');return;}
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  popup.opener=null;
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(template?.title||'Declaração')}</title><style>@page{size:A4;margin:24mm}body{font:11pt Arial,sans-serif;line-height:1.65;margin:0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><pre>${escape(content)}</pre></body></html>`);popup.document.close();popup.focus();popup.print();
 }
 if(!open)return null;
 return <Modal wide title="Modelos de declarações" description="Baixe os modelos em Word, preencha e revise fora do sistema. Depois, cadastre o PDF assinado." onClose={onClose}>
  <div className="document-templates-body">
   <p className="info-note">Modelos de apoio inspirados nos arquivos enviados. Confira o texto exigido pelo edital e a situação real da empresa; nenhuma condição é certificada automaticamente. Declarações devem ser revisadas para cada certame.</p>
   <section className="declaration-model-picker" aria-label="Modelos Word">
    <h3>1. Escolha os modelos para baixar</h3>
    <label className="check-row"><input type="checkbox" checked={modelIds.length===declarationTemplates.length} disabled={downloading} onChange={e=>setModelIds(e.target.checked?declarationTemplates.map(t=>t.id):[])}/> Selecionar todos os modelos</label>
    <div className="declaration-model-grid">{declarationTemplates.map(t=><label className="check-row" key={t.id}><input type="checkbox" checked={modelIds.includes(t.id)} disabled={downloading} onChange={e=>{const checked=e.target.checked;setModelIds(previous=>checked?[...previous,t.id]:previous.filter(id=>id!==t.id));}}/>{t.title}</label>)}</div>
    <div className="button-row"><span className="muted small" role="status">{modelIds.length} modelos selecionados</span><Button variant="secondary" busy={downloading} disabled={!modelIds.length} onClick={downloadModels}>Baixar Word{modelIds.length>1?' (ZIP)':''}</Button></div>
    {error&&<p role="alert">{error}</p>}
    <h3>2. Preencha e revise no Word</h3><p className="muted small">Adapte os campos ao edital, confira as declarações e salve o documento assinado em PDF.</p>
    <Button onClick={()=>onRegister(modelIds.length===1?declarationTemplates.find(t=>t.id===modelIds[0])!.title:'Declaração preenchida')}>Cadastrar PDF preenchido</Button>
   </section>
   <details className="declaration-optional-editor"><summary>Editor no sistema (opcional)</summary>
   <p className="muted small">Os rascunhos de cada modelo ficam disponíveis enquanto você permanecer nesta página. Sair ou recarregar descarta os textos.</p>
   <Field label="Modelo"><select value={selected} onChange={e=>choose(e.target.value)}><option value="">Selecione um dos 16 modelos</option>{declarationTemplates.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
   {template&&<><Field label="Texto da declaração" hint="Substitua todos os campos entre chaves. Você pode adaptar o texto ao edital."><textarea rows={16} value={content} onChange={e=>edit(e.target.value)}/></Field>
   <label className="check-row"><input type="checkbox" checked={reviewed} onChange={e=>setDrafts(previous=>({...previous,[selected]:{content,reviewed:e.target.checked}}))}/> Conferi os dados, as declarações e as exigências do edital.</label>
   {empty&&<p className="muted small" role="status">Escreva o texto da declaração antes de imprimir ou cadastrar.</p>}{missing&&<p className="muted small">Há campos a preencher no texto.</p>}{error&&<p role="alert">{error}</p>}
   <div className="modal-footer"><Button variant="secondary" disabled={!canUse} onClick={print}>Imprimir / Salvar PDF</Button><Button disabled={!canUse} onClick={()=>{if(canUse)onRegister(template.title);}}>Cadastrar PDF assinado</Button></div></>}
   </details>
  </div>
 </Modal>;
}