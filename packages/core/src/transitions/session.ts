/**
 * GameSessionStatus (PLANNING.md §15.1).
 *
 *   CREATED -> ACTIVE        first question served
 *   CREATED -> CANCELLED     user cancels
 *   CREATED -> EXPIRED       30 min inactivity
 *   ACTIVE  -> COMPLETED     /complete with all questions resolved
 *   ACTIVE  -> ABANDONED     /abandon
 *   ACTIVE  -> EXPIRED       30 min inactivity
 *   ACTIVE  -> CANCELLED     multiplayer only: match aborted
 */

import { makeTransitionTable } from './table';

export const SESSION_STATUSES = [
  'CREATED',
  'ACTIVE',
  'COMPLETED',
  'ABANDONED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const sessionTransitions = makeTransitionTable<SessionStatus>(
  'game_session',
  SESSION_STATUSES,
  {
    CREATED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
    ACTIVE: ['COMPLETED', 'ABANDONED', 'EXPIRED', 'CANCELLED'],
    COMPLETED: [],
    ABANDONED: [],
    EXPIRED: [],
    CANCELLED: [],
  },
);

/** Statuses that are open, i.e. count toward the one-open-solo-session rule (§8.1). */
export const OPEN_SESSION_STATUSES = ['CREATED', 'ACTIVE'] as const satisfies readonly (
  'CREATED' | 'ACTIVE'
)[];

export function isOpenSessionStatus(status: SessionStatus): boolean {
  return status === 'CREATED' || status === 'ACTIVE';
}

/** Sessions in a terminal state fan out `session/terminal` post-commit work (§18.3). */
export function isTerminalSessionStatus(status: SessionStatus): boolean {
  return sessionTransitions.isTerminal(status);
}

/** Inactivity window before a session is swept to EXPIRED (§8.2). */
export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
