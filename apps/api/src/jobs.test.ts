import test from "node:test";
import assert from "node:assert/strict";

// Enable only the scheduler decision path. Every database call is mocked below.
process.env.SCHEDULER_ENABLED = "true";
const { pool } = await import("./db.js");
const { pump, tick } = await import("./jobs.js");

const empty = () => ({ rows: [], rowCount: 0 });
function client(
  options: { unlockError?: boolean; onRecovery?: () => void } = {},
) {
  const released: boolean[] = [];
  return {
    released,
    async query(sql: string) {
      if (sql.includes("pg_try_advisory_lock"))
        return { rows: [{ locked: true }] };
      if (sql.includes("pg_advisory_unlock") && options.unlockError)
        throw new Error("unlock indisponível");
      if (sql.includes("Processo interrompido")) options.onRecovery?.();
      return empty();
    },
    release(discard = false) {
      released.push(discard);
    },
  };
}

test("fila retoma após falha ao adquirir conexão", async (t) => {
  let attempts = 0;
  const connection = client();
  t.mock.method(pool, "connect", async () => {
    if (++attempts === 1) throw new Error("banco temporariamente indisponível");
    return connection;
  });
  t.mock.method(pool, "query", async () => empty());
  await assert.rejects(pump(), /temporariamente indisponível/);
  await pump();
  assert.equal(attempts, 2);
  assert.deepEqual(connection.released, [false]);
});

test("falha no unlock descarta conexão e não congela a fila", async (t) => {
  const broken = client({ unlockError: true });
  const healthy = client();
  let attempts = 0;
  t.mock.method(console, "error", () => {});
  t.mock.method(pool, "connect", async () =>
    ++attempts === 1 ? broken : healthy,
  );
  t.mock.method(pool, "query", async () => empty());
  await pump();
  await pump();
  assert.equal(attempts, 2);
  assert.deepEqual(broken.released, [true]);
  assert.deepEqual(healthy.released, [false]);
});

test("falha inesperada finaliza somente a execução ainda RUNNING", async (t) => {
  const connection = client();
  let pending = true;
  const failures: { sql: string; values: unknown[] }[] = [];
  t.mock.method(pool, "connect", async () => connection);
  t.mock.method(pool, "query", async (sql: string, values: unknown[] = []) => {
    if (sql.includes("status='PENDING'") && pending) {
      pending = false;
      return {
        rows: [
          { id: "qa-run", source_code: "qa-no-network", organization_id: null },
        ],
      };
    }
    // Fail before calling a connector; this test never performs network access.
    if (sql.includes("SELECT id,name,profile"))
      throw new Error("perfil indisponível");
    if (sql.includes("SELECT DISTINCT o.id"))
      throw new Error("consulta radar indisponível");
    if (sql.includes("greatest(records_read")) failures.push({ sql, values });
    return empty();
  });
  await assert.rejects(pump(), /consulta radar indisponível/);
  assert.equal(failures.length, 1);
  assert.match(failures[0].sql, /WHERE id=\$5 AND status='RUNNING'/);
  assert.equal(failures[0].values[4], "qa-run");
  await pump();
  assert.equal(connection.released.length, 2);
});

test("próximo ciclo recupera RUNNING após falha também na persistência do erro", async (t) => {
  let recoveries = 0;
  let pending = true;
  let failureWrites = 0;
  const connection = client({
    onRecovery: () => {
      recoveries++;
    },
  });
  t.mock.method(console, "error", () => {});
  t.mock.method(pool, "connect", async () => connection);
  t.mock.method(pool, "query", async (sql: string) => {
    if (sql.includes("status='PENDING'") && pending) {
      pending = false;
      return {
        rows: [
          {
            id: "qa-interrupted",
            source_code: "qa-no-network",
            organization_id: null,
          },
        ],
      };
    }
    if (sql.includes("SELECT id,name,profile"))
      throw new Error("banco indisponível");
    if (sql.includes("SELECT DISTINCT o.id"))
      throw new Error("banco indisponível");
    if (sql.includes("greatest(records_read")) {
      failureWrites++;
      throw new Error("persistência indisponível");
    }
    return empty();
  });
  await assert.rejects(pump(), /banco indisponível/);
  await pump();
  assert.equal(failureWrites, 1);
  assert.equal(recoveries, 2);
  assert.equal(connection.released.length, 2);
});

test("erro após persistir resultado final não reclassifica a execução", async (t) => {
  let finalized = 0;
  let errorUpdates = 0;
  let pending = true;
  t.mock.method(pool, "connect", async () => client());
  t.mock.method(pool, "query", async (sql: string) => {
    if (sql.includes("status='PENDING'") && pending) {
      pending = false;
      return {
        rows: [
          {
            id: "qa-finalized",
            source_code: "qa-no-network",
            organization_id: null,
          },
        ],
      };
    }
    if (sql.includes("SELECT id,name,profile"))
      throw new Error("fonte indisponível");
    if (sql.includes("UPDATE sync_runs SET status=$1")) finalized++;
    if (sql.includes("greatest(records_read")) errorUpdates++;
    return empty();
  });
  t.mock.method(console, "log", () => {
    throw new Error("saída indisponível");
  });
  await assert.rejects(pump(), /saída indisponível/);
  assert.equal(finalized, 1);
  assert.equal(errorUpdates, 0);
});

test("agendamento considera apenas a última coleta global, não coletas manuais de empresas", async (t) => {
  const scheduleQueries: string[] = [];
  t.mock.method(pool, "connect", async () => client());
  t.mock.method(pool, "query", async (sql: string) => {
    if (sql.includes("SELECT id FROM organizations"))
      return { rows: [{ id: "qa-org" }] };
    if (sql.includes("SELECT started_at FROM sync_runs")) {
      scheduleQueries.push(sql);
      return { rows: [{ started_at: new Date() }] };
    }
    return empty();
  });
  await tick();
  assert.equal(scheduleQueries.length, 2);
  for (const sql of scheduleQueries)
    assert.match(sql, /organization_id IS NULL/);
});
