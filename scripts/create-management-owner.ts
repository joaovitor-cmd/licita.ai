// Explicit operator bootstrap. Creates a NEW owner, never promotes an existing account.
// The returned activation link is private, single-use and expires in 30 minutes.
import {randomUUID} from 'node:crypto';
import {pool,transaction,one} from '../apps/api/src/db.js';
import {hashPassword,opaqueToken,digest} from '../apps/api/src/security.js';
import {email} from '../apps/api/src/validation.js';
async function main(){
const address=email.parse(process.argv[2]);
try{
 const result=await transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`grant:${address}`]);
  if(await one('SELECT id FROM users WHERE email=$1',[address],db))throw new Error('Conta já existente: operação cancelada, sem alterações.');
  const userId=randomUUID(),organizationId=randomUUID(),token=opaqueToken();
  await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[organizationId,'Gestão Licitaro']);
  await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[userId,'Administrador Licitaro',address,await hashPassword(opaqueToken())]);
  await db.query("INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",[organizationId,userId]);
  await db.query("INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[digest(token),userId]);
  await db.query("INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,'MANAGEMENT_OWNER_CREATED',$3)",[organizationId,userId,userId]);
  return {userId,organizationId,email:address,activationUrl:`${process.env.APP_URL??'http://localhost:5173'}/redefinir-senha?token=${encodeURIComponent(token)}`};
 });
 console.log(JSON.stringify(result));
}finally{await pool.end();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
