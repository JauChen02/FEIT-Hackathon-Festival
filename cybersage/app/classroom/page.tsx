"use client";

import { useState, useEffect } from "react";
import { loadProgress } from "@/lib/progress";
import { UserProgress } from "@/types";
import Link from "next/link";
import { ChevronLeft, Users, Copy, Check, Play, BookOpen, ArrowRight, Radio, Gamepad2 } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function ClassroomPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [mode, setMode] = useState<"choose" | "host" | "join">("choose");
  const [hostCode, setHostCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const router = useRouter();

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setPlayerName(p.displayName || "Agent_Guest");
    setHostCode(generateCode());
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(hostCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startGame() {
    router.push(`/classroom/play?code=${hostCode}&host=true&name=${encodeURIComponent(playerName)}`);
  }

  function joinGame() {
    if (joinCode.trim().length < 4) return;
    router.push(`/classroom/play?code=${joinCode.toUpperCase()}&name=${encodeURIComponent(playerName)}`);
  }

  return (
    <div className="min-h-screen bg-[#0066B3] text-white selection:bg-white/20 selection:text-white font-sans flex flex-col">
      {/* 1. 顶部纯白导航栏 (与首页完全一致) */}
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
            <span className="font-extrabold text-slate-900 tracking-tight text-sm">Classroom Arena</span>
          </div>

          <div className="text-xs font-mono font-bold text-slate-400">
            {progress?.avatar} {progress?.displayName}
          </div>
        </div>
      </nav>

      {/* 2. 主体操作面板 */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col justify-start">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header 说明 */}
          <div className="mb-10 text-center">
            <div className="inline-block p-3 rounded-2xl bg-white/10 backdrop-blur-md mb-3 border border-white/20 text-3xl">
              🎓
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-white mb-2">
              Live Classroom
            </h1>
            <p className="max-w-md mx-auto text-blue-100/90 text-sm sm:text-base leading-relaxed font-normal">
              Kahoot-style cybersecurity battle arena. Host a live session with your cohort or enter a room code.
            </p>
          </div>

          {/* 模式选择（白底 + 直角卡片） */}
          {mode === "choose" && (
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Host 卡片 */}
              <button
                onClick={() => setMode("host")}
                className="group relative flex flex-col justify-between bg-white border border-slate-200 rounded-none p-6 text-left shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-[#0066B3]"
              >
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center bg-blue-50 text-[#0066B3] border border-blue-100">
                    <Radio size={22} />
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0066B3]">
                    Instructor / Leader
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1 mb-2">
                    Host a Session
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Create a live room, project on screen, and guide students through adaptive cyber challenges.
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-[#0066B3] border-t border-slate-100 pt-3">
                  <span>Create Arena</span>
                  <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Join 卡片 */}
              <button
                onClick={() => setMode("join")}
                className="group relative flex flex-col justify-between bg-white border border-slate-200 rounded-none p-6 text-left shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-[#0066B3]"
              >
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Gamepad2 size={22} />
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600">
                    Student / Defender
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1 mb-2">
                    Join a Session
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Enter the 6-character room PIN from your session host to battle on the live scoreboard.
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-emerald-600 border-t border-slate-100 pt-3">
                  <span>Enter Room</span>
                  <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Solo Practice 连贯卡片 */}
              <Link
                href="/scenario/phishing-01"
                className="group sm:col-span-2 flex items-center justify-between bg-white/10 border border-white/20 rounded-none p-5 text-white backdrop-blur-sm hover:bg-white/15 transition shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center bg-white/10 text-xl border border-white/20">
                    🧑‍💻
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Solo Interactive Practice</p>
                    <p className="text-xs text-blue-100/70">Work through modules individually with real-time AI mentoring</p>
                  </div>
                </div>
                <BookOpen size={18} className="text-white/60 group-hover:text-white transition-colors" />
              </Link>
            </div>
          )}

          {/* Host 流程 */}
          {mode === "host" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <button
                onClick={() => setMode("choose")}
                className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white transition"
              >
                <ChevronLeft size={14} /> Back to Selection
              </button>

              <div className="bg-white border border-slate-200 rounded-none p-8 text-slate-800 shadow-xl space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Your Host Display Name
                  </label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full rounded-none border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#0066B3] focus:bg-white transition"
                    placeholder="Enter your name..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Class Room PIN (Project this on screen)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-none border-2 border-dashed border-[#0066B3] bg-blue-50/60 px-4 py-3 text-center text-3xl font-black tracking-[0.35em] text-[#0066B3] font-mono">
                      {hostCode}
                    </div>
                    <button
                      onClick={copyCode}
                      className="flex h-14 w-14 items-center justify-center border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                      title="Copy PIN"
                    >
                      {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 text-center">
                    Simulated Active Lobby
                  </p>
                  <div className="mt-3 flex justify-center gap-2 flex-wrap">
                    {["🦊 ShadowFox", "🐬 NetNinja", "🦅 NightOwl"].map((p) => (
                      <span
                        key={p}
                        className="text-xs font-medium rounded-none bg-white border border-slate-200 px-3 py-1 text-slate-700 shadow-sm"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="flex w-full items-center justify-center gap-2 rounded-none bg-[#0066B3] py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#005596] shadow-md active:scale-[0.99]"
                >
                  <Play size={15} />
                  Start Live Session
                </button>
              </div>
            </motion.div>
          )}

          {/* Join 流程 */}
          {mode === "join" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <button
                onClick={() => setMode("choose")}
                className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white transition"
              >
                <ChevronLeft size={14} /> Back to Selection
              </button>

              <div className="bg-white border border-slate-200 rounded-none p-8 text-slate-800 shadow-xl space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Your Player Call-Sign
                  </label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full rounded-none border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#0066B3] focus:bg-white transition"
                    placeholder="Enter your name..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    6-Digit Room Code
                  </label>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="w-full rounded-none border-2 border-slate-300 bg-slate-50 px-4 py-3 text-center text-3xl font-black tracking-widest text-[#0066B3] outline-none font-mono focus:border-[#0066B3] focus:bg-white transition"
                    placeholder="______"
                  />
                </div>

                <button
                  onClick={joinGame}
                  disabled={joinCode.trim().length < 4}
                  className="flex w-full items-center justify-center gap-2 rounded-none bg-[#0066B3] py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#005596] disabled:opacity-50 shadow-md active:scale-[0.99]"
                >
                  <Play size={15} />
                  Join Room
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}