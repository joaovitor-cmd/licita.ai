import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {pool,one} from '../apps/api/src/db.js';
import {hashPassword} from '../apps/api/src/security.js';

test('console real: criar, editar, bloquear, arquivar, restaurar e baixar CSV pelo navegador',{timeout:120000},async()=>{
 const suffix=randomUUID(),org=randomUUID(),admin=randomUUID(),email=`qa-ui-${suffix}@example.invalid`,name=`QA UI ${suffix}`,plan='qa-'+suffix.slice(0,18),secret=`QA!${randomUUID()}`;
 let browser:any,environment:string|undefined;const invitedEmail=`qa-invite-${suffix}@example.invalid`,invitedName=`Convidado QA ${suffix}`;
 try{
  await pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,`Gestão QA ${suffix}`]);
  await pool.query("INSERT INTO console_admins(id,organization_id,name,email,password_hash,role) VALUES($1,$2,'QA UI',$3,$4,'OWNER')",[admin,org,email,await hashPassword(secret)]);
  await pool.query("INSERT INTO commercial_plans(code,name,max_companies) VALUES($1,$2,1)",[plan,`Plano QA ${suffix}`]);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('dialog',async(dialog:any)=>dialog.accept());
  // Every mutation in this scenario targets an identity/environment/plan created by this test.
  await page.goto('http://localhost:5174/login');
  await page.getByLabel('E-mail administrativo').fill(email);await page.getByLabel('Senha do console').fill(secret);
  await page.getByRole('button',{name:'Acessar console'}).click();
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await page.getByRole('link',{name:'Ambientes',exact:true}).click();
  await page.getByRole('button',{name:'Adicionar novo ambiente'}).click();
  await page.getByLabel('Nome da empresa principal').fill(name);await page.getByLabel('CNPJ',{exact:true}).fill('00123456000100');
  await page.getByLabel('Plano inicial').selectOption(plan);
  await page.getByLabel('Nome do responsável').fill('Responsável QA');await page.getByLabel('E-mail do responsável').fill(email);
  const created=page.waitForResponse((r:any)=>r.url().endsWith('/api/management/companies')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Criar ambiente',exact:true}).click();
  const response=await created;assert.equal(response.status(),201);environment=(await response.json()).id;
  await page.getByRole('dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.getByLabel('Buscar ambiente').fill(name);await page.getByRole('button',{name:'Buscar',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:name});
  await row.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('CNPJ',{exact:true}).fill('11222333000181');
  const saved=page.waitForResponse((r:any)=>r.url().endsWith(`/management/companies/${environment}`)&&r.request().method()==='PATCH');
  await page.getByRole('button',{name:'Salvar ambiente'}).click();assert.equal((await saved).status(),200);await page.keyboard.press('Escape');
  await row.getByText('11222333000181',{exact:true}).waitFor();
  await page.getByLabel('Buscar ambiente').fill('11.222.333/0001-81');await page.getByRole('button',{name:'Buscar',exact:true}).click();await row.getByText('11222333000181',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Bloquear',exact:true}).click();await row.getByText('Bloqueado',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Excluir/arquivar',exact:true}).click();await row.waitFor({state:'hidden'});
  await page.getByLabel('Visualização').selectOption('archived');await row.getByRole('button',{name:'Restaurar'}).click();await row.waitFor({state:'hidden'});
  await page.getByLabel('Visualização').selectOption('current');await row.getByText('Bloqueado',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Liberar',exact:true}).click();await row.getByText('Liberado',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Personalização de planos',exact:true}).click();
  const editor=page.locator('form.plan-draft').filter({has:page.getByLabel(`Nome do plano ${plan}`)});
  await editor.getByLabel('Limite de empresas por ambiente').fill('2');
  const planSaved=page.waitForResponse((r:any)=>r.url().endsWith(`/management/plans/${plan}`)&&r.request().method()==='PUT');
  await editor.getByRole('button',{name:'Salvar plano'}).click();assert.equal((await planSaved).status(),200);
  await page.getByRole('link',{name:'Acessos à gestão',exact:true}).click();await page.getByRole('button',{name:'Adicionar acesso',exact:true}).click();
  await page.getByLabel('Nome da pessoa').fill(invitedName);await page.getByLabel('E-mail administrativo').fill(invitedEmail);
  await page.getByRole('button',{name:'Criar acesso',exact:true}).click();await page.getByLabel('Link para definir a senha de gestão').waitFor();
  const accessRow=page.getByRole('row').filter({hasText:invitedName});
  await accessRow.getByRole('button',{name:'Bloquear',exact:true}).click();await accessRow.getByText('Bloqueado',{exact:true}).waitFor();
  await accessRow.getByRole('button',{name:'Liberar',exact:true}).click();await accessRow.getByText('Ativo',{exact:true}).waitFor();
  await page.getByLabel(`Permissão de ${invitedName}`).selectOption('ADMIN');
  // The browser response is asynchronous; the final role is asserted below after export.
  const opportunity=await one('SELECT id FROM opportunities WHERE demo_org_id IS NULL LIMIT 1');assert.ok(opportunity,'A base local deve conter ao menos um edital público para o teste de relatório.');
  // Only this test company's tracking is created; the public opportunity itself is never modified.
  await pool.query("INSERT INTO trackings(id,organization_id,opportunity_id,stage,created_at) VALUES($1,$2,$3,'WON','2100-01-15T15:00:00Z')",[randomUUID(),environment,opportunity.id]);
  await page.getByRole('link',{name:'Relatórios',exact:true}).click();
  await page.getByLabel('Data inicial').fill('2100-01-01');await page.getByLabel('Data final').fill('2100-01-31');
  await page.getByRole('button',{name:'Aplicar período'}).click();await page.getByRole('cell').filter({hasText:name}).waitFor();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV'}).click();
  const download=await downloading,stream=await download.createReadStream(),chunks=[];assert.ok(stream);
  for await(const chunk of stream!)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');
  assert.match(download.suggestedFilename(),/2100-01-01-2100-01-31/);assert.ok(csv.includes(name));assert.ok(csv.includes('11.222.333/0001-81'));assert.ok(csv.includes('Ganho'));assert.ok(csv.includes(opportunity.id));
  assert.equal((await one('SELECT role FROM console_admins WHERE email=$1',[invitedEmail])).role,'ADMIN');
 }finally{
  if(browser)await browser.close();
  // Exact unique test names also handle failure immediately after a successful creation response.
  const env=environment??(await one('SELECT id FROM organizations WHERE name=$1',[name]))?.id;
  if(env){await pool.query('DELETE FROM audit_logs WHERE organization_id=$1',[env]);await pool.query('DELETE FROM organizations WHERE id=$1',[env]);}
  await pool.query('DELETE FROM console_admins WHERE id=$1 OR email=$2',[admin,invitedEmail]);await pool.query('DELETE FROM audit_logs WHERE organization_id=$1',[org]);
  await pool.query('DELETE FROM organizations WHERE id=$1',[org]);await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.query('DELETE FROM commercial_plans WHERE code=$1',[plan]);await pool.end();
 }
});
