import 'server-only';
import pino from 'pino';
import { serverEnv } from './env';

/**
 * Structured logs (PLANNING.md §23.1).
 *
 * "Every log line includes request_id, user_id (internal), session_id where
 *  relevant. … Never log emails, tokens, secrets or full request bodies."
 *
 * The redaction list below is the enforcement of that last sentence: even if a
 * caller passes a whole request object by mistake, the sensitive paths are
 * replaced rather than written out.
 */

export const logger = pino({
  level: serverEnv.logLevel(),
  base: { app: 'learnarena-web', env: serverEnv.appEnv() },
  // §19.4: analytics and logs use internal user ids, never email.
  redact: {
    paths: [
      'email',
      '*.email',
      'password',
      '*.password',
      'token',
      '*.token',
      'access_token',
      '*.access_token',
      'refresh_token',
      '*.refresh_token',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.cookie',
      'apikey',
      '*.apikey',
      'body',
    ],
    censor: '[redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export interface RequestLogContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  route: string;
  method: string;
}

/** A child logger carrying the per-request context §23.1 requires. */
export function requestLogger(context: RequestLogContext) {
  return logger.child({
    request_id: context.requestId,
    ...(context.userId ? { user_id: context.userId } : {}),
    ...(context.sessionId ? { session_id: context.sessionId } : {}),
    route: context.route,
    method: context.method,
  });
}

export type Logger = typeof logger;
