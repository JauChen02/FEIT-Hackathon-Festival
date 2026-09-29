import { expect, it } from 'vitest';
import {
  generateMath,
  generateMemory,
  memoryCorrectness,
  scenarioGraphSchema,
  computePoints,
} from '../src';
it('generators reproduce an item from its seed, index and version configuration', () => {
  expect(generateMath('fixed', 2, 3)).toEqual(generateMath('fixed', 2, 3));
  expect(generateMemory('fixed', 2, 3)).toEqual(generateMemory('fixed', 2, 3));
  expect(generateMemory('fixed', 2, 3)).not.toEqual(generateMemory('fixed', 3, 3));
});
it('memory correctness measures matching positions including partial recall', () => {
  expect(memoryCorrectness([1, 2, 3, 4], '1 2 0 4')).toBe(0.75);
  expect(memoryCorrectness([1, 2], '1')).toBe(0.5);
  expect(memoryCorrectness([1, 2], '1 2 3 4')).toBe(0.5);
});
it('rejects dangling nodes, cycles and unreachable endings', () => {
  const node = {
    id: 'a',
    line: 'Choose',
    categorySlug: 'logic',
    choices: [
      { id: 'x', text: 'X', correctness: 1, feedback: 'Yes', nextNodeId: 'z' },
      { id: 'y', text: 'Y', correctness: 0, feedback: 'No', nextNodeId: 'z' },
    ],
  };
  expect(
    scenarioGraphSchema.safeParse({
      start: 'a',
      nodes: [node, { id: 'z', line: 'Done', categorySlug: 'logic', ending: true }],
    }).success,
  ).toBe(true);
  expect(
    scenarioGraphSchema.safeParse({
      start: 'a',
      nodes: [node, { id: 'b', line: 'Done', categorySlug: 'logic', ending: true }],
    }).success,
  ).toBe(false);
  expect(
    scenarioGraphSchema.safeParse({
      start: 'a',
      nodes: [
        { ...node, choices: node.choices.map((c) => ({ ...c, nextNodeId: 'a' })) },
        { id: 'z', line: 'Done', categorySlug: 'logic', ending: true },
      ],
    }).success,
  ).toBe(false);
});
it('scenarios have no combo and add best-ending to raw base', () => {
  const result = computePoints({
    questions: [
      { correctness: 1, speedFactor: 1 },
      { correctness: 0.5, speedFactor: 1 },
    ],
    comboEnabled: false,
    completionBonus: 100,
    multipliers: { streak: 1, friend: 1, weakness: 1, event: 1 },
  });
  expect(result.finalPoints).toBe(250);
  expect(result.comboContribution).toBe('0');
});
