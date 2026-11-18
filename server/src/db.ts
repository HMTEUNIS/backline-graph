/**
 * Postgres pool for Backline's database.
 *
 * The login in Backline's compose file is a superuser, so it can read `truth`.
 * This process never does. Every statement goes through `query`, which rejects
 * the schema by name, and the session search_path is only `label`.
 */

import pg from "pg";

const TRUTH = /(?:"truth"|'truth'|\btruth\b)/i;
const WRITE = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|copy|create)\b/i;

let pool: pg.Pool | null = null;

pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1082, (value) => value);

export function assertSafeSql(sql: string): void {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
  if (TRUTH.test(stripped)) {
    throw new Error("refusing a query that references the truth schema");
  }
  const body = stripped.trim();
  if (!/^(select|with)\b/i.test(body) || WRITE.test(body)) {
    throw new Error("only read queries are allowed");
  }
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://backline:backline@localhost:5432/backline";
  pool = new pg.Pool({
    connectionString,
    options: "-c search_path=label",
    max: 8,
    connectionTimeoutMillis: 4000,
  });
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  assertSafeSql(sql);
  return getPool().query<T>(sql, params);
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
