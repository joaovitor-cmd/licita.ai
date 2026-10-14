import type {DocumentItem} from './types';
import {createDocumentZip} from './document-archive';
export async function downloadDocumentsZip(documents:DocumentItem[],organizationId:string,signal?:AbortSignal):Promise<void>{
 const unique=[...new Map(documents.map(d=>[d.id,d])).values()];
 if(!unique.length)throw new Error('Selecione pelo menos um documento.');
 if(unique.reduce((sum,d)=>sum+d.size,0)>100*1024*1024)throw new Error('O conjunto deve ter até 100 MB.');
 const files=[];let total=0;
 for(const document of unique){
  signal?.throwIfAborted();
  const response=await fetch(`/api/documents/${encodeURIComponent(document.id)}/download`,{credentials:'include',headers:{'X-Workspace-Id':organizationId},signal});
  if(!response.ok)throw new Error(`Não foi possível baixar “${document.name}” (${response.status}). Nenhum arquivo ZIP foi gerado.`);
  const size=Number(response.headers.get('content-length'));
  if(size>10*1024*1024)throw new Error(`“${document.name}” excede o limite de 10 MB.`);
  if(!response.body)throw new Error(`O arquivo “${document.name}” não pôde ser recebido.`);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let received=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;total+=value.byteLength;if(received>10*1024*1024||total>100*1024*1024){await reader.cancel();throw new Error('O conjunto excede os limites de download (10 MB por arquivo e 100 MB no total).');}chunks.push(value);}}finally{reader.releaseLock();}
  if(!received)throw new Error(`O arquivo “${document.name}” está vazio. Nenhum ZIP foi gerado.`);
  const data=new Uint8Array(received);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  files.push({name:document.fileName,data});
 }
 signal?.throwIfAborted();
 const blob=new Blob([createDocumentZip(files)],{type:'application/zip'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download='documentos-licitaro.zip';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}