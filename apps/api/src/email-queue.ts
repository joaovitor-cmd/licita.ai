import { randomUUID } from "node:crypto";
import {entitlements} from './entitlements.js';
import { pool, one, type Database } from "./db.js";
import { sendEmail } from "./mailer.js";
import { companyEmailConfigured } from "./smtp-settings.js";
import { HttpError } from "./security.js";
import type { PoolClient } from "pg";
import {changeSettings} from './change-rules.js';
export async function enqueueEmail(
  db: Database,
  org: string,
  notification: string,
  to: string,
  subject: string,
  body: string,
  category = 'ALERT',
) {
  await db.query(
    "INSERT INTO email_deliveries(id,organization_id,notification_id,recipient,subject,body,category) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(notification_id,recipient) DO NOTHING",
    [randomUUID(), org, notification, to, subject, body, category],
  );
}
export function deliveryFailure(error: any) {
  const code = Number(error?.responseCode);
  if (code >= 500 && code < 600)
    return {
      status: "FAILED",
      message:
        "O servidor recusou o envio. Confira destinatário, remetente e autenticação.",
    };
  if (code >= 400 && code < 500)
    return {
      status: "PENDING",
      message:
        "O servidor recusou temporariamente o envio. Uma nova tentativa foi agendada.",
    };
  if (error?.code === "EAUTH")
    return {
      status: "FAILED",
      message: "A autenticação foi recusada. Confira e teste as credenciais.",
    };
  if (
    ["ECONNECTION", "EDNS", "ECONNREFUSED", "ENOTFOUND"].includes(
      error?.code,
    ) ||
    (error?.code === "ETIMEDOUT" && error?.command === "CONN")
  )
    return {
      status: "PENDING",
      message:
        "Não foi possível conectar ao servidor de e-mail. Uma nova tentativa foi agendada.",
    };
  return {
    status: "UNKNOWN",
    message:
      "Não foi possível confirmar o resultado do envio. Confira o destinatário antes de reenviar, pois a mensagem pode ter sido aceita.",
  };
}
let running: Promise<void> | null = null,
  timer: NodeJS.Timeout | undefined,
  stopped = false;
