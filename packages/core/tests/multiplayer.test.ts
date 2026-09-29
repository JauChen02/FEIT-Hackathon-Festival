import { expect, it } from 'vitest';
import {
  plurality,
  resolveMatchRound,
  matchOutcome,
  weightedQuestionPool,
  type MatchQuestion,
} from '../src';
const question: MatchQuestion = {
  id: 'q',
  prompt: '1+1',
  type: 'MCQ',
  options: [
    { id: 'a', text: '2' },
    { id: 'b', text: '3' },
  ],
  answer: { correctOptionId: 'a' },
  explanation: 'Two',
  categoryId: 'math',
  rating: 1000,
  subTopic: null,
};
it('plurality uses earliest vote only among tied options; numeric forms normalize', () => {
  expect(
    plurality([
      { userId: '1', response: { optionId: 'b' }, receivedAt: 1 },
      { userId: '2', response: { optionId: 'a' }, receivedAt: 2 },
    ])?.response,
  ).toEqual({ optionId: 'b' });
  expect(
    plurality([
      { userId: '1', response: { value: '2.0' }, receivedAt: 1 },
      { userId: '2', response: { value: '3' }, receivedAt: 2 },
      { userId: '3', response: { value: '2' }, receivedAt: 3 },
    ])?.userId,
  ).toBe('1');
  expect(plurality([])).toBeNull();
});
it('resolves simultaneous damage, combo cap, self damage and timeout', () => {
  const round = resolveMatchRound({
    mode: 'team_deathmatch',
    question,
    players: [
      { userId: '1', team: 'A' },
      { userId: '2', team: 'B' },
      { userId: '3', team: 'B' },
    ],
    votes: [
      { userId: '1', response: { optionId: 'a' }, receivedAt: 0 },
      { userId: '2', response: { optionId: 'b' }, receivedAt: 0 },
    ],
    startedAt: 0,
    lockedAt: 15000,
    combos: { '1': 100 },
    hp: { A: 100, B: 100 },
  });
  expect(round.damage).toEqual({ A: 0, B: 18 });
  expect(round.hp).toEqual({ A: 100, B: 82 });
  expect(round.perPlayer[2]?.timedOut).toBe(true);
  expect(matchOutcome({ A: -2, B: -1 })).toBe('DRAW');
});
it('co-op team scoring differs from individual learning, using lock time', () => {
  const round = resolveMatchRound({
    mode: 'quiz_coop',
    question,
    players: [
      { userId: '1', team: 'A' },
      { userId: '2', team: 'A' },
    ],
    votes: [
      { userId: '1', response: { optionId: 'a' }, receivedAt: 0 },
      { userId: '2', response: { optionId: 'b' }, receivedAt: 10000 },
    ],
    startedAt: 0,
    lockedAt: 10000,
    combos: {},
    hp: { A: 100, B: 100 },
  });
  expect(round.teamCorrectness).toBe(1);
  expect(round.teamSpeedFactor).toBe(0.75);
  expect(round.perPlayer.map((p) => p.correctness)).toEqual([1, 0]);
  expect(round.damage).toEqual({ A: 0, B: 0 });
});
it('weighted pool gives categories weights rather than allowing inventory size to dominate', () => {
  const pool = [
    question,
    ...Array.from({ length: 30 }, (_, i) => ({ ...question, id: `s${i}`, categoryId: 'science' })),
  ];
  expect(weightedQuestionPool(pool, { math: 1, science: 0 }, 1, () => 0.5)[0]?.categoryId).toBe(
    'math',
  );
  expect(new Set(weightedQuestionPool(pool, {}, 31, () => 0.2).map((q) => q.id)).size).toBe(31);
});
