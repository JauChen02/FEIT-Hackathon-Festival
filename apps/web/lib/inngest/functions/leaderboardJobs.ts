import { weekKeyUtc, systemClock } from '@learnarena/core';
import { findSessionById } from '@learnarena/db';
import { db } from '../../db';
import { projectUser, rebuildWeek } from '../../leaderboards/service';
import { inngest } from '../client';
export const projectLeaderboardUser = inngest.createFunction(
  {
    id: 'leaderboard-project-user',
    name: 'leaderboard/project-user',
    retries: 5,
    concurrency: { key: 'event.data.userId', limit: 1 },
    triggers: [{ event: 'session/terminal' }],
  },
  async ({ event, step }) => {
    await step.run('project', async () => {
      const session = await findSessionById(db(), event.data.sessionId);
      if (session?.status === 'COMPLETED' && session.endedAt)
        await projectUser(weekKeyUtc(session.endedAt), event.data.userId);
    });
  },
);
export const rebuildLeaderboardWeek = inngest.createFunction(
  {
    id: 'leaderboard-rebuild-week',
    name: 'leaderboard/rebuild-week',
    retries: 5,
    triggers: [{ event: 'leaderboard/rebuild-week' }, { cron: '15 * * * *' }],
  },
  async ({ event, step }) =>
    step.run('rebuild', () =>
      rebuildWeek(
        'week' in event.data && typeof event.data.week === 'string'
          ? event.data.week
          : weekKeyUtc(systemClock.now()),
      ),
    ),
);
export const leaderboardFunctions = [projectLeaderboardUser, rebuildLeaderboardWeek];
