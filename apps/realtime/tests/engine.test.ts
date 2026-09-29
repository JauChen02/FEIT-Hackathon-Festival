import { expect, it } from 'vitest';
import { uuidv7, type MatchQuestion } from '@learnarena/core';
import { MatchEngine } from '../src/engine';
const questions: MatchQuestion[] = Array.from({ length: 10 }, () => ({
  id: uuidv7(),
  prompt: 'Two?',
  type: 'MCQ',
  options: [
    { id: 'a', text: '2' },
    { id: 'b', text: '3' },
  ],
  answer: { correctOptionId: 'a' },
  explanation: 'Two',
  categoryId: uuidv7(),
  rating: 1000,
  subTopic: null,
}));
function match() {
  return new MatchEngine(
    uuidv7(),
    'quiz_coop',
    [
      {
        userId: 'a',
        displayName: 'Alice',
        team: 'A',
        connected: true,
        disconnectedAt: null,
        eliminated: false,
      },
      {
        userId: 'b',
        displayName: 'Bob',
        team: 'A',
        connected: true,
        disconnectedAt: null,
        eliminated: false,
      },
    ],
    questions,
  );
}
it('never leaks answers, dedupes events, rejects second votes and stale rounds', () => {
  const m = match();
  m.start(1000);
  expect(m.snapshot('a').question).not.toHaveProperty('answer');
  const payload = {
    clientEventId: uuidv7(),
    questionId: questions[0]!.id,
    response: { optionId: 'a' },
  };
  expect(m.submit('a', 'vote', payload, 2000).accepted).toBe(true);
  expect(m.submit('a', 'vote', payload, 2100).accepted).toBe(true);
  expect(m.votes.size).toBe(1);
  expect(m.submit('a', 'vote', { ...payload, clientEventId: uuidv7() }, 2100).reason).toBe(
    'ALREADY_ANSWERED',
  );
  expect(
    m.submit(
      'b',
      'vote',
      { ...payload, questionId: questions[1]!.id, clientEventId: uuidv7() },
      2100,
    ).reason,
  ).toBe('QUESTION_NOT_CURRENT');
  expect(m.shouldResolve(21499)).toBe(false);
  expect(m.shouldResolve(21500)).toBe(true);
  m.resolve(21500);
  expect(m.rounds).toHaveLength(1);
  expect(m.rounds[0]!.perPlayer[1]!.timedOut).toBe(true);
});
it('accepts grace-window answers and rejects malformed and late payloads', () => {
  const m = match();
  m.start(0);
  expect(
    m.submit(
      'a',
      'vote',
      { clientEventId: uuidv7(), questionId: questions[0]!.id, response: { optionId: 'a' } },
      20500,
    ).accepted,
  ).toBe(true);
  expect(
    m.submit(
      'b',
      'vote',
      { clientEventId: uuidv7(), questionId: questions[0]!.id, response: { optionId: 'a' } },
      20501,
    ).reason,
  ).toBe('QUESTION_EXPIRED');
  expect(m.submit('b', 'vote', { response: { correctness: 1 } }, 2000).reason).toBe(
    'INVALID_INPUT',
  );
});
it('reconnect is bounded to 30 seconds and never replays scoring', () => {
  const m = match();
  m.start(0);
  m.disconnect('a', 1000);
  expect(m.reconnect('a', 31000)).toBe(true);
  m.disconnect('a', 32000);
  expect(m.reconnect('a', 62001)).toBe(false);
  m.disconnect('b', 32000);
  m.expireDisconnected(62001);
  expect(m.status).toBe('ABORTED');
  expect(m.rounds).toHaveLength(0);
});
