import { acceptedFriendIds } from '@learnarena/db';
import { db } from '@/lib/db';
import { z } from 'zod';
import { AppError, weekKeyUtc } from '@learnarena/core';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { now } from '@/lib/sessions/context';
import { readLeaderboard } from '@/lib/leaderboards/service';
const querySchema = z.object({
  scope: z.enum(['global', 'friends']).default('global'),
  week: z
    .string()
    .regex(/^(current|\d{4}-W(0[1-9]|[1-4]\d|5[0-3]))$/)
    .default('current'),
});
export const GET = route(
  { name: 'GET /api/leaderboards' },
  async ({ request, query, requestId }) => {
    const { user } = await requireOnboarded(request);
    const parsed = querySchema.safeParse(Object.fromEntries(query));
    if (!parsed.success) throw new AppError('INVALID_INPUT');
    const at = now(request);
    const week = parsed.data.week === 'current' ? weekKeyUtc(at) : parsed.data.week;
    return ok(
      await readLeaderboard(
        week,
        user.id,
        at,
        parsed.data.scope === 'friends'
          ? [user.id, ...(await acceptedFriendIds(db(), user.id))]
          : undefined,
      ),
      requestId,
    );
  },
);
