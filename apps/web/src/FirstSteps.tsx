import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useResource} from './api';
import {Button,ErrorNotice,Modal,useSession} from './ui';
import {TourBubble} from './TourBubble';

type Progress={active:boolean;visited:boolean;dismissed:boolean;profileSkipped:boolean};
const initial:Progress={active:false,visited:false,dismissed:false,profileSkipped:false};
export function FirstSteps(){
 const {session}=useSession(),location=useLocation(),navigate=useNavigate();
 const key=`licitaro:first-steps:v1:${session.user.id}:${session.organization.id}`;
 const [progress,setProgress]=useState<Progress>(()=>{try{return {...initial,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return initial;}});
 const [intro,setIntro]=useState(false);
 const [profilePart,setProfilePart]=useState(0);
 const status=useResource<{profileReady:boolean;radarReady:boolean}>('/getting-started');
 const rights=useResource<{features:string[]}>('/entitlements');
 const home=location.pathname==='/app/primeiros-passos';
 const features=rights.data?.features||[];
 function update(p:Partial<Progress>){setProgress(old=>{const next={...old,...p};try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Private browsing may disable storage; the guide remains usable. */}return next;});}
 useEffect(()=>{status.reload();},[location.pathname]);
 useEffect(()=>{const refresh=()=>status.reload();const viewed=()=>{update({visited:true});};window.addEventListener('profile-saved',refresh);window.addEventListener('opportunity-viewed',viewed);return()=>{window.removeEventListener('profile-saved',refresh);window.removeEventListener('opportunity-viewed',viewed);};},[]);
 const done=!!status.data?.radarReady,profileReady=!!status.data?.profileReady;
 const isAdmin=session.role==='ADMIN';
 const stage=done?3:!profileReady&&isAdmin&&!progress.profileSkipped?0:!progress.visited?1:2;
 const steps=[
  {title:'Conheça seu perfil comercial',text:isAdmin?'Informe o CNPJ para receber sugestões, revise o que sua empresa oferece e salve o perfil. Você também pode preencher manualmente; região é opcional.':'O perfil é compartilhado pela empresa. Consulte os interesses cadastrados; alterações ficam com o administrador.',to:'/app/perfil',action:isAdmin?'Configurar meu perfil':'Consultar perfil'},
  {title:'Encontre uma oportunidade',text:'Explore os editais e abra um que desperte seu interesse. A aderência indica afinidade com seu perfil, não aprovação para participar. Se não houver resultados, amplie ou limpe os filtros.',to:'/app/oportunidades',action:'Explorar oportunidades'},
  {title:'Leve uma oportunidade ao radar',text:'No detalhe do edital, confira objeto, prazo e órgão. Se fizer sentido, use “Adicionar ao radar”. É sua lista de negócios em acompanhamento: isso não envia proposta nem realiza inscrição.',to:'/app/oportunidades',action:'Escolher uma oportunidade'},
 ];
 if(!home&&!progress.active&&(progress.dismissed||done||location.pathname!=='/app'))return null;
 const current=steps[Math.min(stage,2)];
 const detail=/^\/app\/oportunidades\/[^/]+$/.test(location.pathname);
 if(progress.active&&!done&&!intro&&!status.error){
  const onProfile=location.pathname==='/app/perfil',onList=location.pathname==='/app/oportunidades';
  const selector=stage===0?(onProfile?(profilePart===0?'[data-tour="cnpj"]':'[data-tour="save-profile"]'):'a.nav-item[href="/app/perfil"]'):detail&&features.includes('radar')?'[data-tour="track"], a[href^="/app/radar/"].full-width':onList?'[data-tour="opportunity"], input[placeholder="Busque por objeto, palavra-chave ou órgão público"]':'a.nav-item[href="/app/oportunidades"]';
  const title=stage===0?(onProfile?(profilePart===0?'Informe o CNPJ da empresa':'Revise e salve seu perfil'):'Abra o Perfil comercial'):detail?'Adicione ao seu radar':'Abra uma oportunidade';
  const text=stage===0?(onProfile?(profilePart===0?'Clique no campo destacado e informe seu CNPJ. Ative “Sugerir interesses pelo CNPJ” para receber sugestões, ou preencha os interesses manualmente.':'Confira segmentos e palavras-chave antes de clicar em “Salvar perfil comercial”. Você não precisa preencher região ou valores para começar.'):'Clique no menu destacado para configurar o foco da sua empresa.'):detail?'Confira o objeto, órgão e prazo. Se fizer sentido, clique no botão destacado. Adicionar ao radar não envia proposta nem realiza inscrição.':onList?'Clique em um edital para conhecer os detalhes. Se não houver resultados, use a busca e reveja os filtros. A aderência não garante habilitação.':'Clique no menu Oportunidades para explorar os editais disponíveis.';
  return <TourBubble selector={selector} title={title} text={text} onClose={()=>update({active:false,dismissed:true})}>{stage===0&&onProfile&&<Button onClick={()=>setProfilePart(v=>v===0?1:0)}>{profilePart===0?'Já revisei os interesses':'Voltar ao CNPJ'}</Button>}</TourBubble>;
 }
 return <section className="card first-steps" aria-label="Primeiros passos">
  <div className="first-steps-heading"><div><span className="eyebrow">DO PERFIL À PRIMEIRA OPORTUNIDADE</span><h2>Primeiros passos</h2></div>{progress.active&&<Button variant="ghost" onClick={()=>update({active:false,dismissed:true})}>Fazer depois</Button>}</div>
  {status.error?<ErrorNotice message="Não foi possível conferir seu progresso. Você pode continuar usando a plataforma." onRetry={status.reload}/>:status.loading&&!status.data?<p>Conferindo a preparação da sua empresa…</p>:<>
   {!progress.active&&!home&&!done?<><p>Vamos ajudar você a configurar o foco e colocar a primeira oportunidade no radar, sem precisar preencher tudo agora.</p><div className="button-row"><Button onClick={()=>setIntro(true)}>Começar orientação</Button><Button variant="ghost" onClick={()=>update({dismissed:true})}>Agora não</Button></div></>:<>
    <ol className="first-steps-list">{steps.map((s,i)=><li key={s.title}><span>{i===0?(profileReady?'✓':isAdmin?'1':'Consulta'):i===1?(progress.visited||done?'✓':'2'):done?'✓':'3'}</span>{s.title}</li>)}</ol>
    <div className="first-steps-tip" role="status"><h3>{done?'Sua empresa já tem uma oportunidade no radar':current.title}</h3><p>{done?'O objetivo inicial foi alcançado. Agora sua equipe pode organizar a preparação, sem confundir acompanhamento com participação formal.':current.text}</p></div>
    {!done&&<div className="button-row">{!progress.active?<Button onClick={()=>setIntro(true)}>Iniciar ou retomar orientação</Button>:stage===2&&detail&&features.includes('radar')?<p>Use o botão <strong>Adicionar ao radar</strong> no edital abaixo. A etapa só será concluída quando a inclusão for confirmada.</p>:stage>0&&(!features.includes('discovery')||(stage===2&&!features.includes('radar')))?<p>A busca ou o radar não está disponível neste plano. Consulte o administrador do ambiente.</p>:<Link className="button primary" to={current.to}>{current.action}</Link>}{isAdmin&&!profileReady&&<Link className="text-link" to="/app/oportunidades" onClick={()=>update({active:true,profileSkipped:true})}>Prefiro explorar antes de configurar</Link>}</div>}
    {done&&<><div className="button-row">{features.includes('radar')&&<Link className="button primary" to="/app/radar">Abrir meu radar</Link>}<Button variant="ghost" onClick={()=>update({active:false,dismissed:true})}>Encerrar orientação</Button></div><h3>Próximos passos, no seu ritmo</h3><p>Confira as exigências do edital e organize documentos e tarefas. As interpretações precisam de revisão humana.</p><div className="button-row">{features.includes('documents')&&<Link className="text-link" to="/app/documentos">Conhecer a biblioteca documental</Link>}<Link className="text-link" to="/app/configuracoes">Configurar preferências de alertas</Link></div></>}
   </>}
   <p className="muted small">Você pode retomar pelo menu Primeiros passos. A preparação é da empresa; a orientação é individual e fica salva neste navegador.</p>
  </>}
  {intro&&<Modal title="Vamos até sua primeira oportunidade no radar?" description="Um roteiro curto, sem bloquear sua navegação." onClose={()=>setIntro(false)}><div className="modal-form"><p>Primeiro conhecemos o perfil da empresa, depois exploramos um edital e mostramos como acompanhá-lo. Nenhuma proposta será enviada.</p><p>{isAdmin?'Se o perfil já estiver configurado, aproveitaremos esses dados.':'Você pode explorar oportunidades. A configuração do perfil fica com o administrador da empresa.'}</p><div className="button-row"><Button onClick={()=>{update({active:true,dismissed:false});setIntro(false);navigate(done?'/app/radar':current.to);}}>Vamos começar</Button><Button variant="ghost" onClick={()=>setIntro(false)}>Voltar</Button></div></div></Modal>}
 </section>;
}
