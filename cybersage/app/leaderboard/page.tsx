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

const RANK_BADGES: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  1: { bg: "bg-amber-50/80", border: "border-amber-300", text: "text-amber-700", icon: "🥇" },
  2: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-700", icon: "🥈" },
  3: { bg: "bg-orange-50/60", border: "border-orange-200", text: "text-orange-700", icon: "🥉" },
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
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 1. 顶部纯白导航栏 */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 sm:px-8 py-3.5 shadow-sm text-slate-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
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
            <span className="font-extrabold text-slate-900 tracking-tight text-sm">Rankings</span>
          </div>

          <div className="w-28 hidden sm:block">
            {userProgress && <XPBar xp={userProgress.totalXP} />}
          </div>
        </div>
      </nav>

      {/* 2. 主体排行榜 */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        {/* 顶部标题 */}
        <div className="mb-8 text-center">
          <div className="inline-block p-3 rounded-2xl bg-white/10 backdrop-blur-md mb-3 border border-white/20 text-3xl">
            🏆
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-tight text-white mb-2">
            Global Rankings
          </h1>
          <p className="max-w-md mx-auto text-blue-100/90 text-sm leading-relaxed font-normal">
            Real-time cybersecurity leaderboards. Compete with peers across cohorts.
          </p>
        </div>

        {/* 玩家当前排名卡片 (白底直角 + 强调高亮边) */}
        {userEntry && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-white border-2 border-blue-400 rounded-none p-5 text-slate-800 shadow-lg relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 bg-[#0066B3] text-white text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-0.5">
              Your Current Standing
            </div>

            <div className="flex items-center gap-4 mt-1">
              <div className="flex h-14 w-14 items-center justify-center bg-blue-50 border border-blue-100 text-3xl">
                {userEntry.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-black text-slate-900 truncate">{userEntry.displayName}</p>
                  <span className="text-[11px] font-mono font-bold uppercase bg-blue-50 text-[#0066B3] px-1.5 py-0.2 border border-blue-200">
                    YOU
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  {userEntry.totalXP} Total XP · {userEntry.accuracy}% Accuracy
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-[#0066B3] font-mono">#{userEntry.rank}</p>
                {userEntry.streak > 0 && (
                  <p className="text-xs font-bold text-amber-600">🔥 {userEntry.streak}d streak</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab 切换栏 (纯直角线框风格) */}
        <div className="mb-4 flex border border-white/30 bg-white/10 p-1">
          {(["global", "weekly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "flex-1 py-2 text-xs font-bold uppercase tracking-wider transition rounded-none",
                tab === t
                  ? "bg-white text-[#0066B3] shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-white/5"
              )}
            >
              {t === "global" ? "🌏 Global All-Time" : "📅 Weekly Sprint"}
            </button>
          ))}
        </div>

        {/* 榜单列表 (白底直角卡片流) */}
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const rankStyle = RANK_BADGES[entry.rank];
            const isUser = entry.isCurrentUser;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={clsx(
                  "flex items-center gap-4 bg-white border rounded-none px-5 py-3.5 shadow-sm transition-all text-slate-800 hover:shadow-md",
                  isUser
                    ? "border-2 border-[#0066B3] ring-2 ring-blue-200"
                    : rankStyle
                    ? `${rankStyle.bg} ${rankStyle.border}`
                    : "border-slate-200"
                )}
              >
                {/* 排名 */}
                <div className="w-8 text-center flex justify-center items-center">
                  {rankStyle ? (
                    <span className="text-xl">{rankStyle.icon}</span>
                  ) : (
                    <span className="text-sm font-mono font-bold text-slate-400">#{entry.rank}</span>
                  )}
                </div>

                {/* 头像 */}
                <div className="flex h-10 w-10 items-center justify-center bg-slate-100 border border-slate-200 text-xl">
                  {entry.avatar}
                </div>

                {/* 玩家信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={clsx("font-bold text-sm truncate", isUser ? "text-[#0066B3] font-black" : "text-slate-900")}>
                      {entry.displayName}
                    </p>
                    {isUser && (
                      <span className="text-[10px] font-mono font-bold bg-blue-100 text-[#0066B3] px-1 py-0.2">
                        you
                      </span>
                    )}
                    {entry.streak >= 3 && <span className="text-xs">🔥</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 font-medium">
                    <span className="flex items-center gap-1">
                      <Shield size={12} className="text-slate-400" /> {entry.completedScenarios} missions
                    </span>
                    <span className="flex items-center gap-1">
                      <Target size={12} className="text-slate-400" /> {entry.accuracy}%
                    </span>
                    {entry.streak > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 font-semibold">
                        <Flame size={12} /> {entry.streak}d
                      </span>
                    )}
                  </div>
                </div>

                {/* XP 积分 */}
                <div className="text-right">
                  <p className="font-mono text-base font-black text-[#0066B3]">
                    {entry.totalXP}
                  </p>
                  <p className="text-[10px] font-mono uppercase font-bold text-slate-400">XP</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <p className="mt-8 text-center text-xs text-white/50 tracking-wider font-medium">
          Rankings reset weekly · Keep solving scenarios to protect the leaderboard lead
        </p>
      </main>
    </div>
  );
}