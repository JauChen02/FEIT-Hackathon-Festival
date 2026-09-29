import 'server-only';

/**
 * Server-side environment access (PLANNING.md §19.1).
 *
 * "Secrets (DB URL, service keys, LLM keys, HMAC secrets) are server-only env
 *  vars and are never exposed to the client bundle (no NEXT_PUBLIC_ prefix)."
 *
 * The `server-only` import above turns a mistaken client import into a build
 * error rather than a leaked secret.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const serverEnv = {
  appEnv: () => process.env.APP_ENV ?? 'production',
  databaseUrl: () => required('DATABASE_URL'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  sentryDsn: () => process.env.SENTRY_DSN ?? '',
  logLevel: () => process.env.LOG_LEVEL ?? 'info',
} as const;

/**
 * The app's own origin, used for the CSRF `Origin` check (§19.1).
 *
 * Vercel sets VERCEL_URL per deployment; NEXT_PUBLIC_SITE_URL pins it locally
 * and in production.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
