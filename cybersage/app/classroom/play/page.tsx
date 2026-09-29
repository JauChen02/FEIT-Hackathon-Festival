"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KAHOOT_QUESTIONS } from "@/lib/classroom";
import { KahootQuestion } from "@/types";
import KahootQuestionComponent from "@/components/classroom/KahootQuestion";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { clsx } from "clsx";

interface Result {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
  xpGained: number;
}

function PlayContent() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code") ?? "??????";
  const playerName = params.get("name") ?? "Agent";
  const isHost = params.get("host") === "true";

  const [phase, setPhase] = useState<"countdown" | "question" | "results" | "final">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [currentQ, setCurrentQ] = useState(0);
  const [results, setResults] = useState<Result[]>([]);

  const questions = KAHOOT_QUESTIONS;

  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(t); setPhase("question"); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  function handleAnswer(selectedIndex: number, timeSpent: number) {
    const q = questions[currentQ];
    const isCorrect = selectedIndex === q.correctIndex;
    const xp = isCorrect ? Math.max(50, 100 - timeSpent * 3) : 0;
    const result: Result = { questionId: q.id, selectedIndex, isCorrect, timeSpent, xpGained: xp };
    const newResults = [...results, result];
    setResults(newResults);

    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        setPhase("final");
      } else {
        setCurrentQ(currentQ + 1);
        setPhase("question");
      }
    }, 2000);
  }

  const totalXP = results.reduce((s, r) => s + r.xpGained, 0);
  const correctCount = results.filter((r) => r.isCorrect).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Room header */}
      <div className="border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-xs text-blue-300/40">Room</p>
            <p className="font-mono text-sm font-bold text-[#4FC3F7]">{code}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-blue-300/40">{isHost ? "Hosting as" : "Playing as"}</p>
            <p className="text-sm font-medium text-white">{playerName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-300/40">XP earned</p>
            <p className="text-sm font-bold text-[#4FC3F7]">+{totalXP}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-8">
        <AnimatePresence mode="wait">
          {phase === "countdown" && (
            <motion.div
              key="countdown"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="flex h-full min-h-[60vh] items-center justify-center flex-col gap-4"
            >
              <p className="text-blue-300/50 text-lg">Get ready...</p>
              <p className="text-8xl font-bold text-white" style={{ textShadow: "0 0 40px rgba(79,195,247,0.5)" }}>
                {countdown}
              </p>
            </motion.div>
          )}

          {phase === "question" && (
            <motion.div
              key={`q-${currentQ}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <KahootQuestionComponent
                question={questions[currentQ]}
                onAnswer={handleAnswer}
                questionNumber={currentQ + 1}
                total={questions.length}
              />
            </motion.div>
          )}

          {phase === "final" && (
            <motion.div
              key="final"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 py-8"
            >
              <div className="text-6xl">{correctCount === questions.length ? "🏆" : correctCount >= 3 ? "🛡️" : "💪"}</div>
              <div>
                <h2 className="text-2xl font-bold text-white">Quiz Complete!</h2>
                <p className="text-blue-300/50 mt-1">{playerName}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Correct", value: `${correctCount}/${questions.length}`, color: "text-emerald-300" },
                  { label: "XP Earned", value: `+${totalXP}`, color: "text-[#4FC3F7]" },
                  { label: "Accuracy", value: `${Math.round((correctCount / questions.length) * 100)}%`, color: "text-blue-300" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 py-4">
                    <p className={clsx("text-xl font-bold", color)}>{value}</p>
                    <p className="text-xs text-blue-300/40 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Question breakdown */}
              <div className="rounded-xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-4 text-left space-y-2">
                {results.map((r, i) => (
                  <div key={r.questionId} className="flex items-center gap-3 text-sm">
                    <span>{r.isCorrect ? "✅" : "❌"}</span>
                    <span className="flex-1 text-blue-200/60 truncate">{questions[i].question}</span>
                    {r.isCorrect && <span className="text-xs text-[#4FC3F7]">+{r.xpGained} XP</span>}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 justify-center">
                <Link href="/leaderboard" className="rounded-xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 px-5 py-2.5 text-sm font-medium text-blue-200 hover:bg-[#1A4A8A]/30 transition">
                  View Rankings
                </Link>
                <Link href="/" className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition" style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)" }}>
                  Back to Missions
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-blue-300/50">Loading...</div>}>
      <PlayContent />
    </Suspense>
  );
}
