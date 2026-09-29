"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { getScenarioById } from "@/data/scenarios";
import { loadProgress, saveProgress, applyResult } from "@/lib/progress";
import { Scenario, Choice, UserProgress } from "@/types";
import ChoicePanel from "@/components/scenario/ChoicePanel";
import FeedbackPanel from "@/components/scenario/FeedbackPanel";
import TutorPanel from "@/components/tutor/TutorPanel";
import XPBar from "@/components/ui/XPBar";
import { Shield, AlertTriangle, ChevronLeft, Lightbulb, Zap } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";

const DIFFICULTY_COLOR = {
  beginner: "text-emerald-400",
  intermediate: "text-amber-400",
  advanced: "text-red-400",
};

function renderContext(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[#90E0EF]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("```") && part.endsWith("```")) {
      return (
        <code key={i} className="scenario-context">
          {part.slice(3, -3).trim()}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [tutorInitial, setTutorInitial] = useState<string | undefined>();
  const [xpFloat, setXpFloat] = useState<number | null>(null);

  useEffect(() => {
    const s = getScenarioById(id);
    if (!s) { router.push("/"); return; }
    setScenario(s);
    setProgress(loadProgress());
    setTutorInitial(
      `Ready to help with "${s.title}". This covers ${s.threat}. What do you want to know before deciding?`
    );
  }, [id, router]);

  function handleChoice(choice: Choice) {
    if (!scenario || !progress) return;
    setSelectedChoice(choice);
    if (choice.xpGain > 0) setXpFloat(choice.xpGain);
    const result = {
      scenarioId: scenario.id,
      choiceId: choice.id,
      isCorrect: choice.isCorrect,
      xpGained: choice.xpGain,
      feedback: choice.feedback,
    };
    const updated = applyResult(progress, result, scenario.category);
    setProgress(updated);
    saveProgress(updated);
  }

  function handleRetry() {
    setSelectedChoice(null);
    setShowHint(false);
    setXpFloat(null);
  }

  if (!scenario) return null;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#1A4A8A]/30 bg-[#071428]/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
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
          {progress && (
            <div className="w-32">
              <XPBar xp={progress.totalXP} />
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Scenario header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={clsx("font-medium capitalize", DIFFICULTY_COLOR[scenario.difficulty])}>
                {scenario.difficulty}
              </span>
              <span className="text-[#1A4A8A]">·</span>
              <span className="text-blue-300/40">{scenario.category}</span>
              <span className="text-[#1A4A8A]">·</span>
              <span className="flex items-center gap-1 text-blue-300/40">
                <AlertTriangle size={11} /> {scenario.threat}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">{scenario.title}</h1>
            <p className="mt-1 text-blue-200/50">{scenario.description}</p>
          </motion.div>

          {/* Context box */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-[#1A4A8A]/30 bg-[#0B1E3D]/50 p-6"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#4FC3F7]/40">
              <Shield size={11} />
              Situation Brief
            </div>
            <div className="scenario-context text-sm leading-relaxed text-blue-200/70">
              {renderContext(scenario.context)}
            </div>
          </motion.div>

          {/* Hint */}
          {scenario.hint && (
            <div>
              {!showHint ? (
                <button
                  onClick={() => setShowHint(true)}
                  className="flex items-center gap-2 text-xs text-blue-300/30 transition hover:text-[#4FC3F7]/60"
                >
                  <Lightbulb size={13} />
                  Reveal hint
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300/70"
                >
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  {scenario.hint}
                </motion.div>
              )}
            </div>
          )}

          {/* Choices */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-blue-300/30">
              What do you do?
            </p>
            <ChoicePanel
              choices={scenario.choices}
              selectedId={selectedChoice?.id ?? null}
              onSelect={handleChoice}
            />
          </motion.div>

          {/* XP float */}
          <AnimatePresence>
            {xpFloat && (
              <motion.div
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: -20 }}
                exit={{ opacity: 0, y: -40 }}
                onAnimationComplete={() => setXpFloat(null)}
                className="pointer-events-none flex items-center gap-1 text-sm font-bold text-[#4FC3F7]"
              >
                <Zap size={14} /> +{xpFloat} XP
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback */}
          <AnimatePresence>
            {selectedChoice && (
              <FeedbackPanel
                choice={selectedChoice}
                xpEarned={selectedChoice.xpGain}
                onRetry={handleRetry}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Right: SAGE tutor */}
        <div className="h-[580px] lg:sticky lg:top-20">
          <TutorPanel
            scenarioContext={scenario.context}
            lastChoice={selectedChoice?.text}
            initialMessage={tutorInitial}
          />
        </div>
      </main>
    </div>
  );
}
