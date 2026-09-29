"use client";
import { getLevel } from "@/lib/progress";
import { clsx } from "clsx";

interface XPBarProps {
  xp: number;
  className?: string;
  showLabel?: boolean;
}

export default function XPBar({ xp, className, showLabel = true }: XPBarProps) {
  const { level, label, nextXP, prevXP } = getLevel(xp);
  const range = nextXP - prevXP;
  const progress = Math.min(100, ((xp - prevXP) / range) * 100);

  return (
    <div className={clsx("space-y-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#4FC3F7]">
            Lv.{level} · {label}
          </span>
          <span className="text-blue-300/60">{xp} XP</span>
        </div>
      )}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#0B1E3D]/80 border border-[#1A4A8A]/40">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, #0077B6, #00B4D8, #4FC3F7)",
            boxShadow: "0 0 8px rgba(79,195,247,0.5)",
          }}
        />
      </div>
    </div>
  );
}
