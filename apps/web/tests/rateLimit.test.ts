import { expect, it, vi } from 'vitest';
vi.unmock('@/lib/security/rateLimit');
import { FixedClock, uuidv7 } from '@learnarena/core';
import { rateLimit } from '@/lib/security/rateLimit';
it('real Redis enforces the exact sliding window and permits the next window', async () => {
  const clock = new FixedClock('2026-09-30T12:00:00Z'),
    id = uuidv7();
  for (let i = 0; i < 5; i++) await rateLimit(id, 'answer', clock);
  await expect(rateLimit(id, 'answer', clock)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  clock.advanceMs(1000);
  await expect(rateLimit(id, 'answer', clock)).resolves.toBeUndefined();
});
it('Redis outage fails open for solo play and closed for social and lobby actions', async () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  try {
    await expect(rateLimit(uuidv7(), 'session')).resolves.toBeUndefined();
    await expect(rateLimit(uuidv7(), 'friend')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(rateLimit(uuidv7(), 'lobby')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  } finally {
    if (url) process.env.UPSTASH_REDIS_REST_URL = url;
  }
});
