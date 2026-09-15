import {useState} from 'react';
import {Moon,Sun} from 'lucide-react';
const key='licita-color-theme';
function initialTheme(){
 try {const saved=localStorage.getItem(key);if(saved==='dark'||saved==='light')return saved;}
 catch {/* Storage can be unavailable in private browsing. */}
 return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
export function initializeTheme(){document.documentElement.dataset.theme=initialTheme();}
export function ThemeToggle(){
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 const label=dark?'Ativar tema claro':'Ativar tema escuro';
 return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={()=>{
  const next=dark?'light':'dark';document.documentElement.dataset.theme=next;setDark(!dark);
  try {localStorage.setItem(key,next);}catch {/* The theme still works for this visit. */}
 }}>{dark?<Sun size={20}/>:<Moon size={20}/>}</button>;
}
