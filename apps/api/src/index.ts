import "./env.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { ZodError } from "zod";
import {trustedProxyHops} from './production-config.js';
import { migrate, pool } from "./db.js";
import {
  allowedOrigins,
  HttpError,
  protectOrigin,
  requireSession,
  session,
} from "./security.js";
import { authRouter } from "./auth.js";
import { router } from "./routes.js";
import { startJobs, stopJobs } from "./jobs.js";
import {startEmailWorker,stopEmailWorker} from './email-queue.js';
import {startAnalysisWorker,stopAnalysisWorker} from './edital-analysis.js';
import {startDigestWorker,stopDigestWorker} from './digests.js';

await migrate();
const app = express();
app.set('trust proxy',trustedProxyHops());
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  }),
);
app.use(protectOrigin);
// Only bounded catalog imports need a larger body; keep the general API limit.
app.use('/api/catalog/import', express.json({limit:'2mb'}));
app.use('/api/proposals', express.json({limit:'512kb'}));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () =>
    console.log(
      JSON.stringify({
        level: "info",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }),
    ),
  );
  next();
});
app.get(["/api/health", "/health"], async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", database: "connected", version: "2.0.0" });
});
app.use("/api", session);
app.use('/api',(req,res,next)=>{
  res.on('finish',()=>{
    if(req.auth&&!['GET','HEAD','OPTIONS'].includes(req.method)&&res.statusCode<400){
      void pool.query('INSERT INTO audit_logs(organization_id,actor_id,action,target) VALUES($1,$2,$3,$4)',[req.auth.organization.id,req.auth.user.id,req.method,req.path]).catch(()=>console.warn('Falha no registro de auditoria.'));
    }
  });next();
});
app.use("/api/auth", authRouter);
app.use("/api", requireSession, router);
app.use((_req, res) =>
  res.status(404).json({ error: "Endereço não encontrado." }),
);
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({
          error: error.issues
            .map(
              (issue) => issue.path[0] === 'taxId' ? `CNPJ: ${issue.message}` : `${issue.path.join(".") || "Dados"}: ${issue.message}`,
            )
            .join("; "),
        });
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError)
      return res
        .status(400)
        .json({
          error:
            error.code === "LIMIT_FILE_SIZE"
              ? "O arquivo deve ter no máximo 10 MB."
              : "Envio inválido. Selecione somente um arquivo de até 10 MB.",
        });
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "Este registro já existe. Atualize a página." });
    if (
      error.code === "22P02" ||
      error.code === "22007" ||
      error.type === "entity.parse.failed"
    )
      return res
        .status(400)
        .json({ error: "Dados inválidos. Revise os campos enviados." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Conteúdo enviado excede o limite permitido." });
    console.error(
      JSON.stringify({
        level: "error",
        message: error.message,
        code: error.code,
      }),
    );
    return res
      .status(500)
      .json({
        error:
          "Não foi possível concluir a operação. Tente novamente; se persistir, consulte o responsável pela plataforma.",
      });
  },
);
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, process.env.API_HOST ?? "127.0.0.1", () =>
  console.log(`Licitaro API pronta em http://localhost:${port}`),
);
if (process.env.LICITARO_ISOLATED_QA !== "true") {
  await startJobs();
  startEmailWorker();
  startAnalysisWorker();
  startDigestWorker();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopJobs();
    server.close(() => void Promise.all([stopEmailWorker(),stopAnalysisWorker(),stopDigestWorker()]).then(()=>pool.end()).then(() => process.exit(0)));
  });
