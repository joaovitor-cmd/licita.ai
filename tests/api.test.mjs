import { test } from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.API_URL || 'http://localhost:3000/api';
function client() {
  let cookie = '';
  return async (path, method = 'GET', body, expected = 200) => {
    const form = body instanceof FormData;
    const response = await fetch(base + path, {
      method, headers: { Origin: 'http://localhost:5173', ...(cookie ? {Cookie:cookie} : {}), ...(!form && body !== undefined ? {'Content-Type':'application/json'} : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().at(-1);
    if (setCookie) { cookie = setCookie.split(';')[0]; assert.match(setCookie,/httponly/i); assert.match(setCookie,/samesite=lax/i); }
    const value = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text();
    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    assert.ok(expectedStatuses.includes(response.status),`${method} ${path} status=${response.status}: ${JSON.stringify(value).slice(0,400)}`);
    return value;
  };
}

test('fluxo completo e isolamento entre empresas', async t => {
  const a=client(), b=client(), anonymous=client();
  await t.test('saúde e autenticação obrigatória',async()=>{ assert.equal((await anonymous('/health')).status,'ok'); await anonymous('/catalog','GET',undefined,401); });
  await t.test('demonstrações isoladas',async()=>{
    const sa=await a('/auth/demo','POST',{},[200,201]), sb=await b('/auth/demo','POST',{},[200,201]);
    assert.equal(sa.organization.isDemo,true); assert.equal(sb.organization.isDemo,true); assert.notEqual(sa.organization.id,sb.organization.id);
    assert.equal((await a('/auth/me')).organization.id,sa.organization.id);
  });
  let opportunity, tracking, offering, task, document;
  await t.test('descoberta, paginação, score e privacidade',async()=>{
    const list=await a('/opportunities?pageSize=2'); assert.ok(list.total>=3); assert.equal(list.items.length,2); opportunity=list.items[0];
    assert.equal(opportunity.isDemo,true); assert.equal(typeof opportunity.match.score,'number'); assert.ok(Array.isArray(opportunity.match.reasons));
    assert.equal((await a('/opportunities/'+opportunity.id)).id,opportunity.id); await b('/opportunities/'+opportunity.id,'GET',undefined,404);
    assert.equal((await a('/opportunities?q=termo-inexistente-qa-8497')).total,0);
  });
  await t.test('perfil persiste termos acentuados e localização',async()=>{
    const profile=await a('/profile'); Object.assign(profile,{keywords:['computação','notebook'],states:['RS','SC','PR','PA'],minValue:100,maxValue:5000000});
    await a('/profile','PUT',profile); const saved=await a('/profile'); assert.deepEqual(saved.keywords,profile.keywords); assert.deepEqual(saved.states,profile.states);
  });
  await t.test('catálogo CRUD isolado',async()=>{
    offering=await a('/catalog','POST',{type:'SERVICE',name:'Consultoria de QA',description:'Revisão',category:'Tecnologia',keywords:['computação'],active:true},201);
    assert.ok(offering.id); await a('/catalog/'+offering.id,'PATCH',{name:'Consultoria atualizada',active:false});
    assert.equal((await a('/catalog')).find(x=>x.id===offering.id).active,false);
    await b('/catalog/'+offering.id,'PATCH',{name:'Intrusão'},404); await b('/catalog/'+offering.id,'DELETE',undefined,404);
  });
  await t.test('radar idempotente, responsável e decisão',async()=>{
    tracking=await a('/trackings','POST',{opportunityId:opportunity.id},[200,201]);
    assert.equal((await a('/trackings','POST',{opportunityId:opportunity.id},[200,201])).id,tracking.id);
    const members=await a('/members');
    const updated=await a('/trackings/'+tracking.id,'PATCH',{stage:'WILL_PARTICIPATE',notes:'Revisão QA persistente',ownerId:members[0].id,expectedValue:125000,deadline:new Date(Date.now()+86400000).toISOString()});
    assert.equal(updated.stage,'WILL_PARTICIPATE'); assert.equal((await a('/trackings/'+tracking.id)).notes,'Revisão QA persistente');
    await b('/trackings/'+tracking.id,'GET',undefined,404); await b('/trackings/'+tracking.id,'PATCH',{stage:'WON'},404);
  });
  await t.test('tarefas, comentários e exportação',async()=>{
    task=await a(`/trackings/${tracking.id}/tasks`,'POST',{title:'Conferir certidões'},201);
    await a(`/trackings/${tracking.id}/tasks/${task.id}`,'PATCH',{done:true});
    await a(`/trackings/${tracking.id}/events`,'POST',{description:'Aprovado para revisão técnica'},201);
    const detail=await a('/trackings/'+tracking.id); assert.equal(detail.tasks.find(x=>x.id===task.id).done,true); assert.ok(detail.events.length>=2);
    assert.match(await a(`/trackings/${tracking.id}/export`),/Conferir certidões/);
    await b(`/trackings/${tracking.id}/tasks/${task.id}`,'PATCH',{done:false},404);
  });
  await t.test('documentos privados e download autenticado',async()=>{
    const form=new FormData(); form.append('name','Certidão de teste QA'); form.append('category','Habilitação'); form.append('expiresAt','2027-12-31');
    form.append('file',new Blob(['%PDF-1.4\n% Fictício QA\n%%EOF'],{type:'application/pdf'}),'certidao-qa.pdf');
    document=await a('/documents','POST',form,201); assert.ok(document.id); assert.match(await a(`/documents/${document.id}/download`),/%PDF/);
    await b(`/documents/${document.id}/download`,'GET',undefined,404); await b(`/documents/${document.id}`,'DELETE',undefined,404); await a(`/documents/${document.id}`,'DELETE');
  });
  await t.test('dashboard, preferências e restrição administrativa',async()=>{
    const dashboard=await a('/dashboard'); assert.ok(dashboard.stats.tracked>=1); assert.ok(Array.isArray(dashboard.byState));
    assert.ok((await a('/sources')).sources.some(x=>x.code==='pncp'));
    await a('/preferences','PUT',{inApp:true,email:false}); assert.equal((await a('/preferences')).email,false);
    await a('/notifications/read-all','POST',{}); assert.ok((await a('/notifications')).every(x=>x.read)); await a('/admin','GET',undefined,404);
  });
  await t.test('limpeza dos recursos QA e logout',async()=>{
    await a(`/trackings/${tracking.id}/tasks/${task.id}`,'DELETE'); await a('/catalog/'+offering.id,'DELETE'); await a('/auth/logout','POST',{}); await a('/auth/me','GET',undefined,401);
  });
});

test('cadastro, validação, login e recuperação sem vazamento',async()=>{
  const c=client(), email=`qa-${Date.now()}@licita.local`;
  await c('/auth/register','POST',{name:'QA',email:'invalid',password:'123',organizationName:'QA'},400);
  const session=await c('/auth/register','POST',{name:'Pessoa QA',email,password:'SenhaQA!12345',organizationName:'Empresa QA isolada'},201);
  assert.equal(session.organization.isDemo,false); assert.equal((await c('/catalog')).length,0);
  const badOrigin=await fetch(base+'/profile',{method:'PUT',headers:{Origin:'https://malicioso.example','Content-Type':'application/json'},body:'{}'}); assert.equal(badOrigin.status,403);
  const recovered=await c('/auth/forgot-password','POST',{email:'inexistente@licita.local'}); assert.ok(recovered.message); assert.equal(recovered.token,undefined);
  await c('/auth/logout','POST',{}); await c('/auth/login','POST',{email,password:'senhaerrada'},401); await c('/auth/login','POST',{email,password:'SenhaQA!12345'});
  assert.equal((await c('/auth/me')).user.email,email);
});
