"use client";

import { Scenario } from "@/types";
import { clsx } from "clsx";
import { Shield, Zap, AlertTriangle, Lock, CheckCircle } from "lucide-react";
import Link from "next/link";

const DIFFICULTY_STYLE = {
  beginner:     { pill: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400" },
  intermediate: { pill: "text-amber-300 border-amber-500/30 bg-amber-500/10",       dot: "bg-amber-400" },
  advanced:     { pill: "text-red-300 border-red-500/30 bg-red-500/10",             dot: "bg-red-400" },
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  "Social Engineering": AlertTriangle,
  "Access Control": Shield,
  "Incident Response": Zap,
};

interface ScenarioCardProps {
  scenario: Scenario;
  completed?: boolean;
  locked?: boolean;
  index: number;
}

export default function ScenarioCard({ scenario, completed = false, locked = false, index }: ScenarioCardProps) {
  const Icon = CATEGORY_ICON[scenario.category] ?? Shield;
  const diff = DIFFICULTY_STYLE[scenario.difficulty];
  const maxXP = Math.max(...scenario.choices.map(c => c.xpGain));

  if (locked) {
    return (
      <div className="relative rounded-2xl border border-[#1A4A8A]/20 bg-[#0B1E3D]/40 p-6 opacity-50 cursor-not-allowed">
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#071428]/60 backdrop-blur-[1px]">
          <Lock size={20} className="text-blue-300/40" />
        </div>
        <div className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A4A8A]/20">
            <Icon size={18} className="text-blue-300/40" />
          </div>
          <p className="font-semibold text-slate-500">{scenario.title}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/scenario/${scenario.id}`}
      className={clsx(
        "group relative block rounded-2xl border p-6 transition-all duration-300",
        completed
          ? "border-[#00B4D8]/40 bg-gradient-to-br from-[#0077B6]/15 to-[#0B1E3D]/60 hover:border-[#4FC3F7]/60"
          : "border-[#1A4A8A]/40 bg-[#0B1E3D]/50 hover:border-[#2D7DD2]/60 hover:bg-[#0F2548]/70"
      )}
      style={{ boxShadow: completed ? "0 0 20px rgba(0,180,216,0.08)" : undefined }}
    >
      {/* Mission number */}
      <div className="absolute right-5 top-5 flex items-center gap-2">
        {completed && <CheckCircle size={16} className="text-[#4FC3F7]" />}
        <span className="text-xs font-mono text-blue-300/30">#{String(index + 1).padStart(2, "0")}</span>
      </div>

      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#1A4A8A]/40 bg-[#1A4A8A]/20 transition-colors group-hover:border-[#2D7DD2]/60 group-hover:bg-[#1A4A8A]/30">
        <Icon size={20} className={completed ? "text-[#4FC3F7]" : "text-blue-300"} />
      </div>

      <p className="mb-0.5 text-xs text-blue-300/50">{scenario.category}</p>
      <h3 className="mb-2 font-semibold text-blue-50 group-hover:text-white transition-colors">
        {scenario.title}
      </h3>
      <p className="mb-5 text-sm text-blue-200/50 leading-relaxed">{scenario.description}</p>

      <div className="flex items-center justify-between">
        <span className={clsx("rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", diff.pill)}>
          <span className={clsx("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", diff.dot)} />
          {scenario.difficulty}
        </span>
        <span className="text-xs font-medium text-[#4FC3F7]/70">+{maxXP} XP</span>
      </div>
    </Link>
  );
}
