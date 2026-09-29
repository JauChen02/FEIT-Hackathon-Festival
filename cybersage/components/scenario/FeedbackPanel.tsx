"use client";

import { Choice } from "@/types";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

interface FeedbackPanelProps {
  choice: Choice;
  xpEarned: number;
  onRetry?: () => void;
}

export default function FeedbackPanel({ choice, xpEarned, onRetry }: FeedbackPanelProps) {
  const correct = choice.isCorrect;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "rounded-2xl border p-6",
        correct
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/8 to-transparent"
          : "border-red-500/30 bg-gradient-to-br from-red-500/8 to-transparent"
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className={clsx(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          correct ? "bg-emerald-500/15" : "bg-red-500/15"
        )}>
          {correct
            ? <CheckCircle size={18} className="text-emerald-400" />
            : <XCircle size={18} className="text-red-400" />
          }
        </div>
        <div>
          <p className={clsx("font-semibold", correct ? "text-emerald-400" : "text-red-400")}>
            {correct ? "Correct decision" : "Not the right call"}
          </p>
          {xpEarned > 0 && (
            <p className="text-xs text-[#4FC3F7]/60">+{xpEarned} XP earned</p>
          )}
        </div>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-blue-200/70">{choice.feedback}</p>

      <div className="flex flex-wrap gap-3">
        {correct && choice.nextScenarioId ? (
          <Link
            href={`/scenario/${choice.nextScenarioId}`}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition"
            style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)", boxShadow: "0 0 16px rgba(0,180,216,0.25)" }}
          >
            Next Mission <ArrowRight size={14} />
          </Link>
        ) : correct ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition"
            style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)" }}
          >
            View Progress <ArrowRight size={14} />
          </Link>
        ) : (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-xl border border-[#1A4A8A]/50 bg-[#1A4A8A]/20 px-5 py-2.5 text-sm font-medium text-blue-200 transition hover:bg-[#1A4A8A]/30"
          >
            <RotateCcw size={14} /> Try Again
          </button>
        )}
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl border border-[#1A4A8A]/30 px-4 py-2.5 text-sm text-blue-300/50 transition hover:text-blue-200"
        >
          All Missions
        </Link>
      </div>
    </motion.div>
  );
}
