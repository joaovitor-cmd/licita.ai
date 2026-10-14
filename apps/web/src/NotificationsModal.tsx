import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {notificationDestination} from './notification-destination';
import type {Notification} from './types';
import {date,send} from './api';
import {Button,Empty,ErrorNotice,Loading,Modal} from './ui';

export function NotificationsModal({items,loading,error,reload,onRead,onClose}:{items:Notification[];loading:boolean;error:string;reload:()=>void;onRead:(id?:string)=>void;onClose:()=>void}) {
  const navigate=useNavigate();
  const unreadItems=items.filter(n=>!n.read);
  const [busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
  async function mark(id?:string){
    setBusy(true);setActionError('');
    try{await send(id?`/notifications/${id}`:'/notifications/read-all',id?'PATCH':'POST',id?{read:true}:{});onRead(id);return true;}
    catch(e){setActionError((e as Error).message);return false;}
    finally{setBusy(false);}
  }
  return <Modal title="Notificações" description="Oportunidades e atualizações para acompanhar." onClose={onClose}>
    <div className="notifications-modal-body">
      {actionError&&<ErrorNotice message={actionError}/>}
      {loading?<Loading/>:error?<ErrorNotice message={error} onRetry={reload}/>:!unreadItems.length?<Empty title="Nenhuma notificação pendente" description="Os avisos lidos saem desta lista."/>:<>
        <div className="notifications-modal-actions"><span className="muted small">{items.filter(n=>!n.read).length} não lidas</span><Button type="button" variant="ghost" busy={busy} disabled={!items.some(n=>!n.read)} onClick={()=>void mark()}>Marcar todas como lidas</Button></div>
        <ul className="notifications-modal-list">{unreadItems.map(n=>{
          // Only app-relative paths are accepted; never follow external destinations.
          const destination=notificationDestination(n.url);
          return <li key={n.id} className={n.read?'':'unread'}>
            <Link to={destination} aria-disabled={busy} onClick={async e=>{e.preventDefault();if(busy)return;if(await mark(n.id)){onClose();navigate(destination);}}}>
              <div className="notification-modal-title"><strong>{n.title}</strong>{!n.read&&<span className="notification-unread-dot" aria-label="Não lida"/>}</div>
              <p>{n.description}</p><time>{date(n.createdAt,true)}</time>
            </Link>
            <Button type="button" variant="ghost" disabled={busy} onClick={()=>void mark(n.id)}>Marcar como lida</Button>
          </li>;
        })}</ul>
      </>}
    </div>
  </Modal>;
}