import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { makeTransitionTable } from '../transitions/table';
import {
  gradeAnswer,
  normaliseNumeric,
  type AnswerKey,
  type AnswerResponse,
  type QuestionType,
} from '../grading/gradeAnswer';
import { speedFactor } from '../scoring/speedFactor';
export const lobbyTransitions = makeTransitionTable(
  'lobby',
  ['OPEN', 'STARTING', 'IN_MATCH', 'CLOSED', 'EXPIRED', 'CANCELLED'] as const,
  {
    OPEN: ['STARTING', 'EXPIRED', 'CANCELLED'],
    STARTING: ['OPEN', 'IN_MATCH', 'CANCELLED'],
    IN_MATCH: ['CLOSED'],
    CLOSED: [],
    EXPIRED: [],
    CANCELLED: [],
  },
);
export const matchTransitions = makeTransitionTable(
  'match',
  ['WAITING_FOR_PLAYERS', 'IN_PROGRESS', 'FINALIZING', 'FINISHED', 'ABORTED'] as const,
  {
    WAITING_FOR_PLAYERS: ['IN_PROGRESS', 'ABORTED'],
    IN_PROGRESS: ['FINALIZING', 'ABORTED'],
    FINALIZING: ['FINISHED', 'ABORTED'],
    FINISHED: [],
    ABORTED: [],
  },
);
export type MultiplayerMode = 'quiz_coop' | 'team_deathmatch';
export type Team = 'A' | 'B';
export const multiplayerResponse = z.union([
  z.object({ optionId: z.string().min(1).max(64) }).strict(),
  z.object({ value: z.string().max(64) }).strict(),
]);
const eventId = z.string().uuid();
export const realtimeSchemas = {
  ready: z.object({ clientEventId: eventId, isReady: z.boolean() }).strict(),
  submit_answer: z
    .object({ clientEventId: eventId, roundId: z.string().uuid(), response: multiplayerResponse })
    .strict(),
  vote: z
    .object({
      clientEventId: eventId,
      questionId: z.string().uuid(),
      response: multiplayerResponse,
    })
    .strict(),
  leave: z.object({ clientEventId: eventId }).strict(),
};
export interface MatchQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  options: { id: string; text: string }[] | null;
  answer: AnswerKey;
  explanation: string;
  categoryId: string;
  rating: number;
  subTopic: string | null;
}
export interface MatchVote {
  userId: string;
  response: AnswerResponse;
  receivedAt: number;
}
export interface RoundPlayer {
  userId: string;
  team: Team;
  correctness: number;
  speedFactor: number;
  response: AnswerResponse | null;
  receivedAt: number;
  timedOut: boolean;
  combo: number;
}
export interface ResolvedRound {
  questionId: string;
  startedAt: number;
  lockedAt: number;
  perPlayer: RoundPlayer[];
  teamCorrectness: number;
  teamSpeedFactor: number;
  hp: Record<Team, number>;
  damage: Record<Team, number>;
  correctAnswer: string;
  explanation: string;
}
function voteKey(response: AnswerResponse) {
  return 'optionId' in response
    ? `o:${response.optionId}`
    : `n:${normaliseNumeric(response.value)?.toString() ?? response.value.trim()}`;
}
export function plurality(votes: readonly MatchVote[]): MatchVote | null {
  const counts = new Map<string, { count: number; first: MatchVote }>();
  for (const vote of [...votes].sort((a, b) => a.receivedAt - b.receivedAt)) {
    const key = voteKey(vote.response);
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { count: 1, first: vote });
  }
  return (
    [...counts.values()].sort(
      (a, b) => b.count - a.count || a.first.receivedAt - b.first.receivedAt,
    )[0]?.first ?? null
  );
}
export function resolveMatchRound(input: {
  mode: MultiplayerMode;
  question: MatchQuestion;
  players: readonly { userId: string; team: Team }[];
  votes: readonly MatchVote[];
  startedAt: number;
  lockedAt: number;
  combos: Readonly<Record<string, number>>;
  hp: Readonly<Record<Team, number>>;
}): ResolvedRound {
  const limit = input.mode === 'quiz_coop' ? 20000 : 15000;
  const deadline = input.startedAt + limit;
  const perPlayer = input.players.map((player) => {
    const vote = input.votes.find((v) => v.userId === player.userId);
    const correctness = vote
      ? gradeAnswer(input.question.type, input.question.answer, vote.response).correctness
      : 0;
    return {
      ...player,
      correctness,
      speedFactor: vote ? Number(speedFactor(deadline - vote.receivedAt, limit)) : 0,
      response: vote?.response ?? null,
      receivedAt: vote?.receivedAt ?? input.lockedAt,
      timedOut: !vote,
      combo: correctness === 1 ? (input.combos[player.userId] ?? 0) + 1 : 0,
    };
  });
  const chosen = plurality(input.votes);
  const teamCorrectness = chosen
    ? gradeAnswer(input.question.type, input.question.answer, chosen.response).correctness
    : 0;
  const damage: Record<Team, number> = { A: 0, B: 0 };
  if (input.mode === 'team_deathmatch')
    for (const player of perPlayer) {
      if (player.timedOut) continue;
      if (player.correctness === 0) damage[player.team] += 3;
      else
        damage[player.team === 'A' ? 'B' : 'A'] += new Decimal(10)
          .times(player.correctness)
          .times(player.speedFactor)
          .times(new Decimal(1).plus(new Decimal(Math.min(player.combo, 5)).times(0.1)))
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();
    }
  const key = input.question.answer;
  return {
    questionId: input.question.id,
    startedAt: input.startedAt,
    lockedAt: input.lockedAt,
    perPlayer,
    teamCorrectness,
    teamSpeedFactor: chosen ? Number(speedFactor(deadline - input.lockedAt, limit)) : 0,
    damage,
    hp: { A: input.hp.A - damage.A, B: input.hp.B - damage.B },
    correctAnswer:
      'correctOptionId' in key
        ? (input.question.options?.find((o) => o.id === key.correctOptionId)?.text ??
          key.correctOptionId)
        : key.value,
    explanation: input.question.explanation,
  };
}
export function matchOutcome(hp: Readonly<Record<Team, number>>): Team | 'DRAW' {
  if ((hp.A <= 0 && hp.B <= 0) || hp.A === hp.B) return 'DRAW';
  return hp.A > hp.B ? 'A' : 'B';
}
/** Weighted sampling without replacement; caller provides a seeded uniform generator. */
export function weightedQuestionPool(
  questions: readonly MatchQuestion[],
  weakness: Readonly<Record<string, number>>,
  count: number,
  random: () => number,
) {
  const remaining = [...questions];
  const selected: MatchQuestion[] = [];
  while (remaining.length && selected.length < count) {
    const groups = new Map<string, MatchQuestion[]>();
    for (const q of remaining) {
      const group = groups.get(q.categoryId) ?? [];
      group.push(q);
      groups.set(q.categoryId, group);
    }
    const categories = [...groups.keys()].sort();
    const weights = categories.map((id) => 0.2 + Math.max(0, Math.min(1, weakness[id] ?? 0.5)));
    let target = random() * weights.reduce((a, b) => a + b, 0);
    let category = categories[categories.length - 1]!;
    for (let i = 0; i < categories.length; i++) {
      target -= weights[i]!;
      if (target < 0) {
        category = categories[i]!;
        break;
      }
    }
    const pool = groups.get(category)!;
    const question = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
    selected.push(question);
    remaining.splice(remaining.indexOf(question), 1);
  }
  return selected;
}
