"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Target, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CoinBalance } from "@/components/game/coin-balance";
import { RenderIcon } from "@/components/ui/icon-picker";

interface MetricGoal {
  id: string;
  category: "METRIC";
  kind: "POINTS" | "TASKS_CLOSED" | "SLA" | "AVG_RESOLUTION" | "CUSTOM";
  period: "MONTH" | "WEEK" | "CONTINUOUS";
  target: number;
  coinsReward: number;
  customLabel: string | null;
  description: string | null;
  icon: string | null;
  current: number;
  label: string;
  progress: number;
  hitThisPeriod: boolean;
}

interface MilestoneGoal {
  id: string;
  category: "MILESTONE";
  coinsReward: number;
  customLabel: string | null;
  description: string | null;
  icon: string | null;
  unlocked: boolean;
  progress: number;
}

interface Payload {
  goals: MetricGoal[];
  milestones: MilestoneGoal[];
}

const KIND_LABEL: Record<MetricGoal["kind"], string> = {
  POINTS: "Pontos de sprint",
  TASKS_CLOSED: "Tarefas concluídas",
  SLA: "Disponibilidade",
  AVG_RESOLUTION: "Tempo médio de resolução",
  CUSTOM: "Personalizada",
};

const PERIOD_LABEL: Record<MetricGoal["period"], string> = {
  MONTH: "mensal",
  WEEK: "semanal",
  CONTINUOUS: "contínua",
};

export function MetasView() {
  const [data, setData] = useState<Payload>({ goals: [], milestones: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/goals")
      .then((r) => r.json())
      .then((d: Payload) => setData({ goals: d.goals ?? [], milestones: d.milestones ?? [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;

  const { goals, milestones } = data;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Minhas metas
        </h2>
        <p className="text-sm text-muted-foreground">
          Bata as metas e ganhe moedas pra trocar na loja.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Metas do período
          </h3>
          <p className="text-xs text-muted-foreground">
            Reabrem a cada período (mês/semana) e creditam moedas quando batidas.
          </p>
        </div>

        {goals.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma meta ativa no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => (
              <Card key={g.id} className={g.hitThisPeriod ? "border-success/40" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {g.customLabel ?? KIND_LABEL[g.kind]}
                        {g.hitThisPeriod && <CheckCircle2 className="h-4 w-4 text-success" />}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {PERIOD_LABEL[g.period]}
                      </p>
                    </div>
                    <CoinBalance coins={g.coinsReward} size="sm" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress
                    value={g.progress}
                    barClassName={g.hitThisPeriod ? "bg-success" : undefined}
                  />
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">{g.label}</span>
                    {g.hitThisPeriod ? (
                      <Badge variant="success">Meta batida!</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{g.progress}%</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Marcos
          </h3>
          <p className="text-xs text-muted-foreground">
            Conquistas únicas no fechamento do mês. Creditam moedas só uma vez.
          </p>
        </div>

        {milestones.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum marco configurado ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {milestones.map((m) => (
              <Card
                key={m.id}
                className={m.unlocked ? "border-success/40" : "opacity-80"}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                      m.unlocked ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <RenderIcon value={m.icon} className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold truncate">
                        {m.customLabel ?? "Marco"}
                      </p>
                      <CoinBalance coins={m.coinsReward} size="sm" />
                    </div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    )}
                    <div className="mt-2">
                      {m.unlocked ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Desbloqueado
                        </Badge>
                      ) : (
                        <Badge variant="outline">Ainda não batido</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
