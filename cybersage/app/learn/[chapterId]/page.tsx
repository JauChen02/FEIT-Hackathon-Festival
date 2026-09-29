"use client";

import { useParams, useRouter } from "next/navigation";
import { module2 } from "@/data/module2";
import { isChapterUnlocked } from "@/lib/moduleProgress";
import LessonCardComponent from "@/components/learn/LessonCardComponent";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, BookOpen } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

export default function ChapterPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const router = useRouter();

  const chapterIds = module2.chapters.map((c) => c.id);
  const chapter = module2.chapters.find((c) => c.id === chapterId);
  const [currentCard, setCurrentCard] = useState(0);
  const [direction, setDirection] = useState(1);

  if (!chapter) {
    return (
      <div className="flex min-h-screen items-center justify-center text-blue-300/50">
        Chapter not found.
      </div>
    );
  }

  const locked = !isChapterUnlocked(chapterId, chapterIds);

  if (locked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center px-6">
        <Lock size={40} className="text-slate-600" />
        <p className="text-lg font-semibold text-slate-400">Chapter Locked</p>
        <p className="text-sm text-slate-600">Complete the previous chapter first.</p>
        <Link href="/learn" className="mt-2 rounded-xl border border-[#1A4A8A]/30 px-4 py-2 text-sm text-[#4FC3F7] hover:border-[#2D7DD2]/50">
          ← Back to Learn
        </Link>
      </div>
    );
  }

  const card = chapter.cards[currentCard];
  const isLast = currentCard === chapter.cards.length - 1;
  const progress = ((currentCard + 1) / chapter.cards.length) * 100;

  function goNext() {
    setDirection(1);
    setCurrentCard((p) => Math.min(chapter!.cards.length - 1, p + 1));
  }

  function goPrev() {
    setDirection(-1);
    setCurrentCard((p) => Math.max(0, p - 1));
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/learn" className="flex items-center gap-1.5 text-sm text-blue-300/50 hover:text-blue-200 transition">
            <ChevronLeft size={16} /> Learn
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-base">{chapter.emoji}</span>
            <span className="text-sm font-semibold text-white">{chapter.title}</span>
          </div>
          <span className="text-xs text-blue-300/40">{currentCard + 1} / {chapter.cards.length}</span>
        </div>
      </nav>

      {/* Progress bar */}
      <div className="h-1 w-full bg-[#1A4A8A]/20">
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-full"
          style={{ background: `linear-gradient(90deg, ${chapter.accentHex}99, ${chapter.accentHex})` }}
        />
      </div>

      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-8 flex flex-col">
        {/* Card dot indicators */}
        <div className="mb-6 flex items-center justify-center gap-1.5">
          {chapter.cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setDirection(i > currentCard ? 1 : -1); setCurrentCard(i); }}
              className={clsx(
                "rounded-full transition-all duration-300",
                i === currentCard
                  ? "w-5 h-2"
                  : i < currentCard
                  ? "w-2 h-2"
                  : "w-2 h-2 opacity-25"
              )}
              style={{
                backgroundColor: i <= currentCard ? chapter.accentHex : "#1A4A8A",
              }}
            />
          ))}
        </div>

        {/* Animated card */}
        <div className="flex-1">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentCard}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="h-full"
            >
              <LessonCardComponent
                card={card}
                index={currentCard}
                isActive={true}
                accentHex={chapter.accentHex}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentCard === 0}
            className="flex items-center gap-1.5 rounded-xl border border-[#1A4A8A]/30 px-4 py-2.5 text-sm text-blue-300/50 transition hover:border-[#1A4A8A]/60 hover:text-blue-200 disabled:opacity-20"
          >
            <ChevronLeft size={15} /> Back
          </button>

          <span className="text-xs text-blue-300/30">
            {chapter.estimatedMinutes} min read
          </span>

          {isLast ? (
            <button
              onClick={() => router.push(`/learn/${chapterId}/quiz`)}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{
                background: `linear-gradient(135deg, ${chapter.accentHex}, ${chapter.accentHex}cc)`,
                boxShadow: `0 0 20px ${chapter.accentHex}40`,
              }}
            >
              Take Quiz <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex items-center gap-1.5 rounded-xl border border-[#1A4A8A]/40 px-4 py-2.5 text-sm text-blue-200 transition hover:border-[#2D7DD2]/60 hover:bg-[#0F2548]/50"
            >
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>

        {/* Swipe hint — only on first card */}
        {currentCard === 0 && (
          <p className="mt-4 text-center text-xs text-blue-300/20">
            Use the buttons or dots above to navigate
          </p>
        )}
      </main>
    </div>
  );
}
