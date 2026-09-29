import { expect, type Page } from '@playwright/test';
import { signInViaMagicLink, uniqueEmail, uniqueUsername } from './auth';

/**
 * The shared parts of the §22.3 end-to-end journeys.
 *
 * Both the Phase 1 quiz spec and the Phase 3 coach spec need a fresh onboarded
 * learner and a completed quiz, so they live here rather than being copied.
 */

export interface OnboardOptions {
  usernamePrefix?: string;
  displayName?: string;
}

/** Sign up and complete onboarding, landing on Home. */
export async function onboard(page: Page, options: OnboardOptions = {}): Promise<void> {
  const { usernamePrefix = 'e2e', displayName = 'Quiz Player' } = options;

  await signInViaMagicLink(page, uniqueEmail());
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Username').fill(uniqueUsername(usernamePrefix));
  await page.getByLabel('Display name').fill(displayName);
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
export async function answerCurrentQuestion(page: Page): Promise<void> {
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

/**
 * Play all ten questions and land on the results screen.
 *
 * The tenth "continue" is what completes the session (its label reads "See
 * results"), so there is no separate finish click on the happy path.
 */
export async function playWholeQuiz(page: Page): Promise<void> {
  // Alpha recommendations may lead to memory, which shares the completion flow.
  await expect(
    page.getByTestId('question-prompt').or(page.getByTestId('memory-sequence')),
  ).toBeVisible();
  if (await page.getByTestId('memory-sequence').isVisible()) {
    for (let round = 0; round < 5; round++) {
      const sequence = await page.getByTestId('memory-sequence').innerText();
      await expect(page.getByTestId('memory-sequence')).toHaveCount(0);
      await page.getByLabel('Your answer').fill(sequence);
      await page.getByRole('button', { name: 'Check answer' }).click();
      await expect(page.getByTestId('activity-feedback')).toBeVisible();
      await page
        .getByRole('button', { name: round === 4 ? 'See results' : 'Next', exact: true })
        .click();
    }
    await expect(page).toHaveURL(/\/results\//);
    return;
  }
  for (let i = 0; i < 10; i += 1) {
    await answerCurrentQuestion(page);
    await page.getByTestId('continue').click();
  }
  await expect(page).toHaveURL(/\/results\//);
}
