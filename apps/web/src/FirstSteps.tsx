import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {send,useResource} from './api';
import {Button,useSession} from './ui';
import {TourBubble} from './TourBubble';

type Status={profileReady:boolean;radarReady:boolean;onboardingStatus:'PENDING'|'SEEN'|'DISMISSED'|'COMPLETED'};
export function FirstSteps(){
 const {session}=useSession(),location=useLocation();
 const status=useResource<Status>('/getting-started');
 const rights=useResource<{features:string[]}>('/entitlements');
 const [active,setActive]=useState(false),[profilePart,setProfilePart]=useState(0),[skipProfile,setSkipProfile]=useState(false);
 // One promise survives StrictMode effect replay. The server claim is atomic across tabs/devices.
 const claim=useRef<Promise<{claimed:boolean}>|null>(null);
 const ended=useRef(false);
 const available=rights.data?.features.includes('discovery')&&rights.data?.features.includes('radar');
 useEffect(()=>{
  if(!available||status.data?.onboardingStatus!=='PENDING')return;
  let live=true;
  claim.current??=send<{claimed:boolean}>('/getting-started/claim','POST');
  claim.current.then(result=>{if(live&&result.claimed&&!ended.current)setActive(true);}).catch(()=>{/* Never block normal use or display before persistent acknowledgement. */});
  return()=>{live=false;};
 },[available,status.data?.onboardingStatus]);
 useEffect(()=>{if(active)status.reload();},[location.pathname,active]);
 useEffect(()=>{const refresh=()=>status.reload();const added=()=>{if(active)finish('COMPLETED');};window.addEventListener('profile-saved',refresh);window.addEventListener('radar-added',added);return()=>{window.removeEventListener('profile-saved',refresh);window.removeEventListener('radar-added',added);};},[status.reload,active]);
 function finish(result:'DISMISSED'|'COMPLETED'){
  ended.current=true;setActive(false);
  // SEEN is already persistent, so even a failed final update cannot replay the tour.
  void send('/getting-started','PUT',{status:result}).catch(()=>{});
 }
 if(!active||!available||status.error)return null;
 const profileStage=session.role==='ADMIN'&&!status.data?.profileReady&&!skipProfile;
 const onProfile=location.pathname==='/app/perfil',onList=location.pathname==='/app/oportunidades';
 const detail=/^\/app\/oportunidades\/[^/]+$/.test(location.pathname);
 const selector=profileStage?(onProfile?(profilePart===0?'[data-tour="cnpj"]':'[data-tour="save-profile"]'):'a.nav-item[href="/app/perfil"]'):detail?'[data-tour="track"], a[href^="/app/radar/"].full-width':onList?'[data-tour="opportunity"], input[aria-label="Buscar oportunidades"]':'a.nav-item[href="/app/oportunidades"]';
 const title=profileStage?(onProfile?(profilePart===0?'Confira o perfil da sua empresa':'Revise e salve seu perfil'):'Comece pelo perfil comercial'):detail?'Leve a oportunidade ao radar':onList?'Abra uma oportunidade':'Encontre sua primeira oportunidade';
 const text=profileStage?(onProfile?(profilePart===0?'Informe seu CNPJ e, se quiser, ative as sugestões de interesses. Você também pode preencher os interesses manualmente.':'Confira os interesses e clique em “Salvar perfil comercial”. Os demais campos podem ficar para depois.'):'Clique no menu destacado para informar o que sua empresa oferece. Ou pule esta etapa para explorar primeiro.'):detail?'Confira objeto, órgão e prazo. Clique em “Adicionar ao radar” para acompanhar. Isso não envia proposta nem realiza inscrição.':onList?'Abra um edital que faça sentido para conhecer os detalhes. Se não houver resultados, amplie os filtros.':'Clique em Oportunidades para explorar os editais e escolher o primeiro para acompanhar.';
 return <TourBubble selector={selector} title={title} text={text} onClose={()=>finish('DISMISSED')}>
  {profileStage&&onProfile&&<Button onClick={()=>setProfilePart(v=>v===0?1:0)}>{profilePart===0?'Já revisei os interesses':'Voltar ao CNPJ'}</Button>}
  {profileStage&&<Button variant="ghost" onClick={()=>setSkipProfile(true)}>Explorar primeiro</Button>}
 </TourBubble>;
}
