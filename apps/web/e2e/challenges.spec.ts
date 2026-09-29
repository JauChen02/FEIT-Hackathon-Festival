import { expect, test } from '@playwright/test';
import { onboard, playWholeQuiz } from './helpers/quiz';
import { execFileSync } from 'node:child_process';
test('daily challenge awards a bonus once and appears on the leaderboard', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  execFileSync('pnpm', ['admin:daily-challenge', '2026-09-30'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
  await context.setExtraHTTPHeaders({ 'x-test-clock': '2026-09-30T12:00:00Z' });
  await onboard(page, { usernamePrefix: 'daily' });
  await page.getByTestId('start-daily-challenge').click();
  await playWholeQuiz(page);
  await expect(page.getByTestId('daily-bonus')).toHaveText(
    'Daily challenge complete: +100 bonus points',
  );
  await page.getByTestId('back-home').click();
  await expect(
    page.getByText('Daily bonus earned — replay for practice', { exact: false }),
  ).toBeVisible();
  await page.getByTestId('start-daily-challenge').click();
  await playWholeQuiz(page);
  await expect(page.getByTestId('daily-bonus')).toHaveCount(0);
  await page.goto('/leaderboard');
  await expect(page.getByText('Your rank:', { exact: false })).toBeVisible();
});
