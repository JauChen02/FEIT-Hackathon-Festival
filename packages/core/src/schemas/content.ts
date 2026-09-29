/**
 * Content file schema for the MVP publishing pipeline (PLANNING.md §13.4, ADR-025).
 *
 * One JSON file per question **version**, at
 * `content/<category>/<externalId>.v<n>.json`. A new version is a new file, so
 * pull-request diffs stay readable and editing a published version is caught by
 * the content hash rather than silently accepted.
 *
 * `rating` is deliberately NOT part of the file: it is derived from `difficulty`
 * by the importer (ADR-009), so an author cannot set it by hand.
 */

import { z } from 'zod';
import { MAX_DIFFICULTY, MIN_DIFFICULTY } from '../content/rating';

export const EXTERNAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const SUB_TOPIC_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;

const externalIdSchema = z.string().regex(EXTERNAL_ID_PATTERN, {
  message: 'externalId must be 3..64 lowercase characters of [a-z0-9-].',
});

const optionSchema = z.object({
  id: z.string().regex(/^[a-z]$/, { message: 'Option ids are single lowercase letters.' }),
  text: z.string().min(1).max(500),
});

const mcqQuestionSchema = z.object({
  type: z.literal('MCQ'),
  options: z
    .array(optionSchema)
    .min(2, { message: 'An MCQ needs at least 2 options.' })
    .max(6, { message: 'An MCQ can have at most 6 options.' }),
  answer: z.object({
    correctOptionId: z.string().regex(/^[a-z]$/),
  }),
});

const numericQuestionSchema = z.object({
  type: z.literal('NUMERIC'),
  options: z.undefined().optional(),
  answer: z.object({
    // Kept as a string so the decimal value survives JSON round-tripping
    // exactly; §8.1 parses it as a decimal at grading time.
    value: z.string().regex(/^-?\d+(\.\d+)?$/, {
      message: 'A numeric answer must be a plain decimal string.',
    }),
    tolerance: z
      .string()
      .regex(/^\d+(\.\d+)?$/, { message: 'Tolerance must be a non-negative decimal string.' })
      .optional(),
  }),
});

const baseFields = {
  externalId: externalIdSchema,
  versionNumber: z.number().int().min(1),
  category: z.string().regex(/^[a-z]+$/, { message: 'category must be a lowercase slug.' }),
  subTopic: z.string().regex(SUB_TOPIC_PATTERN).nullable().optional(),
  difficulty: z.number().int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY),
  prompt: z.string().min(1).max(2000),
  explanation: z
    .string()
    .min(10, { message: 'Every version needs a real explanation (§13.6), not filler.' })
    .max(2000),
  origin: z.enum(['HUMAN', 'AI_GENERATED', 'DEV_SEED']),
  source: z.string().min(1).max(500),
  license: z.string().min(1).max(200),
  authorUsername: z.string().min(1),
  reviewedByUsername: z.string().min(1),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, {
    message: 'reviewedAt must be an ISO-8601 UTC timestamp ending in Z.',
  }),
};

/**
 * A single content file.
 *
 * Cross-field rules (correct option must exist, reviewer must differ from
 * author) are checked here so the importer can report a readable message before
 * the database CHECK ever fires.
 */
export const contentFileSchema = z
  .union([
    z.object({ ...baseFields, ...mcqQuestionSchema.shape }),
    z.object({ ...baseFields, ...numericQuestionSchema.shape }),
  ])
  .superRefine((file, ctx) => {
    if (file.reviewedByUsername === file.authorUsername) {
      ctx.addIssue({
        code: 'custom',
        path: ['reviewedByUsername'],
        message: 'A reviewer must not approve a version they authored (§13.1).',
      });
    }

    if (file.type === 'MCQ') {
      const ids = file.options.map((option) => option.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique.' });
      }
      if (!ids.includes(file.answer.correctOptionId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['answer', 'correctOptionId'],
          message: `correctOptionId "${file.answer.correctOptionId}" is not one of the options.`,
        });
      }
    }
  });

export type ContentFile = z.infer<typeof contentFileSchema>;

/** The filename a content file must have, derived from its own contents. */
export function expectedContentFileName(file: Pick<ContentFile, 'externalId' | 'versionNumber'>) {
  return `${file.externalId}.v${file.versionNumber}.json`;
}
