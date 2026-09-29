import { expect, test, type Page } from '@playwright/test';
import { drainCoachJobs } from './helpers/coach';
import { onboard as onboardLearner, playWholeQuiz } from './helpers/quiz';

/**
 * The Phase 3 journey (PLANNING.md §22.3, §24).
 *
 * "Home shows Focus card → start recommended quiz → complete → ×1.5 in
 *  breakdown → Skills page updates."
 *
 * Runs against the real Next.js build and the real Supabase Auth stack.
 */

function onboard(page: Page): Promise<void> {
  return onboardLearner(page, { usernamePrefix: 'p3', displayName: 'Coach Learner' });
}

test.describe('the Coach', () => {
  test('shows a Focus card with its bonus badge on Home', async ({ page }) => {
    await onboard(page);

    // §11.5: generated lazily on the first read of the learner's local date,
    // so simply loading Home is what creates it.
    await expect(page.getByTestId('focus-card')).toBeVisible();
    await expect(page.getByTestId('focus-bonus')).toHaveText('×1.5');
    await expect(page.getByTestId('focus-category')).not.toBeEmpty();
  });

  test('tags weak and recommended categories in the picker (§20 screen 4)', async ({ page }) => {
    await onboard(page);

    // A brand-new learner has played nothing, so every category scores exactly
    // 0.50 (§11.4) and is weak; the Coach's pick carries ×1.5 instead of ×1.25.
    await expect(page.getByTestId('focus-card')).toBeVisible();
    await expect(page.getByTestId('tier-math')).toBeVisible();
    await expect(page.getByTestId('tier-logic')).toBeVisible();
    await expect(page.getByTestId('tier-science')).toBeVisible();

    const tags = await page.getByTestId(/^tier-/).allTextContents();
    expect(tags.filter((tag) => tag.includes('×1.5'))).toHaveLength(1);
    expect(tags.filter((tag) => tag.includes('×1.25'))).toHaveLength(2);
  });

  test('starting from the Focus card earns ×1.5 in the breakdown', async ({ page }) => {
    await onboard(page);

    await expect(page.getByTestId('focus-card')).toBeVisible();
    const focusCategory = (await page.getByTestId('focus-category').textContent())!.trim();

    await page.getByTestId('start-focus').click();
    await expect(page).toHaveURL(/\/play\//);
    await playWholeQuiz(page);

    // §10.4: the breakdown teaches which behaviours are rewarded.
    await expect(page.getByTestId('breakdown-focus')).toHaveText('×1.5');
    await expect(page.getByTestId('final-points')).toBeVisible();

    // §11.5: the bonus is spent, but the card stays — it reads "Done today"
    // rather than vanishing, and the category is unchanged.
    await page.getByTestId('back-home').click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('focus-done')).toBeVisible();
    await expect(page.getByTestId('focus-category')).toHaveText(focusCategory);
    await expect(page.getByTestId('focus-bonus')).toHaveCount(0);
  });

  test('the Skills page updates after a session', async ({ page }) => {
    await onboard(page);

    // Before: nothing played, so every category sits at the 1000-rating
    // midpoint — proficiency (1000 − 600) / 8 = 50.
    await page.getByTestId('home-skills-link').click();
    await expect(page).toHaveURL(/\/skills$/);
    await expect(page.getByTestId('skill-radar')).toBeVisible();
    await expect(page.getByTestId('proficiency-math')).toHaveText('50/100');
    await expect(page.getByTestId('strengths-empty')).toBeVisible();

    await page.getByTestId('skills-home-link').click();
    await expect(page).toHaveURL(/\/home$/);
    await page.getByTestId('start-math').click();
    await expect(page).toHaveURL(/\/play\//);
    await playWholeQuiz(page);

    // §18.3 defers the Elo updates to coach/process-session.
    await drainCoachJobs();

    // After: the rating has moved, so the derived proficiency is no longer the
    // 50 midpoint and the category no longer reads as unplayed (§11.4).
    await page.getByTestId('view-skills').click();
    await expect(page).toHaveURL(/\/skills$/);
    await expect(page.getByTestId('skill-math')).toContainText('questions answered');
    await expect(page.getByTestId('proficiency-math')).not.toHaveText('50/100');
    await expect(page.getByTestId('history-math')).toBeVisible();
  });

  test('the results screen resolves its skill deltas', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);

    // §18.3 runs the Coach after the commit, so the deltas are not ready when
    // the results screen first renders — §20 screen 6 asks for a pending state
    // rather than a blocked page.
    await expect(page.getByTestId('skill-deltas-pending')).toBeVisible();
    await expect(page.getByTestId('final-points')).toBeVisible();

    await drainCoachJobs();

    await page.reload();
    await expect(page.getByTestId('skill-deltas')).toBeVisible();
    await expect(page.getByTestId('skill-delta-math')).toBeVisible();
  });

  test('shows every launch category on the radar and no deferred ones', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('home-skills-link').click();
    await expect(page).toHaveURL(/\/skills$/);

    for (const slug of ['math', 'logic', 'science', 'memory']) {
      await expect(page.getByTestId(`skill-${slug}`)).toBeVisible();
    }
    // ADR-036: deferred categories are seeded but never shown.
    await expect(page.getByTestId('skill-language')).toHaveCount(0);
  });
});
