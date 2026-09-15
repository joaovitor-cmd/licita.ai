import {z} from 'zod';

export function normalizeCnpj(value:string) {
  const digits=value.replace(/[.\/\-\s]/g,'').toUpperCase();
  if(!/^[A-Z0-9]{12}\d{2}$/.test(digits)||/^(\d)\1+$/.test(digits))throw new Error('Informe um CNPJ válido: 12 letras ou números e 2 dígitos verificadores numéricos.');
  const check=(part:string)=>{
    let weight=part.length-7;
    const sum=[...part].reduce((total,n)=>{const result=total+(n.charCodeAt(0)-48)*weight;weight=weight===2?9:weight-1;return result;},0);
    return sum%11<2?0:11-sum%11;
  };
  if(check(digits.slice(0,12))!==Number(digits[12])||check(digits.slice(0,13))!==Number(digits[13]))throw new Error('Confira os dígitos do CNPJ informado.');
  return digits;
}
const activitySchema=z.object({codigo:z.union([z.number(),z.string()]),descricao:z.string().max(1000)});
const companySchema=z.object({cnpj:z.string(),razao_social:z.string().min(1).max(300),cnae_fiscal:z.union([z.number(),z.string()]),cnae_fiscal_descricao:z.string().max(1000),cnaes_secundarios:z.array(activitySchema).max(200).default([])});
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rules=[
  {id:'printing',name:'Soluções de impressão',pattern:/impressor|fotocopi|reprograf|maquinas e equipamentos para escritorio/,keywords:['outsourcing de impressão','locação de impressoras','impressoras multifuncionais','gerenciamento de impressão','impressão segura','bilhetagem de impressão']},
  {id:'it-equipment',name:'Equipamentos de informática',pattern:/equipamentos.*informatica|perifericos/,keywords:['equipamentos de informática','computadores','notebooks','periféricos']},
  {id:'software',name:'Software e serviços de TI',pattern:/programas de computador|consultoria em tecnologia da informacao|suporte tecnico.*tecnologia da informacao/,keywords:['licenciamento de software','desenvolvimento de sistemas','suporte técnico de TI']},
  {id:'engineering',name:'Serviços de engenharia',pattern:/servicos de engenharia/,keywords:['serviços de engenharia','projetos de engenharia','fiscalização de obras']},
  {id:'cleaning',name:'Limpeza e conservação',pattern:/limpeza em predios|atividades de limpeza/,keywords:['limpeza e conservação','serviços de limpeza','higienização']},
  {id:'medical',name:'Equipamentos e materiais de saúde',pattern:/instrumentos e materiais.*medico|equipamentos.*medico/,keywords:['equipamentos médico-hospitalares','materiais hospitalares']},
];
export function suggestCompany(raw:unknown,requestedCnpj:string) {
  const company=companySchema.parse(raw);
  if(normalizeCnpj(company.cnpj)!==requestedCnpj)throw new Error('O cadastro retornado não corresponde ao CNPJ consultado.');
  const activities=[{code:String(company.cnae_fiscal),description:company.cnae_fiscal_descricao,primary:true},...company.cnaes_secundarios.map(a=>({code:String(a.codigo),description:a.descricao,primary:false}))].filter(a=>a.description.trim()&&a.code!=='0');
  const suggestions=rules.flatMap(rule=>{
    const evidence=activities.filter(a=>rule.pattern.test(normalize(a.description)));
    return evidence.length?[{id:rule.id,segment:rule.name,keywords:rule.keywords,evidence}]:[];
  });
  return {cnpj:requestedCnpj,companyName:company.razao_social,activities,suggestions,source:'BrasilAPI / Minha Receita',consultedAt:new Date().toISOString()};
}
export async function lookupCompany(cnpj:string,fetcher:typeof fetch=fetch) {
  const response=await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/json'}});
  if(response.status===404)throw new Error('CNPJ não encontrado na fonte de consulta. Confira o número ou preencha o perfil manualmente.');
  if(!response.ok)throw new Error('A consulta de CNPJ está indisponível. Tente novamente mais tarde ou configure o perfil manualmente.');
  return suggestCompany(await response.json(),cnpj);
}
