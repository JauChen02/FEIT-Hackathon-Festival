"use client";

import { KahootQuestion } from "@/types";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const OPTION_STYLES = [
  { base: "border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-100",    correct: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200", wrong: "border-red-500/60 bg-red-500/20 opacity-60", icon: "🔴" },
  { base: "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-100", correct: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200", wrong: "border-blue-500/20 opacity-40",               icon: "🔵" },
  { base: "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-100", correct: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200", wrong: "border-yellow-500/20 opacity-40",     icon: "🟡" },
  { base: "border-green-500/40 bg-green-500/10 hover:bg-green-500/20 text-green-100",     correct: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200", wrong: "border-green-500/20 opacity-40",      icon: "🟢" },
];

interface KahootQuestionProps {
  question: KahootQuestion;
  onAnswer: (index: number, timeSpent: number) => void;
  questionNumber: number;
  total: number;
}

export default function KahootQuestionComponent({
  question,
  onAnswer,
  questionNumber,
  total,
}: KahootQuestionProps) {
  const [timeLeft, setTimeLeft] = useState(question.timeLimit);
  const [selected, setSelected] = useState<number | null>(null);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (selected !== null) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          handleSelect(-1);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selected]);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    setTimeout(() => onAnswer(index, timeSpent), 1500);
  }

  const timerPct = (timeLeft / question.timeLimit) * 100;
  const timerColor = timerPct > 50 ? "#00B4D8" : timerPct > 25 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-6">
      {/* Progress + Timer */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs text-blue-300/40">
            <span>Question {questionNumber} / {total}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-[#1A4A8A]/20">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(questionNumber / total) * 100}%`, background: "linear-gradient(90deg, #0077B6, #4FC3F7)" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: timerColor }}>
          <Clock size={14} />
          {timeLeft}s
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-2 w-full rounded-full bg-[#1A4A8A]/20 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: timerColor }}
          animate={{ width: `${timerPct}%` }}
          transition={{ duration: 1, ease: "linear" }}
        />
      </div>

      {/* Question */}
      <div className="rounded-2xl border border-[#1A4A8A]/40 bg-[#0B1E3D]/70 px-6 py-5 text-center">
        <p className="text-lg font-semibold text-white leading-snug">{question.question}</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((opt, i) => {
          const style = OPTION_STYLES[i];
          const isSelected = selected === i;
          const isRevealed = selected !== null;
          const isCorrect = i === question.correctIndex;
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(i)}
              disabled={isRevealed}
              className={clsx(
                "answer-pulse relative flex min-h-[72px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                isRevealed
                  ? isCorrect
                    ? style.correct
                    : isSelected
                    ? style.wrong
                    : `${style.base} opacity-30`
                  : style.base
              )}
            >
              <span className="text-xl shrink-0">{style.icon}</span>
              <span className="leading-snug">{opt}</span>
              {isRevealed && isCorrect && (
                <CheckCircle size={16} className="absolute right-3 top-3 text-emerald-400" />
              )}
              {isRevealed && isSelected && !isCorrect && (
                <XCircle size={16} className="absolute right-3 top-3 text-red-400" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Explanation (after answer) */}
      <AnimatePresence>
        {selected !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              "rounded-xl border px-4 py-3 text-sm leading-relaxed",
              selected === question.correctIndex
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                : "border-red-500/30 bg-red-500/5 text-red-200"
            )}
          >
            <span className="mr-2">{selected === question.correctIndex ? "✅" : "❌"}</span>
            {question.explanation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
