import { expect, test, type Page } from '@playwright/test';
import { signInViaMagicLink, uniqueEmail, uniqueUsername } from './helpers/auth';

/**
 * The Phase 1 journey (PLANNING.md §22.3, §24).
 *
 * "Playwright: start quiz → answer all questions → complete → view results →
 *  reload → results persist."
 *
 * Runs against the real Next.js build and the real Supabase Auth stack.
 */

/** Sign up and complete onboarding, landing on Home. */
async function onboard(page: Page): Promise<void> {
  await signInViaMagicLink(page, uniqueEmail());
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Username').fill(uniqueUsername('p1'));
  await page.getByLabel('Display name').fill('Quiz Player');
  await page.getByLabel('I confirm I am 16 or older.').check();
  await page.getByRole('button', { name: 'Start learning' }).click();

  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Answer the question currently on screen.
 *
 * The client cannot know the right answer — that is the point of §8.1 — so
 * this picks the first option (or types a number) and lets the server grade.
 */
async function answerCurrentQuestion(page: Page): Promise<void> {
  await expect(page.getByTestId('question-prompt')).toBeVisible();

  const numericInput = page.getByTestId('numeric-answer');
  if (await numericInput.isVisible().catch(() => false)) {
    await numericInput.fill('42');
  } else {
    await page.getByTestId('option-a').click();
  }

  await page.getByTestId('submit-answer').click();
  await expect(page.getByTestId('answer-feedback')).toBeVisible();
}

/** Play all ten questions and land on the results screen. */
async function playWholeQuiz(page: Page): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await answerCurrentQuestion(page);
    await page.getByTestId('continue').click();
  }
  await expect(page).toHaveURL(/\/results\//);
}

test.describe('the solo quiz loop', () => {
  test('starts a quiz from Home and serves one question at a time', async ({ page }) => {
    await onboard(page);

    await expect(page.getByTestId('start-math')).toContainText('15 questions');
    await page.getByTestId('start-math').click();

    await expect(page).toHaveURL(/\/play\//);
    await expect(page.getByTestId('quiz-position')).toHaveText('Question 1 of 10');
    await expect(page.getByTestId('question-prompt')).toBeVisible();
    await expect(page.getByTestId('quiz-timer')).toBeVisible();

    // §8.1: one at a time — the next question is not on screen.
    await expect(page.getByTestId('question-prompt')).toHaveCount(1);
  });

  test('gives per-question feedback with the explanation', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await expect(page).toHaveURL(/\/play\//);

    await answerCurrentQuestion(page);

    const feedback = page.getByTestId('answer-feedback');
    await expect(feedback).toBeVisible();
    await expect(page.getByTestId('explanation')).not.toBeEmpty();

    // The grading response is where the answer key legitimately appears.
    const correct = await feedback.getAttribute('data-correct');
    if (correct === 'false') {
      await expect(page.getByTestId('correct-answer')).not.toBeEmpty();
    }
  });

  test('advances through all ten questions to the results screen', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await expect(page).toHaveURL(/\/play\//);

    for (let i = 0; i < 10; i += 1) {
      await expect(page.getByTestId('quiz-position')).toHaveText(`Question ${i + 1} of 10`);
      await answerCurrentQuestion(page);
      await page.getByTestId('continue').click();
    }

    await expect(page).toHaveURL(/\/results\//);
  });

  test('shows the points breakdown and the missed-question review', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);

    // §20 screen 6 / §10.4: the breakdown teaches what is rewarded.
    await expect(page.getByTestId('final-points')).toBeVisible();
    await expect(page.getByTestId('breakdown-base')).toBeVisible();
    await expect(page.getByTestId('breakdown-combo')).toBeVisible();

    // Answering every question with option "a" is virtually certain to miss
    // some, and every missed one must carry its explanation.
    const reviewItems = page.getByTestId('review-list').getByRole('listitem');
    const missed = await reviewItems.count();
    if (missed > 0) {
      await expect(page.getByTestId('review-explanation').first()).not.toBeEmpty();
      await expect(page.getByTestId('review-correct-answer').first()).not.toBeEmpty();
    }
  });

  test('results survive a page reload', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);

    const points = await page.getByTestId('final-points').textContent();
    const resultsUrl = page.url();

    await page.reload();

    await expect(page).toHaveURL(resultsUrl);
    await expect(page.getByTestId('final-points')).toHaveText(points!);

    // And navigating away and back gives the same frozen result.
    await page.goto('/home');
    await page.goto(resultsUrl);
    await expect(page.getByTestId('final-points')).toHaveText(points!);
  });

  test('lists the completed session in History and links back to its results', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);

    const points = await page.getByTestId('final-points').textContent();
    const resultsUrl = page.url();

    await page.getByTestId('view-history').click();
    await expect(page).toHaveURL(/\/history$/);

    const items = page.getByTestId('history-list').getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('math');

    await items.first().getByRole('link').click();
    await expect(page).toHaveURL(resultsUrl);
    await expect(page.getByTestId('final-points')).toHaveText(points!);
  });

  test('adds the points to the Home total', async ({ page }) => {
    await onboard(page);
    await expect(page.getByTestId('total-points')).toHaveText('0');

    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);
    const points = (await page.getByTestId('final-points').textContent())!;

    await page.getByTestId('back-home').click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('total-points')).toHaveText(points);
  });
});

test.describe('one open session at a time (§8.1)', () => {
  test('offers Resume or Abandon when a quiz is already in progress', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await expect(page).toHaveURL(/\/play\//);
    const playUrl = page.url();

    // Walk away and try to start a different category.
    await page.goto('/home');
    await page.getByTestId('start-logic').click();

    await expect(page.getByTestId('active-session-prompt')).toBeVisible();
    await page.getByTestId('resume-session').click();
    await expect(page).toHaveURL(playUrl);
  });

  test('abandoning frees the slot for a new quiz', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await expect(page).toHaveURL(/\/play\//);

    // Answer one so the session is ACTIVE rather than CREATED.
    await answerCurrentQuestion(page);

    await page.goto('/home');
    await page.getByTestId('start-logic').click();
    await expect(page.getByTestId('active-session-prompt')).toBeVisible();

    await page.getByTestId('discard-session').click();
    await expect(page.getByTestId('active-session-prompt')).toBeHidden();

    await page.getByTestId('start-logic').click();
    await expect(page).toHaveURL(/\/play\//);
    await expect(page.getByTestId('quiz-position')).toHaveText('Question 1 of 10');
  });

  test('abandoning from the quiz screen returns to Home with no points', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('start-math').click();
    await answerCurrentQuestion(page);
    await page.getByTestId('continue').click();

    await page.getByTestId('abandon-quiz').click();
    await expect(page).toHaveURL(/\/home$/);
    // §10.4: points are awarded only on COMPLETED.
    await expect(page.getByTestId('total-points')).toHaveText('0');
  });
});

test.describe('history', () => {
  test('is empty before anything is finished', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('home-history-link').click();

    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByText('You have not finished a quiz yet.')).toBeVisible();
  });
});
