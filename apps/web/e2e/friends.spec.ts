import { expect, test } from '@playwright/test';
import { onboard } from './helpers/quiz';
test('two learners accept a request, share a board, and block privately', async ({
  browser,
  page,
}) => {
  const second = await browser.newContext();
  const peer = await second.newPage();
  try {
    await onboard(page, { usernamePrefix: 'friend_a', displayName: 'Friend Alice' });
    await onboard(peer, { usernamePrefix: 'friend_b', displayName: 'Friend Bob' });
    const me = await (await peer.request.get('/api/me')).json();
    await page.goto('/friends');
    await page.getByLabel('Username', { exact: true }).fill(me.profile.username);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request sent', { exact: false })).toBeVisible();
    await peer.goto('/friends');
    await peer.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(peer.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Friend Bob' })).toBeVisible();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unblock', exact: true })).toBeVisible();
    await peer.reload();
    await expect(peer.getByText('No friends yet.', { exact: false })).toBeVisible();
    await expect(peer.getByText('You have no blocked users.')).toBeVisible();
  } finally {
    await second.close();
  }
});
