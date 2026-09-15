import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.js";
import { ensureAttachments, refreshOne } from "./jobs.js";
import { mapOpportunity } from "./data.js";
import { defaultProfile } from "./scoring.js";
test("consulta recente de anexos respeita intervalo sem chamar a fonte", async (t) => {
  const statements: string[] = [];
  t.mock.method(pool, "query", async (sql: string) => {
    statements.push(sql);
    return { rows: [{ review_attempted_at: new Date() }] };
  });
  await ensureAttachments("qa-recent");
  assert.equal(statements.length, 1);
  assert.match(statements[0], /SELECT review_attempted_at/);
});
test("consultas simultâneas do mesmo edital compartilham a execução", async (t) => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  t.mock.method(pool, "query", async () => {
    calls++;
    await gate;
    return { rows: [] };
  });
  const a = ensureAttachments("qa-shared"),
    b = ensureAttachments("qa-shared");
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
});
test("falha preserva documentos e registra aviso persistente, sem chamada externa", async (t) => {
  const statements: string[] = [];
  t.mock.method(pool, "query", async (sql: string) => {
    statements.push(sql);
    return {
      rows: sql.startsWith("SELECT")
        ? [
            {
              canonical_key: "qa-invalid-identity",
              documents: [
                { name: "Anterior", url: "https://pncp.gov.br/arquivo" },
              ],
            },
          ]
        : [],
    };
  });
  await assert.rejects(refreshOne("qa-id"), (e: any) => e.status === 502);
  assert.ok(statements.some((sql) => sql.includes("attachment_error=$2")));
  assert.ok(
    statements.some((sql) => sql.includes("review_attempted_at=now()")),
  );
  assert.equal(
    statements.some((sql) => sql.includes("documents=")),
    false,
  );
  const item = mapOpportunity(
    { id: "qa", documents: [], attachment_error: "Falha preservada" },
    defaultProfile,
    [],
  );
  assert.equal(item.attachmentWarning, "Falha preservada");
});
