"use client";

import { useEffect, useState } from "react";
import { module2 } from "@/data/module2";
import { loadModuleProgress, getChapterProgress, isChapterUnlocked, ModuleProgress } from "@/lib/moduleProgress";
import { loadProgress } from "@/lib/progress";
import ChapterCard from "@/components/learn/ChapterCard";
import XPBar from "@/components/ui/XPBar";
import Link from "next/link";
import { ChevronLeft, BookOpen, Zap, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function LearnPage() {
  const [modProgress, setModProgress] = useState<ModuleProgress | null>(null);
  const [userXP, setUserXP] = useState(0);
  const chapterIds = module2.chapters.map((c) => c.id);

  useEffect(() => {
    setModProgress(loadModuleProgress());
    setUserXP(loadProgress().totalXP);
  }, []);

  const completedCount = modProgress
    ? Object.values(modProgress.chapters).filter((c) => c.completed).length
    : 0;

  const totalModXP = modProgress?.totalXP ?? 0;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-blue-300/50 hover:text-blue-200">
            <ChevronLeft size={16} /> Home
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-[#4FC3F7]" />
            <span className="font-semibold text-white">Learn</span>
          </div>
          <div className="w-28"><XPBar xp={userXP} /></div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Module header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-xs text-blue-300/40">
            <span>Genius Armoury</span>
            <span>·</span>
            <span>Module 2</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{module2.title}</h1>
          <p className="mt-1 text-sm text-blue-300/50 leading-relaxed">{module2.subtitle}</p>

          {/* Learning objectives */}
          <div className="mt-4 rounded-xl border border-[#1A4A8A]/25 bg-[#0B1E3D]/50 p-4">
            <p className="mb-2 text-xs font-medium text-blue-300/40 uppercase tracking-wider">By the end you'll be able to</p>
            <div className="space-y-1.5 text-xs text-blue-200/60">
              {[
                "Identify the 4 primary threat actor types and their motivations",
                "Map multi-stage attacks to MITRE ATT&CK tactics",
                "Recognise AI-driven threats: phishing, vishing, quishing, smishing",
                "Explain supply chain risks and why they're hard to defend",
                "Understand the HNDL threat and why Post-Quantum Cryptography matters now",
              ].map((obj, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#4FC3F7]">→</span>
                  <span>{obj}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Progress overview */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { icon: BookOpen, label: "Chapters", value: `${completedCount}/${module2.chapters.length}`, color: "text-[#4FC3F7]" },
            { icon: Zap, label: "Module XP", value: `${totalModXP}`, color: "text-yellow-300" },
            { icon: Trophy, label: "Status", value: completedCount === module2.chapters.length ? "Complete 🎉" : "In Progress", color: "text-emerald-300" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-xl border border-[#1A4A8A]/25 bg-[#0B1E3D]/50 px-4 py-3 text-center">
              <Icon size={14} className={`mx-auto mb-1 ${color}`} />
              <p className={`text-sm font-bold ${color}`}>{value}</p>
              <p className="text-xs text-blue-300/35">{label}</p>
            </div>
          ))}
        </div>

        {/* Overall progress bar */}
        <div className="mb-8 h-1.5 w-full rounded-full bg-[#1A4A8A]/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / module2.chapters.length) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #0077B6, #4FC3F7)" }}
          />
        </div>

        {/* Chapter list */}
        <div>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-blue-300/35">Chapters</h2>
          <div className="space-y-3">
            {module2.chapters.map((chapter, i) => {
              const prog = modProgress ? getChapterProgress(chapter.id) : null;
              const locked = !isChapterUnlocked(chapter.id, chapterIds);
              return (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  progress={modProgress ? (modProgress.chapters[chapter.id] ?? null) : null}
                  locked={locked}
                  index={i}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-10 text-center text-xs text-blue-300/20">
          Content from Genius Armoury Cybersecurity MOOC · Untapped Holdings Pty Ltd · FEIT Hackathon 2026
        </div>
      </main>
    </div>
  );
}
