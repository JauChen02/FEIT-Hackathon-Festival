import { makeTransitionTable } from './table';
export const FRIENDSHIP_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'REMOVED',
] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];
export const friendshipTransitions = makeTransitionTable<FriendshipStatus>(
  'friendship',
  FRIENDSHIP_STATUSES,
  {
    PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'REMOVED'],
    ACCEPTED: ['REMOVED'],
    DECLINED: ['PENDING', 'REMOVED'],
    CANCELLED: ['PENDING', 'REMOVED'],
    REMOVED: ['PENDING'],
  },
);
export function normalizedPair(a: string, b: string): [string, string] {
  if (a === b) throw new Error('Cannot befriend yourself');
  return a < b ? [a, b] : [b, a];
}
export function canRequestAgain(status: FriendshipStatus, respondedAt: Date | null, now: Date) {
  return (
    status !== 'DECLINED' ||
    respondedAt === null ||
    now.getTime() - respondedAt.getTime() >= 86400000
  );
}
