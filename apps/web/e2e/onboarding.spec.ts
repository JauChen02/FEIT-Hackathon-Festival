import { expect, test } from '@playwright/test';
import { signInViaMagicLink, uniqueEmail, uniqueUsername } from './helpers/auth';

/**
 * The Phase 0 user journey (PLANNING.md §22.3, §24).
 *
 * Acceptance criterion: "a new user can sign up, is forced through onboarding,
 * and lands on a Home placeholder; onboarding rejects taken usernames and
 * invalid IANA timezones."
 *
 * This runs against the real Next.js build and the real Supabase Auth stack —
 * the one part the integration tests fake.
 */

test.describe('sign up → onboarding → Home', () => {
  test('an anonymous visitor is sent to sign-in', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in to LearnArena' })).toBeVisible();
  });

  test('the sign-in page offers both magic link and Google', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('a verified new user is forced through onboarding before Home', async ({ page }) => {
    await signInViaMagicLink(page, uniqueEmail());

    // The callback sends a user with no profile straight to onboarding.
    await expect(page).toHaveURL(/\/onboarding$/);

    // And trying to skip ahead bounces back.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('completing onboarding lands on Home with the profile and categories', async ({ page }) => {
    const username = uniqueUsername();
    await signInViaMagicLink(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill('Alex Example');
    await page.getByLabel('Timezone').selectOption('Australia/Melbourne');
    await page.getByLabel('I confirm I am 16 or older.').check();
    await page.getByRole('button', { name: 'Start learning' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('home-greeting')).toContainText('Alex Example');
    await expect(page.getByText(username)).toBeVisible();
    await expect(page.getByTestId('total-points')).toHaveText('0');

    // §16.2: launch categories with their live-question counts (ADR-036 keeps
    // the deferred ones out). Phase 1 moved these into the category picker,
    // where they double as the buttons that start a quiz.
    for (const slug of ['math', 'logic', 'science']) {
      await expect(page.getByTestId(`start-${slug}`)).toContainText('15 questions');
    }
    await expect(page.getByTestId('start-memory')).toHaveCount(0);
  });

  test('progress persists across a reload and a fresh navigation', async ({ page }) => {
    const username = uniqueUsername();
    await signInViaMagicLink(page, uniqueEmail());

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill('Persisted User');
    await page.getByLabel('I confirm I am 16 or older.').check();
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.reload();
    await expect(page.getByTestId('home-greeting')).toContainText('Persisted User');

    // Returning to the root now resolves to Home, not onboarding.
    await page.goto('/');
    await expect(page).toHaveURL(/\/home$/);

    // And onboarding is no longer reachable.
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/home$/);
  });
});

test.describe('onboarding validation', () => {
  test('rejects a username that is already taken', async ({ page, context }) => {
    const username = uniqueUsername('dup');

    // First user claims the name.
    await signInViaMagicLink(page, uniqueEmail());
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill('First Owner');
    await page.getByLabel('I confirm I am 16 or older.').check();
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page).toHaveURL(/\/home$/);

    // A second, unrelated account tries the same name.
    await context.clearCookies();
    const second = await context.newPage();
    await signInViaMagicLink(second, uniqueEmail());
    await second.getByLabel('Username').fill(username);
    await second.getByLabel('Display name').fill('Second Owner');
    await second.getByLabel('I confirm I am 16 or older.').check();
    await second.getByRole('button', { name: 'Start learning' }).click();

    await expect(second.getByTestId('username-error')).toContainText('already taken');
    await expect(second).toHaveURL(/\/onboarding$/);

    // The name is still free to correct.
    await second.getByLabel('Username').fill(uniqueUsername('ok'));
    await second.getByRole('button', { name: 'Start learning' }).click();
    await expect(second).toHaveURL(/\/home$/);
    await second.close();
  });

  test('rejects an invalid IANA timezone submitted directly to the API', async ({ page }) => {
    // The picker only offers valid zones, so the invalid case is exercised at
    // the API, which is where the rule is actually enforced (§16.1).
    await signInViaMagicLink(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding$/);

    const result = await page.evaluate(async (username) => {
      const response = await fetch('/api/me/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName: 'Bad Timezone',
          timezone: 'Mars/Phobos',
          ageConfirmed: true,
        }),
      });
      return { status: response.status, body: await response.json() };
    }, uniqueUsername('tz'));

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('INVALID_INPUT');
    expect(result.body.error.details.issues[0].path).toBe('timezone');
  });

  test('will not submit without the age confirmation', async ({ page }) => {
    await signInViaMagicLink(page, uniqueEmail());

    await page.getByLabel('Username').fill(uniqueUsername('age'));
    await page.getByLabel('Display name').fill('No Age Confirm');
    await page.getByRole('button', { name: 'Start learning' }).click();

    // The checkbox is required, so the browser blocks submission entirely.
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel('I confirm I am 16 or older.')).not.toBeChecked();
  });
});

test.describe('API guards', () => {
  test('GET /api/me returns 401 with no session', async ({ request }) => {
    const response = await request.get('/api/me');
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('gameplay routes return ONBOARDING_REQUIRED before onboarding', async ({ page }) => {
    await signInViaMagicLink(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding$/);

    const result = await page.evaluate(async () => {
      const response = await fetch('/api/categories');
      return { status: response.status, body: await response.json() };
    });

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ONBOARDING_REQUIRED');
  });
});
