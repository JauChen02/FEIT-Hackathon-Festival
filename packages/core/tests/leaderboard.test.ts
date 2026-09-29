import { expect, it } from 'vitest';
import { rankLeaderboard } from '../src';
it('uses competition ranks and username ordering for ties', () => {
  const entries = rankLeaderboard(
    [
      ['z', 20],
      ['b', 30],
      ['a', 30],
      ['c', 40],
    ].map(([username, points]) => ({
      userId: String(username),
      username: String(username),
      displayName: String(username),
      points: Number(points),
    })),
  );
  expect(entries.map((e) => [e.username, e.rank])).toEqual([
    ['c', 1],
    ['a', 2],
    ['b', 2],
    ['z', 4],
  ]);
});
