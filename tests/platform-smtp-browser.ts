import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
test('console possui SMTP global; cliente não possui formulário nem consulta credenciais',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();let writes=0;
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json:any=[];
   if(path==='/api/console-auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'qa',name:'Gestão'},adminRole:'OWNER'};
   if(path==='/api/management/email-settings'){
    if(route.request().method()==='PUT')writes++;
    json={enabled:true,host:'smtp.example.invalid',port:587,mode:'starttls',username:'',fromEmail:'qa@example.invalid',fromName:'Licitaro',hasPassword:false,verifiedAt:null,serverConfigured:false};
   }
   await route.fulfill({json});
  });
  await page.goto('http://localhost:5174/email');
  await page.getByRole('heading',{name:'Servidor SMTP'}).waitFor();
  await page.getByRole('link',{name:'Serviço de e-mail',exact:true}).waitFor();
  await page.getByRole('button',{name:'Salvar serviço de e-mail'}).click();assert.equal(writes,1);
  await page.screenshot({path:'test-results/platform-smtp.png',fullPage:true});
  const client=await browser.newPage();let smtpReads=0;
  await client.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;let json:any=[];
   if(path.includes('email-settings'))smtpReads++;
   if(path==='/api/auth/me')json={user:{id:'qa',name:'QA',email:'qa@example.invalid'},organization:{id:'qa',name:'Empresa'},role:'ADMIN'};
   if(path==='/api/entitlements')json={features:[],multiCompany:false};
   if(path==='/api/sources')json={sources:[],runs:[],scheduler:{emailConfigured:true}};
   await route.fulfill({json});
  });
  await client.goto('http://localhost:5173/app/configuracoes');
  await client.getByText('O serviço de envio de e-mail é gerenciado pelo Licitaro.',{exact:false}).waitFor();
  assert.equal(await client.getByRole('heading',{name:'Servidor SMTP'}).count(),0);assert.equal(smtpReads,0);
 }finally{await browser.close();}
});
