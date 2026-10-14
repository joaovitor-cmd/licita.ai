import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { ApiError, currency, date, send } from '../api';
import { STAGES, type Member, type Stage, type Tracking } from '../types';
import { Badge, Button, ErrorNotice, Field, Modal, useToast } from '../ui';
import type {RadarStageTotal} from '../useRadarPagination';

type Action = { item: Tracking; kind: 'move' | 'owner' | 'note' | 'order'; stage?: Stage };
export function RadarBoard({ items, stages, members, highlight, onUpdate, onTask,totals,loadingColumns,columnErrors,onMore,orderRevision,refreshing,onRefresh }: {
  items: Tracking[]; stages: typeof STAGES; members: Member[]; highlight: string | null;
  onUpdate: (item: Tracking) => void; onTask: (item: Tracking) => void;
  totals:RadarStageTotal[];loadingColumns:Partial<Record<Stage,boolean>>;columnErrors:Partial<Record<Stage,string>>;onMore:(stage:Stage)=>void;
  orderRevision:string;refreshing:boolean;onRefresh:()=>void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const toast = useToast();
  async function reorder(item:Tracking,beforeId:string|null){
    if(saving.current||refreshing)return;
    saving.current=true;setBusy(true);
    try{await send(`/trackings/${item.id}/order`,'POST',{stage:item.stage,beforeId,revision:orderRevision});onRefresh();toast('Posição salva no quadro.');}
    catch(error){toast((error as Error).message,true);if(error instanceof ApiError&&error.status===409)onRefresh();}
    finally{saving.current=false;setBusy(false);}
  }
  useEffect(() => {
    if (!highlight) return;
    const card = [...(root.current?.querySelectorAll<HTMLElement>('[data-tracking-id]') || [])]
      .find(node => node.dataset.trackingId === highlight);
    card?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    card?.querySelector<HTMLAnchorElement>('.radar-card-title')?.focus({ preventScroll: true });
  }, [highlight]);
  async function move(item: Tracking, stage: Stage) {
    if (saving.current || item.stage === stage) return;
    if (['WON', 'LOST', 'DISCARDED', 'PROPOSAL_SENT'].includes(stage)) {
      setAction({ item, kind: 'move', stage }); return;
    }
    saving.current = true; setBusy(true);
    try {
      onUpdate(await send<Tracking>(`/trackings/${item.id}`, 'PATCH', { stage }));
      toast(`Movido para ${STAGES.find(s => s.value === stage)?.label}.`);
    } catch (e) { toast((e as Error).message, true); }
    finally { saving.current = false; setBusy(false); }
  }
  return <>
    <p className="page-note">Arraste pela alça: sobre outro cartão para posicionar antes, ou para o espaço livre da coluna para colocar ao final. Em outra etapa, o cartão entra no início. Você também pode usar “Mais ações”. Datas e horários de Brasília.</p>
    <div ref={root} className="kanban radar-board" aria-label="Quadro de participações por etapa" aria-busy={busy}>
      {stages.map(stage => {
        const column = items.filter(item => item.stage === stage.value);
        return <section key={stage.value} aria-label={stage.label}
          className={`kanban-column column-${stage.color} ${over === stage.value ? 'drop-target' : ''}`}
          onDragOver={e => { if (dragged && !busy) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(stage.value); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
          onDrop={e => {
            e.preventDefault(); setOver(null); setDragged(null);
            const item = items.find(t => t.id === dragged);
            if (item && !busy&&!refreshing) {if(item.stage===stage.value)void reorder(item,null);else void move(item, stage.value);}
          }}>
          <div className="column-heading"><h2><span />{stage.short}<i>{totals.find(total=>total.stage===stage.value)?.count??0}</i></h2>
            <span>{currency(totals.find(total=>total.stage===stage.value)?.potential,true)} · potencial{totals.find(total=>total.stage===stage.value)?.unknownValues?' parcial':''}</span>
          </div>
          {column.map(item => {
            const next = item.tasks.filter(t => !t.done).sort((a, b) =>
              (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity))[0];
            const owner = members.find(m => m.id === item.ownerId)?.name || 'Sem responsável';
            return <article key={item.id} data-tracking-id={item.id}
              onDragOver={event=>{const moving=items.find(card=>card.id===dragged);if(moving&&moving.id!==item.id&&moving.stage===item.stage&&!busy&&!refreshing){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';}}}
              onDrop={event=>{const moving=items.find(card=>card.id===dragged);if(moving&&moving.stage===item.stage&&!busy&&!refreshing){event.preventDefault();event.stopPropagation();setDragged(null);setOver(null);if(moving.id!==item.id)void reorder(moving,item.id);}}}
              className={`kanban-card radar-card ${highlight === item.id ? 'radar-highlight' : ''}`}>
              <div className="radar-card-toolbar"><Badge>{[item.opportunity.city, item.opportunity.state].filter(Boolean).join(' · ') || 'Local não informado'}</Badge>
                <span className="drag-handle" draggable={!busy&&!refreshing} title="Arraste antes de outro cartão ou para outra etapa; ou use Mais ações"
                  onDragStart={e => { setDragged(item.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); }}
                  onDragEnd={() => { setDragged(null); setOver(null); }}><GripVertical size={18} /></span>
              </div>
              <Link className="radar-card-title" to={`/app/radar/${item.id}`} title={item.opportunity.title}><h3>{item.opportunity.title}</h3></Link>
              <p title={item.opportunity.agency}>{item.opportunity.agency}</p>
              {!!item.pendingChanges && <Link className="text-link" to={`/app/oportunidades/${item.opportunityId}?tab=mudancas`}><Badge color="amber">{item.pendingChanges} {item.pendingChanges===1?'alteração':'alterações'} para conferir</Badge></Link>}
              <details className="radar-source"><summary>Fonte e situação oficial</summary>
                <p>{item.opportunity.sourceName || item.opportunity.sourceCode} · {item.opportunity.modality || 'Modalidade não informada'}</p>
                <p>{item.opportunity.status || 'Situação não informada pela fonte'}</p>
                <p>Última coleta: {date(item.opportunity.syncedAt, true)}</p>
              </details>
              <div className="radar-card-value"><small>{item.expectedValue == null ? 'Estimativa do órgão' : 'Proposta prevista'}</small><strong>{currency(item.expectedValue ?? item.opportunity.value)}</strong></div>
              <div className="radar-card-deadline"><small>{item.deadline ? 'Prazo interno' : 'Fim das propostas'}</small><span>{date(item.deadline || item.opportunity.closesAt, true)}</span></div>
              <div className="radar-next"><small>Próxima pendência</small><p>{next?.title || 'Nenhuma tarefa pendente'}</p>{next?.deadline && <small>Prazo da tarefa: {date(next.deadline)}</small>}</div>
              <div className="radar-card-footer"><span title={owner}>{owner}</span><span>{item.tasks.filter(t => t.done).length}/{item.tasks.length} tarefas</span></div>
              <details className="radar-actions"><summary><MoreHorizontal size={16} /> Mais ações</summary>
                <div>
                  <Button variant="ghost" disabled={busy} onClick={() => setAction({ item, kind: 'move' })}>Mover para outra etapa</Button>
                  <Button variant="ghost" disabled={busy||refreshing} onClick={()=>setAction({item,kind:'order'})}>Organizar posição</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setAction({ item, kind: 'owner' })}>Definir responsável</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => onTask(item)}>Criar tarefa</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setAction({ item, kind: 'note' })}>Adicionar observação</Button>
                  <Link className="button ghost" to={`/app/radar/${item.id}`}>Abrir acompanhamento</Link>
                </div>
              </details>
            </article>;
          })}
          {!column.length && <div className="column-empty">Nenhuma participação nesta etapa</div>}
          {columnErrors[stage.value]&&<ErrorNotice message={columnErrors[stage.value]!} onRetry={()=>onMore(stage.value)}/>}
          {totals.find(total=>total.stage===stage.value)?.hasMore&&<Button variant="secondary" busy={loadingColumns[stage.value]} disabled={busy} onClick={()=>onMore(stage.value)}>Carregar mais em {stage.short}</Button>}
        </section>;
      })}
    </div>
    {action && <RadarActionModal key={`${action.item.id}-${action.kind}`} action={action} members={members} items={items} orderRevision={orderRevision} onRefresh={()=>{setAction(null);onRefresh();}}
      onClose={() => setAction(null)} onSaved={item => { onUpdate(item); setAction(null); }} />}
  </>;
}

function RadarActionModal({ action, members, onClose, onSaved,items,orderRevision,onRefresh }: {
  action: Action; members: Member[]; onClose: () => void; onSaved: (item: Tracking) => void;
  items:Tracking[];orderRevision:string;onRefresh:()=>void;
}) {
  const [stage, setStage] = useState(action.stage || action.item.stage);
  const [owner, setOwner] = useState(action.item.ownerId || '');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(action.item.outcomeReason || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [beforeId,setBeforeId]=useState(''),[conflicted,setConflicted]=useState(false);
  const [baseOrderRevision]=useState(orderRevision);
  const toast = useToast();
  const terminal = ['WON', 'LOST', 'DISCARDED'].includes(stage);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy||conflicted) return;
    setBusy(true); setError('');
    try {
      let updated: Tracking;
      if(action.kind==='order'){
        await send(`/trackings/${action.item.id}/order`,'POST',{stage:action.item.stage,beforeId:beforeId||null,revision:baseOrderRevision});updated=action.item;
      }else if (action.kind === 'note') {
        await send(`/trackings/${action.item.id}/events`, 'POST', { description: note.trim() });
        updated = action.item;
      } else {
        updated = await send<Tracking>(`/trackings/${action.item.id}`, 'PATCH', action.kind === 'owner'
          ? { ownerId: owner || null } : { stage, ...(terminal ? { outcomeReason: reason.trim() } : {}) });
      }
      toast(action.kind === 'order'?'Posição salva no quadro.':action.kind === 'note' ? 'Observação registrada no histórico.' : 'Acompanhamento atualizado.');
      onSaved(updated);
    } catch (e) { setError((e as Error).message);if(action.kind==='order'&&e instanceof ApiError&&e.status===409)setConflicted(true); }
    finally { setBusy(false); }
  }
  const title = action.kind === 'order'?'Organizar posição':action.kind === 'move' ? 'Mover oportunidade' : action.kind === 'owner' ? 'Definir responsável' : 'Adicionar observação';
  return <Modal title={title} description={action.item.opportunity.title} onClose={() => { if (!busy) onClose(); }}>
    <form className="modal-form" onSubmit={submit}>
      {error && <ErrorNotice message={error} />}
      {conflicted&&<Button type="button" onClick={onRefresh}>Atualizar quadro</Button>}
      {action.kind==='order'&&<><Field label="Posição na etapa"><select value={beforeId} onChange={event=>setBeforeId(event.target.value)} disabled={busy||conflicted}><option value="">Ao final da etapa inteira</option>{items.filter(item=>item.stage===action.item.stage&&item.id!==action.item.id).map(item=><option value={item.id} key={item.id}>Antes de {item.opportunity.title}</option>)}</select></Field><p className="field-help">Os destinos acima são os cartões carregados nesta etapa. Carregue mais para escolher outro. A ordem é compartilhada com a equipe, mesmo quando você usa filtros.</p></>}
      {action.kind === 'move' && <>
        <Field label="Etapa comercial"><select value={stage} onChange={e => setStage(e.target.value as Stage)}>{STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        <p className="info-note">Esta mudança registra a decisão da equipe; não altera a situação oficial do edital nem envia uma proposta.</p>
        {terminal && <Field label="Motivo / resultado" required><textarea required minLength={2} maxLength={3000} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
      </>}
      {action.kind === 'owner' && <Field label="Responsável"><select value={owner} onChange={e => setOwner(e.target.value)}><option value="">Sem responsável</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
      {action.kind === 'note' && <Field label="Observação interna" required><textarea autoFocus required minLength={2} maxLength={5000} value={note} onChange={e => setNote(e.target.value)} /><small>Será adicionada ao histórico, sem substituir notas anteriores.</small></Field>}
      <div className="modal-footer"><Button variant="secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={busy} disabled={conflicted}>Salvar</Button></div>
    </form>
  </Modal>;
}
