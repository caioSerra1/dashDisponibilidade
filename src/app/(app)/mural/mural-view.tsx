"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileText,
  ExternalLink,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricLabel } from "@/components/ui/metric-label";
import { PeriodPicker } from "@/components/filters/period-picker";
import { TeamHeatmap } from "@/components/admin/team-heatmap";
import { BacklogAgingChart } from "@/components/admin/backlog-aging-chart";
import { OneOnOneModal } from "@/components/admin/one-on-one-modal";
import { formatBRL } from "@/lib/money";
import type { BacklogAging } from "@/lib/team-metrics";

interface MemberCard {
  userId: string;
  name: string;
  pontosDev: number;
  tasksDev: number;
  tasksSuporte: number;
  slaAvg: number;
  mttrHoras: number | null;
  mttaHoras: number | null;
  wipAtual: number;
  backlogAging: BacklogAging;
  retornosExecucao: number;
  metasBatidas: number;
  marcosBatidos: number;
  alertaAnomalia: boolean;
  temAnotacaoPrivada: boolean;
  scoreEvolucao: number;
  deltaEvolucao: {
    pontosDev: number;
    tasksDev: number;
    slaAvg: number;
    avgResolutionHours: number | null;
  };
  valorParcial: number;
  valorPontos: number;
  valorDisponibilidade: number;
  valorFechado: boolean;
}

interface MuralPayload {
  periodo: { modo: string; de: string; ate: string; label: string };
  kpisEquipe: {
    pontosDev: number;
    tasksDev: number;
    tasksSuporte: number;
    slaMedio: number;
    mttrMedio: number | null;
    mttaMedio: number | null;
    wipAtual: number;
    throughputPorSemana: number;
    retornosExecucao: number;
    equidade: { score: number; label: string };
    backlogAging: BacklogAging;
    valorTotal: number;
    valorTotalPontos: number;
    valorTotalDisponibilidade: number;
  };
  destaqueEvolucao: {
    userId: string;
    name: string;
    scoreEvolucao: number;
    delta: {
      pontosDev: number;
      tasksDev: number;
      slaAvg: number;
      avgResolutionHours: number | null;
    };
  } | null;
  membros: MemberCard[];
  heatmap: number[][];
}

