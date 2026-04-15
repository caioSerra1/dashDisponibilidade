const DATE_BR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const DATETIME_BR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const MONTH_BR = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export function formatDate(d: Date | string): string {
  return DATE_BR.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: Date | string): string {
  return DATETIME_BR.format(typeof d === "string" ? new Date(d) : d);
}

export function formatMonth(year: number, month: number): string {
  return MONTH_BR.format(new Date(year, month - 1, 1));
}

export function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return { from, to };
}

export function currentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Retorna o intervalo UTC [from, to] da semana N dentro do mês. Semana 1 é
 * a que contém o dia 1. Divisão ISO: segunda a domingo. Semanas incompletas
 * são recortadas pra não sair do mês.
 */
export function weekOfMonthRange(
  year: number,
  month: number,
  week: number,
): { from: Date; to: Date } {
  const { from: monthStart, to: monthEnd } = monthRange(year, month);
  // Dia da semana do primeiro dia do mês (0=dom, 1=seg, ... 6=sáb)
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // Offset pra chegar na segunda: se for domingo (0), volta 6 dias.
  const offsetToMonday = firstDow === 0 ? 6 : firstDow - 1;
  const firstMondayDay = 1 - offsetToMonday;
  const weekStartDay = firstMondayDay + (week - 1) * 7;
  const weekEndDay = weekStartDay + 6;

  const from = new Date(
    Date.UTC(year, month - 1, Math.max(1, weekStartDay), 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(
      year,
      month - 1,
      Math.min(daysInMonth(year, month), weekEndDay),
      23,
      59,
      59,
    ),
  );
  // Se o recorte ficou inválido (semana fora do mês), cai pro mês inteiro.
  if (to < monthStart || from > monthEnd) return { from: monthStart, to: monthEnd };
  return { from, to };
}

/**
 * Quantas semanas (ISO) o mês atravessa. Útil pro PeriodPicker listar
 * semanas selecionáveis. Sempre ≥ 1.
 */
export function weeksInMonth(year: number, month: number): number {
  const days = daysInMonth(year, month);
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offsetToMonday = firstDow === 0 ? 6 : firstDow - 1;
  return Math.ceil((days + offsetToMonday) / 7);
}

export type PeriodMode = "mes" | "semana" | "intervalo";

export interface Period {
  mode: PeriodMode;
  from: Date;
  to: Date;
  label: string;
}

/**
 * Extrai um Period de query params no formato:
 *   ?modo=mes&ano=2026&mes=4
 *   ?modo=semana&ano=2026&mes=4&semana=2
 *   ?modo=intervalo&de=2026-04-01&ate=2026-04-15
 *
 * Defaults pra mês corrente quando ausente/inválido.
 */
export function parsePeriodFromSearchParams(sp: URLSearchParams): Period {
  const modo = (sp.get("modo") ?? "mes") as PeriodMode;
  const now = currentMonth();

  if (modo === "intervalo") {
    const deStr = sp.get("de");
    const ateStr = sp.get("ate");
    if (deStr && ateStr) {
      const from = parseIsoDateUtc(deStr, false);
      const to = parseIsoDateUtc(ateStr, true);
      if (from && to && from <= to) {
        return {
          mode: "intervalo",
          from,
          to,
          label: `${formatDate(from)} – ${formatDate(to)}`,
        };
      }
    }
    // fallback: mês atual
  }

  const yearRaw = Number(sp.get("ano"));
  const monthRaw = Number(sp.get("mes"));
  const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : now.year;
  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.month;

  if (modo === "semana") {
    const semanaRaw = Number(sp.get("semana"));
    const totalWeeks = weeksInMonth(year, month);
    const week =
      Number.isFinite(semanaRaw) && semanaRaw >= 1 && semanaRaw <= totalWeeks
        ? semanaRaw
        : 1;
    const { from, to } = weekOfMonthRange(year, month, week);
    return {
      mode: "semana",
      from,
      to,
      label: `Semana ${week} de ${formatMonth(year, month)}`,
    };
  }

  const { from, to } = monthRange(year, month);
  return {
    mode: "mes",
    from,
    to,
    label: formatMonth(year, month),
  };
}

function parseIsoDateUtc(s: string, endOfDay: boolean): Date | null {
  // aceita "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  // Valida ranges — JS Date normaliza silenciosamente (2026-13-99 → 2027-02-08)
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
    ),
  );
  // Confirma que o normalizado casa — pega dias inválidos tipo 31/2
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
