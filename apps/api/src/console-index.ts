import './env.js';
import {migrate,pool} from './db.js';
import {bootstrapConsoleOwner} from './console-auth.js';
import {createConsoleApp} from './console-server.js';
await migrate();await bootstrapConsoleOwner();
const app=createConsoleApp(),port=Number(process.env.CONSOLE_PORT??3001);
const server=app.listen(port,process.env.CONSOLE_API_HOST??'127.0.0.1',()=>console.log(`Console API pronta em http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>void pool.end().then(()=>process.exit(0))));
