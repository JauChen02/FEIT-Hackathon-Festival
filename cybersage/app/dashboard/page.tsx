"use client";

import { useEffect, useState } from "react";
import { loadProgress, getAccuracy, getLevel } from "@/lib/progress";
import { UserProgress } from "@/types";
import { scenarios } from "@/data/scenarios";
import XPBar from "@/components/ui/XPBar";
import Badge from "@/components/ui/Badge";
import StreakCounter from "@/components/ui/StreakCounter";
import { Shield, Target, Zap, TrendingUp, ChevronLeft, Trophy, Users, Award } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  if (!progress) return null;

  const accuracy = getAccuracy(progress);
  const { level, label, nextXP } = getLevel(progress.totalXP);

  return (
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 1. 顶部纯白导航栏 */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 sm:px-8 py-3.5 shadow-sm text-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-[#0066B3] transition"
          >
            <ChevronLeft size={16} /> Missions
          </Link>

          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0066B3]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#0284C7]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#004C85]"></span>
            </div>
            <span className="font-extrabold text-slate-900 tracking-tight text-sm">Dashboard</span>
          </div>

          <div className="w-28 hidden sm:block">
            <XPBar xp={progress.totalXP} />
          </div>
        </div>
      </nav>

      {/* 2. 主体个人信息与数据中心 */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-10">
        {/* Profile Header (白底直角卡片) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center gap-5 bg-white border border-slate-200 rounded-none p-6 text-slate-800 shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center bg-blue-50 border border-blue-100 text-3xl">
            {progress.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{progress.displayName}</h1>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider bg-blue-50 text-[#0066B3] px-2 py-0.5 border border-blue-100">
                Agent Active
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 mt-0.5">Level {level} · {label}</p>
            <div className="mt-2.5 flex items-center gap-3">
              <StreakCounter streak={progress.streak} />
              {progress.badges.length > 0 && (
                <span className="text-xs font-mono font-bold text-slate-400">
                  {progress.badges.length} badge{progress.badges.length !== 1 ? "s" : ""} unlocked
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Link
              href="/leaderboard"
              className="flex items-center gap-1.5 border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#0066B3] hover:text-[#0066B3] hover:bg-white transition"
            >
              <Trophy size={13} className="text-amber-500" /> Rankings
            </Link>
            <Link
              href="/classroom"
              className="flex items-center gap-1.5 border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#0066B3] hover:text-[#0066B3] hover:bg-white transition"
            >
              <Users size={13} className="text-[#0066B3]" /> Classroom
            </Link>
          </div>
        </motion.div>

        {/* XP Progress (白底直角卡片) */}
        <div className="mb-6 bg-white border border-slate-200 rounded-none p-6 text-slate-800 shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">XP Progress</p>
            <span className="text-xs font-mono font-bold text-[#0066B3]">
              {progress.totalXP} / {nextXP} XP to next level
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 border border-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#0066B3] to-[#38BDF8] transition-all duration-700"
              style={{ width: `${Math.min(100, (progress.totalXP / nextXP) * 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid (4 个纯直角白底卡片) */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Zap, label: "Total XP", value: progress.totalXP, color: "text-[#0066B3]", bg: "bg-blue-50 text-[#0066B3]" },
            { icon: Target, label: "Accuracy", value: `${accuracy}%`, color: "text-emerald-600", bg: "bg-emerald-50 text-emerald-600" },
            { icon: TrendingUp, label: "Missions", value: `${progress.completedScenarios.length}/${scenarios.length}`, color: "text-amber-600", bg: "bg-amber-50 text-amber-600" },
            { icon: Shield, label: "Badges", value: progress.badges.length, color: "text-sky-600", bg: "bg-sky-50 text-sky-600" },
          ].map(({ icon: Icon, label, value, color, bg }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.05 }}
              className="bg-white border border-slate-200 rounded-none p-5 shadow-md flex flex-col justify-between"
            >
              <div className={`w-8 h-8 flex items-center justify-center mb-3 ${bg}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Skill Scores (白底直角卡片) */}
        <div className="mb-6 bg-white border border-slate-200 rounded-none p-6 text-slate-800 shadow-md">
          <p className="mb-5 text-xs font-black uppercase tracking-wider text-slate-500">Skill Competency</p>
          <div className="space-y-4">
            {Object.entries(progress.skillScores).map(([skill, score]) => (
              <div key={skill}>
                <div className="mb-1.5 flex justify-between text-xs font-bold">
                  <span className="text-slate-700">{skill}</span>
                  <span className="font-mono text-[#0066B3]">{score}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 border border-slate-200 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-[#0066B3] to-[#38BDF8]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badges Achievements (白底直角卡片) */}
        {progress.badges.length > 0 ? (
          <div className="bg-white border border-slate-200 rounded-none p-6 text-slate-800 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <Award size={16} className="text-[#0066B3]" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Earned Badges</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {progress.badges.map((b) => (
                <div key={b} className="border border-slate-200 px-3 py-1.5 bg-slate-50">
                  <Badge id={b} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white/10 border border-white/20 rounded-none p-8 text-center text-white backdrop-blur-sm">
            <p className="text-3xl mb-2">🎖️</p>
            <p className="text-sm font-semibold text-blue-100 mb-4">Complete missions to earn badges</p>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-none bg-white text-[#0066B3] text-xs font-black uppercase tracking-wider shadow-md hover:bg-blue-50 transition"
            >
              Start First Mission
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}