export function pumpEmail(sender: typeof sendEmail = sendEmail) {
  if (running || stopped) return running ?? Promise.resolve();
  running = processNext(sender).finally(() => {
    running = null;
  });
  return running;
}
async function processNext(sender: typeof sendEmail) {
  let db: PoolClient | undefined,
    locked = false,
    discard = false;
  try {
    db = await pool.connect();
    locked = (await db.query("SELECT pg_try_advisory_lock(8206912) locked"))
      .rows[0].locked;
    if (!locked) return;
    // A previous process may have sent before crashing. Never automatically duplicate an uncertain delivery.
    await db.query(
      "UPDATE email_delivery_attempts SET status='UNKNOWN',error='Processo interrompido; resultado não confirmado.',finished_at=now() WHERE status='STARTED' AND delivery_id IN (SELECT id FROM email_deliveries WHERE status='SENDING')",
    );
    await db.query(
      "UPDATE email_deliveries SET status='UNKNOWN',last_error='Processo interrompido; confirme o recebimento antes de reenviar.',updated_at=now() WHERE status='SENDING'",
    );
    const job = await one(
      "SELECT * FROM email_deliveries WHERE status IN ('PENDING','BLOCKED') AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 1",
      [],
      db,
    );
    if (!job) return;
    const eligible = await one(
      "SELECT 1 FROM organizations o JOIN members m ON m.organization_id=o.id JOIN users u ON u.id=m.user_id WHERE o.id=$1 AND o.active AND m.active AND o.is_demo=false AND o.preferences->>'email'='true' AND m.role='ADMIN' AND u.email=$2",
      [job.organization_id, job.recipient],
      db,
    );
    const digestAllowed=job.category!=='DIGEST'||await one("SELECT 1 FROM digest_settings d JOIN members m ON m.organization_id=d.organization_id JOIN users u ON u.id=m.user_id WHERE d.organization_id=$1 AND d.enabled AND m.role='ADMIN' AND u.email=$2 AND (d.recipient_ids='[]'::jsonb OR d.recipient_ids ? m.user_id::text)",[job.organization_id,job.recipient],db);
    const changeConfig=job.category?.startsWith('CHANGE:') ? changeSettings((await one('SELECT settings FROM change_alert_settings WHERE organization_id=$1',[job.organization_id],db))?.settings) : null;
    const changeAllowed=!changeConfig || (changeConfig.email && job.category.slice(7).split(',').some((type:string)=>changeConfig.types.includes(type)));
    const plan=await entitlements(job.organization_id,db);
    const feature=job.category==='DIGEST'?'digest':job.category?.startsWith('CHANGE:')?'changeAlerts':'discovery';
    if (!eligible || !digestAllowed || !changeAllowed || !plan.active || !plan.features.includes(feature)) {
      await db.query(
        "UPDATE email_deliveries SET status='CANCELLED',last_error='Canal desativado ou destinatário sem acesso de administrador.',updated_at=now() WHERE id=$1",
        [job.id],
      );
      return;
    }
    if (!(await companyEmailConfigured(job.organization_id))) {
      await db.query(
        "UPDATE email_deliveries SET status='BLOCKED',last_error='Configure e teste o serviço SMTP para liberar o envio.',next_attempt_at=now()+interval '15 minutes',updated_at=now() WHERE id=$1",
        [job.id],
      );
      return;
    }
    const attempt = job.attempts + 1;
    await db.query(
      "UPDATE email_deliveries SET status='SENDING',attempts=$2,updated_at=now() WHERE id=$1",
      [job.id, attempt],
    );
    await db.query(
      "INSERT INTO email_delivery_attempts(delivery_id,number) VALUES($1,$2)",
      [job.id, attempt],
    );
    let outcome: { status: string; message: string | null } = {
      status: "SENT",
      message: null,
    };
    try {
      if (
        !(await sender(
          job.recipient,
          job.subject,
          job.body,
          job.organization_id,
        ))
      )
        outcome = {
          status: "BLOCKED",
          message: "O serviço foi desativado ou alterado antes do envio.",
        };
    } catch (error) {
      outcome = deliveryFailure(error);
      if (outcome.status === "PENDING" && attempt >= job.max_attempts)
        outcome = {
          status: "FAILED",
          message:
            "O limite de tentativas foi atingido. Confira o serviço antes de tentar novamente.",
        };
    }
    await db.query("BEGIN");
    try {
      await db.query(
        "UPDATE email_delivery_attempts SET status=$3,error=$4,finished_at=now() WHERE delivery_id=$1 AND number=$2",
        [job.id, attempt, outcome.status, outcome.message],
      );
      await db.query(
        "UPDATE email_deliveries SET status=$2,last_error=$3,accepted_at=CASE WHEN $2='SENT' THEN now() ELSE accepted_at END,next_attempt_at=now()+($4::int*interval '1 second'),updated_at=now() WHERE id=$1",
        [
          job.id,
          outcome.status,
          outcome.message,
          outcome.status === "BLOCKED" ? 900 : attempt === 1 ? 60 : 300,
        ],
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
  } finally {
    if (db) {
      try {
        if (locked) await db.query("SELECT pg_advisory_unlock(8206912)");
      } catch {
        discard = true;
      }
      db.release(discard);
    }
  }
}
export function startEmailWorker() {
  stopped = false;
  timer = setInterval(
    () =>
      void pumpEmail().catch(() =>
        console.warn(
          "Fila de e-mail temporariamente indisponível. O estado foi preservado.",
        ),
      ),
    5000,
  );
  timer.unref();
}
export async function stopEmailWorker() {
  stopped = true;
  if (timer) clearInterval(timer);
  await running?.catch(() => {});
}
export async function retryDelivery(
  org: string,
  id: string,
  confirmUnknown: boolean,
) {
  if (!(await companyEmailConfigured(org)))
    throw new HttpError(400, "Configure e teste o SMTP antes de reenviar.");
  const job = await one(
    "SELECT status FROM email_deliveries WHERE id=$1 AND organization_id=$2",
    [id, org],
  );
  if (!job) throw new HttpError(404, "Envio não encontrado.");
  if (job.status === "UNKNOWN" && !confirmUnknown)
    throw new HttpError(
      409,
      "Confirme que deseja reenviar mesmo com possibilidade de duplicidade.",
    );
  const result = await pool.query(
    "UPDATE email_deliveries SET status='PENDING',max_attempts=attempts+3,next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2 AND status=$3 AND status IN ('FAILED','UNKNOWN','BLOCKED')",
    [id, org, job.status],
  );
  if (!result.rowCount)
    throw new HttpError(
      409,
      "Este envio mudou ou não pode ser reenviado neste momento.",
    );
  return { message: "Envio recolocado na fila." };
}
