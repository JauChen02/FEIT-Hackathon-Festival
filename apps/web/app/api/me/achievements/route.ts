import { and, eq } from 'drizzle-orm';
import { achievements, userAchievements } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const GET = route({ name: 'GET /api/me/achievements' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  return ok(
    {
      achievements: await db()
        .select({
          id: achievements.id,
          name: achievements.name,
          description: achievements.description,
          earnedAt: userAchievements.earnedAt,
        })
        .from(achievements)
        .leftJoin(
          userAchievements,
          and(
            eq(userAchievements.achievementId, achievements.id),
            eq(userAchievements.userId, user.id),
          ),
        ),
    },
    requestId,
  );
});
