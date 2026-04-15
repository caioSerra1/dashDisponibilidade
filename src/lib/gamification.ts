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
