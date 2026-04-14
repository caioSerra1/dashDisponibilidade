export interface SlaTier {
  minPct: number;
  payoutPct: number;
}

export function applySlaTiers(slaPct: number, tiers: readonly SlaTier[]): number {
  if (tiers.length === 0) return 0;
  const clamped = Math.max(0, Math.min(100, slaPct));
  const sorted = [...tiers].sort((a, b) => b.minPct - a.minPct);
  for (const tier of sorted) {
    if (clamped >= tier.minPct) return tier.payoutPct;
  }
  return 0;
}
