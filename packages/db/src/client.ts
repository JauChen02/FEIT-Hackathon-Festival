/**
 * Database client (PLANNING.md §14.1).
 *
 * "The browser never talks to Postgres directly. Row Level Security is enabled
 *  with deny-all for the anon and authenticated roles; the server connects with
 *  a privileged role."
 *
 * This module is server-only. Importing it from a client component is a bug.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';
import { requireDatabaseUrl } from './env';

export type Database = PostgresJsDatabase<typeof schema>;
export type Sql = postgres.Sql;

export interface CreateDatabaseOptions {
  databaseUrl?: string;
  /** Connection pool size. Serverless route handlers want a small pool. */
  max?: number;
  /** Postgres schema to use, so tests can isolate themselves. */
  searchPath?: string;
}

export interface DatabaseHandle {
  db: Database;
  sql: Sql;
  close(): Promise<void>;
}

export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseHandle {
  const url = options.databaseUrl ?? requireDatabaseUrl();

  const sql = postgres(url, {
    max: options.max ?? 10,
    // Drizzle handles its own type coercion; leaving transforms off keeps
    // numeric(12,4) values as exact strings rather than lossy JS numbers.
    prepare: false,
    onnotice: () => {},
    ...(options.searchPath ? { connection: { search_path: options.searchPath } } : {}),
  });

  const db = drizzle(sql, { schema, casing: 'snake_case' });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

let shared: DatabaseHandle | undefined;

/**
 * Process-wide handle for the web app. Next.js reuses module state between
 * requests, so this keeps one pool rather than one per request.
 */
export function getDatabase(): DatabaseHandle {
  shared ??= createDatabase({ max: 5 });
  return shared;
}

export { schema };
