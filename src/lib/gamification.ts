export interface Level {
  name: "Bronze" | "Prata" | "Ouro" | "Platina";
  minXp: number;
  color: string;
}

export const LEVELS: readonly Level[] = [
  { name: "Bronze", minXp: 0, color: "#b08d57" },
  { name: "Prata", minXp: 150, color: "#c0c0c0" },
  { name: "Ouro", minXp: 500, color: "#f5c518" },
  { name: "Platina", minXp: 1200, color: "#7fd4ff" },
];

export function computeLevel(xp: number): Level {
  let current: Level = LEVELS[0]!;
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
  }
  return current;
}

export interface SnapshotForStreak {
  date: Date;
  slaMedioMes: number;
}

export function computeStreak(
  snapshots: readonly SnapshotForStreak[],
  metaPct: number,
): number {
  if (snapshots.length === 0) return 0;
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.slaMedioMes >= metaPct) streak += 1;
    else break;
  }
  return streak;
}
