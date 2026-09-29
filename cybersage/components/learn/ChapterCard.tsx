"use client";

import { Chapter } from "@/data/module2";
import { ChapterProgress } from "@/lib/moduleProgress";
import Link from "next/link";
import { clsx } from "clsx";
import { Lock, CheckCircle, Clock, Star } from "lucide-react";
import { motion } from "framer-motion";

interface ChapterCardProps {
  chapter: Chapter;
  progress: ChapterProgress | null;
  locked: boolean;
  index: number;
}

export default function ChapterCard({ chapter, progress, locked, index }: ChapterCardProps) {
  const completed = !!progress?.completed;
  const accuracy = progress ? Math.round((progress.quizScore / progress.quizTotal) * 100) : null;

  const stars = accuracy === null ? 0 : accuracy === 100 ? 3 : accuracy >= 75 ? 2 : 1;

  if (locked) {
    return (
      <div className="relative flex items-start gap-4 rounded-2xl border border-[#1A4A8A]/15 bg-[#0B1E3D]/30 p-5 opacity-40 cursor-not-allowed">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1A4A8A]/10 text-2xl grayscale">
          {chapter.emoji}
        </div>
        <div>
          <p className="text-xs text-blue-300/30 mb-1">Chapter {chapter.number}</p>
          <p className="font-semibold text-slate-500">{chapter.title}</p>
          <p className="text-xs text-slate-600">{chapter.subtitle}</p>
        </div>
        <Lock size={14} className="absolute right-4 top-4 text-slate-600" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <Link href={`/learn/${chapter.id}`} className="group block">
        <div className={clsx(
          "relative flex items-start gap-4 rounded-2xl border p-5 transition-all duration-200",
          completed
            ? "border-[#00B4D8]/30 bg-gradient-to-r from-[#0077B6]/10 to-[#0B1E3D]/50 hover:border-[#4FC3F7]/50"
            : "border-[#1A4A8A]/30 bg-[#0B1E3D]/50 hover:border-[#2D7DD2]/50 hover:bg-[#0F2548]/60"
        )}>
          {/* Chapter emoji */}
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl transition group-hover:scale-105"
            style={{ background: `${chapter.accentHex}20`, border: `1px solid ${chapter.accentHex}40` }}
          >
            {chapter.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-blue-300/40 mb-0.5">Chapter {chapter.number}</p>
            <h3 className="font-semibold text-blue-50 group-hover:text-white transition">{chapter.title}</h3>
            <p className="text-xs text-blue-300/45 mt-0.5 leading-snug">{chapter.subtitle}</p>

            <div className="mt-3 flex items-center gap-4">
              <span className="flex items-center gap-1 text-xs text-blue-300/35">
                <Clock size={11} /> {chapter.estimatedMinutes} min
              </span>
              <span className="text-xs text-blue-300/35">
                {chapter.cards.length} cards · {chapter.quiz.length} quiz questions
              </span>
            </div>
          </div>

          {/* Right side: status */}
          <div className="shrink-0 text-right">
            {completed ? (
              <div className="space-y-1">
                <div className="flex justify-end gap-0.5">
                  {[1,2,3].map(s => (
                    <Star key={s} size={13} className={s <= stars ? "text-yellow-400 fill-yellow-400" : "text-slate-700"} />
                  ))}
                </div>
                <p className="text-xs text-[#4FC3F7]">{accuracy}% accuracy</p>
                <p className="text-xs text-blue-300/30">+{progress?.xpEarned} XP</p>
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A4A8A]/30 text-xs font-bold text-blue-300/30">
                {chapter.number}
              </div>
            )}
          </div>

          {completed && (
            <CheckCircle size={14} className="absolute right-4 top-4 text-[#4FC3F7]/60" />
          )}
        </div>
      </Link>
    </motion.div>
  );
}
