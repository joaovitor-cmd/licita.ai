import {useCallback,useEffect,useState} from 'react';
export {currency,date,dateInput} from '../../web/src/api';
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const headers=new Headers(options.headers);if(options.body)headers.set('Content-Type','application/json');
 const response=await fetch(`/api${path}`,{...options,headers,credentials:'include'});
 const body=await response.text();let data:unknown;try{data=body?JSON.parse(body):undefined;}catch{data=undefined;}
 if(!response.ok){if(response.status===401&&!path.startsWith('/console-auth/'))window.dispatchEvent(new Event('console-session-expired'));throw new Error((data as {error?:string})?.error||`Não foi possível concluir a operação (${response.status}).`);}return data as T;
}
export const send=<T>(path:string,method:string,body?:unknown)=>api<T>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
export function useResource<T>(path:string){
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');api<T>(path,{signal:c.signal}).then(v=>{if(!c.signal.aborted)setData(v);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[path,revision]);
 return{data,loading,error,reload,setData};
}
export async function downloadReport(query:string){const response=await fetch(`/api/management/reports/export?${query}`,{credentials:'include'});if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===401)window.dispatchEvent(new Event('console-session-expired'));throw new Error(data.error||'Não foi possível exportar o relatório.');}const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`licitaro-participacoes-${new URLSearchParams(query).get('from')}-${new URLSearchParams(query).get('to')}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
