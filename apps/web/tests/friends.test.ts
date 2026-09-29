import { afterAll, beforeAll, expect, it } from 'vitest';
import { FixedClock, uuidv7 } from '@learnarena/core';
import {
  requestFriend,
  changeFriendRequest,
  blockUser,
  unblockUser,
  listFriends,
  createFriendInvite,
  redeemFriendInvite,
} from '@learnarena/db';
import { POST as onboarding } from '@/app/api/me/onboarding/route';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  type WebTestContext,
} from './helpers/testApp';
let ctx: WebTestContext;
const clock = new FixedClock('2026-09-30T12:00:00Z');
const ids: string[] = [];
beforeAll(async () => {
  ctx = await createWebTestContext('friends');
  for (let i = 0; i < 3; i++) {
    const id = uuidv7();
    ids.push(id);
    ctx.signInAs(id);
    await onboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: `social_user${i}` }),
      }),
    );
  }
});
afterAll(async () => {
  await ctx?.teardown();
});
it('serializes crossed requests, limits actor transitions, and preserves blocking privacy', async () => {
  const [a, b] = ids as [string, string, string];
  const rows = await Promise.all([
    ctx.db.transaction((tx) => requestFriend(tx, a, 'social_user1', clock.now())),
    ctx.db.transaction((tx) => requestFriend(tx, b, 'social_user0', clock.now())),
  ]);
  expect(rows[0].id).toBe(rows[1].id);
  const sender = rows[0].requestedBy,
    recipient = sender === a ? b : a;
  await expect(
    ctx.db.transaction((tx) => changeFriendRequest(tx, sender, rows[0].id, 'accept', clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await ctx.db.transaction((tx) =>
    changeFriendRequest(tx, recipient, rows[0].id, 'decline', clock.now()),
  );
  await expect(
    ctx.db.transaction((tx) => requestFriend(tx, a, 'social_user1', clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  clock.advanceDays(1);
  const next = await ctx.db.transaction((tx) => requestFriend(tx, a, 'social_user1', clock.now()));
  await ctx.db.transaction((tx) => changeFriendRequest(tx, b, next.id, 'accept', clock.now()));
  expect((await listFriends(ctx.db, a)).friends).toHaveLength(1);
  await ctx.db.transaction((tx) => blockUser(tx, a, b, clock.now()));
  expect((await listFriends(ctx.db, b)).friends).toHaveLength(0);
  expect((await listFriends(ctx.db, b)).blocked).toHaveLength(0);
  await expect(
    ctx.db.transaction((tx) => requestFriend(tx, b, 'social_user0', clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    ctx.db.transaction((tx) => requestFriend(tx, a, 'social_user1', clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await ctx.db.transaction((tx) => unblockUser(tx, a, b));
  expect((await listFriends(ctx.db, a)).friends).toHaveLength(0);
});
it('single-use invites retry safely and never admit a second recipient', async () => {
  const [a, b, c] = ids as [string, string, string];
  const invite = await createFriendInvite(ctx.db, a, 'test_invite_secret_123456789', clock.now());
  const results = await Promise.all([
    ctx.db.transaction((tx) => redeemFriendInvite(tx, b, invite.code, clock.now())),
    ctx.db.transaction((tx) => redeemFriendInvite(tx, b, invite.code, clock.now())),
  ]);
  expect(results[0].id).toBe(results[1].id);
  await expect(
    ctx.db.transaction((tx) => redeemFriendInvite(tx, c, invite.code, clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  clock.advanceDays(8);
  await expect(
    ctx.db.transaction((tx) => redeemFriendInvite(tx, b, invite.code, clock.now())),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
