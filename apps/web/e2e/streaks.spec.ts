import { expect, test } from '@playwright/test';
import { onboard, playWholeQuiz } from './helpers/quiz';
test('streak persists, extends across local days, and celebrates day three', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'x-test-clock': '2026-10-01T12:00:00Z' });
  await onboard(page, { usernamePrefix: 'streak' });
  for (let day = 1; day <= 3; day++) {
    await context.setExtraHTTPHeaders({ 'x-test-clock': `2026-10-0${day}T12:00:00Z` });
    await page.goto('/home');
    await page.getByTestId('start-math').click();
    await playWholeQuiz(page);
    await expect(page.getByTestId('streak-card')).toContainText(`${day} day streak`);
    if (day === 3)
      await expect(page.getByTestId('streak-milestone')).toContainText('3-day milestone');
    await page.getByTestId('back-home').click();
    await expect(page.getByTestId('streak-card')).toContainText(`${day} day streak`);
    await expect(page.getByTestId('streak-state')).toContainText('Practiced today');
  }
});
