/**
 * The Phase 0 API surface (PLANNING.md §16.1, §16.2, §19.1, §24).
 *
 * Acceptance criteria covered:
 *   - "GET /api/me returns 401 unauthenticated"
 *   - "POST /api/me/onboarding validates input and is idempotent (repeat with
 *      same data → 200, no duplicate rows)"
 *   - "gameplay routes return ONBOARDING_REQUIRED before onboarding"
 *   - "Idempotency: onboarding … re-runnable"
 *
 * Handlers are called directly against a real database; only the identity is
 * faked (see helpers/testApp.ts).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { uuidv7 } from '@learnarena/core';
import { users } from '@learnarena/db/schema';
import { GET as getMe } from '@/app/api/me/route';
import { POST as postOnboarding } from '@/app/api/me/onboarding/route';
import { GET as getCategories } from '@/app/api/categories/route';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';

let ctx: WebTestContext;
let authUserId: string;

beforeAll(async () => {
  ctx = await createWebTestContext('api');
});

afterAll(async () => {
  await ctx?.teardown();
});

beforeEach(async () => {
  // A fresh Supabase auth id per test, so each starts pre-onboarding.
  authUserId = uuidv7();
  ctx.signInAs(authUserId);
});

async function userCount(): Promise<number> {
  const [row] = await ctx.db.select({ n: count() }).from(users);
  return row!.n;
}

describe('GET /api/me', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    ctx.signInAs(null);

    const result = await readResponse(await getMe(jsonRequest('/api/me')));

    expect(result.status).toBe(401);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('reports onboarded: false before onboarding', async () => {
    const result = await readResponse<{ onboarded: boolean }>(await getMe(jsonRequest('/api/me')));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ onboarded: false });
  });

  it('returns the profile once onboarding is complete', async () => {
    await postOnboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'me_profile' }),
      }),
    );

    const result = await readResponse<{
      onboarded: boolean;
      profile: Record<string, unknown>;
      streak: null;
      weeklyPoints: number;
    }>(await getMe(jsonRequest('/api/me')));

    expect(result.status).toBe(200);
    expect(result.body.onboarded).toBe(true);
    expect(result.body.profile).toMatchObject({
      userId: authUserId,
      username: 'me_profile',
      displayName: 'Alex',
      timezone: 'Australia/Melbourne',
      totalPoints: 0,
    });
    // Phase 1 and 2 fill these in.
    expect(result.body.streak).toMatchObject({
      currentLen: 0,
      displayState: 'BROKEN',
      freezesAvailable: 0,
    });
    expect(result.body.weeklyPoints).toBe(0);
  });

  it('never returns the user email (§19.4 data minimisation)', async () => {
    await postOnboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'minimal_user' }),
      }),
    );

    const response = await getMe(jsonRequest('/api/me'));
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/email/i);
    expect(text).not.toMatch(/@/);
  });

  it('carries a request id on every response (§23.1)', async () => {
    const result = await readResponse(await getMe(jsonRequest('/api/me')));
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a caller-supplied request id, so a trace spans client and server', async () => {
    const requestId = uuidv7();
    const result = await readResponse(
      await getMe(jsonRequest('/api/me', { headers: { 'x-request-id': requestId } })),
    );
    expect(result.requestId).toBe(requestId);
  });
});

describe('POST /api/me/onboarding', () => {
  it('requires a session', async () => {
    ctx.signInAs(null);

    const result = await readResponse(
      await postOnboarding(
        jsonRequest('/api/me/onboarding', { method: 'POST', body: onboardingBody() }),
      ),
    );

    expect(result.status).toBe(401);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('creates the profile and reports created: true', async () => {
    const result = await readResponse<{ profile: { username: string }; created: boolean }>(
      await postOnboarding(
        jsonRequest('/api/me/onboarding', {
          method: 'POST',
          body: onboardingBody({ username: 'new_user_1' }),
        }),
      ),
    );

    expect(result.status).toBe(200);
    expect(result.body.created).toBe(true);
    expect(result.body.profile.username).toBe('new_user_1');
  });

  it('normalises the username to lowercase', async () => {
    const result = await readResponse<{ profile: { username: string } }>(
      await postOnboarding(
        jsonRequest('/api/me/onboarding', {
          method: 'POST',
          body: onboardingBody({ username: '  Mixed_Case_1  ' }),
        }),
      ),
    );

    expect(result.body.profile.username).toBe('mixed_case_1');
  });

  it('canonicalises the timezone spelling before storing it', async () => {
    // The browser's ICU may disagree with the server's about alias spellings;
    // whatever arrives must come back as one canonical value.
    const result = await readResponse<{ profile: { timezone: string } }>(
      await postOnboarding(
        jsonRequest('/api/me/onboarding', {
          method: 'POST',
          body: onboardingBody({ username: 'tz_user_1', timezone: 'australia/melbourne' }),
        }),
      ),
    );

    expect(result.body.profile.timezone).toBe('Australia/Melbourne');
  });

  describe('validation (§16.1 INVALID_INPUT)', () => {
    it.each([
      ['a username shorter than 3', { username: 'ab' }],
      ['a username longer than 20', { username: 'a'.repeat(21) }],
      ['a username with a hyphen', { username: 'alex-01' }],
      ['a username with a space', { username: 'alex 01' }],
      ['an empty display name', { displayName: '   ' }],
      ['a display name over 40 characters', { displayName: 'A'.repeat(41) }],
      ['an unrecognised timezone', { timezone: 'Mars/Phobos' }],
      ['a fixed-offset timezone', { timezone: '+10:00' }],
      ['ageConfirmed: false', { ageConfirmed: false }],
    ])('rejects %s', async (_label, override) => {
      const before = await userCount();

      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody(override),
          }),
        ),
      );

      expect(result.status).toBe(400);
      expect(result.code).toBe('INVALID_INPUT');
      expect(await userCount()).toBe(before);
    });

    it('rejects a missing ageConfirmed', async () => {
      const body = onboardingBody();
      delete (body as Record<string, unknown>).ageConfirmed;

      const result = await readResponse(
        await postOnboarding(jsonRequest('/api/me/onboarding', { method: 'POST', body })),
      );

      expect(result.code).toBe('INVALID_INPUT');
    });

    it('names the offending field so the form can highlight it', async () => {
      const result = await readResponse<{
        error: { details: { issues: { path: string }[] } };
      }>(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'ab' }),
          }),
        ),
      );

      expect(result.body.error.details.issues[0]?.path).toBe('username');
    });

    it('rejects a body that is not valid JSON', async () => {
      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', { method: 'POST', rawBody: '{ not json' }),
        ),
      );

      expect(result.status).toBe(400);
      expect(result.code).toBe('INVALID_INPUT');
    });
  });

  // §24: "is idempotent (repeat with same data → 200, no duplicate rows)".
  describe('idempotency (§16.2)', () => {
    it('returns 200 and leaves exactly one row when repeated with the same data', async () => {
      const body = onboardingBody({ username: 'idem_user_1' });
      const before = await userCount();

      const first = await readResponse<{ created: boolean; profile: unknown }>(
        await postOnboarding(jsonRequest('/api/me/onboarding', { method: 'POST', body })),
      );
      const second = await readResponse<{ created: boolean; profile: unknown }>(
        await postOnboarding(jsonRequest('/api/me/onboarding', { method: 'POST', body })),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.created).toBe(true);
      expect(second.body.created).toBe(false);
      expect(second.body.profile).toEqual(first.body.profile);
      expect(await userCount()).toBe(before + 1);
    });

    it('returns the stored profile unchanged when the repeat sends different data (ADR-023)', async () => {
      const first = await readResponse<{ profile: { username: string; displayName: string } }>(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'stable_user', displayName: 'First' }),
          }),
        ),
      );

      const second = await readResponse<{
        profile: { username: string; displayName: string };
        created: boolean;
      }>(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'other_name', displayName: 'Second' }),
          }),
        ),
      );

      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.profile).toEqual(first.body.profile);

      const stored = await ctx.db.select().from(users).where(eq(users.id, authUserId));
      expect(stored[0]?.displayName).toBe('First');
      expect(stored[0]?.username).toBe('stable_user');
    });

    it('survives concurrent submissions, creating one row', async () => {
      const body = onboardingBody({ username: 'concurrent_1' });
      const before = await userCount();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          postOnboarding(jsonRequest('/api/me/onboarding', { method: 'POST', body })),
        ),
      );
      const results = await Promise.all(responses.map((r) => readResponse(r)));

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await userCount()).toBe(before + 1);
    });
  });

  describe('username conflicts', () => {
    it('returns 409 USERNAME_TAKEN when another user holds the name', async () => {
      await postOnboarding(
        jsonRequest('/api/me/onboarding', {
          method: 'POST',
          body: onboardingBody({ username: 'taken_name' }),
        }),
      );

      // A different auth identity claiming the same username.
      ctx.signInAs(uuidv7());
      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'taken_name' }),
          }),
        ),
      );

      expect(result.status).toBe(409);
      expect(result.code).toBe('USERNAME_TAKEN');
    });

    it('treats a different casing as the same username (citext)', async () => {
      await postOnboarding(
        jsonRequest('/api/me/onboarding', {
          method: 'POST',
          body: onboardingBody({ username: 'case_clash' }),
        }),
      );

      ctx.signInAs(uuidv7());
      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'Case_Clash' }),
          }),
        ),
      );

      expect(result.code).toBe('USERNAME_TAKEN');
    });
  });

  describe('request hardening (§19.1)', () => {
    it('rejects a body larger than 16 KB with PAYLOAD_TOO_LARGE', async () => {
      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ displayName: 'A'.repeat(20_000) }),
          }),
        ),
      );

      expect(result.status).toBe(413);
      expect(result.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects a cross-site Origin on a mutating request', async () => {
      const before = await userCount();

      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'csrf_test' }),
            origin: 'https://evil.example',
          }),
        ),
      );

      expect(result.status).toBe(403);
      expect(result.code).toBe('FORBIDDEN');
      expect(await userCount()).toBe(before);
    });

    it('allows a request with no Origin header at all', async () => {
      // SameSite=Lax cookies already prevent the cross-site case, and some
      // same-origin clients omit the header.
      const result = await readResponse(
        await postOnboarding(
          jsonRequest('/api/me/onboarding', {
            method: 'POST',
            body: onboardingBody({ username: 'no_origin' }),
            origin: null,
          }),
        ),
      );

      expect(result.status).toBe(200);
    });
  });
});

// §24: "gameplay routes return ONBOARDING_REQUIRED before onboarding" (ADR-027).
describe('GET /api/categories', () => {
  it('returns 401 without a session', async () => {
    ctx.signInAs(null);

    const result = await readResponse(await getCategories(jsonRequest('/api/categories')));

    expect(result.status).toBe(401);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 ONBOARDING_REQUIRED for a signed-in user without a profile', async () => {
    const result = await readResponse(await getCategories(jsonRequest('/api/categories')));

    expect(result.status).toBe(403);
    expect(result.code).toBe('ONBOARDING_REQUIRED');
  });

  it('returns the launch categories with live question counts once onboarded', async () => {
    await postOnboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'cat_reader' }),
      }),
    );

    const result = await readResponse<{
      categories: { slug: string; name: string; liveQuestionCount: number }[];
    }>(await getCategories(jsonRequest('/api/categories')));

    expect(result.status).toBe(200);
    expect(result.body.categories.map((c) => c.slug)).toEqual([
      'logic',
      'math',
      'memory',
      'science',
    ]);
    for (const category of result.body.categories) {
      expect(category.liveQuestionCount, category.slug).toBe(category.slug === 'memory' ? 0 : 15);
    }
  });

  it('omits deferred categories (ADR-036)', async () => {
    await postOnboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'cat_reader_2' }),
      }),
    );

    const result = await readResponse<{ categories: { slug: string }[] }>(
      await getCategories(jsonRequest('/api/categories')),
    );

    const slugs = result.body.categories.map((c) => c.slug);
    expect(slugs).toContain('memory');
    expect(slugs).not.toContain('language');
    expect(slugs).not.toContain('history');
  });
});
