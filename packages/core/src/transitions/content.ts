/**
 * ContentStatus (PLANNING.md §13.3, §15.7).
 *
 *   DRAFT ──► IN_REVIEW ──► APPROVED ──► LIVE ──► ARCHIVED
 *     ▲            │            │
 *     └────────────┴────────────┘  (changes requested)
 *
 * Legal: DRAFT→IN_REVIEW, IN_REVIEW→DRAFT, IN_REVIEW→APPROVED,
 *        APPROVED→LIVE, APPROVED→DRAFT, LIVE→ARCHIVED.
 *
 * There is no path from DRAFT to LIVE without passing through human approval —
 * that is what keeps AI_GENERATED content out of production unreviewed (§13.3).
 */

import { makeTransitionTable } from './table';

export const CONTENT_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'LIVE', 'ARCHIVED'] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const contentTransitions = makeTransitionTable<ContentStatus>(
  'question_version',
  CONTENT_STATUSES,
  {
    DRAFT: ['IN_REVIEW'],
    IN_REVIEW: ['DRAFT', 'APPROVED'],
    APPROVED: ['LIVE', 'DRAFT'],
    LIVE: ['ARCHIVED'],
    ARCHIVED: [],
  },
);

/**
 * The publish path the MVP import command walks in one audited transaction
 * (§13.4, §15.7). Each step writes a `content_audit_log` row.
 */
export const IMPORT_PUBLISH_PATH = [
  'IN_REVIEW',
  'APPROVED',
  'LIVE',
] as const satisfies readonly ContentStatus[];

/** Assessment-critical fields are immutable once a version leaves DRAFT (§13.2). */
export function isImmutableStatus(status: ContentStatus): boolean {
  return status !== 'DRAFT';
}
