// One-time logical transfer. Run with Node 24: node --import tsx scripts/migrate-supabase.mjs
// Default: preflight only. --transfer backs up and transfers into an ABSENT app schema.
// Never modifies Supabase auth/storage/public schemas or switches application credentials.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import {schema} from '../apps/api/src/schema.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=dotenv.parse(fs.readFileSync(path.join(root,'.env')));
const remote=dotenv.parse(fs.readFileSync(path.join(root,'.env.production')));
const sourceUrl=new URL(local.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(sourceUrl.hostname)) throw new Error('Source must be local; refusing a repeat transfer.');
if(sourceUrl.port==='55432'&&local.LOCAL_PG_PORT) sourceUrl.port=local.LOCAL_PG_PORT;
const targetUrl=new URL(remote.DATABASE_URL);
if(targetUrl.hostname!=='aws-0-us-east-2.pooler.supabase.com'||targetUrl.username!=='postgres.oevztyolvuczohjloxpi'||targetUrl.port!=='5432') throw new Error('Unexpected destination.');
if([...targetUrl.searchParams.keys()].some(k=>k.startsWith('ssl'))) throw new Error('Remove URL SSL overrides.');
const source=new pg.Client({connectionString:sourceUrl.href,connectionTimeoutMillis:12000});
const target=new pg.Client({connectionString:targetUrl.href,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(root,'deploy/secrets/database-ca.pem'),'utf8')}});
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const table=n=>qi('workspace_v2')+'.'+qi(n);
const digest=async(c,n)=>(await c.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM (SELECT md5(to_jsonb(t)::text) h FROM ${table(n)} t) hashes`)).rows[0];
const columns=async(c,n)=>(await c.query(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) type,a.attgenerated,a.attidentity,a.attnotnull FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[table(n)])).rows;
let sourceTransaction=false,targetTransaction=false,committed=false;
try {
 await source.connect(); await target.connect();
 for(const c of [source,target]){await c.query("SET timezone='UTC'");await c.query("SET datestyle='ISO, YMD'");await c.query('SET extra_float_digits=3');await c.query('SET lock_timeout=\'10s\'');await c.query('SET statement_timeout=\'180s\'');}
 const schemas=(await source.query("SELECT DISTINCT schemaname FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows;
 if(schemas.some(x=>x.schemaname!=='workspace_v2'))throw new Error('Additional source schemas require an explicit backup plan.');
 if((await target.query("SELECT 1 FROM pg_namespace WHERE nspname='workspace_v2'")).rowCount)throw new Error('Destination schema already exists; nothing overwritten.');
 const names=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='workspace_v2' ORDER BY tablename")).rows.map(x=>x.tablename);
 if(!names.length)throw new Error('Empty source.');
 const other=(await source.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rows[0].n;
 if(other)throw new Error('Stop source API/jobs before migration.');
 console.log(JSON.stringify({phase:'preflight',tables:names.length,tls:'verified',destination:'Supabase',otherSourceConnections:other}));
 if(!process.argv.includes('--transfer')){console.log('Preflight OK; use --transfer to back up and migrate.');}
 else {
  const dir=path.join(root,'.local','backups','supabase-'+new Date().toISOString().replaceAll(':','-'));
  fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(path.join(root,'.env'),path.join(dir,'source.env.backup'));
  fs.copyFileSync(path.join(root,'.env.production'),path.join(dir,'production.env.backup'));
  if(fs.existsSync(path.join(root,'.local/smtp-key.bin')))fs.copyFileSync(path.join(root,'.local/smtp-key.bin'),path.join(dir,'smtp-key.bin'));
  fs.writeFileSync(path.join(dir,'schema.sql'),schema);
  const manifest={createdAt:new Date().toISOString(),schema:'workspace_v2',schemaSha256:createHash('sha256').update(schema).digest('hex'),tables:[],sequences:[]};
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ'); sourceTransaction=true;
  await source.query(`LOCK TABLE ${names.map(table).join(',')} IN SHARE MODE`);
  for(const name of names){
   const cols=await columns(source,name);
   if(cols.some(c=>c.attgenerated||c.attidentity))throw new Error('Generated/identity columns need explicit handling.');
   const check=await digest(source,name);
   const hash=createHash('sha256'); const out=fs.openSync(path.join(dir,name+'.jsonl'),'wx');
   let count=0;
   try {
    await source.query(`DECLARE export_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM ${table(name)} t`);
    for(;;){const result=await source.query('FETCH 250 FROM export_rows');if(!result.rowCount)break;for(const r of result.rows){const line=r.row+'\n';fs.writeSync(out,line);hash.update(line);count++;}}
    await source.query('CLOSE export_rows');
   }finally{fs.closeSync(out);}
   if(String(count)!==check.count)throw new Error('Backup count mismatch.');
   manifest.tables.push({name,columns:cols,...check,sha256:hash.digest('hex')});
   console.log(JSON.stringify({phase:'backup',table:name,rows:count}));
  }
  for(const {sequencename} of (await source.query("SELECT sequencename FROM pg_sequences WHERE schemaname='workspace_v2' ORDER BY sequencename")).rows){
   const value=(await source.query(`SELECT last_value::text,is_called FROM ${table(sequencename)}`)).rows[0];manifest.sequences.push({name:sequencename,...value});
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({phase:'backup-complete',directory:path.relative(root,dir)}));
  await target.query('BEGIN');targetTransaction=true;
  await target.query('SELECT pg_advisory_xact_lock(723104891)');
  if((await target.query("SELECT 1 FROM pg_namespace WHERE nspname='workspace_v2'")).rowCount)throw new Error('Destination changed during backup.');
  await target.query(schema);
  const targetNames=(await target.query("SELECT tablename FROM pg_tables WHERE schemaname='workspace_v2' ORDER BY tablename")).rows.map(x=>x.tablename);
  if(JSON.stringify(names)!==JSON.stringify(targetNames))throw new Error('Schema table mismatch.');
  for(const t of manifest.tables){
   const actual=await columns(target,t.name);
   const canonical=cs=>JSON.stringify([...cs].sort((a,b)=>a.attname.localeCompare(b.attname)));
   if(canonical(t.columns)!==canonical(actual)){
    console.error(JSON.stringify({table:t.name,sourceColumns:t.columns,targetColumns:actual}));
    throw new Error('Schema column mismatch: '+t.name);
   }
  }
  // Foreign keys are recreated and validated before commit, including self references.
  const fks=(await target.query("SELECT conrelid::regclass::text rel,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype='f' AND connamespace='workspace_v2'::regnamespace")).rows;
  for(const f of fks)await target.query(`ALTER TABLE ${f.rel} DROP CONSTRAINT ${qi(f.conname)}`);
  await target.query(`TRUNCATE TABLE ${names.map(table).join(',')}`);
  for(const t of manifest.tables){
   await target.query(`ALTER TABLE ${table(t.name)} DISABLE TRIGGER USER`);
   const hash=createHash('sha256');let batch=[];
   const cols=t.columns.map(c=>qi(c.attname)).join(',');
   const insert=async()=>{if(!batch.length)return;await target.query(`INSERT INTO ${table(t.name)} (${cols}) SELECT ${cols} FROM json_populate_recordset(NULL::${table(t.name)},$1::json)`,['['+batch.join(',')+']']);batch=[];};
   for await(const line of createInterface({input:fs.createReadStream(path.join(dir,t.name+'.jsonl')),crlfDelay:Infinity})){hash.update(line+'\n');batch.push(line);if(batch.length===250)await insert();}
   await insert();if(hash.digest('hex')!==t.sha256)throw new Error('Backup checksum mismatch.');
   await target.query(`ALTER TABLE ${table(t.name)} ENABLE TRIGGER USER`);
   const check=await digest(target,t.name);
   if(check.count!==t.count||check.digest!==t.digest)throw new Error('Destination verification mismatch: '+t.name);
   console.log(JSON.stringify({phase:'copied-and-verified',table:t.name,rows:t.count}));
  }
  for(const f of fks)await target.query(`ALTER TABLE ${f.rel} ADD CONSTRAINT ${qi(f.conname)} ${f.def}`);
  for(const s of manifest.sequences){await target.query('SELECT setval($1::regclass,$2::bigint,$3::boolean)',[table(s.name),s.last_value,s.is_called]);const v=(await target.query(`SELECT last_value::text,is_called FROM ${table(s.name)}`)).rows[0];if(v.last_value!==s.last_value||v.is_called!==s.is_called)throw new Error('Sequence mismatch.');}
  // App-only schema: no direct anonymous/authenticated Data API access to tenant data.
  await target.query('REVOKE ALL ON SCHEMA workspace_v2 FROM PUBLIC, anon, authenticated');
  await target.query('REVOKE ALL ON ALL TABLES IN SCHEMA workspace_v2 FROM PUBLIC, anon, authenticated');
  await target.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA workspace_v2 FROM PUBLIC, anon, authenticated');
  await target.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA workspace_v2 FROM PUBLIC, anon, authenticated');
  await target.query('COMMIT');targetTransaction=false;committed=true;
  await source.query('COMMIT');sourceTransaction=false;
  fs.writeFileSync(path.join(dir,'transfer-result.json'),JSON.stringify({completedAt:new Date().toISOString(),tables:names.length,rows:manifest.tables.reduce((n,t)=>n+Number(t.count),0),verified:true},null,2));
  console.log(JSON.stringify({phase:'complete',tables:names.length,backup:path.relative(root,dir),configurationSwitched:false}));
 }
}catch(e){
 if(targetTransaction)await target.query('ROLLBACK').catch(()=>{});
 if(sourceTransaction)await source.query('ROLLBACK').catch(()=>{});
 // Avoid error details, which may contain row values or connection credentials.
 console.error(JSON.stringify({phase:'failed',code:e.code??'MIGRATION_GUARD',message:e.code?'Database operation failed; no row data printed.':e.message,targetCommitConfirmed:committed}));process.exitCode=1;
}finally{await source.end().catch(()=>{});await target.end().catch(()=>{});}
