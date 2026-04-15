"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  currentMonth,
  formatMonth,
  parsePeriodFromSearchParams,
  weeksInMonth,
} from "@/lib/date";

type Mode = "mes" | "semana" | "intervalo";

/**
 * Filtro unificado de período (mês / semana do mês / intervalo custom).
 * Guarda estado na URL via query params pra funcionar com SSR e
 * permitir compartilhar links. Uso:
 *
 *   <PeriodPicker />
 *
 * Lê `?modo=mes|semana|intervalo&ano=&mes=&semana=&de=&ate=` e re-navega
 * preservando outros query params.
 */
export function PeriodPicker({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const period = useMemo(
    () => parsePeriodFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function setMode(mode: Mode) {
    const cur = currentMonth();
    if (mode === "mes") {
      update({
        modo: "mes",
        ano: String(cur.year),
        mes: String(cur.month),
        semana: null,
        de: null,
        ate: null,
      });
    } else if (mode === "semana") {
      update({
        modo: "semana",
        ano: String(cur.year),
        mes: String(cur.month),
        semana: "1",
        de: null,
        ate: null,
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      update({ modo: "intervalo", de: today, ate: today, ano: null, mes: null, semana: null });
    }
  }

  return (
    <div className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40 transition-colors"
      >
        <Calendar className="h-4 w-4 text-primary" />
        <span>{period.label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] rounded-md border bg-card shadow-xl">
          <div className="flex border-b">
            <ModeTab active={period.mode === "mes"} onClick={() => setMode("mes")}>
              Mês
            </ModeTab>
            <ModeTab active={period.mode === "semana"} onClick={() => setMode("semana")}>
              Semana
            </ModeTab>
            <ModeTab active={period.mode === "intervalo"} onClick={() => setMode("intervalo")}>
              Intervalo
            </ModeTab>
          </div>
          <div className="p-3 space-y-3">
            {period.mode === "mes" && <MonthControls update={update} />}
            {period.mode === "semana" && <WeekControls update={update} />}
            {period.mode === "intervalo" && <RangeControls update={update} />}
          </div>
          <div className="flex justify-end border-t p-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "text-primary border-b-2 border-primary bg-primary/5"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MonthControls({
  update,
}: {
  update: (next: Record<string, string | null>) => void;
}) {
  const cur = currentMonth();
  const months = useMemo(() => {
    const out: Array<{ year: number; month: number; label: string }> = [];
    const d = new Date(Date.UTC(cur.year, cur.month - 1, 1));
    for (let i = 0; i < 12; i++) {
      out.push({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        label: formatMonth(d.getUTCFullYear(), d.getUTCMonth() + 1),
      });
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return out;
  }, [cur.year, cur.month]);

  return (
    <div className="grid grid-cols-2 gap-1 max-h-[240px] overflow-y-auto">
      {months.map((m) => (
        <button
          key={`${m.year}-${m.month}`}
          type="button"
          onClick={() =>
            update({
              modo: "mes",
              ano: String(m.year),
              mes: String(m.month),
              semana: null,
              de: null,
              ate: null,
            })
          }
          className="rounded-md px-2 py-1.5 text-xs text-left hover:bg-accent capitalize"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function WeekControls({
  update,
}: {
  update: (next: Record<string, string | null>) => void;
}) {
  const cur = currentMonth();
  const total = weeksInMonth(cur.year, cur.month);
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Semanas de {formatMonth(cur.year, cur.month)}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() =>
              update({
                modo: "semana",
                ano: String(cur.year),
                mes: String(cur.month),
                semana: String(w),
                de: null,
                ate: null,
              })
            }
            className="rounded-md border px-2 py-1.5 text-xs hover:border-primary/40"
          >
            Semana {w}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeControls({
  update,
}: {
  update: (next: Record<string, string | null>) => void;
}) {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("de") ?? "");
  const [to, setTo] = useState(searchParams.get("ate") ?? "");

  function apply() {
    if (!from || !to) return;
    update({ modo: "intervalo", de: from, ate: to, ano: null, mes: null, semana: null });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">De</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Até</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={apply} disabled={!from || !to}>
        Aplicar
      </Button>
    </div>
  );
}
