import { clsx } from "clsx";

const BADGE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  "first-blood":    { label: "First Strike",    icon: "🎯", color: "text-red-300",    bg: "bg-red-500/10 border-red-500/30" },
  "rising-defender":{ label: "Rising Defender", icon: "🛡️", color: "text-blue-300",   bg: "bg-blue-500/10 border-blue-400/30" },
  "cyber-warrior":  { label: "Cyber Warrior",   icon: "⚔️", color: "text-purple-300", bg: "bg-purple-500/10 border-purple-500/30" },
  "hat-trick":      { label: "Hat Trick",       icon: "🎩", color: "text-amber-300",  bg: "bg-amber-500/10 border-amber-500/30" },
  "scenario-master":{ label: "Mission Master",  icon: "⚡", color: "text-[#4FC3F7]",  bg: "bg-[#0077B6]/20 border-[#00B4D8]/40" },
  "on-fire":        { label: "On Fire 🔥",      icon: "🔥", color: "text-orange-300", bg: "bg-orange-500/10 border-orange-500/30" },
  "perfect-run":    { label: "Perfect Run",     icon: "💎", color: "text-cyan-300",   bg: "bg-cyan-500/10 border-cyan-400/30" },
};

interface BadgeProps {
  id: string;
  size?: "sm" | "md";
}

export default function Badge({ id, size = "md" }: BadgeProps) {
  const meta = BADGE_META[id];
  if (!meta) return null;
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 rounded-full border font-medium",
      meta.bg, meta.color,
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
    )}>
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
