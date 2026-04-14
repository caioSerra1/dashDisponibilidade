"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  TrendingUp,
  Target,
  Clock,
  ListChecks,
  Activity,
  Zap,
  ExternalLink,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatHours } from "@/lib/duration";
import { formatDate } from "@/lib/date";

const TasksBarChart = dynamic(
  () => import("@/components/charts/tasks-bar").then((m) => m.TasksBarChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted/40 rounded-md" /> },
);
const ResolutionLineChart = dynamic(
  () => import("@/components/charts/resolution-line").then((m) => m.ResolutionLineChart),
  { ssr: false, loading: () => <div className="h-56 animate-pulse bg-muted/40 rounded-md" /> },
);
const PriorityPieChart = dynamic(
  () => import("@/components/charts/priority-pie").then((m) => m.PriorityPieChart),
  { ssr: false, loading: () => <div className="h-56 animate-pulse bg-muted/40 rounded-md" /> },
);

interface ProdData {
  month: { year: number; month: number };
  last: {
    tasksClosedMonth: number;
    tasksClosedWeek: number;
    pointsMonth: number;
    avgResolutionHoursMonth: number | null;
    avgCycleHoursMonth: number | null;
    throughputPerWeek: number | null;
    tagsBreakdown: Array<{ tag: string; count: number }> | null;
    priorityBreakdown: { urgent: number; high: number; normal: number; low: number } | null;
    date: string;
  } | null;
  series: Array<{
    date: string;
    tasksClosedMonth: number;
    tasksClosedWeek: number;
    avgResolutionHoursMonth: number | null;
    avgCycleHoursMonth: number | null;
  }>;
  goalHitsThisMonth: number;
  walletTxns: Array<{ id: string; delta: number; reason: string; createdAt: string }>;
}

export function ProdutividadeView() {
  const [data, setData] = useState<ProdData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/produtividade")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!data) return <p className="text-destructive">Erro.</p>;

  const last = data.last;
  const PRIORITY_PT: Record<string, string> = {
    urgent: "Urgente",
    high: "Alta",
    normal: "Normal",
    low: "Baixa",
  };
  const priorityData = last?.priorityBreakdown
    ? Object.entries(last.priorityBreakdown)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name: PRIORITY_PT[name] ?? name, value }))
    : [];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          Minha produtividade
        </h2>
        <p className="text-sm text-muted-foreground">
          Métricas reais derivadas das suas tasks no ClickUp.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={ListChecks}
          title="Tasks no mês"
          value={String(last?.tasksClosedMonth ?? 0)}
          helper={`${last?.tasksClosedWeek ?? 0} nos últimos 7 dias`}
        />
        <Kpi
          icon={Target}
          title="Pontos entregues"
          value={String(last?.pointsMonth ?? 0)}
        />
        <Kpi
          icon={Clock}
          title="Tempo médio resolução"
          value={formatHours(last?.avgResolutionHoursMonth)}
          helper={
            last?.avgCycleHoursMonth != null
              ? `ciclo ${formatHours(last.avgCycleHoursMonth)}`
              : undefined
          }
        />
        <Kpi
          icon={Zap}
          title="Metas batidas no mês"
          value={String(data.goalHitsThisMonth)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Throughput */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tasks fechadas por dia (acumulado do mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TasksBarChart data={data.series} />
          </CardContent>
        </Card>

        {/* Priority pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            {priorityData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <PriorityPieChart data={priorityData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resolution time trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Evolução do tempo médio de resolução
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResolutionLineChart data={data.series} />
        </CardContent>
      </Card>

      {/* Tags */}
      {last?.tagsBreakdown && last.tagsBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {last.tagsBreakdown.map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
                >
                  <span className="font-medium">{t.tag}</span>
                  <span className="text-muted-foreground">×{t.count}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link para a página de tasks dedicada */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Quer ver quais tasks estão entrando nessa conta?
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/tasks">
              Ver lista completa
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  title,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold mt-1.5 whitespace-nowrap">{value}</p>
          {helper && <p className="text-xs text-muted-foreground mt-1">{helper}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
