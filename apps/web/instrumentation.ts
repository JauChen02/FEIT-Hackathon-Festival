import * as Sentry from '@sentry/nextjs';

/**
 * Error tracking (PLANNING.md §21.1, §23.2).
 *
 * Sentry is wired but inert when SENTRY_DSN is unset, so local development and
 * CI never send anything and never need a key.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? 'production',
    tracesSampleRate: 0.1,
    // §19.4: logs and error reports never carry emails or tokens.
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
