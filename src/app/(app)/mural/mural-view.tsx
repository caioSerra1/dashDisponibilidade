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
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricLabel } from "@/components/ui/metric-label";
import { PeriodPicker } from "@/components/filters/period-picker";
import { TeamHeatmap } from "@/components/admin/team-heatmap";
import { OneOnOneModal } from "@/components/admin/one-on-one-modal";
import { formatBRL } from "@/lib/money";

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
}

export function MuralView() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<MuralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMember, setActiveMember] = useState<MemberCard | null>(null);
  const [heatmapGrid, setHeatmapGrid] = useState<number[][] | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [wipByUser, setWipByUser] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const query = useMemo(() => searchParams.toString(), [searchParams]);

  function loadData() {
    setLoading(true);
    setHeatmapGrid(null);
    fetch(`/api/mural?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MuralPayload) => {
        setData(d);
        setLastSync(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      })
      .finally(() => setLoading(false));

    setHeatmapLoading(true);
    fetch(`/api/mural/heatmap?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { heatmap: number[][]; wipByUser?: Record<string, number> }) => {
        setHeatmapGrid(d.heatmap);
        setWipByUser(d.wipByUser ?? {});
      })
      .catch(() => {
        setHeatmapGrid(null);
        setWipByUser({});
      })
      .finally(() => setHeatmapLoading(false));
  }

  useEffect(() => { loadData(); }, [query]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/admin/sync", { method: "POST" });
      loadData();
    } finally {
      setSyncing(false);
    }
  }

  async function handleRecalcMonth() {
    if (!data) return;
    const de = new Date(data.periodo.de);
    const year = de.getUTCFullYear();
    const month = de.getUTCMonth() + 1;
    setSyncing(true);
    try {
      await fetch(`/api/admin/sync?kind=close&year=${year}&month=${month}&force=1`, { method: "POST" });
      loadData();
    } finally {
      setSyncing(false);
    }
  }

  const isPastMonth = data
    ? (() => {
        const now = new Date();
        const de = new Date(data.periodo.de);
        return (
          de.getUTCFullYear() < now.getUTCFullYear() ||
          (de.getUTCFullYear() === now.getUTCFullYear() &&
            de.getUTCMonth() < now.getUTCMonth())
        );
      })()
    : false;

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
            {lastSync && (
              <span className="ml-2 text-[10px] text-muted-foreground/60">
                (atualizado às {lastSync})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          {isPastMonth && (
            <button
              type="button"
              onClick={handleRecalcMonth}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              Recalcular mês
            </button>
          )}
          <PeriodPicker />
        </div>
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <TeamKpis
            kpis={{
              ...data.kpisEquipe,
              wipAtual:
                Object.keys(wipByUser).length > 0
                  ? Object.values(wipByUser).reduce((a, b) => a + b, 0)
                  : data.kpisEquipe.wipAtual,
            }}
            showWip={!isPastMonth}
          />

          <Card>
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
              {heatmapLoading ? (
                <div className="h-48 animate-pulse bg-muted/40 rounded-md flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Carregando heatmap do ClickUp…</p>
                </div>
              ) : heatmapGrid ? (
                <TeamHeatmap grid={heatmapGrid} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sem dados de tasks fechadas no período.
                </p>
              )}
            </CardContent>
          </Card>

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
                {data.membros.map((m) => {
                  const liveWip = wipByUser[m.userId];
                  const memberWithWip =
                    !isPastMonth && liveWip != null
                      ? { ...m, wipAtual: liveWip }
                      : { ...m, wipAtual: isPastMonth ? 0 : m.wipAtual };
                  return (
                    <MemberCardBlock
                      key={m.userId}
                      member={memberWithWip}
                      onOpen1on1={() => setActiveMember(memberWithWip)}
                    />
                  );
                })}
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

function TeamKpis({
  kpis,
  showWip = true,
}: {
  kpis: MuralPayload["kpisEquipe"];
  showWip?: boolean;
}) {
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
      {showWip && (
        <KpiCard
          sigla="WIP"
          nome="Tasks em andamento ao mesmo tempo"
          value={String(kpis.wipAtual)}
        />
      )}
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
          <MiniStat label="Var. dev" value={formatBRL(member.valorPontos)} />
          <MiniStat label="Var. disponibilidade" value={formatBRL(member.valorDisponibilidade)} />
          <MiniStat label="Tasks dev" value={String(member.tasksDev)} />
          <MiniStat label="Tasks suporte" value={String(member.tasksSuporte)} />
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
          <MiniStat label="SLA" value={`${member.slaAvg.toFixed(1)}%`} />
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
