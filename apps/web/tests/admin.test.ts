import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FixedClock, uuidv7 } from '@learnarena/core';
import { userRoles, questionVersions, contentAuditLog } from '@learnarena/db';
import { POST as onboarding } from '@/app/api/me/onboarding/route';
import { GET, POST } from '@/app/api/admin/content/route';
import { setSessionClock } from '@/lib/sessions/context';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';
let ctx: WebTestContext;
let restore: () => void;
let author: string;
let reviewer: string;
let outsider: string;
beforeAll(async () => {
  ctx = await createWebTestContext('admin');
  restore = setSessionClock(new FixedClock('2026-09-30T12:00:00Z'));
  for (const name of ['author', 'reviewer', 'outsider']) {
    const id = uuidv7();
    ctx.signInAs(id);
    await onboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: `admin_${name}` }),
      }),
    );
    if (name === 'author') author = id;
    else if (name === 'reviewer') reviewer = id;
    else outsider = id;
  }
  await ctx.db.insert(userRoles).values([
    { userId: author, role: 'AUTHOR' },
    { userId: author, role: 'REVIEWER' },
    { userId: reviewer, role: 'REVIEWER' },
    { userId: reviewer, role: 'ADMIN' },
  ]);
});
afterAll(async () => {
  restore();
  await ctx?.teardown();
});
const post = (body: unknown) => POST(jsonRequest('/api/admin/content', { method: 'POST', body }));
it('enforces roles and the audited review/publish workflow', async () => {
  ctx.signInAs(outsider);
  expect((await GET(jsonRequest('/api/admin/content'))).status).toBe(403);
  expect((await post({ action: 'fork', versionId: uuidv7() })).status).toBe(403);
  ctx.signInAs(author);
  const draft = {
    externalId: 'admin-test-question',
    categorySlug: 'math',
    type: 'NUMERIC',
    prompt: 'What is 2 + 3?',
    answer: { value: '5' },
    explanation: 'Adding two and three gives five.',
    difficulty: 1,
    origin: 'AI_GENERATED',
    source: 'Integration fixture',
    license: 'Test only',
  };
  const saved = await readResponse<{ id: string }>(await post({ action: 'save', draft }));
  expect(saved.status).toBe(200);
  const id = saved.body.id;
  expect((await readResponse<{ id: string }>(await post({ action: 'save', draft }))).body.id).toBe(
    id,
  );
  expect((await post({ action: 'transition', versionId: id, to: 'LIVE' })).status).toBe(403);
  expect((await post({ action: 'transition', versionId: id, to: 'IN_REVIEW' })).status).toBe(200);
  expect((await post({ action: 'transition', versionId: id, to: 'APPROVED' })).status).toBe(403);
  expect(
    (await post({ action: 'save', versionId: id, draft: { ...draft, prompt: 'Changed' } })).status,
  ).toBe(400);
  ctx.signInAs(reviewer);
  expect((await post({ action: 'transition', versionId: id, to: 'APPROVED' })).status).toBe(200);
  const publishes = await Promise.all([
    post({ action: 'transition', versionId: id, to: 'LIVE' }),
    post({ action: 'transition', versionId: id, to: 'LIVE' }),
  ]);
  expect(publishes.map((r) => r.status)).toEqual([200, 200]);
  expect(
    (await ctx.db.select().from(questionVersions).where(eq(questionVersions.id, id)))[0]!.status,
  ).toBe('LIVE');
  expect(
    (await ctx.db.select().from(contentAuditLog).where(eq(contentAuditLog.entityId, id))).map(
      (row) => row.toStatus,
    ),
  ).toEqual(['IN_REVIEW', 'APPROVED', 'LIVE']);
  await expect(
    ctx.db.update(questionVersions).set({ prompt: 'Tampered' }).where(eq(questionVersions.id, id)),
  ).rejects.toThrow();
  ctx.signInAs(author);
  const fork = await readResponse<{ id: string }>(await post({ action: 'fork', versionId: id }));
  expect(fork.status).toBe(200);
  expect(fork.body.id).not.toBe(id);
});
