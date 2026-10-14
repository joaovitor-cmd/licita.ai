// Validates against an ephemeral local PostgreSQL, independently of .env/Supabase.
import EmbeddedPostgres from "embedded-postgres";
import { isolatedQaEnvironment } from "./qa-environment.mjs";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

const tempRoot = await realpath(tmpdir());
const directory = await mkdtemp(join(tempRoot, "licitaro-qa-"));
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const password = randomBytes(18).toString("hex");
const env = {
  ...isolatedQaEnvironment(),
  TEST_DATABASE_URL: `postgresql://qa:${password}@127.0.0.1:${port}/postgres`,
  DATABASE_SSL: "false",
  DATABASE_SSL_CA_FILE: "",
  LOCAL_PG_PORT: "",
  NODE_ENV: "test",
  SCHEDULER_ENABLED: "false",
};
function run(args, childEnv = isolatedQaEnvironment(), executable = process.execPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`QA process exited with ${code}`)),
    );
  });
}
let started = false;
let postgres;
try {
  postgres = new EmbeddedPostgres({
    databaseDir: join(directory, "database"),
    user: "qa",
    password,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await postgres.initialise();
  await postgres.start();
  started = true;
  await run([
    "node_modules/typescript/bin/tsc",
    "-p",
    "apps/api/tsconfig.json",
  ]);
  await run(["tests/onboarding-search-api.mjs"], env);
} finally {
  if (started && process.platform === "win32") {
    // Graceful shutdown also ends PostgreSQL's Windows I/O workers. A forced
    // process-tree kill can leave an orphan worker holding the output pipe open.
    const { pg_ctl } = await import("@embedded-postgres/windows-x64");
    await run(
      [
        "-D",
        join(directory, "database"),
        "-m",
        "fast",
        "-w",
        "-t",
        "20",
        "stop",
      ],
      isolatedQaEnvironment(),
      pg_ctl,
    );
    // The library's exit hook must not try to stop an already exited process.
    postgres.process = undefined;
  } else if (started) await postgres.stop();
  // Delete only the unique directory this invocation created.
  if (
    dirname(directory) === tempRoot &&
    basename(directory).startsWith("licitaro-qa-")
  )
    await rm(directory, { recursive: true, force: true });
}
