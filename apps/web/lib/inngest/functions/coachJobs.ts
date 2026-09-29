import 'server-only';
import { applyElo, systemClock } from '@learnarena/core';
import {
  findSkillProfile,
  lockStreakUser,
  insertSkillUpdate,
  listSessionsMissingSkillUpdates,
  listUnprocessedEvents,
  markPostProcessed,
  upsertSkillProfile,
} from '@learnarena/db';
import { db } from '../../db';
import { logger } from '../../logger';
import { SESSION_TERMINAL_EVENT, inngest, type SessionTerminalEvent } from '../client';
import { sendSessionTerminal } from '../events';

/**
 * `coach/process-session` (PLANNING.md §11.3, §18.3).
 *
 * "apply Elo updates for the session's learning events (**concurrency key =
 *  user_id**, so one user's updates run serially), upsert `skill_profiles`,
 *  set `post_processed_at`."
 *
 * The concurrency key is what makes the rating chain correct: two sessions
 * finishing at once would otherwise both read the same `rating_before` and one
 * would overwrite the other's result. Serialising per user — not globally —
 * keeps throughput while making each learner's chain deterministic.
 *
 * This replaces Phase 1's `sessions/mark-post-processed` stub (ADR-043).
 */

export interface ProcessSessionResult {
  eventsApplied: number;
  categoriesTouched: number;
  /** True when every event was already applied — the idempotent re-run case. */
  alreadyProcessed: boolean;
}

export async function runProcessSession(
  sessionId: string,
  userId: string,
  at: Date = systemClock.now(),
): Promise<ProcessSessionResult> {
  return db().transaction(async (tx) => {
    await lockStreakUser(tx, userId);
    // §11.3: "Events are applied in occurred_at order (ties by event id), one at
    // a time." The query returns only events with no skill_updates row, so a
    // re-run sees an empty list and does nothing (§18.1).
    const events = await listUnprocessedEvents(tx, sessionId, userId);

    if (events.length === 0) {
      // Still stamp the column: a cancelled session has no events at all, and
      // without this `sessions/reconcile` would chase it forever (ADR-042).
      if ((await listUnprocessedEvents(tx, sessionId)).length === 0)
        await markPostProcessed(tx, sessionId, at);
      return { eventsApplied: 0, categoriesTouched: 0, alreadyProcessed: true };
    }

    // Carry the running rating per category across the whole run rather than
    // re-reading between events — the chain is sequential by definition.
    const running = new Map<
      string,
      { rating: number; lifetimeEventCount: number; lastEventAt: Date }
    >();

    let applied = 0;

    for (const event of events) {
      let state = running.get(event.categoryId);
      if (!state) {
        const profile = await findSkillProfile(tx, userId, event.categoryId);
        state = {
          // §11.3: "Per (user, category), starting rating 1000."
          rating: profile?.rating ?? 1000,
          lifetimeEventCount: profile?.lifetimeEventCount ?? 0,
          lastEventAt: event.occurredAt,
        };
        running.set(event.categoryId, state);
      }

      const application = applyElo({
        userRating: state.rating,
        itemRating: event.difficultyRating,
        correctness: event.correctness,
        // §11.3: the K factor uses the count *before* this event.
        lifetimeEventCountBefore: state.lifetimeEventCount,
      });

      const wrote = await insertSkillUpdate(tx, {
        learningEventId: event.id,
        userId,
        categoryId: event.categoryId,
        application,
        now: at,
      });

      if (!wrote) {
        // A concurrent run applied this event first. Its rating_after is the
        // truth; skip rather than double-count.
        logger.debug({ event_id: event.id }, 'coach.skill_update_already_applied');
        continue;
      }

      state.rating = application.ratingAfter;
      state.lifetimeEventCount += 1;
      state.lastEventAt = event.occurredAt;
      applied += 1;
    }

    for (const [categoryId, state] of running) {
      await upsertSkillProfile(tx, {
        userId,
        categoryId,
        rating: state.rating,
        lifetimeEventCount: state.lifetimeEventCount,
        lastEventAt: state.lastEventAt,
        now: at,
      });
    }

    if ((await listUnprocessedEvents(tx, sessionId)).length === 0)
      await markPostProcessed(tx, sessionId, at);

    logger.info(
      { session_id: sessionId, user_id: userId, events_applied: applied },
      'coach.session_processed',
    );

    return {
      eventsApplied: applied,
      categoriesTouched: running.size,
      alreadyProcessed: applied === 0,
    };
  });
}

export const processSession = inngest.createFunction(
  {
    id: 'coach-process-session',
    name: 'coach/process-session',
    retries: 5,
    // §18.3: one user's updates run serially, so the Elo chain is applied in
    // order even when several of their sessions finish together.
    concurrency: { key: 'event.data.userId', limit: 1 },
    triggers: [{ event: SESSION_TERMINAL_EVENT }],
  },
  async ({ event, step }) => {
    const { sessionId, userId } = event.data as SessionTerminalEvent['data'];
    return step.run('process', () => runProcessSession(sessionId, userId));
  },
);

/**
 * Apply the Coach in-process for every session still missing its skill updates
 * (ADR-052).
 *
 * `coach/process-session` normally runs on Inngest. When Inngest is
 * unreachable, or when a local environment has no dev server, ratings silently
 * stop moving — §23.4 covers the lost-event case with `sessions/reconcile`, but
 * reconcile only re-sends, so it cannot help if nothing is consuming.
 *
 * This is the manual drain: it runs the same `runProcessSession` the job runs,
 * against the same idempotency guards, so it is safe to run at any time and
 * safe to run alongside a healthy Inngest.
 */
export async function runDrainPendingSessions(
  at: Date = systemClock.now(),
): Promise<{ processed: number; eventsApplied: number }> {
  const pending = await listSessionsMissingSkillUpdates(db());
  let eventsApplied = 0;

  // Sequential on purpose: `coach/process-session` serialises per user, and
  // draining by hand must not be the thing that breaks that guarantee.
  for (const session of pending) {
    const result = await runProcessSession(session.sessionId, session.userId, at);
    eventsApplied += result.eventsApplied;
  }

  return { processed: pending.length, eventsApplied };
}

/**
 * Backfill for sessions played before Phase 3 (ADR-051).
 *
 * Phase 1's stub consumer stamped `post_processed_at` without applying any
 * Elo, so those sessions have learning events and no `skill_updates`. Re-send
 * `session/terminal` for them; the UNIQUE guard on
 * `skill_updates.learning_event_id` makes it safe to run repeatedly.
 *
 * Use this when Inngest is healthy. Use `runDrainPendingSessions` when it is
 * not — re-sending into a queue nothing is consuming achieves nothing.
 */
export async function runBackfillSkillUpdates(): Promise<{ resent: number }> {
  const pending = await listSessionsMissingSkillUpdates(db());

  for (const session of pending) {
    logger.info(
      { session_id: session.sessionId, user_id: session.userId },
      'coach.backfill_resend',
    );
    await sendSessionTerminal(session.sessionId, session.userId);
  }

  return { resent: pending.length };
}

export const coachFunctions = [processSession];
