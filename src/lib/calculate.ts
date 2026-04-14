import { applySlaTiers, type SlaTier } from "./sla-tiers";

export interface CalculateInputs {
  pontosMes: number;
  slaMedioMes: number;
  valorPorPonto: number;
  valorDisponibilidade100: number;
  tiers: readonly SlaTier[];
}

export interface CalculateResult {
  pontosMes: number;
  slaMedioMes: number;
  payoutPctSla: number;
  valorPontos: number;
  valorDisponibilidade: number;
  valorParcial: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePartial(i: CalculateInputs): CalculateResult {
  const payoutPctSla = applySlaTiers(i.slaMedioMes, i.tiers);
  const valorPontos = round2(i.pontosMes * i.valorPorPonto);
  const valorDisponibilidade = round2(i.valorDisponibilidade100 * (payoutPctSla / 100));
  const valorParcial = round2(valorPontos + valorDisponibilidade);
  return {
    pontosMes: i.pontosMes,
    slaMedioMes: i.slaMedioMes,
    payoutPctSla,
    valorPontos,
    valorDisponibilidade,
    valorParcial,
  };
}
