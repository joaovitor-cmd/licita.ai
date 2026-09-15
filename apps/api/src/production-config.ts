import {readFileSync} from 'node:fs';
export function databaseSecurity(env:NodeJS.ProcessEnv=process.env){
 const max=Number(env.DATABASE_POOL_MAX||12);
 if(!Number.isInteger(max)||max<2||max>100)throw new Error('DATABASE_POOL_MAX deve estar entre 2 e 100.');
 const enabled=env.DATABASE_SSL==='true';
 if(env.NODE_ENV==='production'&&!enabled)throw new Error('Configure DATABASE_SSL=true para o banco externo em produção.');
 if(enabled&&env.DATABASE_URL){
  const url=new URL(env.DATABASE_URL);
  if([...url.searchParams.keys()].some(k=>k.startsWith('ssl')))throw new Error('Remova opções ssl da DATABASE_URL e configure DATABASE_SSL e DATABASE_SSL_CA_FILE.');
 }
 return {max,...(enabled?{ssl:{rejectUnauthorized:true,...(env.DATABASE_SSL_CA_FILE?{ca:readFileSync(env.DATABASE_SSL_CA_FILE,'utf8')}:{})}}:{})};
}
export function trustedProxyHops(env:NodeJS.ProcessEnv=process.env){
 const value=env.TRUST_PROXY_HOPS||'0';
 if(!['0','1'].includes(value))throw new Error('TRUST_PROXY_HOPS deve ser 0 ou 1.');
 return Number(value);
}
