"use client";

import { useParams, useRouter } from "next/navigation";
import { module2 } from "@/data/module2";
import { saveChapterResult, isChapterUnlocked } from "@/lib/moduleProgress";
import Link from "next/link";
import { ChevronLeft, CheckCircle, XCircle, Zap } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

const XP_PER_CORRECT = 20;

export default function QuizPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const router = useRouter();

  const chapterIds = module2.chapters.map((c) => c.id);
  const chapter = module2.chapters.find((c) => c.id === chapterId);

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  if (!chapter) {
    return (
      <div className="flex min-h-screen items-center justify-center text-blue-300/50">
        Chapter not found.
      </div>
    );
  }

  if (!isChapterUnlocked(chapterId, chapterIds)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Link href="/learn" className="text-sm text-[#4FC3F7] hover:underline">← Back to Learn</Link>
      </div>
    );
  }

  const question = chapter.quiz[current];
  const score = answers.filter(Boolean).length;
  const total = chapter.quiz.length;
  const xpEarned = answers.filter(Boolean).reduce((sum, correct, idx) => sum + (correct ? chapter.quiz[idx]?.xp ?? XP_PER_CORRECT : 0), 0);
  const accuracy = Math.round((score / total) * 100);

  function handleSelect(optionIdx: number) {
    if (selected !== null) return;
    setSelected(optionIdx);
  }

  function handleNext() {
    if (selected === null) return;
    const correct = selected === question.correctIndex;
    const newAnswers = [...answers, correct];
    setAnswers(newAnswers);

    if (current + 1 >= total) {
      const finalScore = newAnswers.filter(Boolean).length;
      const finalXP = newAnswers.reduce((sum, correct, idx) => sum + (correct ? chapter.quiz[idx]?.xp ?? XP_PER_CORRECT : 0), 0);
      saveChapterResult(chapterId, finalScore, total, finalXP);
      setDone(true);
    } else {
      setCurrent((p) => p + 1);
      setSelected(null);
    }
  }

  // Results screen
  if (done) {
    const stars = accuracy === 100 ? 3 : accuracy >= 75 ? 2 : 1;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/70 p-8 text-center"
        >
          <p className="text-4xl mb-3">{"⭐".repeat(stars)}</p>
          <h2 className="text-xl font-bold text-white mb-1">
            {accuracy === 100 ? "Perfect!" : accuracy >= 75 ? "Great work!" : "Keep practising!"}
          </h2>
          <p className="text-sm text-blue-300/50 mb-6">
            {score}/{total} correct · {accuracy}% accuracy
          </p>

          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 py-3">
            <Zap size={16} className="text-yellow-300" />
            <span className="text-lg font-bold text-yellow-300">+{xpEarned} XP</span>
          </div>

          <div className="flex gap-3">
            <Link
              href="/learn"
              className="flex-1 rounded-xl border border-[#1A4A8A]/30 py-2.5 text-sm text-blue-300/60 hover:text-blue-200 transition"
            >
              ← Back to Learn
            </Link>
            <button
              onClick={() => router.push("/learn")}
              className="flex-1 rounded-xl bg-[#0077B6] py-2.5 text-sm font-semibold text-white hover:bg-[#0096C7] transition"
            >
              Continue
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href={`/learn/${chapterId}`} className="flex items-center gap-1.5 text-sm text-blue-300/50 hover:text-blue-200">
            <ChevronLeft size={16} /> Lesson
          </Link>
          <span className="text-sm font-medium text-white">Quiz · {chapter.title}</span>
          <span className="text-xs text-blue-300/40">{current + 1} / {total}</span>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Progress */}
        <div className="mb-8 h-1 w-full rounded-full bg-[#1A4A8A]/20 overflow-hidden">
          <motion.div
            animate={{ width: `${((current) / total) * 100}%` }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #0077B6, #4FC3F7)" }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <p className="mb-2 text-xs text-blue-300/40">Question {current + 1}</p>
            <h2 className="mb-6 text-lg font-bold text-white leading-snug">{question.question}</h2>

            <div className="space-y-3">
              {question.options.map((opt, i) => {
                const isSelected = selected === i;
                const isCorrect = i === question.correctIndex;
                const revealed = selected !== null;

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    className={clsx(
                      "w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all",
                      !revealed && "border-[#1A4A8A]/30 bg-[#0B1E3D]/50 hover:border-[#2D7DD2]/50 hover:bg-[#0F2548]/60 text-blue-100",
                      revealed && isCorrect && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                      revealed && isSelected && !isCorrect && "border-red-500/40 bg-red-500/10 text-red-300",
                      revealed && !isSelected && !isCorrect && "border-[#1A4A8A]/20 bg-[#0B1E3D]/30 text-blue-300/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{opt}</span>
                      {revealed && isCorrect && <CheckCircle size={15} className="shrink-0 text-emerald-400" />}
                      {revealed && isSelected && !isCorrect && <XCircle size={15} className="shrink-0 text-red-400" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected !== null && question.explanation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-xl border border-[#1A4A8A]/25 bg-[#071428]/60 px-4 py-3 text-xs text-blue-200/60 leading-relaxed"
              >
                <span className="font-medium text-blue-300/70">Explanation: </span>
                {question.explanation}
              </motion.div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleNext}
                disabled={selected === null}
                className="rounded-xl bg-[#0077B6] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0096C7] disabled:opacity-30 transition"
              >
                {current + 1 >= total ? "See Results" : "Next →"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
