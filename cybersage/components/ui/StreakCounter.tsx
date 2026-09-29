"use client";

interface StreakCounterProps {
  streak: number;
}

export default function StreakCounter({ streak }: StreakCounterProps) {
  if (streak === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="streak-flame text-xl">🔥</span>
      <div>
        <p className="text-sm font-bold text-orange-300 leading-none">{streak}</p>
        <p className="text-[10px] text-orange-400/60 leading-none">day streak</p>
      </div>
    </div>
  );
}
