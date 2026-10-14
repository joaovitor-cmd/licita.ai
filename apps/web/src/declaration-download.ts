import {createDocumentZip} from './document-archive';
import {declarationTemplates} from './declaration-templates';
export async function downloadDeclarationModels(ids:string[],signal?:AbortSignal){
 const templates=declarationTemplates.filter(template=>ids.includes(template.id));
 if(!templates.length)throw new Error('Selecione pelo menos um modelo.');
 const files=[];
 for(const template of templates){
  const response=await fetch(`/templates/declaracoes/${template.id}.docx`,{signal});
  if(!response.ok)throw new Error(`Não foi possível baixar o modelo ${template.title}.`);
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length<4||data[0]!==0x50||data[1]!==0x4b)throw new Error(`O modelo ${template.title} não está disponível em Word.`);
  files.push({name:`${template.title}.docx`,data});
 }
 if(signal?.aborted)return;
 const blob=files.length===1?new Blob([files[0].data.buffer],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}):new Blob([createDocumentZip(files)],{type:'application/zip'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=files.length===1?files[0].name:'modelos-de-declaracoes.zip';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}