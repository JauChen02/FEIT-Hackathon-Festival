"use client";

import { useState, useEffect } from "react";
import { loadProgress } from "@/lib/progress";
import { UserProgress } from "@/types";
import Link from "next/link";
import { ChevronLeft, Users, Copy, Check, Play, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
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
    setPlayerName(p.displayName);
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
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-blue-300/60 hover:text-blue-200">
            <ChevronLeft size={16} /> Back
          </Link>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#4FC3F7]" />
            <span className="font-semibold text-white">Classroom</span>
          </div>
          <div className="w-16" />
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8 text-center">
            <div className="mb-3 text-5xl">🎓</div>
            <h1 className="text-2xl font-bold text-white">Live Classroom</h1>
            <p className="mt-1 text-sm text-blue-300/50">
              Kahoot-style cybersecurity quizzes with your class. Real-time leaderboard included.
            </p>
          </div>

          {mode === "choose" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => setMode("host")}
                className="group rounded-2xl border border-[#1A4A8A]/40 bg-[#0B1E3D]/60 p-6 text-left transition hover:border-[#2D7DD2]/60 hover:bg-[#0F2548]/70"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1A4A8A]/30 text-2xl group-hover:bg-[#1A4A8A]/50 transition">
                  📡
                </div>
                <h3 className="font-semibold text-white mb-1">Host a Session</h3>
                <p className="text-sm text-blue-300/50 leading-relaxed">
                  Create a room, share the code with your class, and run a live quiz battle.
                </p>
              </button>

              <button
                onClick={() => setMode("join")}
                className="group rounded-2xl border border-[#1A4A8A]/40 bg-[#0B1E3D]/60 p-6 text-left transition hover:border-[#2D7DD2]/60 hover:bg-[#0F2548]/70"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1A4A8A]/30 text-2xl group-hover:bg-[#1A4A8A]/50 transition">
                  🎮
                </div>
                <h3 className="font-semibold text-white mb-1">Join a Session</h3>
                <p className="text-sm text-blue-300/50 leading-relaxed">
                  Enter a room code from your instructor to compete with classmates.
                </p>
              </button>

              <Link
                href={`/scenario/${progress ? "phishing-01" : "phishing-01"}`}
                className="group sm:col-span-2 flex items-center gap-4 rounded-2xl border border-[#1A4A8A]/40 bg-[#0B1E3D]/60 p-5 transition hover:border-[#2D7DD2]/60"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1A4A8A]/30 text-xl">
                  🧑‍💻
                </div>
                <div>
                  <p className="font-medium text-white">Solo Practice</p>
                  <p className="text-sm text-blue-300/40">Work through missions at your own pace with AI coaching</p>
                </div>
                <BookOpen size={16} className="ml-auto text-blue-300/30" />
              </Link>
            </div>
          )}

          {mode === "host" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <button onClick={() => setMode("choose")} className="text-sm text-blue-300/50 hover:text-blue-200 flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              
              <div className="rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-6 space-y-5">
                <div>
                  <label className="block text-xs text-blue-300/50 mb-2">Your display name</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full rounded-xl border border-[#1A4A8A]/40 bg-[#071428]/80 px-4 py-2.5 text-sm text-blue-100 outline-none focus:border-[#2D7DD2]/60"
                    placeholder="Enter your name..."
                  />
                </div>

                <div>
                  <label className="block text-xs text-blue-300/50 mb-2">Share this room code with your class</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-1 rounded-xl border border-[#00B4D8]/40 bg-[#0077B6]/10 px-4 py-3 text-center text-3xl font-bold tracking-[0.3em] text-[#4FC3F7]"
                      style={{ fontFamily: "monospace" }}
                    >
                      {hostCode}
                    </div>
                    <button
                      onClick={copyCode}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 text-blue-300 transition hover:bg-[#1A4A8A]/40"
                    >
                      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[#1A4A8A]/20 bg-[#071428]/60 px-4 py-3">
                  <p className="text-xs text-blue-300/40 text-center">Waiting for players to join... (simulated)</p>
                  <div className="mt-2 flex justify-center gap-2 flex-wrap">
                    {["🦊 ShadowFox", "🐬 NetNinja", "🦅 NightOwl"].map((p) => (
                      <span key={p} className="text-xs rounded-full border border-[#1A4A8A]/30 px-2.5 py-1 text-blue-200/60">{p}</span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition"
                  style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)", boxShadow: "0 0 20px rgba(0,180,216,0.25)" }}
                >
                  <Play size={16} />
                  Start the Quiz
                </button>
              </div>
            </motion.div>
          )}

          {mode === "join" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <button onClick={() => setMode("choose")} className="text-sm text-blue-300/50 hover:text-blue-200 flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              
              <div className="rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/60 p-6 space-y-5">
                <div>
                  <label className="block text-xs text-blue-300/50 mb-2">Your display name</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full rounded-xl border border-[#1A4A8A]/40 bg-[#071428]/80 px-4 py-2.5 text-sm text-blue-100 outline-none focus:border-[#2D7DD2]/60"
                    placeholder="Enter your name..."
                  />
                </div>

                <div>
                  <label className="block text-xs text-blue-300/50 mb-2">Room code (from your instructor)</label>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="w-full rounded-xl border border-[#1A4A8A]/40 bg-[#071428]/80 px-4 py-3 text-center text-2xl font-bold tracking-widest text-[#4FC3F7] outline-none focus:border-[#2D7DD2]/60"
                    style={{ fontFamily: "monospace" }}
                    placeholder="_ _ _ _ _ _"
                  />
                </div>

                <button
                  onClick={joinGame}
                  disabled={joinCode.trim().length < 4}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)" }}
                >
                  <Play size={16} />
                  Join Game
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
