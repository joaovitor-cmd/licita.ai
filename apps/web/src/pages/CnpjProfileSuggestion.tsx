import {useEffect,useId,useRef,useState} from 'react';
import {api} from '../api';
import {Button,ErrorNotice} from '../ui';
import type {Profile} from '../types';

type Suggestion={id:string;segment:string;keywords:string[];evidence:{code:string;description:string;primary:boolean}[]};
type Result={cnpj:string;companyName:string;source:string;consultedAt:string;activities:{code:string;description:string;primary:boolean}[];suggestions:Suggestion[]};
export function CnpjProfileSuggestion({profile,onApply}:{profile:Profile;onApply:(profile:Profile)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[selected,setSelected]=useState<string[]>([]);
  const [enabled,setEnabled]=useState(false),request=useRef<AbortController|null>(null),hintId=useId();
  const currentCnpj=(profile.taxId||'').replace(/[.\/\-\s]/g,'').toUpperCase();
  const validResult=result?.cnpj===currentCnpj?result:null;
  useEffect(()=>{request.current?.abort();setEnabled(false);setBusy(false);setError('');setResult(null);return()=>request.current?.abort();},[currentCnpj]);
  function turnOff(){request.current?.abort();setEnabled(false);setBusy(false);setError('');setResult(null);setSelected([]);}
  async function consult(){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setResult(null);
    try{const data=await api<Result>('/profile/cnpj-suggestion',{method:'POST',body:JSON.stringify({cnpj:profile.taxId}),signal:controller.signal});if(!controller.signal.aborted){setResult(data);setSelected(data.suggestions.map(s=>s.id));}}
    catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  function apply(){
    if(!validResult)return;
    const chosen=validResult.suggestions.filter(s=>selected.includes(s.id));
    const merge=(existing:string[],added:string[])=>{const values=new Map(existing.map(s=>[s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),s]));for(const s of added){const key=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!values.has(key))values.set(key,s);}return [...values.values()];};
    const segments=merge(profile.segments,chosen.map(s=>s.segment)),keywords=merge(profile.keywords,chosen.flatMap(s=>s.keywords));
    if(segments.length>50||keywords.length>50){setError('A combinação ultrapassa 50 segmentos ou palavras-chave. Selecione menos sugestões ou revise os termos atuais.');return;}
    onApply({...profile,segments,keywords});turnOff();
  }
  return <div className="cnpj-assistant">
    <div className="cnpj-toggle-row"><h3>Sugerir interesses pelo CNPJ</h3><button type="button" className="cnpj-switch" role="switch" aria-label="Sugerir interesses pelo CNPJ" aria-checked={enabled} aria-describedby={hintId} disabled={!currentCnpj} onClick={()=>{if(enabled)turnOff();else{setEnabled(true);void consult();}}}><span className="cnpj-switch-thumb"/></button></div>
    <p id={hintId} className="cnpj-toggle-hint muted">Consulta seu CNPJ na BrasilAPI e sugere interesses. Você revisa antes de salvar.</p>
    {!currentCnpj&&<p className="muted small">Informe o CNPJ acima para ativar.</p>}
    {enabled&&busy&&<p role="status">Consultando atividades da empresa…</p>}
    {enabled&&error&&<><ErrorNotice message={error}/><Button type="button" variant="secondary" onClick={consult} disabled={busy}>Tentar consulta novamente</Button></>}
    {enabled&&validResult&&<div className="cnpj-review" aria-live="polite">
      <h3>Confira se estas atividades representam seu negócio</h3>
      <p><strong>{validResult.companyName}</strong> · CNPJ {validResult.cnpj}</p>
      <p className="muted">Fonte: {validResult.source} · Consultado em {new Date(validResult.consultedAt).toLocaleString('pt-BR')}. O cadastro pode estar desatualizado.</p>
      <details><summary>Ver atividades do cadastro</summary>{validResult.activities.map((a,i)=><p key={i}>{a.code} — {a.description} ({a.primary?'principal':'secundária'})</p>)}</details>
      {validResult.suggestions.length===0?<p>Ainda não temos sugestões específicas para essas atividades. Você pode preencher seus segmentos e palavras-chave abaixo, sem restrições.</p>:<>
        <p>Desmarque o que não oferece. As palavras-chave são exemplos, não uma confirmação de capacidade ou habilitação para participar.</p>
        {validResult.suggestions.map(s=><div key={s.id} className="cnpj-choice"><label><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/><strong>{s.segment}</strong></label><p>{s.keywords.join(' · ')}</p><small>Sugerido por: {s.evidence.map(a=>`${a.code} — ${a.description}`).join('; ')}</small></div>)}
        <div className="button-row"><Button type="button" disabled={!selected.length} onClick={apply}>Adicionar ao meu perfil</Button><Button type="button" variant="ghost" onClick={turnOff}>Descartar sugestões</Button></div>
        <p>Seus termos atuais serão preservados. Depois, revise os campos e clique em “Salvar perfil comercial”. Não alteramos região, valores ou exclusões.</p>
      </>}
    </div>}
  </div>;
}
