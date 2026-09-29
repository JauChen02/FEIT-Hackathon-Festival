import { expect, test } from '@playwright/test';
import { onboard } from './helpers/quiz';
test('memory recall is playable through results', async ({ page, context }) => {
  let time = Date.parse('2026-09-30T12:00:00Z');
  await page.clock.install({ time: new Date(time) });
  await context.setExtraHTTPHeaders({ 'x-test-clock': new Date(time).toISOString() });
  await onboard(page, { usernamePrefix: 'memory' });
  await page.goto('/games');
  await page.getByTestId('play-memory_match').click();
  for (let round = 0; round < 5; round++) {
    const sequence = await page.getByTestId('memory-sequence').innerText();
    time += 10000;
    await context.setExtraHTTPHeaders({ 'x-test-clock': new Date(time).toISOString() });
    await page.clock.fastForward(10000);
    await page.getByLabel('Your answer').fill(sequence);
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByTestId('activity-feedback')).toContainText('Well done!');
    await page
      .getByRole('button', { name: round === 4 ? 'See results' : 'Next', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByTestId('final-points')).toBeVisible();
});
test('a dialogue choice gives feedback and a best-ending result', async ({ page }) => {
  await onboard(page, { usernamePrefix: 'dialogue' });
  await page.goto('/games');
  await page.getByTestId('play-lab-safety').click();
  await page.getByRole('button', { name: 'Step back and notify the supervisor.' }).click();
  await expect(page.getByTestId('activity-feedback')).toContainText('isolate the hazard');
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page).toHaveURL(/\/results\//);
});
test('speed math ends after the server sprint deadline', async ({ page, context }) => {
  const time = Date.parse('2026-09-30T12:00:00Z');
  await page.clock.install({ time: new Date(time) });
  await context.setExtraHTTPHeaders({ 'x-test-clock': new Date(time).toISOString() });
  await onboard(page, { usernamePrefix: 'sprint' });
  await page.goto('/games');
  await page.getByTestId('play-speed_math').click();
  await page.getByLabel('Your answer').fill('1');
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByTestId('activity-feedback')).toBeVisible();
  await context.setExtraHTTPHeaders({ 'x-test-clock': new Date(time + 61000).toISOString() });
  await page.clock.fastForward(61000);
  await page.getByRole('button', { name: 'Finish sprint' }).click();
  await expect(page).toHaveURL(/\/results\//);
});
