"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Server,
  Globe,
  RefreshCw,
  ExternalLink,
  History,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

interface SparkPoint {
  start: string;
  pct: number;
}

interface ServerSummary {
  type: "server";
  id: string;
  name: string;
  slaPct: number;
  totalDownMinutes: number;
  incidentCount: number;
  sparkline: SparkPoint[];
}

interface AppSummary {
  type: "app";
  id: string;
  name: string;
  url: string;
  slaPct: number;
  totalDownMinutes: number;
  incidentCount: number;
  gapCount: number;
  lastCheckAt: string | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
  lastError: string | null;
  sparkline: SparkPoint[];
}

interface DashboardData {
  period: { from: string; to: string; days: number };
  summary: {
    aggregateSlaPct: number;
    totalIncidents: number;
    totalGaps: number;
    totalDownMinutes: number;
    targetsCount: number;
  };
  servers: ServerSummary[];
  webapps: AppSummary[];
}

interface TimelineData {
  period: { from: string; to: string; days: number; bucket: string };
  aggregateSlaPct: number;
  totalDownMinutes: number;
  buckets: Array<{ start: string; pct: number; downMinutes: number }>;
}

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

export function MonitoringView() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<string>("");
  const [drilldown, setDrilldown] = useState<{
    type: "server" | "app";
    id: string;
    name: string;
  } | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/availability/dashboard?days=${days}`, {
        cache: "no-store",
      });
      const json = await r.json();
      setData(json);
      setRefreshedAt(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    reload();
    // Auto-refresh a cada 60s
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  async function openDrilldown(target: { type: "server" | "app"; id: string; name: string }) {
    setDrilldown(target);
    setTimeline(null);
    setTimelineLoading(true);
    try {
      const r = await fetch(
        `/api/admin/availability/timeline?type=${target.type}&id=${encodeURIComponent(target.id)}&days=${days}`,
      );
      const json = await r.json();
      setTimeline(json);
    } finally {
      setTimelineLoading(false);
    }
  }

  const allTargets = data ? [...data.servers, ...data.webapps] : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Monitoramento de Disponibilidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Servidores Zabbix + Aplicações monitoradas internamente
            {refreshedAt && (
              <span className="ml-2 text-[10px] text-muted-foreground/60">
                (atualizado às {refreshedAt})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-1 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 rounded ${
                  days === r.days
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            onClick={reload}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="SLA agregado"
              value={`${data.summary.aggregateSlaPct.toFixed(2)}%`}
              tone={
                data.summary.aggregateSlaPct >= 99.5
                  ? "good"
                  : data.summary.aggregateSlaPct >= 99
                    ? "warn"
                    : "bad"
              }
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Incidentes"
              value={String(data.summary.totalIncidents)}
              helper={`em ${data.period.days}d`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4" />}
              label="Tempo total fora"
              value={formatMinutes(data.summary.totalDownMinutes)}
            />
            <KpiCard
              icon={<Server className="h-4 w-4" />}
              label="Targets ativos"
              value={`${data.summary.targetsCount}`}
              helper={`${data.servers.length} servidores · ${data.webapps.length} URLs`}
            />
          </div>

          {/* Gráfico agregado (todos targets em linhas separadas) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SLA diário ({data.period.days}d)</CardTitle>
              <p className="text-xs text-muted-foreground">
                100% = sem indisponibilidade naquele dia. Zoom out (90d) revela tendências.
              </p>
            </CardHeader>
            <CardContent>
              {allTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum target habilitado.
                </p>
              ) : (
                <AggregatedChart targets={allTargets} />
              )}
            </CardContent>
          </Card>

          {/* Servidores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                Servidores Zabbix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.servers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum servidor habilitado.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.servers.map((s) => (
                    <TargetCard
                      key={s.id}
                      title={s.name}
                      subtitle={`Zabbix ID ${s.id}`}
                      slaPct={s.slaPct}
                      downMin={s.totalDownMinutes}
                      incidents={s.incidentCount}
                      sparkline={s.sparkline}
                      onOpen={() =>
                        openDrilldown({ type: "server", id: s.id, name: s.name })
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Aplicações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Aplicações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.webapps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma aplicação habilitada.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.webapps.map((a) => (
                    <TargetCard
                      key={a.id}
                      title={a.name}
                      subtitle={a.url}
                      subtitleHref={a.url}
                      slaPct={a.slaPct}
                      downMin={a.totalDownMinutes}
                      incidents={a.incidentCount}
                      gaps={a.gapCount}
                      lastCheckAt={a.lastCheckAt}
                      lastStatusCode={a.lastStatusCode}
                      lastResponseMs={a.lastResponseMs}
                      lastError={a.lastError}
                      sparkline={a.sparkline}
                      onOpen={() =>
                        openDrilldown({ type: "app", id: a.id, name: a.name })
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {drilldown && (
        <DrilldownModal
          target={drilldown}
          days={days}
          timeline={timeline}
          loading={timelineLoading}
          onClose={() => {
            setDrilldown(null);
            setTimeline(null);
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-2 ${toneClass}`}>
          {value}
        </div>
        {helper && <div className="text-xs text-muted-foreground mt-1">{helper}</div>}
      </CardContent>
    </Card>
  );
}

