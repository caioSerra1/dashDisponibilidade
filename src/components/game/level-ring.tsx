"use client";
import { motion } from "framer-motion";
import { LEVELS, type Level } from "@/lib/gamification";

export function LevelRing({ xp, level }: { xp: number; level: Level }) {
  const currentIdx = LEVELS.findIndex((l) => l.name === level.name);
  const next = LEVELS[currentIdx + 1];
  const min = level.minXp;
  const max = next?.minXp ?? min + 500;
  const pct = Math.min(100, ((xp - min) / (max - min)) * 100);
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-20 w-20">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} strokeWidth="6" stroke="hsl(var(--muted))" fill="none" />
          <motion.circle
            cx="40"
            cy="40"
            r={radius}
            strokeWidth="6"
            stroke={level.color}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {xp}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">{level.name}</p>
        <p className="text-xs text-muted-foreground">{xp} XP</p>
        {next && (
          <p className="text-xs text-muted-foreground">{max - xp} p/ {next.name}</p>
        )}
      </div>
    </div>
  );
}
