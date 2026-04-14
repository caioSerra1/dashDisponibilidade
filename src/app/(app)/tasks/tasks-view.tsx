"use client";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  ListChecks,
  RefreshCw,
  ExternalLink,
  Target,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatHours } from "@/lib/duration";
import { formatDate, formatMonth } from "@/lib/date";

interface TaskRow {
  id: string;
  customId: string | null;
  name: string;
  status: string | null;
  points: number | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  dateCreated: number | null;
  dateClosed: number | null;
  url: string;
  resolutionHours: number | null;
  cycleHours: number | null;
  passedExecution: boolean;
  ageHours: number | null;
}

interface TasksData {
  month: { year: number; month: number };
  executionStatuses: string[];
  tis: { enabled: boolean | null; message?: string };
  closed: {
    total: number;
    pointsTotal: number;
    avgCycleHours: number | null;
    avgResolutionHours: number | null;
    countedForCycle: number;
    skippedNoExecution: number;
    tasks: TaskRow[];
  };
  pending: {
    total: number;
    pointsTotal: number;
    tasks: TaskRow[];
  };
  reason?: string;
  error?: string;
}

const PRIORITY_COLOR: Record<NonNullable<TaskRow["priority"]>, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

const PRIORITY_LABEL: Record<NonNullable<TaskRow["priority"]>, string> = {
  urgent: "urgente",
  high: "alta",
  normal: "normal",
  low: "baixa",
};

type Tab = "closed" | "pending";

export function TasksView() {
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("closed");
  const [query, setQuery] = useState("");

  async function load(force: boolean) {
    setLoading(true);
    try {
      const r = await fetch(force ? "/api/me/tasks?force=1" : "/api/me/tasks");
      const j = (await r.json()) as TasksData;
      setData(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        <div className="h-24 animate-pulse bg-muted/40 rounded-lg" />
        <div className="h-96 animate-pulse bg-muted/40 rounded-lg" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <Card>
        <CardContent className="p-6 text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {data?.error ?? "Erro ao carregar tasks."}
        </CardContent>
      </Card>
    );
  }

  if (data.reason) {
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground">{data.reason}</CardContent>
      </Card>
    );
  }

  const activeList = tab === "closed" ? data.closed.tasks : data.pending.tasks;
  const filtered = query
    ? activeList.filter((t) =>
        (t.name + " " + (t.customId ?? "") + " " + (t.status ?? ""))
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : activeList;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            Suas tasks no ClickUp
          </h2>
          <p className="text-sm text-muted-foreground">
            Tudo o que está atribuído a você. Tempo de resolução é{" "}
            <em>fechada — criada</em>. Período: {formatMonth(data.month.year, data.month.month)}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Aviso TIS */}
      {data.tis.enabled === false && data.tis.message && (
        <Card className="border-amber-300/40 bg-amber-50/40 dark:bg-amber-900/10">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Tempo em execução não disponível — usando criação → fechamento
              </p>
              <p className="text-xs text-muted-foreground mt-1">{data.tis.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CheckCircle2}
          title="Concluídas no mês"
          value={String(data.closed.total)}
          tone="success"
        />
        <Kpi
          icon={Target}
          title="Pontos entregues"
          value={String(data.closed.pointsTotal)}
        />
        <Kpi
          icon={Clock}
          title="Tempo médio em execução"
          value={formatHours(data.closed.avgCycleHours ?? data.closed.avgResolutionHours)}
          helper={
            data.closed.avgCycleHours != null
              ? `${data.closed.countedForCycle} task(s) consideradas${data.closed.skippedNoExecution > 0 ? ` · ${data.closed.skippedNoExecution} ignoradas` : ""}`
              : "fallback: criação → fechamento"
          }
        />
        <Kpi
          icon={Hourglass}
          title="Pendentes"
          value={String(data.pending.total)}
          helper={`${data.pending.pointsTotal} pontos previstos`}
          tone="warning"
        />
      </div>

      {/* Tabs + busca */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-2">
            <TabButton
              active={tab === "closed"}
              onClick={() => setTab("closed")}
              count={data.closed.total}
              icon={CheckCircle2}
            >
              Concluídas
            </TabButton>
            <TabButton
              active={tab === "pending"}
              onClick={() => setTab("pending")}
              count={data.pending.total}
              icon={Hourglass}
            >
              Pendentes
            </TabButton>
          </div>
          <Input
            placeholder="Buscar por nome, ID ou status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {query
                ? "Nenhuma task bate com a busca."
                : tab === "closed"
                  ? "Nenhuma task concluída neste mês."
                  : "Nenhuma task pendente. 🎉"}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((t) => (
                <TaskRowCard key={t.id} task={t} mode={tab} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TaskRowCard({
  task,
  mode,
}: {
  task: TaskRow;
  mode: Tab;
}) {
  return (
    <a
      href={task.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-card p-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate group-hover:text-primary">{task.name}</p>
          {task.customId && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              {task.customId}
            </span>
          )}
          {task.priority && (
            <span
              className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 font-medium ${PRIORITY_COLOR[task.priority]}`}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.status && (
            <Badge variant="secondary" className="text-[10px]">
              {task.status}
            </Badge>
          )}
          {mode === "closed" && task.dateClosed != null && (
            <span>fechada em {formatDate(new Date(task.dateClosed))}</span>
          )}
          {mode === "pending" && task.dateCreated != null && (
            <span>aberta em {formatDate(new Date(task.dateCreated))}</span>
          )}
          {mode === "closed" && task.cycleHours != null && (
            <span className="inline-flex items-center gap-1 text-success">
              <Clock className="h-3 w-3" />
              em execução por {formatHours(task.cycleHours)}
            </span>
          )}
          {mode === "closed" && task.cycleHours == null && task.resolutionHours != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              criada → fechada: {formatHours(task.resolutionHours)}
            </span>
          )}
          {mode === "closed" && !task.passedExecution && (
            <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-700">
              não passou por execução
            </Badge>
          )}
          {mode === "pending" && task.ageHours != null && (
            <span className="inline-flex items-center gap-1">
              <Hourglass className="h-3 w-3" />
              aberta há {formatHours(task.ageHours)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        <span className="text-sm font-bold tabular-nums text-primary">
          {task.points != null ? `${task.points} pt` : "—"}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </a>
  );
}

function TabButton({
  active,
  onClick,
  count,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
      <span
        className={`text-xs rounded px-1.5 py-0.5 ${
          active ? "bg-primary-foreground/20" : "bg-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function Kpi({
  icon: Icon,
  title,
  value,
  helper,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  helper?: string;
  tone?: "success" | "warning";
}) {
  const iconBg =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold mt-1.5 whitespace-nowrap">{value}</p>
          {helper && <p className="text-xs text-muted-foreground mt-1 truncate">{helper}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
