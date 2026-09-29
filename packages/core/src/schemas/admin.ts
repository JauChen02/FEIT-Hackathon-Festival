import { z } from 'zod';
export const draftQuestionSchema = z
  .object({
    externalId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
    categorySlug: z.string().min(1),
    type: z.enum(['MCQ', 'NUMERIC']),
    prompt: z.string().min(1).max(2000),
    options: z
      .array(z.object({ id: z.string().regex(/^[a-z]$/), text: z.string().min(1).max(500) }))
      .min(2)
      .max(6)
      .optional(),
    answer: z.union([
      z.object({ correctOptionId: z.string() }),
      z.object({
        value: z.string().regex(/^-?\d+(\.\d+)?$/),
        tolerance: z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .optional(),
      }),
    ]),
    explanation: z.string().min(10).max(2000),
    difficulty: z.number().int().min(1).max(5),
    origin: z.enum(['HUMAN', 'AI_GENERATED']),
    source: z.string().min(1).max(500),
    license: z.string().min(1).max(200),
  })
  .superRefine((draft, ctx) => {
    if (
      draft.type === 'MCQ' &&
      (!('correctOptionId' in draft.answer) ||
        !draft.options?.some(
          (o) => o.id === ('correctOptionId' in draft.answer ? draft.answer.correctOptionId : ''),
        ) ||
        new Set(draft.options.map((o) => o.id)).size !== draft.options.length)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'MCQ options must be unique and include the correct answer.',
      });
    if (draft.type === 'NUMERIC' && !('value' in draft.answer))
      ctx.addIssue({ code: 'custom', message: 'Numeric questions require a numeric answer.' });
  });
export const adminContentRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    versionId: z.uuid().optional(),
    draft: draftQuestionSchema,
  }),
  z.object({ action: z.literal('fork'), versionId: z.uuid() }),
  z.object({
    action: z.literal('transition'),
    versionId: z.uuid(),
    to: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'LIVE', 'ARCHIVED']),
    note: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('daily'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    questionVersionIds: z.array(z.uuid()).length(10),
  }),
]);
export type AdminContentRequest = z.infer<typeof adminContentRequestSchema>;

export const activityDraftSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  name: z.string().trim().min(3).max(100),
  kind: z.enum(['speed_math', 'memory_match', 'dialogue_scenario']),
  origin: z.enum(['HUMAN', 'AI_GENERATED']),
  source: z.string().trim().min(3).max(500),
  license: z.string().trim().min(3).max(200),
  content: z.unknown(),
});
export const adminActivityRequest = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    versionId: z.uuid().optional(),
    draft: activityDraftSchema,
  }),
  z.object({
    action: z.literal('transition'),
    versionId: z.uuid(),
    to: z.enum(['IN_REVIEW', 'APPROVED', 'LIVE', 'ARCHIVED', 'DRAFT']),
  }),
]);
export type AdminActivityRequest = z.infer<typeof adminActivityRequest>;
