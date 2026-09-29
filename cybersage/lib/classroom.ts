import { ClassroomSession, ClassroomParticipant, KahootQuestion } from "@/types";

// Mock classroom sessions stored in-memory (in production: Supabase Realtime)
const sessions: Record<string, ClassroomSession> = {};

export function generateClassCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createSession(hostName: string, scenarioId: string): ClassroomSession {
  const code = generateClassCode();
  const session: ClassroomSession = {
    code,
    hostName,
    scenarioId,
    status: "waiting",
    participants: [],
  };
  sessions[code] = session;
  return session;
}

export function joinSession(code: string, participant: ClassroomParticipant): ClassroomSession | null {
  const session = sessions[code.toUpperCase()];
  if (!session) return null;
  const existing = session.participants.findIndex((p) => p.userId === participant.userId);
  if (existing === -1) session.participants.push(participant);
  return session;
}

export function getSession(code: string): ClassroomSession | null {
  return sessions[code.toUpperCase()] ?? null;
}

export const KAHOOT_QUESTIONS: KahootQuestion[] = [
  {
    id: "k1",
    question: "Which of these is the most common entry point for ransomware?",
    options: ["Phishing emails", "USB drives", "Software updates", "Firewall gaps"],
    correctIndex: 0,
    explanation: "Over 90% of ransomware attacks begin with a phishing email. Always verify sender identity before clicking links.",
    timeLimit: 20,
  },
  {
    id: "k2",
    question: "What does MFA stand for in cybersecurity?",
    options: ["Multiple Firewall Access", "Multi-Factor Authentication", "Managed Firewall Algorithm", "Malware File Analysis"],
    correctIndex: 1,
    explanation: "Multi-Factor Authentication adds a second verification step beyond passwords, blocking 99.9% of automated attacks.",
    timeLimit: 15,
  },
  {
    id: "k3",
    question: "A zero-day vulnerability is one that...",
    options: ["Has zero impact", "Was discovered and patched on the same day", "Is unknown to the vendor with no available patch", "Occurs only on the first day of a month"],
    correctIndex: 2,
    explanation: "Zero-day vulnerabilities are particularly dangerous because there's no patch available — defenders have zero days to prepare.",
    timeLimit: 20,
  },
  {
    id: "k4",
    question: "What is 'tailgating' in physical security?",
    options: ["Following too closely in traffic", "Unauthorised access by following an authorised person", "A type of email scam", "Monitoring network traffic"],
    correctIndex: 1,
    explanation: "Tailgating bypasses physical access controls by piggybacking on a legitimate person's entry — always badge separately.",
    timeLimit: 15,
  },
  {
    id: "k5",
    question: "The CIA Triad in cybersecurity stands for:",
    options: ["Control, Integrity, Access", "Confidentiality, Integrity, Availability", "Cyber, Intelligence, Analysis", "Credentials, Identity, Authentication"],
    correctIndex: 1,
    explanation: "The CIA Triad is the foundation of information security: keeping data secret (Confidentiality), accurate (Integrity), and accessible (Availability).",
    timeLimit: 20,
  },
];
