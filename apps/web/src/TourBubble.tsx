import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export function TourBubble({selector,title,text,onClose,children}:{selector:string;title:string;text:string;onClose:()=>void;children?:ReactNode}){
 const ref=useRef<HTMLDivElement>(null),id=useId(),close=useRef(onClose);close.current=onClose;
 const [pos,setPos]=useState({left:12,top:80,arrow:30,above:false,found:false});
 useEffect(()=>{
  let anchor:HTMLElement|null=null,frame=0;
  function place(){
   const candidate=Array.from(document.querySelectorAll<HTMLElement>(selector)).sort((a,b)=>Number(b.hasAttribute('data-tour'))-Number(a.hasAttribute('data-tour'))).find(el=>el.getClientRects().length&&el.getBoundingClientRect().right>0&&!el.closest('[inert]'))||null;
   if(candidate!==anchor){anchor?.classList.remove('tour-target');anchor=candidate;anchor?.classList.add('tour-target');anchor?.scrollIntoView({block:'center',behavior:'instant'});}
   const box=anchor?.getBoundingClientRect(),height=ref.current?.offsetHeight||220,width=Math.min(350,innerWidth-24);
   const above=!!box&&box.top>=height+18;
   const left=Math.max(12,Math.min(innerWidth-width-12,box?box.left+box.width/2-width/2:innerWidth-width-16));
   const next={left,top:Math.max(12,Math.min(innerHeight-height-12,box?(above?box.top-height-14:box.bottom+14):80)),arrow:box?Math.max(20,Math.min(width-20,box.left+box.width/2-left)):30,above,found:!!box};
   setPos(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(place);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();};
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  const resize=new ResizeObserver(schedule);if(ref.current)resize.observe(ref.current);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);document.addEventListener('click',schedule);document.addEventListener('keydown',escape);place();
  return()=>{anchor?.classList.remove('tour-target');cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('click',schedule);document.removeEventListener('keydown',escape);};
 },[selector,title,text]);
 return createPortal(<div ref={ref} className={`tour-bubble ${pos.above?'tour-above':'tour-below'}`} style={{left:pos.left,top:pos.top}} role="dialog" aria-modal="false" aria-labelledby={id}>
  {pos.found&&<span className="tour-arrow" style={{left:pos.arrow}}/>}<div className="tour-heading"><span>PRIMEIROS PASSOS</span><button type="button" aria-label="Fechar primeiros passos" onClick={onClose}>×</button></div><h3 id={id}>{title}</h3><p>{text}</p>{!pos.found&&<p>Aguardando o controle aparecer. Se necessário, abra o menu lateral.</p>}<div className="button-row">{children}<button type="button" className="text-link" onClick={onClose}>Fazer depois</button></div>
 </div>,document.body);
}
