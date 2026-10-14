import {useState} from 'react';
import {send} from './api';
import type {DocumentItem} from './types';
import {Button,Field,Modal,ErrorNotice} from './ui';
export function DocumentDeadline({document,onClose,onSaved}:{document:DocumentItem;onClose:()=>void;onSaved:()=>void}){
 const [value,setValue]=useState(document.expiresAt?.slice(0,10)||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Modal title="Prazo do documento" description={document.name} onClose={()=>{if(!busy)onClose();}}><form className="modal-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await send(`/documents/${document.id}`,'PATCH',{expiresAt:value||null});onSaved();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
 {error&&<ErrorNotice message={error}/>}
 <Field label="Vencimento ou próxima revisão" hint="Avisos no sistema 15 dias antes e após a data. Sem data, não há alerta automático."><input type="date" value={value} onChange={e=>setValue(e.target.value)}/></Field>
 <p className="info-note">Alterar a data não renova o conteúdo. Confira o documento e cadastre o arquivo atualizado quando necessário.</p>
 <div className="modal-footer"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={busy}>Salvar prazo</Button></div>
 </form></Modal>;
}