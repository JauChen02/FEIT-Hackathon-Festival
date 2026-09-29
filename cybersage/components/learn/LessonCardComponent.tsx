"use client";

import { LessonCard } from "@/data/module2";
import { clsx } from "clsx";
import { motion } from "framer-motion";

const TYPE_STYLES = {
  fact:        { border: "border-[#0077B6]/30", bg: "bg-[#0077B6]/8",  label: "Key Fact",      labelColor: "text-blue-300",    labelBg: "bg-[#0077B6]/20" },
  "case-study":{ border: "border-amber-500/25", bg: "bg-amber-500/5",  label: "Case Study",    labelColor: "text-amber-300",   labelBg: "bg-amber-500/15" },
  framework:   { border: "border-purple-500/25",bg: "bg-purple-500/5", label: "Framework",     labelColor: "text-purple-300",  labelBg: "bg-purple-500/15" },
  warning:     { border: "border-red-500/25",   bg: "bg-red-500/5",    label: "⚠ Watch Out",  labelColor: "text-red-300",     labelBg: "bg-red-500/15" },
  tip:         { border: "border-emerald-500/25",bg: "bg-emerald-500/5",label: "💡 Strategy",  labelColor: "text-emerald-300", labelBg: "bg-emerald-500/15" },
};

function renderBody(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.trim() === "") return <br key={i} />;
    // bold with **
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <strong key={j} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
      }
      return <span key={j}>{p}</span>;
    });
    return <p key={i} className="mb-1 leading-relaxed">{parts}</p>;
  });
}

interface LessonCardProps {
  card: LessonCard;
  index: number;
  isActive: boolean;
}

export default function LessonCardComponent({ card, index, isActive }: LessonCardProps) {
  const style = TYPE_STYLES[card.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: isActive ? 1 : 0.4, y: 0, scale: isActive ? 1 : 0.97 }}
      transition={{ duration: 0.35, delay: isActive ? 0 : 0 }}
      className={clsx(
        "rounded-2xl border p-6 transition-all",
        style.border,
        style.bg,
        isActive ? "ring-1 ring-white/5" : "pointer-events-none"
      )}
    >
      {/* Type label */}
      <div className="mb-4 flex items-center gap-2">
        {card.emoji && <span className="text-xl">{card.emoji}</span>}
        <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", style.labelColor, style.labelBg)}>
          {style.label}
        </span>
      </div>

      {/* Stat (if present) */}
      {card.stat && (
        <div className="mb-4 rounded-xl border border-[#1A4A8A]/20 bg-[#071428]/60 px-4 py-3 text-center">
          <p className="text-3xl font-bold text-[#4FC3F7]">{card.stat}</p>
          {card.statLabel && <p className="mt-0.5 text-xs text-blue-300/50">{card.statLabel}</p>}
        </div>
      )}

      <h3 className="mb-3 text-base font-bold text-white leading-snug">{card.title}</h3>
      <div className="text-sm text-blue-200/70 space-y-0.5">
        {renderBody(card.body)}
      </div>
    </motion.div>
  );
}
