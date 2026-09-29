"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KAHOOT_QUESTIONS } from "@/lib/classroom";
import { KahootQuestion } from "@/types";
import KahootQuestionComponent from "@/components/classroom/KahootQuestion";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { clsx } from "clsx";
import { Trophy, ChevronLeft, ArrowRight, Zap, Target, CheckCircle2, XCircle } from "lucide-react";

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
        if (n <= 1) {
          clearInterval(t);
          setPhase("question");
          return 0;
        }
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
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 1. 顶部纯白状态导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 sm:px-8 py-3.5 shadow-sm text-slate-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Room PIN</p>
            <p className="font-mono text-base font-black text-[#0066B3] tracking-widest">{code}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              {isHost ? "Hosting as" : "Playing as"}
            </p>
            <p className="text-sm font-black text-slate-900 truncate max-w-[140px] sm:max-w-none">{playerName}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">XP Gained</p>
            <p className="font-mono text-base font-black text-emerald-600">+{totalXP}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-8 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {/* 阶段 1：倒计时 */}
          {phase === "countdown" && (
            <motion.div
              key="countdown"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.4, opacity: 0 }}
              className="flex h-full min-h-[50vh] items-center justify-center flex-col gap-4 text-center"
            >
              <p className="text-blue-100 text-sm font-mono uppercase tracking-widest font-bold">
                Match starting in
              </p>
              <p className="text-9xl font-black text-white drop-shadow-lg">
                {countdown}
              </p>
            </motion.div>
          )}

          {/* 阶段 2：Kahoot 答题中 */}
          {phase === "question" && (
            <motion.div
              key={`q-${currentQ}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <KahootQuestionComponent
                question={questions[currentQ]}
                onAnswer={handleAnswer}
                questionNumber={currentQ + 1}
                total={questions.length}
              />
            </motion.div>
          )}

          {/* 阶段 3：结算面板 */}
          {phase === "final" && (
            <motion.div
              key="final"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-200 rounded-none p-6 sm:p-8 text-slate-800 shadow-2xl space-y-6 text-center"
            >
              <div className="text-5xl mb-2">
                {correctCount === questions.length ? "🏆" : correctCount >= 3 ? "🛡️" : "💪"}
              </div>

              <div>
                <h2 className="text-2xl font-black text-slate-900">Battle Complete!</h2>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Participant: {playerName}
                </p>
              </div>

              {/* 三格指标数据 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Correct", value: `${correctCount}/${questions.length}`, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
                  { label: "XP Earned", value: `+${totalXP}`, color: "text-[#0066B3]", bg: "bg-blue-50 border-blue-100" },
                  { label: "Accuracy", value: `${Math.round((correctCount / questions.length) * 100)}%`, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`border rounded-none p-3.5 ${bg}`}>
                    <p className={clsx("text-xl font-black font-mono", color)}>{value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* 答题详细复盘 */}
              <div className="border border-slate-200 bg-slate-50 p-4 text-left space-y-2">
                <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Question Breakdown
                </p>
                {results.map((r, i) => (
                  <div key={r.questionId} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold border-b border-slate-200/60 pb-2 last:border-b-0 last:pb-0">
                    <span>
                      {r.isCorrect ? (
                        <CheckCircle2 size={16} className="text-emerald-600 inline" />
                      ) : (
                        <XCircle size={16} className="text-rose-600 inline" />
                      )}
                    </span>
                    <span className="flex-1 text-slate-700 truncate">{questions[i].question}</span>
                    {r.isCorrect && (
                      <span className="text-xs font-mono font-bold text-emerald-600">+{r.xpGained} XP</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 justify-center pt-2">
                <Link
                  href="/leaderboard"
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition rounded-none"
                >
                  <Trophy size={14} className="text-amber-500" />
                  View Rankings
                </Link>
                <Link
                  href="/"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#0066B3] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#005596] shadow-md transition rounded-none"
                >
                  <span>Missions Track</span>
                  <ArrowRight size={14} />
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0066B3] text-white font-mono font-bold">
          Entering Arena...
        </div>
      }
    >
      <PlayContent />
    </Suspense>
  );
}