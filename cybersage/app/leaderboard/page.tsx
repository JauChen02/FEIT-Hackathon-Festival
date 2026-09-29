"use client";

import { useEffect, useState } from "react";
import { loadProgress, getAccuracy } from "@/lib/progress";
import { getGlobalLeaderboard, insertUserIntoLeaderboard } from "@/lib/leaderboard";
import { LeaderboardEntry, UserProgress } from "@/types";
import XPBar from "@/components/ui/XPBar";
import Link from "next/link";
import { ChevronLeft, Trophy, Flame, Target, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

const RANK_STYLES: Record<number, { bg: string; text: string; icon: string }> = {
  1: { bg: "bg-gradient-to-r from-yellow-500/20 to-amber-400/10 border-yellow-400/40", text: "text-yellow-300", icon: "🥇" },
  2: { bg: "bg-gradient-to-r from-slate-400/15 to-slate-300/5 border-slate-400/30",   text: "text-slate-300",  icon: "🥈" },
  3: { bg: "bg-gradient-to-r from-amber-700/20 to-amber-600/5 border-amber-600/30",    text: "text-amber-400", icon: "🥉" },
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [tab, setTab] = useState<"global" | "weekly">("global");

  useEffect(() => {
    const progress = loadProgress();
    setUserProgress(progress);
    const global = getGlobalLeaderboard();
    const withUser = insertUserIntoLeaderboard(
      global,
      progress.userId,
      progress.displayName,
      progress.avatar,
      progress.totalXP,
      progress.streak,
      progress.completedScenarios.length,
      getAccuracy(progress)
    );
    setEntries(withUser);
  }, []);

  const userEntry = entries.find((e) => e.isCurrentUser);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-blue-300/60 transition hover:text-blue-200">
            <ChevronLeft size={16} /> Missions
          </Link>
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-yellow-400" />
            <span className="font-semibold text-white">Rankings</span>
          </div>
          {userProgress && <div className="w-28"><XPBar xp={userProgress.totalXP} /></div>}
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">🏆</div>
          <h1 className="text-2xl font-bold text-white">Global Rankings</h1>
          <p className="mt-1 text-sm text-blue-300/50">Updated in real time. Compete with learners worldwide.</p>
        </div>

        {/* Your rank card */}
        {userEntry && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 rounded-2xl border border-[#00B4D8]/40 bg-gradient-to-r from-[#0077B6]/20 to-[#00B4D8]/10 p-4"
            style={{ boxShadow: "0 0 24px rgba(0,180,216,0.12)" }}
          >
            <p className="mb-2 text-xs text-[#4FC3F7]/60 font-medium">Your Current Rank</p>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1A4A8A]/40 text-2xl">
                {userEntry.avatar}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">{userEntry.displayName}</p>
                <p className="text-xs text-blue-300/50">{userEntry.totalXP} XP · {userEntry.accuracy}% accuracy</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#4FC3F7]">#{userEntry.rank}</p>
                {userEntry.streak > 0 && (
                  <p className="text-xs text-orange-300">🔥 {userEntry.streak} day streak</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab toggle */}
        <div className="mb-4 flex gap-1 rounded-xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-1">
          {(["global", "weekly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition",
                tab === t
                  ? "bg-[#1A4A8A] text-white"
                  : "text-blue-300/50 hover:text-blue-200"
              )}
            >
              {t === "global" ? "🌏 Global" : "📅 This Week"}
            </button>
          ))}
        </div>

        {/* Leaderboard list */}
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const rankStyle = RANK_STYLES[entry.rank];
            const isUser = entry.isCurrentUser;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={clsx(
                  "flex items-center gap-4 rounded-xl border px-4 py-3 transition",
                  isUser
                    ? "border-[#00B4D8]/40 bg-[#0077B6]/15"
                    : rankStyle
                    ? rankStyle.bg
                    : "border-[#1A4A8A]/20 bg-[#0B1E3D]/40"
                )}
              >
                {/* Rank */}
                <div className="w-8 text-center">
                  {rankStyle ? (
                    <span className="text-xl">{rankStyle.icon}</span>
                  ) : (
                    <span className="text-sm font-mono text-blue-300/40">#{entry.rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1A4A8A]/30 text-lg">
                  {entry.avatar}
                </div>

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={clsx("font-medium truncate", isUser ? "text-[#4FC3F7]" : "text-blue-100")}>
                      {entry.displayName}
                      {isUser && <span className="ml-1 text-xs text-[#4FC3F7]/60">(you)</span>}
                    </p>
                    {entry.streak >= 3 && <span className="text-xs">🔥</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-blue-300/40 mt-0.5">
                    <span className="flex items-center gap-1"><Shield size={10} /> {entry.completedScenarios} missions</span>
                    <span className="flex items-center gap-1"><Target size={10} /> {entry.accuracy}%</span>
                    {entry.streak > 0 && <span className="flex items-center gap-1"><Flame size={10} className="text-orange-400" /> {entry.streak}d</span>}
                  </div>
                </div>

                {/* XP */}
                <div className="text-right">
                  <p className={clsx("font-bold", rankStyle ? rankStyle.text : isUser ? "text-[#4FC3F7]" : "text-blue-200")}>
                    {entry.totalXP}
                  </p>
                  <p className="text-xs text-blue-300/30">XP</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-blue-300/20">
          Complete more missions to climb the ranks · Rankings reset weekly
        </p>
      </main>
    </div>
  );
}
