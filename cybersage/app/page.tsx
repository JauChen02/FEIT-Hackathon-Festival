"use client";

import { useEffect, useState } from "react";
import { scenarios } from "@/data/scenarios";
import { loadProgress, getAccuracy, getLevel } from "@/lib/progress";
import { UserProgress } from "@/types";
import ScenarioCard from "@/components/scenario/ScenarioCard";
import XPBar from "@/components/ui/XPBar";
import Badge from "@/components/ui/Badge";
import StreakCounter from "@/components/ui/StreakCounter";
import { Trophy, Users, LogIn, ArrowRight, ShieldCheck, Cpu, Swords, Sparkles } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function HomePage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const completed = progress?.completedScenarios ?? [];
  const xp = progress?.totalXP ?? 0;
  const accuracy = progress ? getAccuracy(progress) : 0;
  const { level, label } = getLevel(xp);

  // 官网同款的功能 Features
  const features = [
    { label: "AI SCENARIO SIMULATION", icon: Cpu },
    { label: "REAL-TIME COACHING", icon: Sparkles },
    { label: "LIVE CLASSROOM BATTLES", icon: Swords },
    { label: "THREAT INTELLIGENCE", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 1. 顶部纯白导航栏：增加右上角 Login 按钮 */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 sm:px-8 py-3.5 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Untapped 点阵 Logo */}
            <div className="grid grid-cols-2 gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0066B3]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#0284C7]"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#004C85]"></span>
            </div>
            <span className="text-xl font-bold tracking-tight text-[#0066B3]">
              untapped<span className="text-slate-900 font-medium">.</span>
            </span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="font-semibold text-slate-800 text-sm">CyberSage</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {progress && <StreakCounter streak={progress.streak} />}
            {progress && (
              <div className="hidden w-28 md:block">
                <XPBar xp={xp} />
              </div>
            )}
            
            <Link
              href="/leaderboard"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-[#0066B3] transition"
            >
              <Trophy size={13} /> Ranks
            </Link>
            
            <Link
              href="/classroom"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-[#0066B3] transition"
            >
              <Users size={13} /> Classroom
            </Link>

            {/* Login / Profile 状态切换 */}
            {!progress || progress.totalXP === 0 ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0066B3] text-white text-xs font-bold hover:bg-[#005596] transition shadow-sm"
              >
                <LogIn size={13} />
                <span>Login</span>
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200 transition"
              >
                <span>{progress.avatar}</span>
                <span className="max-w-[80px] truncate">{progress.displayName}</span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 2. 主体 Hero 区域 */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 pt-16 pb-20 flex flex-col justify-start">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full text-center"
        >
          {/* 大标题 */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight mb-6">
            Defend. Decide.
            <br />
            Empowering Innovation.
          </h1>

          {/* 重点修改 1：正文字体加粗、高对比度纯白显示，醒目清晰 */}
          <p className="max-w-3xl mx-auto text-white text-base sm:text-lg leading-relaxed font-semibold mb-8 drop-shadow-sm">
            Real cybersecurity scenarios. AI coaching. Live classroom battles. Learn the way the future demands — by building resilience, tapping into curiosity, and mastering real-world defenses.
          </p>

          {/* 官网标志性细白线 */}
          <div className="w-full max-w-2xl mx-auto h-[1px] bg-white/40 my-8"></div>

          {/* 重点修改 2：圆圈变成平台的核心 Features 药丸胶囊 */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 max-w-4xl mx-auto mb-10">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <span
                  key={feat.label}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#0066B3] text-xs font-extrabold uppercase tracking-wider shadow-md hover:scale-105 transition-transform cursor-default"
                >
                  <Icon size={14} className="text-[#0066B3]" />
                  {feat.label}
                </span>
              );
            })}
          </div>

          {/* 行动号召 CTA 按钮 */}
          <div className="mb-10">
            <Link
              href={!progress || progress.totalXP === 0 ? `/scenario/${scenarios[0].id}` : "/dashboard"}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition shadow-lg"
            >
              <span>{progress && progress.totalXP > 0 ? "Resume Training" : "Start First Scenario"}</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>

        {/* 3. 关卡模块 Training Scenarios */}
        <div className="w-full border-t border-white/20 pt-10 mt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-white">
              Training Scenarios ({completed.length} / {scenarios.length})
            </h2>
            <div className="w-40 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${(completed.length / scenarios.length) * 100}%` }}
              />
            </div>
          </div>

          {/* 卡片列表 */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((scenario, i) => (
              <motion.div
                key={scenario.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.05 }}
              >
                <ScenarioCard
                  scenario={scenario}
                  completed={completed.includes(scenario.id)}
                  locked={i > 0 && !completed.includes(scenarios[i - 1].id)}
                  index={i}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* 4. 页脚 */}
        <footer className="mt-20 border-t border-white/20 pt-8 text-center text-xs text-white/60 font-medium tracking-wider">
          Untapped CyberSage · Powered by Genius Armoury · FEIT Hackathon 2026
        </footer>
      </main>
    </div>
  );
}