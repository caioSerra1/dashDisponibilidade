"use client";

import type { BacklogAging } from "@/lib/team-metrics";

const BUCKETS: Array<{ key: keyof BacklogAging; label: string; color: string }> = [
  { key: "0-2d", label: "0–2 dias", color: "bg-success" },
  { key: "3-7d", label: "3–7 dias", color: "bg-primary" },
  { key: "8-14d", label: "8–14 dias", color: "bg-warning" },
  { key: "15-30d", label: "15–30 dias", color: "bg-orange-500" },
  { key: ">30d", label: "> 30 dias", color: "bg-destructive" },
];

/**
 * Chart horizontal das faixas de idade do backlog. Cada linha mostra um
 * bucket com contagem + barra proporcional ao máximo.
 */
export function BacklogAgingChart({ data }: { data: BacklogAging }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(data));

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhuma task aberta no momento.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {BUCKETS.map((b) => {
        const value = data[b.key];
        const pct = (value / max) * 100;
        return (
          <div key={b.key} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-16 shrink-0">
              {b.label}
            </span>
            <div className="flex-1 h-4 rounded-sm bg-muted overflow-hidden">
              <div
                className={`h-full ${b.color} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold w-8 text-right tabular-nums">
              {value}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground pt-1 border-t">
        Total: {total} tasks abertas
      </p>
    </div>
  );
}