export function MuralView() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<MuralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMember, setActiveMember] = useState<MemberCard | null>(null);

  const query = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mural?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MuralPayload) => setData(d))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Gestão de Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada da equipe — {data?.periodo.label ?? "carregando…"}
          </p>
        </div>
        <PeriodPicker />
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <TeamWalletCard kpis={data.kpisEquipe} />
          <TeamKpis kpis={data.kpisEquipe} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Heatmap de atividade
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tasks fechadas por dia da semana × hora do dia
                </p>
              </CardHeader>
              <CardContent>
                <TeamHeatmap grid={data.heatmap} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Backlog aberto</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Distribuição por idade (dias)
                </p>
              </CardHeader>
              <CardContent>
                <BacklogAgingChart data={data.kpisEquipe.backlogAging} />
              </CardContent>
            </Card>
          </div>

          {data.destaqueEvolucao && <DestaqueEvolucao destaque={data.destaqueEvolucao} />}

          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-primary" />
              Colaboradores ({data.membros.length})
            </h3>
            {data.membros.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Nenhum colaborador ativo no mural.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {data.membros.map((m) => (
                  <MemberCardBlock
                    key={m.userId}
                    member={m}
                    onOpen1on1={() => setActiveMember(m)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <OneOnOneModal
        open={activeMember !== null}
        onClose={() => setActiveMember(null)}
        member={activeMember}
      />
    </div>
  );
}

function TeamWalletCard({ kpis }: { kpis: MuralPayload["kpisEquipe"] }) {
  const total = kpis.valorTotal;
  const pts = kpis.valorTotalPontos;
  const disp = kpis.valorTotalDisponibilidade;
  const ptsPct = total > 0 ? (pts / total) * 100 : 0;
  const dispPct = total > 0 ? (disp / total) * 100 : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/8 via-transparent to-success/5">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variável da equipe no período
              </p>
              <p className="text-3xl md:text-4xl font-bold text-primary mt-0.5 tracking-tight">
                {formatBRL(total)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Soma dos valores parciais de todos os colaboradores visíveis
              </p>
            </div>
          </div>

          <div className="flex-1 md:max-w-md md:ml-6 space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  Variável de desenvolvimento (pontos)
                </span>
                <span className="font-semibold tabular-nums">{formatBRL(pts)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${ptsPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  Variável de disponibilidade (SLA)
                </span>
                <span className="font-semibold tabular-nums">{formatBRL(disp)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-success transition-all"
                  style={{ width: `${dispPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamKpis({ kpis }: { kpis: MuralPayload["kpisEquipe"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        sigla="Pontos (dev)"
        nome="Pontos de sprint entregues"
        value={String(kpis.pontosDev)}
      />
      <KpiCard
        sigla="Tasks dev"
        nome="Tasks de desenvolvimento fechadas"
        value={String(kpis.tasksDev)}
        helper={`+${kpis.tasksSuporte} tasks de suporte`}
      />
      <KpiCard
        sigla="SLA"
        nome="Disponibilidade média acordada"
        value={`${kpis.slaMedio.toFixed(1)}%`}
      />
      <KpiCard
        sigla="MTTR"
        nome="Tempo médio até resolver uma demanda"
        value={kpis.mttrMedio != null ? `${kpis.mttrMedio}h` : "—"}
      />
      <KpiCard
        sigla="MTTA"
        nome="Tempo médio até assumir uma demanda (suporte)"
        value={kpis.mttaMedio != null ? `${kpis.mttaMedio}h` : "—"}
      />
      <KpiCard
        sigla="WIP"
        nome="Tasks em andamento ao mesmo tempo"
        value={String(kpis.wipAtual)}
      />
      <KpiCard
        sigla="Throughput"
        nome="Tasks dev fechadas por semana"
        value={`${kpis.throughputPorSemana}/sem`}
      />
      <KpiCard
        sigla="Equidade"
        nome="Distribuição de carga entre membros"
        value={kpis.equidade.label}
        helper={`score ${kpis.equidade.score}`}
      />
    </div>
  );
}

function KpiCard({
  sigla,
  nome,
  value,
  helper,
}: {
  sigla: string;
  nome: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <MetricLabel sigla={sigla} nome={nome} />
        <p className="text-2xl font-bold mt-2 whitespace-nowrap">{value}</p>
        {helper && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DestaqueEvolucao({
  destaque,
}: {
  destaque: NonNullable<MuralPayload["destaqueEvolucao"]>;
}) {
  const { delta } = destaque;
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/8 via-transparent to-success/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Maior evolução do período
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Avatar userId={destaque.userId} name={destaque.name} size={28} />
              <p className="text-lg font-bold truncate">{destaque.name}</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {delta.pontosDev > 0 && (
                <Badge variant="success">+{delta.pontosDev} pontos</Badge>
              )}
              {delta.tasksDev > 0 && (
                <Badge variant="success">+{delta.tasksDev} tasks</Badge>
              )}
              {delta.slaAvg >= 0.1 && (
                <Badge variant="success">SLA +{delta.slaAvg.toFixed(1)}pp</Badge>
              )}
              {delta.avgResolutionHours != null && delta.avgResolutionHours < 0 && (
                <Badge variant="success">
                  MTTR −{Math.abs(delta.avgResolutionHours).toFixed(1)}h
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberCardBlock({
  member,
  onOpen1on1,
}: {
  member: MemberCard;
  onOpen1on1: () => void;
}) {
  return (
    <Card className={member.alertaAnomalia ? "border-warning/60" : ""}>
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <Avatar userId={member.userId} name={member.name} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base truncate">{member.name}</CardTitle>
            {member.alertaAnomalia && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Atenção
              </Badge>
            )}
            {member.temAnotacaoPrivada && (
              <FileText
                className="h-4 w-4 text-muted-foreground"
                aria-label="tem anotação privada"
              />
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <p className="text-xl font-bold text-primary tabular-nums">
              {formatBRL(member.valorParcial)}
            </p>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {member.valorFechado ? "fechado" : "parcial"}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatBRL(member.valorPontos)} em pontos ·{" "}
            {formatBRL(member.valorDisponibilidade)} em disponibilidade
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <MiniStat label="Pontos dev" value={String(member.pontosDev)} />
          <MiniStat label="Tasks dev" value={String(member.tasksDev)} />
          <MiniStat label="Suporte" value={String(member.tasksSuporte)} />
          <MiniStat label="SLA" value={`${member.slaAvg.toFixed(0)}%`} />
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <MiniStat
            label="MTTR"
            value={member.mttrHoras != null ? `${member.mttrHoras.toFixed(0)}h` : "—"}
          />
          <MiniStat
            label="MTTA"
            value={member.mttaHoras != null ? `${member.mttaHoras.toFixed(0)}h` : "—"}
          />
          <MiniStat label="WIP" value={String(member.wipAtual)} />
          <MiniStat label="Retornos" value={String(member.retornosExecucao)} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {member.marcosBatidos > 0 && (
            <Badge variant="secondary">
              {member.marcosBatidos} marco{member.marcosBatidos > 1 ? "s" : ""}
            </Badge>
          )}
          {member.metasBatidas > 0 && (
            <Badge variant="secondary">
              {member.metasBatidas} meta{member.metasBatidas > 1 ? "s" : ""}
            </Badge>
          )}
          {member.retornosExecucao > 0 && (
            <Badge variant="outline">
              {member.retornosExecucao} retorno{member.retornosExecucao > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant={member.alertaAnomalia ? "default" : "outline"}
            onClick={onOpen1on1}
            className="flex-1"
          >
            <FileText className="h-4 w-4" />
            Preparar 1:1
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard?userId=${member.userId}`}>
              <ExternalLink className="h-4 w-4" />
              Ver dashboard
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/50 p-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
