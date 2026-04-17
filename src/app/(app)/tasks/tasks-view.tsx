"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { PeriodPicker } from "@/components/filters/period-picker";
import { UserPicker } from "@/components/filters/user-picker";
import { formatHours } from "@/lib/duration";
import { formatDate } from "@/lib/date";

type TaskType = "dev" | "support" | "ignored";

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
  ageHours: number | null;
  type: TaskType;
}

interface TasksData {
  period: { from: string; to: string };
  closed: {
    total: number;
    pointsTotal: number;
    avgResolutionHours: number | null;
    avgCycleHours: number | null;
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
type TypeFilter = "all" | "dev" | "support";
type PriorityFilter = "all" | NonNullable<TaskRow["priority"]>;

export function TasksView({
  viewingUser,
  isAdmin,
  currentUserId,
}: {
  viewingUser?: { id: string; name: string };
  isAdmin?: boolean;
  currentUserId?: string;
}) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("closed");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  const periodQuery = useMemo(() => searchParams.toString(), [searchParams]);

  async function load(force: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams(periodQuery);
      if (force) params.set("force", "1");
      const r = await fetch(`/api/me/tasks?${params.toString()}`);
      const j = (await r.json()) as TasksData;
      setData(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodQuery]);

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
  const filtered = activeList.filter((t) => {
    if (typeFilter === "dev" && t.type !== "dev") return false;
    if (typeFilter === "support" && t.type !== "support") return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (query) {
      const hay = (t.name + " " + (t.customId ?? "") + " " + (t.status ?? "")).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {viewingUser && (
        <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Visualização administrativa
            </p>
            <p className="text-sm mt-0.5">
              Tasks de <strong>{viewingUser.name}</strong>
            </p>
          </div>
          <a href="/tasks" className="text-xs text-primary hover:underline">
            ← voltar pras minhas tasks
          </a>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            {viewingUser ? `Tasks — ${viewingUser.name}` : "Suas tasks no ClickUp"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Tudo o que está atribuído. Tempo de resolução é{" "}
            <em>fechada — criada</em>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <UserPicker currentUserId={currentUserId} />}
          <PeriodPicker />
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CheckCircle2}
          title="Concluídas"
          value={String(data.closed.total)}
          tone="success"
        />
        <Kpi
          icon={Target}
          title="Pontos entregues (dev)"
          value={String(data.closed.pointsTotal)}
          helper="suporte não pontua"
        />
        <Kpi
          icon={Clock}
          title="Tempo médio em execução"
          value={formatHours(data.closed.avgCycleHours ?? data.closed.avgResolutionHours)}
          helper={data.closed.avgCycleHours != null ? "execução → fechamento" : "criação → fechamento (sem TIS)"}
        />
        <Kpi
          icon={Hourglass}
          title="Pendentes"
          value={String(data.pending.total)}
          helper={`${data.pending.pointsTotal} pontos dev previstos`}
          tone="warning"
        />
      </div>

      {/* Tabs + filtros */}
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex-1" />
            <Input
              placeholder="Buscar por nome, ID ou status…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterGroup label="Tipo">
              <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
                Todas
              </FilterChip>
              <FilterChip active={typeFilter === "dev"} onClick={() => setTypeFilter("dev")}>
                Desenvolvimento
              </FilterChip>
              <FilterChip active={typeFilter === "support"} onClick={() => setTypeFilter("support")}>
                Suporte
              </FilterChip>
            </FilterGroup>
            <FilterGroup label="Prioridade">
              <FilterChip
                active={priorityFilter === "all"}
                onClick={() => setPriorityFilter("all")}
              >
                Todas
              </FilterChip>
              <FilterChip
                active={priorityFilter === "urgent"}
                onClick={() => setPriorityFilter("urgent")}
              >
                Urgente
              </FilterChip>
              <FilterChip
                active={priorityFilter === "high"}
                onClick={() => setPriorityFilter("high")}
              >
                Alta
              </FilterChip>
              <FilterChip
                active={priorityFilter === "normal"}
                onClick={() => setPriorityFilter("normal")}
              >
                Normal
              </FilterChip>
              <FilterChip
                active={priorityFilter === "low"}
                onClick={() => setPriorityFilter("low")}
              >
                Baixa
              </FilterChip>
            </FilterGroup>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {query || typeFilter !== "all" || priorityFilter !== "all"
                ? "Nenhuma task bate com os filtros."
                : tab === "closed"
                  ? "Nenhuma task concluída neste período."
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

function TaskRowCard({ task, mode }: { task: TaskRow; mode: Tab }) {
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
          <TypeBadge type={task.type} />
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
          {task.type === "dev" && task.points != null ? `${task.points} pt` : "—"}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </a>
  );
}

function TypeBadge({ type }: { type: TaskType }) {
  if (type === "dev")
    return (
      <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
        dev
      </Badge>
    );
  if (type === "support")
    return (
      <Badge variant="secondary" className="text-[10px] bg-orange-500/10 text-orange-600">
        suporte
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      ignorada
    </Badge>
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
        {label}:
      </span>
      {children}
    </div>
  );
}

function FilterChip({
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
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
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
