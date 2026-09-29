import { Inngest } from 'inngest';

/**
 * Inngest client (PLANNING.md §21.1, §18.3).
 *
 * Background jobs and cron. Phase 1 registers the two session jobs §24 asks
 * for plus the consumer that closes the reconcile loop; Phases 3+ add
 * `coach/process-session` and the rest of the §18.3 fan-out.
 */

/** The only event Phase 1 publishes (§18.3). */
export const SESSION_TERMINAL_EVENT = 'session/terminal';

export interface SessionTerminalEvent {
  name: typeof SESSION_TERMINAL_EVENT;
  data: { sessionId: string };
}

export const inngest = new Inngest({
  id: 'learnarena',
  // Dev mode talks to the local Inngest dev server; production uses the
  // event and signing keys from the environment.
  isDev: process.env.APP_ENV !== 'production',
});

/**
 * §18.3: "event id `session-terminal:{sessionId}`".
 *
 * Deriving the id from the session means the original send and any number of
 * `sessions/reconcile` re-sends collapse into one delivery — which is what
 * makes re-sending safe (§18.1, "Background jobs").
 */
export function sessionTerminalEventId(sessionId: string): string {
  return `session-terminal:${sessionId}`;
}