function TargetCard({
  title,
  subtitle,
  subtitleHref,
  slaPct,
  downMin,
  incidents,
  gaps,
  lastCheckAt,
  lastStatusCode,
  lastResponseMs,
  lastError,
  sparkline,
  onOpen,
}: {
  title: string;
  subtitle: string;
  subtitleHref?: string;
  slaPct: number;
  downMin: number;
  incidents: number;
  gaps?: number;
  lastCheckAt?: string | null;
  lastStatusCode?: number | null;
  lastResponseMs?: number | null;
  lastError?: string | null;
  sparkline: SparkPoint[];
  onOpen: () => void;
}) {
  const slaTone =
    slaPct >= 99.5 ? "text-emerald-600" : slaPct >= 99 ? "text-amber-600" : "text-red-600";
  const isUp = lastError == null && lastStatusCode != null;
  const dot = lastCheckAt == null
    ? "bg-muted-foreground/40"
    : isUp
      ? "bg-emerald-500"
      : "bg-red-500";
  return (
    <div className="rounded-md border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {lastCheckAt !== undefined && (
              <span className={`h-2 w-2 rounded-full ${dot}`} />
            )}
            <h3 className="font-medium truncate">{title}</h3>
          </div>
          {subtitleHref ? (
            <a
              href={subtitleHref}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate"
            >
              {subtitle}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen} title="Ver gráfico detalhado">
          <History className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="SLA" value={`${slaPct.toFixed(2)}%`} className={slaTone} />
        <Stat label="Tempo fora" value={formatMinutes(downMin)} />
        <Stat
          label="Incidentes"
          value={
            gaps != null && gaps > 0
              ? `${incidents} +${gaps}gap`
              : String(incidents)
          }
        />
      </div>

      {sparkline.length > 0 && (
        <div className="h-12 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline}>
              <Area
                type="monotone"
                dataKey="pct"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
              {/* XAxis hide com dataKey="start" garante que o tooltip recebe
                  a data ISO (não o índice 0/1/2 que vira "01/01/1988"). */}
              <XAxis dataKey="start" hide />
              <YAxis hide domain={[Math.min(95, slaPct - 1), 100]} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelFormatter={(d) => formatDate(String(d))}
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "SLA"]}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {lastCheckAt !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          Última check:{" "}
          {lastCheckAt ? formatDate(lastCheckAt) : "—"}
          {lastStatusCode != null && <span> · HTTP {lastStatusCode}</span>}
          {lastResponseMs != null && <span> · {lastResponseMs}ms</span>}
          {lastError && (
            <div className="text-red-500 mt-0.5 truncate" title={lastError}>
              {lastError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function AggregatedChart({
  targets,
}: {
  targets: Array<{ name: string; sparkline: SparkPoint[] }>;
}) {
  // Constrói dataset multi-line: mesmo eixo X (datas), uma série por target
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const t of targets) {
    for (const p of t.sparkline) {
      const key = p.start;
      if (!dateMap.has(key)) dateMap.set(key, { date: key });
      dateMap.get(key)![t.name] = p.pct;
    }
  }
  const data = Array.from(dateMap.values()).sort(
    (a, b) => String(a.date).localeCompare(String(b.date)),
  );

  // Cores diversas pra cada série
  const palette = [
    "hsl(var(--primary))",
    "hsl(142 71% 45%)",
    "hsl(38 92% 50%)",
    "hsl(0 84% 60%)",
    "hsl(199 89% 48%)",
    "hsl(280 65% 55%)",
    "hsl(160 60% 45%)",
  ];

  return (
    <div className="h-72 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="date"
            fontSize={10}
            tickFormatter={(d) => formatDate(d).slice(0, 5)}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            fontSize={10}
            stroke="hsl(var(--muted-foreground))"
            domain={[(dataMin: number) => Math.min(95, Math.floor(dataMin)), 100]}
            unit="%"
          />
          <Tooltip
            labelFormatter={(d) => formatDate(String(d))}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => `${Number(v).toFixed(2)}%`}
          />
          {targets.map((t, i) => (
            <Line
              key={t.name}
              type="monotone"
              dataKey={t.name}
              stroke={palette[i % palette.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {targets.map((t, i) => (
          <div key={t.name} className="flex items-center gap-1.5 text-[10px]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: palette[i % palette.length] }}
            />
            <span className="text-muted-foreground">{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrilldownModal({
  target,
  days,
  timeline,
  loading,
  onClose,
}: {
  target: { type: "server" | "app"; id: string; name: string };
  days: number;
  timeline: TimelineData | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-lg max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              {target.type === "server" ? (
                <Server className="h-4 w-4 text-primary" />
              ) : (
                <Globe className="h-4 w-4 text-primary" />
              )}
              {target.name}
            </h3>
            <p className="text-xs text-muted-foreground">Últimos {days} dias</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !timeline ? (
            <p className="text-sm text-red-500">Falha ao carregar.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                <Stat label="SLA do período" value={`${timeline.aggregateSlaPct.toFixed(2)}%`} />
                <Stat label="Tempo fora" value={formatMinutes(timeline.totalDownMinutes)} />
                <Stat label="Buckets" value={String(timeline.buckets.length)} />
              </div>
              <div className="h-72 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline.buckets}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="start"
                      fontSize={10}
                      tickFormatter={(d) => formatDate(d).slice(0, 5)}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      fontSize={10}
                      stroke="hsl(var(--muted-foreground))"
                      domain={[Math.min(95, timeline.aggregateSlaPct - 1), 100]}
                      unit="%"
                    />
                    <Tooltip
                      labelFormatter={(d) => formatDate(String(d))}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                      formatter={(v) => `${Number(v).toFixed(2)}%`}
                    />
                    <Area
                      type="monotone"
                      dataKey="pct"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Cada ponto = 1 dia. SLA% = (24h − minutos fora) / 24h.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min < 1) return "0min";
  if (min < 60) return `${Math.round(min)}min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
}
