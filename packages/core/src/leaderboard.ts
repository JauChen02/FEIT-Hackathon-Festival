export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  points: number;
  rank: number;
}
export function rankLeaderboard(
  rows: readonly Omit<LeaderboardEntry, 'rank'>[],
): LeaderboardEntry[] {
  let rank = 0;
  let previous: number | undefined;
  return [...rows]
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
    .map((row, index) => {
      if (previous !== row.points) rank = index + 1;
      previous = row.points;
      return { ...row, rank };
    });
}
export interface LeaderboardResponse {
  week: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  degraded: boolean;
  nextWeekAt: string;
}
export interface DailyChallengeResponse {
  challenge: {
    id: string;
    date: string;
    categorySlug: string;
    questionCount: number;
    bonusAvailable: boolean;
  } | null;
}
