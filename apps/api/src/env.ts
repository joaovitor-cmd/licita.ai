import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
} as any);
// Local preview override only; never redirect a remote/production database.
if(process.env.NODE_ENV!=='production'&&process.env.LOCAL_PG_PORT&&process.env.DATABASE_URL){
 const databaseUrl=new URL(process.env.DATABASE_URL);
 const port=Number(process.env.LOCAL_PG_PORT);
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('LOCAL_PG_PORT inválida.');
 if(['localhost','127.0.0.1'].includes(databaseUrl.hostname)&&databaseUrl.port==='55432'){
  databaseUrl.port=String(port);process.env.DATABASE_URL=databaseUrl.toString();
 }
}
