import { z } from 'zod';
export interface NarrationSnapshot {
  display_name: string;
  strengths: { category: string; proficiency: number }[];
  weaknesses: { category: string; proficiency: number; games_played: number }[];
  last_session: { game_type: string; accuracy: number; missed_sub_topics: string[] };
  recommendation: { category: string; game_type: string; bonus: string } | null;
}
export const narrationOutputSchema = z
  .object({
    sentences: z.array(z.string().min(5).max(180)).min(2).max(3),
    tip: z.string().min(5).max(180),
  })
  .strict();
/** Numbers are forbidden in generated prose: canonical numeric facts are displayed by the app. */
export function validateNarration(value: unknown): string | null {
  const result = narrationOutputSchema.safeParse(value);
  if (!result.success) return null;
  const message = `${result.data.sentences.join(' ')} Tip: ${result.data.tip}`;
  if (
    message.length > 400 ||
    /[\d%×]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|percent|double|triple)\b/i.test(
      message,
    )
  )
    return null;
  if (
    result.data.sentences.some(
      (s) => !/[.!?]$/.test(s.trim()) || s.match(/[.!?](?:\s|$)/g)?.length !== 1,
    )
  )
    return null;
  if (/https?:|<[^>]*>|\b(points|rating|rank|streak|awarded|earned|unlocked)\b/i.test(message))
    return null;
  return message;
}
export function templateNarration(snapshot: NarrationSnapshot) {
  const focus =
    snapshot.recommendation?.category ?? snapshot.weaknesses[0]?.category ?? 'your next topic';
  const strength = snapshot.strengths[0]?.category;
  const opening =
    snapshot.last_session.accuracy >= 0.8
      ? 'Your careful practice is paying off.'
      : snapshot.last_session.accuracy >= 0.5
        ? 'You are building useful understanding.'
        : 'Every attempt helps you see what to practise next.';
  return `${opening} ${strength ? `Keep building on your ${strength} practice.` : 'Give yourself room to learn at your own pace.'} Tip: Revisit a missed explanation, then try ${focus} again.`;
}
export function achievementIds(input: {
  skills: readonly { proficiency: number; confidence: number }[];
  completedRecommendations: number;
  friendDeathmatchWins: number;
}) {
  const result: string[] = [];
  if (input.skills.filter((s) => s.proficiency >= 70 && s.confidence >= 0.5).length >= 3)
    result.push('renaissance');
  if (input.completedRecommendations >= 10) result.push('weakness_slayer');
  if (input.friendDeathmatchWins >= 10) result.push('team_player');
  return result;
}
export function isQuietHour(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
