"use client";

/**
 * Matriz 7x24 (seg-first) de tasks fechadas por dia-da-semana × hora.
 * Heatmap em escala de intensidade baseado no max. Hover mostra o valor.
 *
 * Usa `gridTemplateColumns` inline porque Tailwind default só vai até
 * `grid-cols-12` — `grid-cols-24` é silenciosamente ignorado.
 */
export function TeamHeatmap({ grid }: { grid: number[][] }) {
  const flat = grid.flat();
  const max = Math.max(1, ...flat);
  const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const cols24: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
    gap: "1px",
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-[520px] w-full">
        {/* Header: horas */}
        <div className="flex items-end">
          <div className="w-8 shrink-0" />
          <div className="flex-1" style={cols24}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="text-[9px] text-muted-foreground text-center leading-tight"
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Linhas: dia da semana */}
        <div className="space-y-[2px] mt-1">
          {grid.map((row, d) => (
            <div key={d} className="flex items-center">
              <div className="w-8 shrink-0 text-[10px] text-muted-foreground pr-1 text-right">
                {DAYS[d]}
              </div>
              <div className="flex-1" style={cols24}>
                {row.map((value, h) => {
                  const intensity = value === 0 ? 0 : value / max;
                  const bg =
                    intensity === 0
                      ? "rgba(148,163,184,0.1)"
                      : `rgba(59,130,246,${0.2 + intensity * 0.7})`;
                  return (
                    <div
                      key={h}
                      title={`${DAYS[d]} ${String(h).padStart(2, "0")}h: ${value} tasks`}
                      className="h-5 rounded-[2px]"
                      style={{ background: bg }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
