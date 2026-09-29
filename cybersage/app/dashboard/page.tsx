"use client";

import { useEffect, useState } from "react";
import { loadProgress, getAccuracy, getLevel } from "@/lib/progress";
import { UserProgress } from "@/types";
import { scenarios } from "@/data/scenarios";
import XPBar from "@/components/ui/XPBar";
import Badge from "@/components/ui/Badge";
import StreakCounter from "@/components/ui/StreakCounter";
import { Shield, Target, Zap, TrendingUp, ChevronLeft, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => { setProgress(loadProgress()); }, []);

  if (!progress) return null;

  const accuracy = getAccuracy(progress);
  const { level, label, nextXP } = getLevel(progress.totalXP);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-blue-300/50 hover:text-blue-200 transition"
          >
            <ChevronLeft size={16} /> Missions
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-0.5">
              {["#0077B6","#0096C7","#00B4D8","#48CAE4","#90E0EF","#00B4D8","#0096C7"].map((c, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-sm font-bold text-white">CyberSage</span>
          </div>
          <div className="w-28">
            <XPBar xp={progress.totalXP} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-start gap-5"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 text-3xl">
            {progress.avatar}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{progress.displayName}</h1>
            <p className="text-blue-300/50">Level {level} · {label}</p>
            <div className="mt-2 flex items-center gap-3">
              <StreakCounter streak={progress.streak} />
              {progress.badges.length > 0 && (
                <span className="text-xs text-blue-300/30">
                  {progress.badges.length} badge{progress.badges.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Link
              href="/leaderboard"
              className="flex items-center gap-1.5 rounded-xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 px-3 py-2 text-xs text-blue-200 hover:bg-[#1A4A8A]/30 transition"
            >
              <Trophy size={12} /> Rankings
            </Link>
            <Link
              href="/classroom"
              className="flex items-center gap-1.5 rounded-xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 px-3 py-2 text-xs text-blue-200 hover:bg-[#1A4A8A]/30 transition"
            >
              <Users size={12} /> Classroom
            </Link>
          </div>
        </motion.div>

        {/* XP Progress */}
        <div className="mb-6 rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-200">XP Progress</p>
            <span className="text-xs text-blue-300/40">
              {progress.totalXP} / {nextXP} XP to next level
            </span>
          </div>
          <XPBar xp={progress.totalXP} showLabel={false} />
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Zap,        label: "Total XP",  value: progress.totalXP,                                   color: "text-[#4FC3F7]",   iconColor: "text-[#4FC3F7]"   },
            { icon: Target,     label: "Accuracy",  value: `${accuracy}%`,                                     color: "text-emerald-300", iconColor: "text-emerald-400" },
            { icon: TrendingUp, label: "Missions",  value: `${progress.completedScenarios.length}/${scenarios.length}`, color: "text-blue-300",    iconColor: "text-blue-400"    },
            { icon: Shield,     label: "Badges",    value: progress.badges.length,                             color: "text-purple-300",  iconColor: "text-purple-400"  },
          ].map(({ icon: Icon, label, value, color, iconColor }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="rounded-xl border border-[#1A4A8A]/25 bg-[#0B1E3D]/50 p-4"
            >
              <Icon size={15} className={`mb-2 ${iconColor}`} />
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-blue-300/35">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* Skill Scores */}
        <div className="mb-6 rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-5">
          <p className="mb-5 text-sm font-medium text-blue-200">Skill Confidence</p>
          <div className="space-y-4">
            {Object.entries(progress.skillScores).map(([skill, score]) => (
              <div key={skill}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-blue-300/50">{skill}</span>
                  <span className="text-[#4FC3F7]/60">{score}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#1A4A8A]/20 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #0077B6, #4FC3F7)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        {progress.badges.length > 0 ? (
          <div className="rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-5">
            <p className="mb-4 text-sm font-medium text-blue-200">Achievements</p>
            <div className="flex flex-wrap gap-2">
              {progress.badges.map((b) => <Badge key={b} id={b} />)}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#1A4A8A]/30 p-8 text-center">
            <p className="text-2xl mb-2">🎖️</p>
            <p className="text-sm text-blue-300/35 mb-4">Complete missions to earn badges</p>
            <Link
              href="/"
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition"
              style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)" }}
            >
              Start a Mission
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
