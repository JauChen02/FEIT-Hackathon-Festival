import { expect, test } from '@playwright/test';
import { onboard } from './helpers/quiz';
test('two browsers complete a co-op match and reload durable results', async ({
  browser,
  page,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext();
  const peer = await context.newPage();
  try {
    await onboard(page, { usernamePrefix: 'coop_a' });
    await onboard(peer, { usernamePrefix: 'coop_b' });
    await page.goto('/lobbies');
    await page.getByRole('button', { name: 'Create Co-op consensus room' }).click();
    await expect(page).toHaveURL(/\/lobbies\/[A-HJ-NP-Z2-9]{8}$/);
    const code = page.url().split('/').at(-1)!;
    await peer.goto('/lobbies');
    await peer.getByLabel('Room code').fill(code);
    await peer.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(peer.getByRole('button', { name: 'Ready to play' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Ready to play' })).toBeEnabled();
    await page.getByRole('button', { name: 'Ready to play' }).click();
    await peer.getByRole('button', { name: 'Ready to play' }).click();
    for (let i = 1; i <= 10; i++) {
      for (const player of [page, peer]) {
        await expect(player.getByText(`Round ${i} / 10`, { exact: true })).toBeVisible();
        await expect(player.getByTestId('match-question')).toBeVisible();
        const numeric = player.getByLabel('Answer', { exact: true });
        if (await numeric.isVisible()) await numeric.fill('42');
        else await player.getByRole('radio').first().check();
        await player.getByRole('button', { name: 'Submit vote' }).click();
      }
    }
    await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
    await expect(peer.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
  } finally {
    await context.close();
  }
});
