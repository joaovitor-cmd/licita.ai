import {Router,type Request,type Response,type NextFunction} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {one,rows,transaction,pool,type Database} from './db.js';
import {current,digest,hashPassword,HttpError,opaqueToken,rateLimit,verifyPassword} from './security.js';
import {email,loginSchema,password} from './validation.js';

export const CONSOLE_COOKIE=process.env.NODE_ENV==='production'?'__Host-licitaro_console':'licitaro_console_session';
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'};
const duration=8*60*60*1000,dummyHash=hashPassword(opaqueToken());
export const consoleUrl=()=>process.env.CONSOLE_ORIGIN??'http://localhost:5174';
const dto=(a:any)=>({user:{id:a.id,name:a.name,email:a.email},organization:{id:a.organization_id,name:'Gestão Licitaro',taxId:null,isDemo:false},role:'ADMIN' as const,isPlatformAdmin:true,adminRole:a.role});
export async function bootstrapConsoleOwner(){
 const userId=process.env.PLATFORM_ADMIN_USER_ID?.trim();if(!userId)return;
 // Explicit one-time bootstrap; public password recovery never alters console credentials.
 const owner=await one(`SELECT u.*,m.organization_id FROM users u JOIN members m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE u.id=$1 AND NOT o.is_demo ORDER BY o.created_at LIMIT 1`,[userId]);
 if(!owner)throw new Error('Conta explicitamente autorizada para gestão não encontrada.');
 await pool.query("INSERT INTO console_admins(id,organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'OWNER') ON CONFLICT DO NOTHING",[owner.id,owner.organization_id,owner.name,owner.email,owner.password_hash]);
}
export async function consoleSession(req:Request,_res:Response,next:NextFunction){
 const token=req.cookies?.[CONSOLE_COOKIE];
 if(typeof token==='string'&&token.length<200){
  const a=await one(`SELECT a.* FROM console_sessions s JOIN console_admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND a.active`,[digest(token)]);
  if(a){req.auth=dto(a);await pool.query('UPDATE console_sessions SET last_seen_at=now() WHERE token_hash=$1',[digest(token)]);}
 }next();
}
export function requireConsole(req:Request,_res:Response,next:NextFunction){
 const auth=current(req);if(!auth.isPlatformAdmin||!auth.adminRole)throw new HttpError(403,'Acesso exclusivo do console administrativo.');
 if(auth.adminRole==='VIEWER'&&!['GET','HEAD','OPTIONS'].includes(req.method))throw new HttpError(403,'O perfil de consulta não pode alterar registros.');next();
}
function ownerOnly(req:Request){if(current(req).adminRole!=='OWNER')throw new HttpError(403,'Somente o proprietário pode gerenciar acessos ao console.');}
async function audit(db:Database,req:Request,action:string,target:string){await db.query('INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)',[current(req).organization.id,current(req).user.id,action,target]);}
async function clear(req:Request,res:Response){const token=req.cookies?.[CONSOLE_COOKIE];if(typeof token==='string')await pool.query('DELETE FROM console_sessions WHERE token_hash=$1',[digest(token)]);res.clearCookie(CONSOLE_COOKIE,cookieOptions);}
export function consoleAuthRoutes(router:Router){
 router.get('/console-auth/me',(req,res)=>res.json(current(req)));
 router.post('/console-auth/login',rateLimit('console-login',15),async(req,res)=>{
  const b=loginSchema.parse(req.body),a=await one('SELECT * FROM console_admins WHERE email=$1 AND active',[b.email]);
  const valid=await verifyPassword(b.password,a?.password_hash??await dummyHash);
  if(!a||!valid)throw new HttpError(401,'E-mail ou senha incorretos.');
  await clear(req,res);const token=opaqueToken();
  await transaction(async db=>{
   const active=await one('SELECT id FROM console_admins WHERE id=$1 AND active AND password_hash=$2 FOR UPDATE',[a.id,a.password_hash],db);
   if(!active)throw new HttpError(401,'Acesso inativado.');
   await db.query('INSERT INTO console_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,$3)',[digest(token),a.id,new Date(Date.now()+duration)]);
   await db.query('UPDATE console_admins SET last_login_at=now() WHERE id=$1',[a.id]);
   await db.query("INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,'CONSOLE_LOGIN',$3)",[a.organization_id,a.id,a.id]);
  });res.cookie(CONSOLE_COOKIE,token,{...cookieOptions,maxAge:duration});res.json(dto(a));
 });
 router.post('/console-auth/logout',async(req,res)=>{await clear(req,res);res.json({ok:true});});
 router.post('/console-auth/activate',rateLimit('console-activate',12),async(req,res)=>{
  const b=z.object({token:z.string().min(32).max(200),password}).strict().parse(req.body),hash=await hashPassword(b.password);
  await transaction(async db=>{
   const t=await one('SELECT i.*,a.active FROM console_invites i JOIN console_admins a ON a.id=i.admin_id WHERE token_hash=$1 AND expires_at>now() FOR UPDATE OF i,a',[digest(b.token)],db);
   if(!t||!t.active)throw new HttpError(400,'Convite inválido ou expirado. Solicite um novo ao proprietário.');
   await db.query('UPDATE console_admins SET password_hash=$1 WHERE id=$2',[hash,t.admin_id]);
   await db.query('DELETE FROM console_invites WHERE admin_id=$1',[t.admin_id]);
   await db.query('DELETE FROM console_sessions WHERE admin_id=$1',[t.admin_id]);
  });await clear(req,res);res.json({ok:true});
 });
}
export function consoleAccessRoutes(router:Router){
 router.get('/management/admins',async(req,res)=>{ownerOnly(req);res.json({items:await rows('SELECT id,name,email,role,active,created_at,last_login_at FROM console_admins ORDER BY created_at,id')});});
 router.post('/management/admins',rateLimit('console-grant',15,60000),async(req,res)=>{
  ownerOnly(req);const b=z.object({name:z.string().trim().min(2).max(150),email,role:z.enum(['ADMIN','VIEWER'])}).strict().parse(req.body),id=randomUUID(),token=opaqueToken(),hash=await hashPassword(opaqueToken());
  await transaction(async db=>{
   await db.query('INSERT INTO console_admins(id,organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,$6)',[id,current(req).organization.id,b.name,b.email,hash,b.role]);
   await db.query("INSERT INTO console_invites(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[digest(token),id]);
   await audit(db,req,'CONSOLE_ACCESS_GRANTED',id);
  });res.status(201).json({id,activationUrl:`${consoleUrl()}/ativar?token=${encodeURIComponent(token)}`});
 });
 router.patch('/management/admins/:id',async(req,res)=>{
  ownerOnly(req);const id=z.string().uuid().parse(req.params.id),b=z.object({active:z.boolean(),role:z.enum(['ADMIN','VIEWER'])}).strict().parse(req.body);
  await transaction(async db=>{
   const a=await one('SELECT * FROM console_admins WHERE id=$1 FOR UPDATE',[id],db);
   if(!a)throw new HttpError(404,'Acesso não encontrado.');
   if(a.role==='OWNER'||id===current(req).user.id)throw new HttpError(400,'O acesso do proprietário não pode ser alterado por esta tela.');
   await db.query('UPDATE console_admins SET active=$1,role=$2 WHERE id=$3',[b.active,b.role,id]);
   await db.query('DELETE FROM console_sessions WHERE admin_id=$1',[id]);
   if(!b.active)await db.query('DELETE FROM console_invites WHERE admin_id=$1',[id]);
   await audit(db,req,b.active?'CONSOLE_ACCESS_UPDATED':'CONSOLE_ACCESS_BLOCKED',id);
  });res.json({ok:true});
 });
 router.post('/management/admins/:id/invitation',rateLimit('console-reinvite',15,60000),async(req,res)=>{
  ownerOnly(req);const id=z.string().uuid().parse(req.params.id),token=opaqueToken();
  await transaction(async db=>{
   const a=await one("SELECT id FROM console_admins WHERE id=$1 AND active AND role<>'OWNER' FOR UPDATE",[id],db);
   if(!a)throw new HttpError(400,'Selecione um acesso ativo que não seja o proprietário.');
   await db.query('DELETE FROM console_invites WHERE admin_id=$1',[id]);
   await db.query("INSERT INTO console_invites(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[digest(token),id]);
   await audit(db,req,'CONSOLE_INVITATION_REISSUED',id);
  });res.json({activationUrl:`${consoleUrl()}/ativar?token=${encodeURIComponent(token)}`});
 });
}
