import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj,suggestCompany,lookupCompany} from './cnpj-profile.js';
const cnpj='11222333000181';
const company={cnpj,razao_social:'Empresa de teste',cnae_fiscal:7733100,cnae_fiscal_descricao:'Aluguel de máquinas e equipamentos para escritório',cnaes_secundarios:[{codigo:6201501,descricao:'Desenvolvimento de programas de computador sob encomenda'}]};
test('CNPJ normaliza formato e rejeita dígitos inválidos e URLs',()=>{
 assert.equal(normalizeCnpj('11.222.333/0001-81'),cnpj);
 assert.equal(normalizeCnpj('12.abc.345/01de-35'),'12ABC34501DE35');
 assert.equal(normalizeCnpj('00.000.000/E08G-12'),'00000000E08G12');
 for(const value of ['12ABC34501DE36','12ABC34501DE3A','12ÁBC34501DE35'])assert.throws(()=>normalizeCnpj(value));
 for(const value of ['00000000000000','11222333000182','https://localhost','123'])assert.throws(()=>normalizeCnpj(value));
});
test('sugestões usam CNAEs principal e secundário com evidência, sem filtros restritivos',()=>{
 const result=suggestCompany(company,cnpj);
 assert.equal(result.suggestions.length,2);
 assert.equal(result.suggestions[0].evidence[0].primary,true);
 assert.equal(result.suggestions[1].evidence[0].primary,false);
 assert.equal('excludedKeywords' in result,false);
 assert.equal('states' in result,false);
 assert.equal('minValue' in result,false);
});
test('atividade desconhecida não inventa sugestão; cadastro divergente ou incompleto é rejeitado',()=>{
 assert.equal(suggestCompany({...company,cnpj:'12.ABC.345/01DE-35'},'12ABC34501DE35').cnpj,'12ABC34501DE35');
 assert.equal(suggestCompany({...company,cnae_fiscal_descricao:'Atividade não mapeada',cnaes_secundarios:[]},cnpj).suggestions.length,0);
 assert.throws(()=>suggestCompany({...company,cnpj:'00000000000000'},cnpj));
 assert.throws(()=>suggestCompany({},cnpj));
});
test('consulta usa host fixo, sem redirecionamento, e trata falhas da fonte',async()=>{
 const fetcher:typeof fetch=async(url,options)=>{assert.equal(url,`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);assert.equal(options?.redirect,'error');assert.ok(options?.signal);return Response.json(company);};
 assert.equal((await lookupCompany(cnpj,fetcher)).companyName,company.razao_social);
 await assert.rejects(lookupCompany(cnpj,async()=>new Response(null,{status:404})),/não encontrado/);
 await assert.rejects(lookupCompany(cnpj,async()=>new Response(null,{status:429})),/indisponível/);
});
test('cadastro cadastral preserva ausência, limita textos e não infere representantes ou inscrições',()=>{
 const result=suggestCompany({...company,nome_fantasia:'Nome comercial',logradouro:'Rua QA',numero:'10',municipio:'Porto Alegre',uf:'RS',cep:'90000000',email:null,ddd_telefone_1:'51999999999',porte:'MICRO EMPRESA',qsa:[{nome_socio:'Pessoa privada',cpf:'123'}]},cnpj);
 assert.equal(result.registration.legalName,company.razao_social);
 assert.equal(result.registration.email,'');assert.equal(result.registration.street,'Rua QA');
 assert.equal(result.registration.phone,'51999999999');assert.equal(result.registration.companySize,'MICRO EMPRESA');
 assert.equal('representative' in result.registration,false);assert.equal('stateRegistration' in result.registration,false);
 assert.doesNotMatch(JSON.stringify(result.registration),/Pessoa privada|123/);
});
test('consulta limita o corpo antes de interpretar JSON',async()=>{
 await assert.rejects(lookupCompany(cnpj,async()=>new Response('x'.repeat(512_001))),/excede o limite/);
});
