/**
 * Integration-test harness for the route handlers (PLANNING.md §22.2).
 *
 * The handlers are imported and called directly with a real `Request`, against
 * a real Postgres. Only the identity is faked, through the `setSessionResolver`
 * seam — everything else on the path is production code: Zod parsing, the
 * §16.1 error envelope, the Origin check, the 16 KB body cap, every database
 * constraint and every transaction.
 *
 * Playwright covers the genuine Supabase Auth path end to end (§22.3), so the
 * one faked piece is exercised for real somewhere.
 */

import postgres from 'postgres';
import type { Clock } from '@learnarena/core';
import { runMigrations, seedDatabase, createDatabase, type Database } from '@learnarena/db';
import { setSessionResolver } from '@/lib/auth/session';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export interface WebTestContext {
  db: Database;
  /** Act as this Supabase user for subsequent requests; null signs out. */
  signInAs(userId: string | null): void;
  teardown(): Promise<void>;
}

function adminUrl(base: string): string {
  const url = new URL(base);
  url.pathname = '/postgres';
  return url.toString();
}

/**
 * Create a throwaway database, point the app at it, and seed the taxonomy and
 * content users that the routes read.
 */
export interface WebTestContextOptions {
  /**
   * Seed the §13.6 fixture users and their scripted learning histories.
   * Off by default: most suites build the exact data they need, and the
   * histories are slow to write. `fixtures.test.ts` turns it on.
   */
  fixtureHistories?: boolean;
  /** Pin the clock the seed uses, so event recency is deterministic. */
  clock?: Clock;
}

export async function createWebTestContext(
  name: string,
  options: WebTestContextOptions = {},
): Promise<WebTestContext> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL is not set; see .env.example.');

  const databaseName = `la_web_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`.slice(0, 63);

  const admin = postgres(adminUrl(baseUrl), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${databaseName}`;

  // Set this *before* anything calls lib/db's `db()`, which memoises a pool
  // built from DATABASE_URL on first use.
  process.env.DATABASE_URL = testUrl.toString();

  const handle = createDatabase({ databaseUrl: testUrl.toString(), max: 2 });
  await runMigrations(handle.db);
  // The real dev seed: taxonomy, content users and the 45 published questions,
  // so `GET /api/categories` returns the same counts the app would show.
  await seedDatabase(handle.db, {
    skipFixtureHistories: options.fixtureHistories !== true,
    ...(options.clock ? { clock: options.clock } : {}),
  });

  let currentUserId: string | null = null;
  const restoreResolver = setSessionResolver(async () =>
    currentUserId ? { id: currentUserId } : null,
  );

  return {
    db: handle.db,
    signInAs: (userId) => {
      currentUserId = userId;
    },
    teardown: async () => {
      restoreResolver();
      await handle.close();
      process.env.DATABASE_URL = baseUrl;

      const cleanup = postgres(adminUrl(baseUrl), { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    },
  };
}

export interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  /** Override the Origin header; `null` omits it entirely. */
  origin?: string | null;
  headers?: Record<string, string>;
  /** Send this raw string instead of JSON-encoding `body`. */
  rawBody?: string;
}

/** Build a `Request` the way the browser would. */
export function jsonRequest(path: string, options: JsonRequestOptions = {}): Request {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...options.headers,
  };

  if (options.origin !== null) {
    headers.origin = options.origin ?? SITE_ORIGIN;
  }

  const body =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

  return new Request(new URL(path, SITE_ORIGIN), {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

export interface ParsedResponse<T = unknown> {
  status: number;
  body: T;
  /** The §16.1 error code, when the response was an error envelope. */
  code: string | undefined;
  requestId: string | null;
}

export async function readResponse<T = unknown>(response: Response): Promise<ParsedResponse<T>> {
  const body = (await response.json()) as T;
  const envelope = (body as { error?: { code?: string } }).error;
  return {
    status: response.status,
    body,
    code: envelope?.code,
    requestId: response.headers.get('x-request-id'),
  };
}

/** A valid onboarding payload; override any field to make it invalid. */
export function onboardingBody(overrides: Record<string, unknown> = {}) {
  return {
    username: 'alex_01',
    displayName: 'Alex',
    timezone: 'Australia/Melbourne',
    ageConfirmed: true,
    ...overrides,
  };
}
