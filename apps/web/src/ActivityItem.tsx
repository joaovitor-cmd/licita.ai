import {useState} from 'react';
import {date} from './api';
import {Modal} from './ui';

const fieldNames:Record<string,string>={Objeto:'Objeto',Descrição:'Descrição',Órgão:'Órgão',UF:'Estado',Município:'Município',Modalidade:'Modalidade',Esfera:'Esfera',"Valor estimado":'Valor estimado',Publicação:'Data de publicação',Abertura:'Data de abertura',Encerramento:'Prazo para envio de propostas',Situação:'Situação do edital',"Portal de origem":'Link do portal oficial',Anexos:'Documentos do edital',stage:'Etapa do acompanhamento',expectedValue:'Valor esperado',deadline:'Prazo interno',outcomeReason:'Motivo do resultado'};
const stageNames:Record<string,string>={IDENTIFIED:'No radar',IN_ANALYSIS:'Em análise',WILL_PARTICIPATE:'Vai participar',PROPOSAL_SENT:'Proposta enviada',WON:'Ganha',LOST:'Perdida',DISCARDED:'Descartada'};
type Change={label:string;before:unknown;after:unknown};
const decode=(v:string):unknown=>{try{return JSON.parse(v);}catch{return v;}};
function changesOf(description:string):Change[]{
 return description.split('\n').flatMap(line=>{
  const match=/^([^:\n]+): (.*?) → (.*)$/.exec(line);if(!match)return [];
  const [,rawLabel,before,after]=match;
  if(!fieldNames[rawLabel])return [];
  return [{label:fieldNames[rawLabel],before:decode(before),after:decode(after)}];
 });
}
function humanize(value:unknown,label:string){
 if(value===null||value===''||value===undefined)return 'Não informado';
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value))return date(value,true);
 if(typeof value==='string'&&label==='Link do portal oficial')return 'Endereço da publicação atualizado';
 if(typeof value==='string'&&label==='Situação do edital')return value;
 if(typeof value==='string'&&['Modalidade','Esfera','Estado','Município','Órgão','Objeto'].includes(label))return value;
 if(typeof value==='number'&&label==='Valor estimado')return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
 if(Array.isArray(value))return documentChange(value,[]);
 if(typeof value==='object')return 'Informação atualizada';
 const text=String(value);
 return /^https?:\/\//i.test(text)?'Endereço da publicação atualizado':text;
}
function documentChange(before:unknown[],after:unknown[]){
const name=(v:any)=>{const value=typeof v==='string'?v:(v?.name||v?.filename||'Documento');if(/^https?:\/\//i.test(value))return 'Documento (link)';return String(value).slice(0,100);};
 const old=new Map(before.map(v=>[name(v),v])),next=new Map(after.map(v=>[name(v),v]));
 const added=[...next.keys()].filter(k=>!old.has(k)),removed=[...old.keys()].filter(k=>!next.has(k));
 if(!added.length&&!removed.length)return `${after.length} ${after.length===1?'documento permaneceu disponível':'documentos permaneceram disponíveis'}.`;
 const out:string[]=[];
 if(added.length)out.push(`Adicionado${added.length===1?'':'s'}: ${added.slice(0,4).join(', ')}${added.length>4?` e mais ${added.length-4}`:''}.`);
 if(removed.length)out.push(`Removido${removed.length===1?'':'s'}: ${removed.slice(0,4).join(', ')}${removed.length>4?` e mais ${removed.length-4}`:''}.`);
 return out.join(' ');
}
function display(change:Change){
 if(change.label==='Documentos do edital'&&Array.isArray(change.before)&&Array.isArray(change.after))return documentChange(change.before,change.after);
 const before=change.label==='Etapa do acompanhamento'&&typeof change.before==='string'?stageNames[change.before]||change.before:humanize(change.before,change.label);
 const after=change.label==='Etapa do acompanhamento'&&typeof change.after==='string'?stageNames[change.after]||change.after:humanize(change.after,change.label);
 if(change.label==='Link do portal oficial')return 'O endereço da publicação oficial foi atualizado.';
 if(change.label==='Etapa do acompanhamento')return `Etapa alterada: ${before} → ${after}.`;
 if(change.label==='Prazo interno')return `Prazo interno: de ${before} para ${after}.`;
 return `De ${before} para ${after}.`;
}
export function activitySummary(description:string){
 const changes=changesOf(description);
 if(changes.length)return `Edital atualizado: ${changes.slice(0,3).map(c=>c.label.toLocaleLowerCase('pt-BR')).join(', ')}${changes.length>3?' e outros itens':''}.`;
 if(/\b(stage|ownerId|expectedValue|deadline):/.test(description))return 'Os dados do acompanhamento foram atualizados.';
 const plain=description.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
 return plain.length>150?plain.slice(0,147).trimEnd()+'…':plain;
}
export function ActivityItem({item}:{item:{title:string;description:string;createdAt:string}}){
 const [open,setOpen]=useState(false);
 const changes=changesOf(item.description),summary=activitySummary(item.description);
 return <div className="activity-item"><span className="activity-node"/><div>
  <h3>{item.title}</h3><p>{summary}</p><time>{date(item.createdAt,true)}</time>
  {summary!==item.description&&<button type="button" className="activity-details-button text-link" onClick={()=>setOpen(true)}>Entenda o que mudou</button>}
  {open&&<Modal title={item.title} description={date(item.createdAt,true)} onClose={()=>setOpen(false)}><div className="activity-detail-content">
   {changes.length?<><p className="activity-detail-intro">Compare as informações recebidas nas consultas ao edital. Confira prazos e exigências no documento oficial antes de tomar uma decisão.</p><ul className="activity-change-list">{changes.map((change,i)=><li key={i}><strong>{change.label}</strong><span>{display(change)}</span></li>)}</ul></>:<p>{summary}</p>}
  </div></Modal>}
 </div></div>;
}
