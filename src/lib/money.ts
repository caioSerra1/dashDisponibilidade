const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) return "R$ 0,00";
  return BRL.format(value);
}

const PCT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2,
});

export function formatPct(value: number): string {
  return PCT.format(value / 100);
}
