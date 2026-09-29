import { LeaderboardEntry } from "@/types";

// Mock global leaderboard — in production this would be from Supabase
const MOCK_GLOBAL: LeaderboardEntry[] = [
  { rank: 1, userId: "u1", displayName: "ShadowFox", avatar: "🦊", totalXP: 980, streak: 12, completedScenarios: 8, accuracy: 94 },
  { rank: 2, userId: "u2", displayName: "NightOwl", avatar: "🦅", totalXP: 860, streak: 7, completedScenarios: 7, accuracy: 89 },
  { rank: 3, userId: "u3", displayName: "DataDragon", avatar: "🐉", totalXP: 740, streak: 5, completedScenarios: 6, accuracy: 91 },
  { rank: 4, userId: "u4", displayName: "CipherWolf", avatar: "🐺", totalXP: 620, streak: 9, completedScenarios: 5, accuracy: 87 },
  { rank: 5, userId: "u5", displayName: "BinaryBear", avatar: "🦁", totalXP: 500, streak: 3, completedScenarios: 5, accuracy: 80 },
  { rank: 6, userId: "u6", displayName: "NetNinja", avatar: "🐬", totalXP: 410, streak: 4, completedScenarios: 4, accuracy: 83 },
  { rank: 7, userId: "u7", displayName: "PacketPro", avatar: "🦋", totalXP: 340, streak: 2, completedScenarios: 3, accuracy: 76 },
  { rank: 8, userId: "u8", displayName: "ZeroDay", avatar: "🦄", totalXP: 280, streak: 1, completedScenarios: 3, accuracy: 73 },
  { rank: 9, userId: "u9", displayName: "HashHound", avatar: "🐙", totalXP: 200, streak: 0, completedScenarios: 2, accuracy: 70 },
  { rank: 10, userId: "u10", displayName: "FirewallFin", avatar: "🦈", totalXP: 150, streak: 0, completedScenarios: 2, accuracy: 67 },
];

export function getGlobalLeaderboard(): LeaderboardEntry[] {
  return MOCK_GLOBAL;
}

export function insertUserIntoLeaderboard(
  entries: LeaderboardEntry[],
  userId: string,
  displayName: string,
  avatar: string,
  totalXP: number,
  streak: number,
  completedScenarios: number,
  accuracy: number
): LeaderboardEntry[] {
  // Remove any existing entry for this user
  const filtered = entries.filter((e) => e.userId !== userId);
  filtered.push({ rank: 0, userId, displayName, avatar, totalXP, streak, completedScenarios, accuracy, isCurrentUser: true });
  // Sort by XP
  filtered.sort((a, b) => b.totalXP - a.totalXP);
  // Re-rank
  return filtered.map((e, i) => ({ ...e, rank: i + 1 }));
}
