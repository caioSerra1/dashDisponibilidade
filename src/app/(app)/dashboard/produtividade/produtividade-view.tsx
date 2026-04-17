"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  LifeBuoy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/filters/period-picker";
import { UserPicker } from "@/components/filters/user-picker";
import { MetricLabel } from "@/components/ui/metric-label";
import { TeamHeatmap } from "@/components/admin/team-heatmap";
import { computeHeatmap } from "@/lib/team-metrics";
import { formatHours } from "@/lib/duration";

const ResolutionLineChart = dynamic(
  () => import("@/components/charts/resolution-line").then((m) => m.ResolutionLineChart),
  { ssr: false, loading: () => <div className="h-56 animate-pulse bg-muted/40 rounded-md" /> },
);
const PriorityPieChart = dynamic(
  () => import("@/components/charts/priority-pie").then((m) => m.PriorityPieChart),
  { ssr: false, loading: () => <div className="h-56 animate-pulse bg-muted/40 rounded-md" /> },
);

interface LastBreakdown {
  tasksClosed: number;
  points?: number;
  avgResolutionHours: number | null;
  avgCycleHours: number | null;
  avgAckHours?: number | null;
}

interface ProdData {
  periodo: { modo: string; de: string; ate: string; label: string };
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
    dev: LastBreakdown;
    support: LastBreakdown;
    returnedCount: number;
  } | null;
  series: Array<{
    date: string;
    tasksClosedMonth: number;
    tasksClosedWeek: number;
    avgResolutionHoursMonth: number | null;
    avgCycleHoursMonth: number | null;
    tasksClosedDev: number;
    tasksClosedSupport: number;
  }>;
  goalHits: number;
}

type TypeFilter = "all" | "dev" | "support";

export function ProdutividadeView({
  viewingUser,
  isAdmin,
  currentUserId,
}: {
  viewingUser?: { id: string; name: string };
  isAdmin?: boolean;
  currentUserId?: string;
}) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ProdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [heatmapGrid, setHeatmapGrid] = useState<number[][] | null>(null);

  const query = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/dashboard/produtividade?${query}`).then((r) => r.json()),
      fetch(`/api/me/tasks?${query}`).then((r) => r.json()).catch(() => null),
    ]).then(([prodData, tasksData]) => {
      setData(prodData as ProdData);
      if (tasksData?.closed?.tasks) {
        const closedDates = (tasksData.closed.tasks as Array<{ dateClosed: number | null }>)
          .filter((t) => t.dateClosed != null);
        setHeatmapGrid(computeHeatmap(closedDates));
      } else {
        setHeatmapGrid(null);
      }
    }).finally(() => setLoading(false));
  }, [query]);

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

  // Seleciona as métricas do filtro
  const viewTasks =
    typeFilter === "dev"
      ? last?.dev.tasksClosed ?? 0
      : typeFilter === "support"
        ? last?.support.tasksClosed ?? 0
        : last?.tasksClosedMonth ?? 0;
  const viewResolution =
    typeFilter === "dev"
      ? last?.dev.avgResolutionHours ?? null
      : typeFilter === "support"
        ? last?.support.avgResolutionHours ?? null
        : last?.avgResolutionHoursMonth ?? null;
  const viewCycle =
    typeFilter === "dev"
      ? last?.dev.avgCycleHours ?? null
      : typeFilter === "support"
        ? last?.support.avgCycleHours ?? null
        : last?.avgCycleHoursMonth ?? null;

  return (
    <div className="space-y-6 max-w-7xl">
      {viewingUser && (
        <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Visualização administrativa
            </p>
            <p className="text-sm mt-0.5">
              Produtividade de <strong>{viewingUser.name}</strong>
            </p>
          </div>
          <a href="/dashboard/produtividade" className="text-xs text-primary hover:underline">
            ← voltar pro meu painel
          </a>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {viewingUser ? `Produtividade — ${viewingUser.name}` : "Minha produtividade"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Métricas reais derivadas das tasks no ClickUp — {data.periodo.label}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <UserPicker currentUserId={currentUserId} />}
          <PeriodPicker />
        </div>
      </div>

      {/* Toggle tipo */}
      <div className="flex flex-wrap gap-1.5">
        <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          Ambos
        </TypeChip>
        <TypeChip active={typeFilter === "dev"} onClick={() => setTypeFilter("dev")}>
          Desenvolvimento
        </TypeChip>
        <TypeChip active={typeFilter === "support"} onClick={() => setTypeFilter("support")}>
          Suporte
        </TypeChip>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ListChecks}
          sigla="Tasks"
          nome={
            typeFilter === "dev"
              ? "Tasks de desenvolvimento concluídas no período"
              : typeFilter === "support"
                ? "Tasks de suporte concluídas no período"
                : "Total de tasks concluídas no período"
          }
          value={String(viewTasks)}
          helper={`${last?.tasksClosedWeek ?? 0} nos últimos 7 dias`}
        />
        <KpiCard
          icon={Target}
          sigla="Pontos (dev)"
          nome="Pontos de sprint entregues (suporte não pontua)"
          value={String(last?.dev.points ?? 0)}
        />
        <KpiCard
          icon={Clock}
          sigla="MTTR"
          nome="Tempo médio até resolver uma demanda"
          value={formatHours(viewResolution)}
          helper={
            viewCycle != null ? `ciclo (execução → fechar): ${formatHours(viewCycle)}` : undefined
          }
        />
        <KpiCard
          icon={Zap}
          sigla="Metas batidas"
          nome="Metas do período já batidas"
          value={String(data.goalHits)}
        />
      </div>

      {/* Card dedicado de suporte */}
      {(last?.support.tasksClosed ?? 0) > 0 && typeFilter !== "dev" && (
        <Card className="border-orange-400/30 bg-orange-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <MetricLabel
                  sigla="Tasks de suporte atendidas"
                  nome="Demandas de suporte que você atendeu no período"
                />
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <SupportStat
                    label="Volume"
                    value={String(last?.support.tasksClosed ?? 0)}
                  />
                  <SupportStat
                    label="MTTA"
                    value={formatHours(last?.support.avgAckHours ?? null)}
                    helper="até assumir"
                  />
                  <SupportStat
                    label="MTTR"
                    value={formatHours(last?.support.avgResolutionHours ?? null)}
                    helper="até resolver"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Heatmap individual */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Quando você fecha tasks
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribuição por dia da semana × hora do dia
            </p>
          </CardHeader>
          <CardContent>
            {heatmapGrid ? (
              <TeamHeatmap grid={heatmapGrid} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sem dados de tasks fechadas no período.
              </p>
            )}
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

function TypeChip({
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
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  icon: Icon,
  sigla,
  nome,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  sigla: string;
  nome: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <MetricLabel sigla={sigla} nome={nome} />
          <p className="text-2xl font-bold mt-2 whitespace-nowrap">{value}</p>
          {helper && <p className="text-xs text-muted-foreground mt-1 truncate">{helper}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function SupportStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
      {helper && <p className="text-[10px] text-muted-foreground">{helper}</p>}
    </div>
  );
}
