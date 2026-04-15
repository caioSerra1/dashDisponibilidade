"use client";

/**
 * Matriz 7x24 (seg-first) de tasks fechadas por dia-da-semana × hora.
 * Heatmap em escala de intensidade baseado no max. Hover mostra o valor.
 */
export function TeamHeatmap({ grid }: { grid: number[][] }) {
  const flat = grid.flat();
  const max = Math.max(1, ...flat);
  const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-10" />
          <div className="flex-1 grid grid-cols-24">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="text-[9px] text-muted-foreground text-center"
                style={{ width: 16 }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center">
            <div className="w-10 text-[10px] text-muted-foreground pr-1 text-right">
              {DAYS[d]}
            </div>
            <div className="flex-1 grid grid-cols-24 gap-[1px]">
              {row.map((value, h) => {
                const intensity = value === 0 ? 0 : value / max;
                const bg =
                  intensity === 0
                    ? "rgba(255,255,255,0.05)"
                    : `rgba(59,130,246,${0.15 + intensity * 0.65})`;
                return (
                  <div
                    key={h}
                    title={`${DAYS[d]} ${String(h).padStart(2, "0")}h: ${value} tasks`}
                    className="h-4 rounded-[2px]"
                    style={{ background: bg }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
