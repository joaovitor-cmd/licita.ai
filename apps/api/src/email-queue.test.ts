import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.js";
import { pumpEmail, deliveryFailure, retryDelivery } from "./email-queue.js";
test("classifica falha temporária, permanente e resultado incerto sem expor detalhes", () => {
  assert.equal(deliveryFailure({ responseCode: 451 }).status, "PENDING");
  assert.equal(deliveryFailure({ responseCode: 550 }).status, "FAILED");
  assert.equal(
    deliveryFailure({
      code: "EAUTH",
      message: "senha secreta",
    }).message.includes("secreta"),
    false,
  );
  assert.equal(
    deliveryFailure({ code: "ETIMEDOUT", command: "DATA" }).status,
    "UNKNOWN",
  );
  assert.equal(deliveryFailure({ code: "ECONNREFUSED" }).status, "PENDING");
});
for (const [label, failure, attempts, expected] of [
  ["sucesso", null, 0, "SENT"],
  ["falha temporária", { responseCode: 451 }, 0, "PENDING"],
  ["tentativas esgotadas", { responseCode: 451 }, 2, "FAILED"],
  ["recusa definitiva", { responseCode: 550 }, 0, "FAILED"],
  ["resultado incerto", { code: "ETIMEDOUT", command: "DATA" }, 0, "UNKNOWN"],
] as const)
  test(`fila persiste ${label}`, async (t) => {
    const statements: { sql: string; values: any[] }[] = [];
    let released = false;
    t.mock.method(pool, "query", async () => ({
      rows: [{ settings: { enabled: true }, verified_at: new Date() }],
    }));
    t.mock.method(pool, "connect", async () => ({
      query: async (sql: string, values: any[] = []) => {
        statements.push({ sql, values });
        if(sql.includes('e.id environment_id'))return {rows:[{active:true,enforce_features:false,max_companies:1}]};
        if (sql.includes("pg_try_advisory_lock"))
          return { rows: [{ locked: true }] };
        if (sql.startsWith("SELECT * FROM email_deliveries"))
          return {
            rows: [
              {
                id: "qa",
                organization_id: "qa-org",
                recipient: "qa@example.invalid",
                subject: "QA",
                body: "Teste",
                attempts,
                max_attempts: 3,
              },
            ],
          };
        if (sql.startsWith("SELECT 1 FROM organizations"))
          return { rows: [{}] };
        return { rows: [], rowCount: 1 };
      },
      release: () => {
        released = true;
      },
    }));
    let sends = 0;
    await pumpEmail(async () => {
      sends++;
      if (failure) throw failure;
      return true;
    });
    assert.equal(sends, 1);
    assert.equal(released, true);
    const final = statements.find((s) =>
      s.sql.startsWith("UPDATE email_deliveries SET status=$2"),
    );
    assert.equal(final?.values[1], expected);
    assert.ok(
      statements.some((s) =>
        s.sql.startsWith("INSERT INTO email_delivery_attempts"),
      ),
    );
    assert.ok(
      statements.some(
        (s) =>
          s.sql.includes("status='UNKNOWN'") &&
          s.sql.includes("status='SENDING'"),
      ),
    );
  });
test("falha de conexão não congela a fila", async (t) => {
  let tries = 0;
  t.mock.method(pool, "connect", async () => {
    tries++;
    throw new Error("Sem conexão QA");
  });
  await assert.rejects(pumpEmail());
  await assert.rejects(pumpEmail());
  assert.equal(tries, 2);
});
test("reenvio incerto exige confirmação e respeita organização", async (t) => {
  let writes = 0;
  t.mock.method(pool, "query", async (sql: string, values: any[]) => {
    if (sql.startsWith("SELECT settings"))
      return {
        rows: [{ settings: { enabled: true }, verified_at: new Date() }],
      };
    if (sql.startsWith("SELECT status")) {
      assert.equal(values[1], "qa-org");
      return { rows: [{ status: "UNKNOWN" }] };
    }
    writes++;
    return { rowCount: 1, rows: [] };
  });
  await assert.rejects(
    retryDelivery("qa-org", "qa", false),
    (e: any) => e.status === 409,
  );
  assert.equal(writes, 0);
  await retryDelivery("qa-org", "qa", true);
  assert.equal(writes, 1);
});
