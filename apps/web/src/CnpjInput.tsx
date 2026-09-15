import {useLayoutEffect,useRef,type InputHTMLAttributes} from 'react';

export const cleanCnpj=(value:string)=>value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,14);
export function formatCnpj(value:string){
  const raw=cleanCnpj(value);
  return raw.split('').map((c,i)=>(i===2||i===5?'.':i===8?'/':i===12?'-':'')+c).join('');
}
export function CnpjInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'> & {value:string;onValueChange:(value:string)=>void}){
  const ref=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null);
  const display=formatCnpj(value);
  useLayoutEffect(()=>{if(caret.current!==null){ref.current?.setSelectionRange(caret.current,caret.current);caret.current=null;}},[display]);
  return <input {...props} ref={ref} type="text" inputMode="text" autoCapitalize="characters" spellCheck={false} placeholder="00.000.000/0000-00" value={display} onChange={e=>{
    const position=e.target.selectionStart??e.target.value.length;
    const count=cleanCnpj(e.target.value.slice(0,position)).length;
    const next=formatCnpj(e.target.value);
    let index=0,seen=0;while(index<next.length&&seen<count){if(/[A-Z0-9]/.test(next[index]))seen++;index++;}
    caret.current=index;onValueChange(next);
  }} onKeyDown={e=>{
    if(props.onKeyDown)props.onKeyDown(e);
    const input=e.currentTarget,start=input.selectionStart??0,end=input.selectionEnd??0;
    if(e.defaultPrevented||start!==end||!['Backspace','Delete'].includes(e.key))return;
    const target=e.key==='Backspace'?start-1:start;
    if(target<0||target>=display.length||/[A-Z0-9]/.test(display[target]))return;
    e.preventDefault();
    const raw=cleanCnpj(display),before=cleanCnpj(display.slice(0,start)).length;
    const remove=e.key==='Backspace'?before-1:before;
    const next=formatCnpj(raw.slice(0,remove)+raw.slice(remove+1));
    caret.current=formatCnpj(raw.slice(0,Math.max(0,remove))).length;onValueChange(next);
  }}/>;
}
