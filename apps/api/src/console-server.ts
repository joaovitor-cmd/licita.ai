import express,{Router} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import {ZodError} from 'zod';
import {trustedProxyHops} from './production-config.js';
import {HttpError,rateLimit} from './security.js';
import {consoleSession,requireConsole,consoleAuthRoutes,consoleAccessRoutes} from './console-auth.js';
import {managementRoutes} from './management.js';
import {managementReportRoutes} from './management-reports.js';
import {platformEmailRoutes} from './platform-email-routes.js';
export function createConsoleApp(){
 const production=process.env.NODE_ENV==='production';
 const configured=process.env.CONSOLE_ORIGIN;
 if(production){
  let valid=false;try{const url=new URL(configured??''),client=new URL(process.env.APP_URL??'');valid=url.protocol==='https:'&&url.origin===configured&&url.origin!==client.origin&&!url.username&&!url.password;}catch{}
  if(!valid)throw new Error('Configure CONSOLE_ORIGIN como origem HTTPS exata, independente do APP_URL do cliente.');
 }
 const origins=new Set(production?[configured!]:['http://localhost:5174','http://127.0.0.1:5174',...(configured?[configured]:[])]);
 const app=express();app.set('trust proxy',trustedProxyHops());app.disable('x-powered-by');app.use(helmet());
 app.use(cors({origin:(o,cb)=>cb(null,!!o&&origins.has(o)),credentials:true}));
 app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  const origin=req.get('origin');
  if(origin&&!origins.has(origin))throw new HttpError(403,'Origem não autorizada para o console.');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   if(!origin)throw new HttpError(403,'Origem obrigatória para o console.');
   if((Number(req.get('content-length')??0)>0||req.get('transfer-encoding'))&&!req.is('application/json'))throw new HttpError(415,'Envie conteúdo em JSON.');
  }next();
 });
 app.use(express.json({limit:'200kb'}),cookieParser());
 app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'licitaro-console'}));
 app.use('/api',consoleSession);
 const auth=Router();consoleAuthRoutes(auth);app.use('/api',auth);
 const routes=Router();routes.use(requireConsole);
 // Do not mount customer workspaces, auth, uploads or business routes in the console process.
 routes.use((req,_res,next)=>{if(!req.path.startsWith('/management/'))throw new HttpError(404,'Endereço não encontrado.');next();});
 routes.get('/management/reports/export',rateLimit('console-export',20,60000));
 managementRoutes(routes);managementReportRoutes(routes);consoleAccessRoutes(routes);platformEmailRoutes(routes);app.use('/api',routes);
 app.use((_req,res)=>res.status(404).json({error:'Endereço não encontrado.'}));
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error instanceof HttpError)return res.status(error.status).json({error:error.message});
  if(error instanceof ZodError)return res.status(400).json({error:error.issues.map(x=>x.message).join('; ')});
  if(error.code==='23505')return res.status(409).json({error:'Registro já cadastrado.'});
  if(['22P02','22007'].includes(error.code)||error.type==='entity.parse.failed')return res.status(400).json({error:'Dados inválidos.'});
  if(error.type==='entity.too.large')return res.status(413).json({error:'Conteúdo muito grande.'});
  console.error('Falha no console:',error.message);return res.status(500).json({error:'Não foi possível concluir a operação.'});
 });return app;
}
