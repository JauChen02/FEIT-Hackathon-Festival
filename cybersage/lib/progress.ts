import { UserProgress, ScenarioResult, LeaderboardEntry } from "@/types";

const STORAGE_KEY = "cybersage_progress_v2";

const AVATARS = ["🦊", "🐺", "🦅", "🐬", "🦁", "🐉", "🦋", "🦄", "🐙", "🦈"];

export const defaultProgress: UserProgress = {
  userId: generateId(),
  displayName: "Agent_" + Math.floor(Math.random() * 9999),
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  completedScenarios: [],
  totalXP: 0,
  correctAnswers: 0,
  totalAnswers: 0,
  skillScores: {
    "Social Engineering": 0,
    "Access Control": 0,
    "Incident Response": 0,
    "Network Security": 0,
  },
  badges: [],
  streak: 0,
  lastActiveDate: new Date().toISOString().split("T")[0],
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function loadProgress(): UserProgress {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const fresh = { ...defaultProgress, userId: generateId() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return JSON.parse(stored);
  } catch {
    return defaultProgress;
  }
}

export function saveProgress(progress: UserProgress): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function updateDisplayName(name: string): void {
  const p = loadProgress();
  saveProgress({ ...p, displayName: name });
}

export function applyResult(
  progress: UserProgress,
  result: ScenarioResult,
  category: string
): UserProgress {
  const updated = { ...progress };
  updated.totalXP += result.xpGained;
  updated.totalAnswers += 1;
  if (result.isCorrect) updated.correctAnswers += 1;
  if (!updated.completedScenarios.includes(result.scenarioId)) {
    updated.completedScenarios.push(result.scenarioId);
  }
  if (result.isCorrect && category) {
    updated.skillScores = {
      ...updated.skillScores,
      [category]: Math.min(100, (updated.skillScores[category] ?? 0) + 20),
    };
  }
  // Streak
  const today = new Date().toISOString().split("T")[0];
  const lastDate = updated.lastActiveDate;
  if (lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    updated.streak = lastDate === yesterday ? updated.streak + 1 : 1;
    updated.lastActiveDate = today;
  }
  updated.badges = computeBadges(updated);
  return updated;
}

export function computeBadges(progress: UserProgress): string[] {
  const badges: string[] = [];
  if (progress.totalXP >= 100) badges.push("first-blood");
  if (progress.totalXP >= 300) badges.push("rising-defender");
  if (progress.totalXP >= 500) badges.push("cyber-warrior");
  if (progress.correctAnswers >= 3) badges.push("hat-trick");
  if (progress.completedScenarios.length >= 3) badges.push("scenario-master");
  if (progress.streak >= 3) badges.push("on-fire");
  const accuracy = progress.totalAnswers > 0 ? progress.correctAnswers / progress.totalAnswers : 0;
  if (accuracy === 1 && progress.totalAnswers >= 3) badges.push("perfect-run");
  return badges;
}

export function getAccuracy(progress: UserProgress): number {
  if (progress.totalAnswers === 0) return 0;
  return Math.round((progress.correctAnswers / progress.totalAnswers) * 100);
}

export function getLevel(xp: number): { level: number; label: string; nextXP: number; prevXP: number } {
  if (xp < 100) return { level: 1, label: "Trainee", nextXP: 100, prevXP: 0 };
  if (xp < 300) return { level: 2, label: "Analyst", nextXP: 300, prevXP: 100 };
  if (xp < 600) return { level: 3, label: "Defender", nextXP: 600, prevXP: 300 };
  if (xp < 1000) return { level: 4, label: "Sentinel", nextXP: 1000, prevXP: 600 };
  return { level: 5, label: "Cyber Elite", nextXP: 9999, prevXP: 1000 };
}
