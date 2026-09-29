import 'server-only';
import { logger } from '../logger';
import { SESSION_TERMINAL_EVENT, inngest, sessionTerminalEventId } from './client';

/**
 * Sending the post-commit `session/terminal` event (PLANNING.md §18.3).
 *
 * Two properties matter here:
 *
 * 1. **It never fails the request.** The event is sent *after* the completion
 *    transaction commits, so by the time we get here the user's points are
 *    already durable. §23.4 says an Inngest send that fails after commit is
 *    covered by `sessions/reconcile` within the hour — so a failure is logged
 *    and swallowed, never propagated.
 * 2. **It is deduplicated.** The event id is derived from the session id, so
 *    the original send and any number of reconcile re-sends collapse into one
 *    delivery (§18.1).
 */

export type EventTransport = (sessionId: string, userId: string) => Promise<void>;

const inngestTransport: EventTransport = async (sessionId, userId) => {
  await inngest.send({
    id: sessionTerminalEventId(sessionId, userId),
    name: SESSION_TERMINAL_EVENT,
    data: { sessionId, userId },
  });
};

let transport: EventTransport = inngestTransport;

/**
 * Swap the transport. Integration tests use this to observe what would have
 * been sent without needing an Inngest dev server running.
 */
export function setEventTransport(next: EventTransport): () => void {
  const previous = transport;
  transport = next;
  return () => {
    transport = previous;
  };
}

export async function sendSessionTerminal(sessionId: string, userId: string): Promise<void> {
  if (process.env.BACKGROUND_JOB_MODE === 'worker') return;
  try {
    await transport(sessionId, userId);
    logger.debug({ session_id: sessionId }, 'session.terminal_event_sent');
  } catch (error) {
    // §23.4: "Inngest send fails after commit → sessions/reconcile re-sends
    // within an hour." Losing the event is recoverable; losing the response
    // after a committed award is not.
    logger.error(
      { err: error, session_id: sessionId },
      'session.terminal_event_send_failed — reconcile will retry',
    );
  }
}
