"use client";

import { Choice } from "@/types";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";

interface ChoicePanelProps {
  choices: Choice[];
  selectedId: string | null;
  onSelect: (choice: Choice) => void;
  disabled?: boolean;
}

export default function ChoicePanel({ choices, selectedId, onSelect, disabled = false }: ChoicePanelProps) {
  const labels = ["A", "B", "C", "D"];

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {choices.map((choice, i) => {
          const isSelected = selectedId === choice.id;
          const isRevealed = selectedId !== null;
          const isCorrect = choice.isCorrect;
          const label = labels[i];

          return (
            <motion.button
              key={choice.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => !disabled && !selectedId && onSelect(choice)}
              disabled={disabled || selectedId !== null}
              className={clsx(
                "group w-full rounded-xl border px-5 py-4 text-left text-sm transition-all duration-200",
                !isRevealed && !disabled
                  ? "cursor-pointer border-[#1A4A8A]/50 bg-[#0B1E3D]/60 text-blue-100 hover:border-[#2D7DD2]/70 hover:bg-[#0F2548]/80 hover:text-white"
                  : isSelected && isCorrect
                  ? "cursor-default border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                  : isSelected && !isCorrect
                  ? "cursor-default border-red-500/50 bg-red-500/10 text-red-200"
                  : isRevealed && isCorrect
                  ? "cursor-default border-emerald-500/20 bg-emerald-500/5 text-emerald-400/60"
                  : "cursor-default border-[#1A4A8A]/20 bg-[#0B1E3D]/30 text-blue-300/30"
              )}
            >
              <div className="flex items-center gap-3">
                {isRevealed && isCorrect ? (
                  <CheckCircle size={16} className="shrink-0 text-emerald-400" />
                ) : isRevealed && isSelected && !isCorrect ? (
                  <XCircle size={16} className="shrink-0 text-red-400" />
                ) : (
                  <span className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition",
                    !isRevealed
                      ? "border-[#2D7DD2]/40 text-[#4FC3F7]/60 group-hover:border-[#4FC3F7]/60 group-hover:text-[#4FC3F7]"
                      : "border-[#1A4A8A]/20 text-blue-300/20"
                  )}>
                    {label}
                  </span>
                )}
                <span className="leading-snug">{choice.text}</span>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
