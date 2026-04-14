"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const EvolutionAreaChart = dynamic(
  () => import("@/components/charts/evolution-area").then((m) => m.EvolutionAreaChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted/40 rounded-md" /> },
);
import {
  Trophy,
  TrendingUp,
  Target,
  Calendar,
  ServerCog,
  Gauge,
  TimerReset,
  Sparkles,
  Coins,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/money";
import { formatMonth, formatDate } from "@/lib/date";
import { StreakBadge } from "@/components/game/streak-badge";
import { LevelRing } from "@/components/game/level-ring";
import { AchievementsList } from "@/components/game/achievements-list";

interface HostBreakdownEntry {
  hostId: string;
  name: string;
  pct: number;
}

interface DashboardData {
  month: { year: number; month: number; totalDays: number; diasDecorridos: number; diasRestantes: number };
  parcial: {
    pontos: number;
    sla: number;
    valorPontos: number;
    valorDisponibilidade: number;
    valorParcial: number;
    date: string;
    hostBreakdown: HostBreakdownEntry[];
  } | null;
  projecao: { pontos: number; valorTotal: number; deltaDia: number };
  snapshots: Array<{ date: string; valorParcial: number; pontos: number; sla: number }>;
  history: Array<{
    year: number;
    month: number;
    pontos: number;
    slaFinal: number;
    valorTotal: number;
    closedAt: string;
  }>;
  gamification: {
    enabled: boolean;
    xp: number;
    level: { name: "Bronze" | "Prata" | "Ouro" | "Platina"; minXp: number; color: string };
    streak: number;
    metaSla: number;
    metaPontos: number;
    achievements: Array<{
      code: string;
      name: string;
      description: string;
      icon: string;
      xp: number;
      unlockedAt: string;
    }>;
  };
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d: DashboardData) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (!data) return <p className="text-destructive">Erro ao carregar dados.</p>;

  const parcial = data.parcial;
  const metaPct = Math.min(
    100,
    parcial ? (parcial.pontos / Math.max(1, data.gamification.metaPontos)) * 100 : 0,
  );
  const monthLabel = formatMonth(data.month.year, data.month.month);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden border-primary/10">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4 pointer-events-none" />
            <CardContent className="relative p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    Sua variável parcial de {monthLabel}
                  </p>
                  <p className="text-4xl md:text-5xl font-bold mt-1 text-primary tracking-tight">
                    {formatBRL(parcial?.valorParcial ?? 0)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="warning">parcial</Badge>
                    {parcial && (
                      <span className="text-xs text-muted-foreground">
                        atualizado em {formatDate(parcial.date)}
                      </span>
                    )}
                    {data.projecao.deltaDia !== 0 && (
                      <span
                        className={`text-xs font-medium ${
                          data.projecao.deltaDia > 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {data.projecao.deltaDia > 0 ? "▲" : "▼"}{" "}
                        {formatBRL(Math.abs(data.projecao.deltaDia))} vs. ontem
                      </span>
                    )}
                  </div>
                </div>
                {data.gamification.enabled && (
                  <LevelRing xp={data.gamification.xp} level={data.gamification.level} />
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Progresso de pontos</span>
                    <span>
                      {parcial?.pontos ?? 0} / {data.gamification.metaPontos}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${metaPct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-primary"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Mês corrente</span>
                    <span>
                      dia {data.month.diasDecorridos} de {data.month.totalDays}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(data.month.diasDecorridos / data.month.totalDays) * 100}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-success to-primary"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      </motion.div>

      {/* KPI ROW */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="Pontos acumulados"
          value={String(parcial?.pontos ?? 0)}
          helper={`projeção fim do mês: ${data.projecao.pontos}`}
          icon={Target}
        />
        <Kpi
          title="Variável de desenvolvimento"
          value={formatBRL(parcial?.valorPontos ?? 0)}
          helper={`${parcial?.pontos ?? 0} pontos entregues`}
          icon={Coins}
        />
        <Kpi
          title="Disponibilidade média"
          value={`${(parcial?.sla ?? 0).toFixed(2)}%`}
          helper={`baseada em ${parcial?.hostBreakdown.length ?? 0} servidores`}
          icon={Gauge}
        />
        <Kpi
          title="Variável de disponibilidade"
          value={formatBRL(parcial?.valorDisponibilidade ?? 0)}
          helper={`de ${formatBRL(parcial ? parcial.valorDisponibilidade / Math.max(parcial.sla / 100, 0.0001) : 0)} possíveis`}
          icon={Trophy}
        />
      </div>

      {/* Row 2: Chart + Projection */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" />
              Evolução no mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EvolutionAreaChart data={data.snapshots} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TimerReset className="h-4 w-4 text-primary" />
              Projeção de fechamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Se mantiver o ritmo até o fim do mês</p>
              <p className="text-3xl font-bold text-primary mt-1">
                {formatBRL(data.projecao.valorTotal)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Pontos projetados</p>
                <p className="font-semibold">{data.projecao.pontos}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Dias restantes</p>
                <p className="font-semibold">
                  {plural(data.month.diasRestantes, "dia", "dias")}
                </p>
              </div>
            </div>
            <div className="rounded-md bg-accent p-3 text-xs text-accent-foreground flex gap-2">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                O valor parcial é <strong>recalculado diariamente</strong> e só vira definitivo no
                fechamento do mês.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Servers + Achievements */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ServerCog className="h-4 w-4 text-primary" />
              Disponibilidade por servidor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {parcial?.hostBreakdown.length ? (
              <div className="space-y-2.5">
                {parcial.hostBreakdown.map((h) => (
                  <HostRow key={h.hostId} host={h} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum servidor habilitado. Ative servidores em{" "}
                <strong>Servidores Zabbix</strong> para compor a disponibilidade.
              </p>
            )}
          </CardContent>
        </Card>

        {data.gamification.enabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" />
                Conquistas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StreakBadge days={data.gamification.streak} meta={data.gamification.metaSla} />
              <AchievementsList items={data.gamification.achievements} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Histórico de meses fechados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum mês fechado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 font-medium">Mês</th>
                    <th className="py-2 font-medium">Pontos</th>
                    <th className="py-2 font-medium">Disponibilidade</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={`${h.year}-${h.month}`} className="border-b last:border-0">
                      <td className="py-3">{formatMonth(h.year, h.month)}</td>
                      <td className="py-3">{h.pontos}</td>
                      <td className="py-3">{h.slaFinal.toFixed(2)}%</td>
                      <td className="py-3 text-right font-semibold">{formatBRL(h.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1.5 whitespace-nowrap">{value}</p>
            {helper && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{helper}</p>
            )}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HostRow({ host }: { host: HostBreakdownEntry }) {
  const pct = Math.max(0, Math.min(100, host.pct));
  const status =
    pct >= 99.5 ? "ok" : pct >= 97 ? "warn" : "crit";
  const statusColor =
    status === "ok"
      ? "bg-success"
      : status === "warn"
        ? "bg-warning"
        : "bg-destructive";
  const statusLabel =
    status === "ok" ? "saudável" : status === "warn" ? "atenção" : "crítico";
  const barWidth = `${pct}%`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium truncate">{host.name}</span>
          <Badge variant="outline" className="text-[10px] h-5">
            {statusLabel}
          </Badge>
        </div>
        <span className="text-sm font-semibold tabular-nums">{pct.toFixed(2)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: barWidth }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full ${statusColor}`}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 bg-muted rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg" />
    </div>
  );
}
