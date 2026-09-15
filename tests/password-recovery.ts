import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import {SMTPServer} from 'smtp-server';

test('recuperação envia e-mail local, token é de uso único e invalida sessões',async()=>{
  let received='';
  const smtp=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream:any,_session:any,callback:any){let data='';stream.on('data',(b:Buffer)=>{data+=b.toString();});stream.on('end',()=>{received=data;callback();});}});
  await new Promise<void>(resolve=>smtp.listen(11026,'127.0.0.1',resolve));
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT='11026';process.env.SMTP_SECURE='false';
  const {authRouter}=await import('../apps/api/src/auth.js');
  const {session,protectOrigin,HttpError}=await import('../apps/api/src/security.js');
  const {pool}=await import('../apps/api/src/db.js');
  const app=express();app.use(protectOrigin,express.json(),cookieParser(),session);app.use('/auth',authRouter);app.use((e:any,_q:any,s:any,_n:any)=>s.status(e instanceof HttpError?e.status:500).json({error:e.message}));
  const server=app.listen(11027,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  let cookie='',orgId='',userId='';
  const request=async(path:string,body?:unknown,expected=200,oldCookie?:string)=>{
    const r=await fetch('http://127.0.0.1:11027/auth'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost:5173',Cookie:oldCookie??cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const set=r.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0];const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;
  };
  try{
    const email=`recovery-qa-${Date.now()}@licita.local`;
    const account=await request('/register',{name:'QA recuperação',organizationName:'QA recuperação isolada',email,password:'SenhaInicial!1234'},201);orgId=account.organization.id;userId=account.user.id;const previousCookie=cookie;
    const response=await request('/forgot-password',{email});assert.equal(response.token,undefined);
    for(let i=0;i<60&&!received;i++)await new Promise(r=>setTimeout(r,100));assert.ok(received,'O SMTP local não recebeu mensagem.');
    const token=received.replace(/=\r?\n/g,'').match(/token(?:=3D|=)([A-Za-z0-9_-]{43})/)?.[1];assert.ok(token,'Link de recuperação ausente no e-mail.');
    await request('/reset-password',{token,password:'NovaSenhaSegura!1234'});
    await request('/me',undefined,401,previousCookie);
    await request('/reset-password',{token,password:'OutraSenha!1234'},400);
    await request('/login',{email,password:'SenhaInicial!1234'},401);
    await request('/login',{email,password:'NovaSenhaSegura!1234'});
    assert.equal((await request('/me')).user.id,userId);
  }finally{
    if(orgId)await pool.query('DELETE FROM organizations WHERE id=$1',[orgId]);
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>smtp.close(resolve));await pool.end();
  }
});
