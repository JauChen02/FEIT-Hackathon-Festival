"use client";

import { useState } from "react";
import { Scenario } from "@/types";
import { clsx } from "clsx";
import { CheckCircle2, Circle, Lock, Bookmark } from "lucide-react";
import Link from "next/link";

const DIFFICULTY_STYLE = {
  beginner:     { text: "text-emerald-600", dot: "bg-emerald-500" },
  intermediate: { text: "text-amber-600",   dot: "bg-amber-500" },
  advanced:     { text: "text-red-600",     dot: "bg-red-500" },
};

interface ScenarioCardProps {
  scenario: Scenario;
  completed?: boolean;
  locked?: boolean;
  index: number;
}

export default function ScenarioCard({
  scenario,
  completed = false,
  locked = false,
  index,
}: ScenarioCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const diff = DIFFICULTY_STYLE[scenario.difficulty] ?? DIFFICULTY_STYLE.beginner;
  const maxXP = Math.max(...scenario.choices.map((c) => c.xpGain));

  const handleBookmarkToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsBookmarked((prev) => !prev);
  };

  if (locked) {
    return (
      <div className="relative flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-none p-6 opacity-60 cursor-not-allowed">
        <div className="space-y-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-none bg-slate-200">
            <Lock size={15} className="text-slate-400" />
          </div>
          <p className="font-bold text-slate-400">{scenario.title}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/scenario/${scenario.id}`}
      className={clsx(
        "group relative flex flex-col justify-between bg-white border rounded-none p-6 transition-all duration-200 hover:-translate-y-1 block shadow-sm hover:shadow-lg",
        completed ? "border-slate-300" : "border-slate-200 hover:border-[#0066B3]"
      )}
    >
      {/* 右上角：完成状态图标、编号、收藏 */}
      <div className="absolute right-5 top-5 flex items-center gap-2.5 z-10">
        {/* 做完显示亮绿对勾，没做显示浅灰空心圆 */}
        {completed ? (
          <span className="flex items-center text-emerald-500" title="Completed">
            <CheckCircle2 size={16} />
          </span>
        ) : (
          <span className="flex items-center text-slate-300" title="Not completed">
            <Circle size={15} />
          </span>
        )}

        <span className="text-xs font-mono font-bold text-slate-400">
          #{String(index + 1).padStart(2, "0")}
        </span>

        {/* 收藏按钮 */}
        <button
          type="button"
          onClick={handleBookmarkToggle}
          aria-label="Bookmark"
          className="p-1 rounded text-slate-400 hover:text-amber-500 transition-colors"
        >
          <Bookmark
            size={16}
            className={clsx(
              "transition-all",
              isBookmarked
                ? "fill-amber-400 text-amber-500 scale-110"
                : "text-slate-400 hover:text-slate-600"
            )}
          />
        </button>
      </div>

      {/* 文字主体 */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#0066B3]">
          {scenario.category}
        </p>

        <h3 className="mb-2 text-lg font-bold text-slate-900 group-hover:text-[#0066B3] transition-colors pr-16 leading-snug">
          {scenario.title}
        </h3>

        <p className="mb-6 text-sm text-slate-600 leading-relaxed line-clamp-3">
          {scenario.description}
        </p>
      </div>

      {/* 底部难度与奖励 */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-auto">
        <span className={clsx("inline-flex items-center text-xs font-bold capitalize", diff.text)}>
          <span className={clsx("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", diff.dot)} />
          {scenario.difficulty}
        </span>
        <span className="text-xs font-extrabold text-[#0066B3]">
          +{maxXP} XP
        </span>
      </div>
    </Link>
  );
}