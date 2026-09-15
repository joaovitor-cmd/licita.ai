// PostgreSQL portátil para preview. Não acessa nem substitui volumes Docker.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {config} from 'dotenv';
config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const port=Number(process.env.LOCAL_PG_PORT||55432);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('LOCAL_PG_PORT inválida.');
const databaseDir = fileURLToPath(new URL('../.local/postgres', import.meta.url));
const pg = new EmbeddedPostgres({databaseDir, user:'licita', password:process.env.LOCAL_PG_PASSWORD || 'licita', port, persistent:true, authMethod:'scram-sha-256', initdbFlags:['--encoding=UTF8','--locale=C'], postgresFlags:['-h','127.0.0.1']});
if (!existsSync(databaseDir + '/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='licita'")).rowCount) await client.query('CREATE DATABASE licita');
await client.end();
console.log(`PostgreSQL de desenvolvimento pronto em 127.0.0.1:${port}. Dados persistidos em .local/postgres.`);
// Mantém o processo supervisor ligado; shutdown normal para preservar o cluster.
const heartbeat = setInterval(() => {}, 30000);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { clearInterval(heartbeat); await pg.stop(); process.exit(0); });
