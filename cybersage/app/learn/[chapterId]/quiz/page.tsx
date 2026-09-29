"use client";

import { useParams, useRouter } from "next/navigation";
import { module2 } from "@/data/module2";
import { saveChapterResult, isChapterUnlocked } from "@/lib/moduleProgress";
import Link from "next/link";
import { ChevronLeft, CheckCircle, XCircle, Zap, ArrowRight, RotateCcw } from "lucide-react";
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
      <div className="flex min-h-screen items-center justify-center bg-[#0066B3] text-white font-bold">
        Chapter not found.
      </div>
    );
  }

  if (!isChapterUnlocked(chapterId, chapterIds)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0066B3]">
        <Link href="/learn" className="text-sm font-bold text-white hover:underline">
          ← Back to Learn
        </Link>
      </div>
    );
  }

  const question = chapter.quiz[current];
  const score = answers.filter(Boolean).length;
  const total = chapter.quiz.length;
  const xpEarned = answers.filter(Boolean).reduce(
    (sum, correct, idx) => sum + (correct ? chapter.quiz[idx]?.xp ?? XP_PER_CORRECT : 0),
    0
  );
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
      const finalXP = newAnswers.reduce(
        (sum, c, idx) => sum + (c ? chapter.quiz[idx]?.xp ?? XP_PER_CORRECT : 0),
        0
      );
      saveChapterResult(chapterId, finalScore, total, finalXP);
      setDone(true);
    } else {
      setCurrent((p) => p + 1);
      setSelected(null);
    }
  }

  // 1. 结算完成页面 (Results Screen)
  if (done) {
    const stars = accuracy === 100 ? 3 : accuracy >= 75 ? 2 : 1;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 bg-[#0066B3] text-slate-800 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-none p-8 text-center shadow-2xl"
        >
          <p className="text-4xl mb-3 tracking-widest">{"⭐".repeat(stars)}</p>
          <h2 className="text-2xl font-black text-slate-900 mb-1">
            {accuracy === 100 ? "Perfect Score!" : accuracy >= 75 ? "Well Done!" : "Keep Practising!"}
          </h2>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-6">
            {score}/{total} Correct · {accuracy}% Accuracy
          </p>

          <div className="mb-6 flex items-center justify-center gap-2 border border-amber-200 bg-amber-50 py-3.5">
            <Zap size={18} className="text-amber-500 fill-amber-400" />
            <span className="text-xl font-black text-amber-800 font-mono">+{xpEarned} XP</span>
          </div>

          <div className="flex gap-3">
            <Link
              href="/learn"
              className="flex-1 flex items-center justify-center gap-1 border border-slate-300 bg-slate-50 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition"
            >
              <ChevronLeft size={14} /> Back to Modules
            </Link>
            <button
              onClick={() => router.push("/learn")}
              className="flex-1 flex items-center justify-center gap-1 bg-[#0066B3] py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#005596] shadow-md transition"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. 做题答题页面 (Quiz Screen)
  return (
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 顶部纯白导航栏 */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 sm:px-8 py-3.5 shadow-sm text-slate-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link
            href={`/learn/${chapterId}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-[#0066B3] transition"
          >
            <ChevronLeft size={16} /> Lesson
          </Link>
          <span className="text-sm font-extrabold text-slate-900 truncate max-w-[200px] sm:max-w-none">
            Quiz · {chapter.title}
          </span>
          <span className="text-xs font-mono font-bold text-[#0066B3] bg-blue-50 px-2 py-0.5 border border-blue-100">
            {current + 1} / {total}
          </span>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-10 flex flex-col justify-start">
        {/* 顶部进度条 */}
        <div className="mb-8 h-2 w-full bg-white/20 overflow-hidden">
          <motion.div
            animate={{ width: `${((current) / total) * 100}%` }}
            className="h-full bg-white transition-all duration-300"
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200 rounded-none p-6 sm:p-8 text-slate-800 shadow-xl"
          >
            {/* 题号与题目 */}
            <p className="mb-2 text-xs font-mono font-bold uppercase tracking-wider text-[#0066B3]">
              Question {current + 1} of {total}
            </p>
            <h2 className="mb-6 text-xl font-black text-slate-900 leading-snug">
              {question.question}
            </h2>

            {/* 选项列表 */}
            <div className="space-y-3">
              {question.options.map((opt, i) => {
                const isSelected = selected === i;
                const isCorrect = i === question.correctIndex;
                const revealed = selected !== null;

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={revealed}
                    className={clsx(
                      "w-full rounded-none border p-4 text-left text-sm font-semibold transition-all flex items-center justify-between gap-3",
                      !revealed &&
                        "border-slate-200 bg-slate-50 hover:border-[#0066B3] hover:bg-blue-50/40 text-slate-800 active:scale-[0.99]",
                      revealed &&
                        isCorrect &&
                        "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold",
                      revealed &&
                        isSelected &&
                        !isCorrect &&
                        "border-rose-500 bg-rose-50 text-rose-900 font-bold",
                      revealed &&
                        !isSelected &&
                        !isCorrect &&
                        "border-slate-100 bg-slate-50/60 text-slate-400 opacity-60"
                    )}
                  >
                    <span>{opt}</span>
                    {revealed && isCorrect && (
                      <CheckCircle size={18} className="shrink-0 text-emerald-600" />
                    )}
                    {revealed && isSelected && !isCorrect && (
                      <XCircle size={18} className="shrink-0 text-rose-600" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 解析展示 */}
            {selected !== null && question.explanation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 border-l-4 border-[#0066B3] bg-blue-50/60 p-4 text-xs sm:text-sm text-slate-700 leading-relaxed"
              >
                <span className="font-bold text-[#0066B3] block mb-1 uppercase tracking-wider text-[11px]">
                  Explanation:
                </span>
                {question.explanation}
              </motion.div>
            )}

            {/* 底部下一步按钮 */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleNext}
                disabled={selected === null}
                className="inline-flex items-center gap-1.5 bg-[#0066B3] px-7 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#005596] disabled:opacity-40 transition shadow-md active:scale-95"
              >
                <span>{current + 1 >= total ? "See Results" : "Next Question"}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}