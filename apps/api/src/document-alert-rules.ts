export function documentAlert(id:string,name:string,expiresAt:string,now=new Date()) {
 const due=expiresAt.slice(0,10);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const days=Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 if(!Number.isFinite(days)||days>15)return null;
 const expired=days<0;
 return {title:expired?'Documento precisa ser renovado':'Documento próximo da data de revisão',description:`${name} — data cadastrada: ${due.split('-').reverse().join('/')}. ${expired?'Revise ou renove o arquivo.':days===0?'O prazo é hoje.':`Faltam ${days} dias para revisar ou renovar.`}`,url:`/app/documentos?highlight=${encodeURIComponent(id)}`,key:`document-date:${id}:${due}:${expired?'expired':'upcoming'}`};
}