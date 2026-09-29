export interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
  xpGain: number;
  nextScenarioId: string | null;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  context: string;
  threat: string;
  choices: Choice[];
  difficulty: "beginner" | "intermediate" | "advanced";
  category: string;
  hint?: string;
  timeLimit?: number; // seconds, for Kahoot mode
}

export interface UserProgress {
  userId: string;
  displayName: string;
  avatar: string; // emoji avatar
  completedScenarios: string[];
  totalXP: number;
  correctAnswers: number;
  totalAnswers: number;
  skillScores: Record<string, number>;
  badges: string[];
  streak: number;
  lastActiveDate: string;
  classroomCode?: string;
}

export interface TutorMessage {
  role: "tutor" | "user";
  content: string;
  timestamp: Date;
}

export interface ScenarioResult {
  scenarioId: string;
  choiceId: string;
  isCorrect: boolean;
  xpGained: number;
  feedback: string;
  timeSpent?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatar: string;
  totalXP: number;
  streak: number;
  completedScenarios: number;
  accuracy: number;
  isCurrentUser?: boolean;
}

export interface ClassroomSession {
  code: string;
  hostName: string;
  scenarioId: string;
  status: "waiting" | "active" | "finished";
  participants: ClassroomParticipant[];
  startedAt?: Date;
}

export interface ClassroomParticipant {
  userId: string;
  displayName: string;
  avatar: string;
  hasAnswered: boolean;
  isCorrect?: boolean;
  xpGained?: number;
  timeSpent?: number;
}

export interface KahootQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  timeLimit: number;
}
