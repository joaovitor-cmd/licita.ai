import {z} from 'zod';
const decimal=z.string().trim().regex(/^\d{1,12}(?:\.\d{1,6})?$/,'Use um número com ponto decimal, sem separador de milhar.');
export const priceRecordSchema=z.object({
 number:z.string().trim().min(1).max(100),title:z.string().trim().min(1).max(300),agency:z.string().trim().min(1).max(300),
 opportunityId:z.uuid().nullable().default(null),documentId:z.uuid().nullable().default(null),ownerId:z.uuid().nullable().default(null),
 startsOn:z.iso.date(),endsOn:z.iso.date(),notes:z.string().trim().max(5000).default(''),
 items:z.array(z.object({description:z.string().trim().min(1).max(2000),unit:z.string().trim().min(1).max(60),quantity:decimal.refine(v=>/[1-9]/.test(v),'Quantidade deve ser maior que zero.'),unitPrice:decimal,supplierName:z.string().trim().min(1).max(300),supplierTaxId:z.string().trim().max(24).default('')}).strict()).max(100).default([]),
}).strict().refine(v=>v.endsOn>=v.startsOn,{path:['endsOn'],message:'O fim da vigência deve ser igual ou posterior ao início.'});
export function priceRecordAlert(id:string,number:string,endsOn:string,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const days=Math.round((Date.parse(endsOn+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 if(!Number.isFinite(days)||days>30)return null;
 return {key:`price-record:${id}:${endsOn}:${days<0?'expired':'upcoming'}`,title:days<0?'Ata com vigência encerrada':'Ata próxima do fim da vigência',description:`Ata ${number} — fim cadastrado: ${endsOn.split('-').reverse().join('/')}. ${days<0?'Confira a situação e os documentos.':days===0?'A vigência cadastrada termina hoje.':`Faltam ${days} dias.`} Registro manual; confira o documento oficial.`,url:`/app/atas-precos?highlight=${encodeURIComponent(id)}`};
}
