import "./env.js";
import pg from "pg";
import { schema } from "./schema.js";
import {databaseSecurity} from './production-config.js';

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://licita:licita@localhost:5432/licita",
  ...databaseSecurity(),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  options: "-c search_path=workspace_v2,public",
});

pool.on("error", (error) =>
  console.error("Conexão com o banco indisponível:", error.message),
);

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(723104891)");
    await client.query(schema);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type Database = Pick<pg.Pool, "query"> | pg.PoolClient;

export async function one<T = any>(
  sql: string,
  values: unknown[] = [],
  db: Database = pool,
): Promise<T | undefined> {
  const result = await db.query(sql, values);
  return result.rows[0];
}

export async function rows<T = any>(
  sql: string,
  values: unknown[] = [],
  db: Database = pool,
): Promise<T[]> {
  const result = await db.query(sql, values);
  return result.rows;
}
