import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.js";
import { pumpEmail } from "./email-queue.js";
import { notify } from "./data.js";
test("boletim desativado ou destinatário removido cancela a fila antes de chamar SMTP", async (t) => {
  const statements: string[] = [];
  t.mock.method(
    pool,
    "connect",
    async () =>
      ({
        query: async (sql: string) => {
          statements.push(sql);
          if(sql.includes('e.id environment_id'))return {rows:[{active:true,enforce_features:false,max_companies:1}]};
          if (sql.includes("pg_try_advisory_lock"))
            return { rows: [{ locked: true }] };
          if (sql.startsWith("SELECT * FROM email_deliveries"))
            return {
              rows: [
                {
                  id: "qa",
                  category: "DIGEST",
                  organization_id: "qa-org",
                  recipient: "qa@example.invalid",
                },
              ],
            };
          if (sql.startsWith("SELECT 1 FROM organizations"))
            return { rows: [{}] };
          return { rows: [], rowCount: 1 };
        },
        release: () => {},
      }) as any,
  );
  let sent = false;
  await pumpEmail(async () => {
    sent = true;
    return true;
  });
  assert.equal(sent, false);
  assert.ok(statements.some((s) => s.includes("status='CANCELLED'")));
});
test("modo diário mantém notificação no portal sem enfileirar e-mail imediato", async (t) => {
  const statements: string[] = [];
  t.mock.method(pool, "query", async () => ({
    rows: [{ preferences: { inApp: true, email: true }, is_demo: false }],
  }));
  t.mock.method(
    pool,
    "connect",
    async () =>
      ({
        query: async (sql: string) => {
          statements.push(sql);
          return {
            rows: sql.startsWith("INSERT INTO notifications")
              ? [{ id: "qa" }]
              : [],
            rowCount: 1,
          };
        },
        release: () => {},
      }) as any,
  );
  await notify("qa", "Novos editais", "Teste", "/app", "qa-key", true);
  assert.ok(statements.some((s) => s.startsWith("INSERT INTO notifications")));
  assert.equal(
    statements.some((s) => s.includes("email_deliveries")),
    false,
  );
});
