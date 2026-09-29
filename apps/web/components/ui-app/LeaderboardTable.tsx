import type { LeaderboardResponse } from '@learnarena/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function LeaderboardTable({
  board,
  countdown,
}: {
  board: LeaderboardResponse;
  countdown: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This week’s learners</CardTitle>
        <p className="text-sm text-muted-foreground">
          {board.week} · New week in {countdown}
        </p>
      </CardHeader>
      <CardContent>
        {board.degraded ? (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            Showing verified scores from our database.
          </p>
        ) : null}
        {board.me ? (
          <p className="mb-4 font-medium">
            Your rank: #{board.me.rank} · {board.me.points.toLocaleString()} points
          </p>
        ) : (
          <p className="mb-4">Complete a session to join the board.</p>
        )}
        {board.entries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Rank</th>
                  <th className="p-3">Learner</th>
                  <th className="p-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((row) => (
                  <tr key={row.userId} className="border-b">
                    <td className="p-3">{row.rank}</td>
                    <td className="p-3">
                      <strong>{row.displayName}</strong>
                      <span className="block text-muted-foreground">@{row.username}</span>
                    </td>
                    <td className="p-3 text-right">{row.points.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No points this week yet. Be the first to practice.</p>
        )}
      </CardContent>
    </Card>
  );
}
