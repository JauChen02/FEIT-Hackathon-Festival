import 'server-only';
import { getDatabase, type Database } from '@learnarena/db';

/**
 * The application's database handle (PLANNING.md §14.1).
 *
 * One pool per process; Next.js reuses module state across requests, so this
 * does not open a connection per request. The connection uses the privileged
 * DATABASE_URL role — the browser never reaches Postgres directly.
 */
export function db(): Database {
  return getDatabase().db;
}
