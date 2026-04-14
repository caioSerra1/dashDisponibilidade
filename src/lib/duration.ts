/**
 * Formata uma duração em horas para uma string amigável em pt-BR.
 *  - < 1h → "Xmin"
 *  - < 24h → "Xh Ymin"
 *  - < 7d → "Xd Yh"
 *  - >= 7d → "Xd"
 */
export function formatHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 0) return "—";
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const remHours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  if (days >= 7) return `${days} dias`;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
