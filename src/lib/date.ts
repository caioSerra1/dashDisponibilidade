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
