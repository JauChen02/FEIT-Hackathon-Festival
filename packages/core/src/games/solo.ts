import { z } from 'zod';
import { seededRandom } from '../rand';
export const soloModeSchema = z.enum(['speed_math', 'memory_match', 'dialogue_scenario']);
export type SoloMode = z.infer<typeof soloModeSchema>;
const choiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  correctness: z.number().min(0).max(1),
  feedback: z.string().min(1),
  nextNodeId: z.string().min(1),
});
export const scenarioGraphSchema = z
  .object({
    start: z.string(),
    nodes: z
      .array(
        z.object({
          id: z.string(),
          line: z.string(),
          categorySlug: z.string(),
          subTopic: z.string().optional(),
          choices: z.array(choiceSchema).min(2).max(4).optional(),
          ending: z.boolean().optional(),
          bestEnding: z.boolean().optional(),
        }),
      )
      .min(2),
  })
  .superRefine((graph, ctx) => {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    if (nodes.size !== graph.nodes.length || !nodes.has(graph.start)) {
      ctx.addIssue({ code: 'custom', message: 'Node ids must be unique and start must exist.' });
      return;
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let endings = 0;
    function walk(id: string) {
      const node = nodes.get(id);
      if (!node) {
        ctx.addIssue({ code: 'custom', message: `Dangling node ${id}` });
        return;
      }
      if (visiting.has(id)) {
        ctx.addIssue({ code: 'custom', message: 'Scenario paths must terminate without cycles.' });
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      if (node.ending) {
        endings++;
        if (node.choices?.length)
          ctx.addIssue({ code: 'custom', message: 'Endings cannot contain choices.' });
      } else if (!node.choices)
        ctx.addIssue({ code: 'custom', message: 'Every non-ending needs choices.' });
      if (node.choices && new Set(node.choices.map((c) => c.id)).size !== node.choices.length)
        ctx.addIssue({ code: 'custom', message: 'Choice ids must be unique within a node.' });
      node.choices?.forEach((choice) => walk(choice.nextNodeId));
      visiting.delete(id);
      visited.add(id);
    }
    walk(graph.start);
    if (!endings || visited.size !== nodes.size)
      ctx.addIssue({
        code: 'custom',
        message: 'Every node must be reachable and paths must reach an ending.',
      });
  });
export type ScenarioGraph = z.infer<typeof scenarioGraphSchema>;
export const generatorConfigSchema = z.object({
  difficulty: z.number().int().min(1).max(5),
  rounds: z.number().int().min(1).max(20).default(5),
});
export interface GeneratedItem {
  prompt: string;
  answer: string;
  sequence?: number[];
  rating: number;
  explanation: string;
}
export function generateMath(seed: string, index: number, difficulty: number): GeneratedItem {
  const random = seededRandom(`${seed}:math:${index}`);
  const max = 10 * difficulty;
  const a = random.nextInt(max) + 1;
  const b = random.nextInt(max) + 1;
  const multiply = difficulty >= 3 && random.nextInt(2) === 1;
  return {
    prompt: `${a} ${multiply ? '×' : '+'} ${b} = ?`,
    answer: String(multiply ? a * b : a + b),
    rating: 700 + 100 * difficulty,
    explanation: `${a} ${multiply ? '×' : '+'} ${b} = ${multiply ? a * b : a + b}.`,
  };
}
export function generateMemory(seed: string, index: number, difficulty: number): GeneratedItem {
  const random = seededRandom(`${seed}:memory:${index}`);
  const sequence = Array.from(
    { length: Math.min(3 + difficulty + Math.floor(index / 2), 12) },
    () => random.nextInt(9) + 1,
  );
  return {
    prompt: 'Recall the sequence in order.',
    answer: sequence.join(' '),
    sequence,
    rating: 700 + 100 * difficulty,
    explanation: `The sequence was ${sequence.join(' → ')}.`,
  };
}
export function memoryCorrectness(expected: readonly number[], response: string): number {
  const actual = response
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return (
    expected.reduce((sum, value, index) => sum + (actual[index] === value ? 1 : 0), 0) /
    Math.max(expected.length, actual.length)
  );
}
export interface ModeQuestion {
  id: string;
  position: number;
  kind: SoloMode;
  prompt: string;
  options: { id: string; text: string }[] | null;
  sequence: number[] | null;
  revealUntil: string | null;
  deadlineAt: string | null;
  finished: boolean;
}
export interface ModeAnswerResult {
  correctness: number;
  explanation: string;
  correctAnswer: string;
  sessionFinished: boolean;
}
