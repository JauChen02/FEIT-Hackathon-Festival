export interface ChapterProgress {
  chapterId: string;
  completed: boolean;
  quizScore: number;     // correct answers
  quizTotal: number;     // total questions
  xpEarned: number;
  completedAt?: string;
}

export interface ModuleProgress {
  moduleId: string;
  chapters: Record<string, ChapterProgress>;
  totalXP: number;
}

const KEY = "cybersage_module_progress_v1";

export function loadModuleProgress(): ModuleProgress {
  if (typeof window === "undefined") return empty();
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : empty();
  } catch { return empty(); }
}

function empty(): ModuleProgress {
  return { moduleId: "module-2", chapters: {}, totalXP: 0 };
}

export function saveChapterResult(
  chapterId: string,
  quizScore: number,
  quizTotal: number,
  xpEarned: number
): ModuleProgress {
  const progress = loadModuleProgress();
  progress.chapters[chapterId] = {
    chapterId,
    completed: true,
    quizScore,
    quizTotal,
    xpEarned,
    completedAt: new Date().toISOString(),
  };
  progress.totalXP = Object.values(progress.chapters).reduce((s, c) => s + c.xpEarned, 0);
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(progress));
  }
  return progress;
}

export function isChapterUnlocked(chapterId: string, allChapterIds: string[]): boolean {
  const idx = allChapterIds.indexOf(chapterId);
  if (idx === 0) return true;
  const progress = loadModuleProgress();
  const prev = allChapterIds[idx - 1];
  return !!progress.chapters[prev]?.completed;
}

export function getChapterProgress(chapterId: string): ChapterProgress | null {
  const p = loadModuleProgress();
  return p.chapters[chapterId] ?? null;
}
