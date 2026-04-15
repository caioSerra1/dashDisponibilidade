"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Target, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CoinBalance } from "@/components/game/coin-balance";

interface Goal {
  id: string;
  kind: "POINTS" | "TASKS_CLOSED" | "SLA" | "AVG_RESOLUTION" | "CUSTOM";
  period: "MONTH" | "WEEK" | "CONTINUOUS";
  target: number;
  coinsReward: number;
  customLabel: string | null;
  current: number;
  label: string;
  progress: number;
  hitThisPeriod: boolean;
}

const KIND_LABEL: Record<Goal["kind"], string> = {
  POINTS: "Pontos de sprint",
  TASKS_CLOSED: "Tarefas concluídas",
  SLA: "Disponibilidade",
  AVG_RESOLUTION: "Tempo médio de resolução",
  CUSTOM: "Personalizada",
};

const PERIOD_LABEL: Record<Goal["period"], string> = {
  MONTH: "mensal",
  WEEK: "semanal",
  CONTINUOUS: "contínua",
};

export function MetasView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/goals")
      .then((r) => r.json())
      .then((d) => setGoals(d.goals ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Minhas metas
        </h2>
        <p className="text-sm text-muted-foreground">
          Bata as metas e ganhe moedas pra trocar na loja.
        </p>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
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
    </div>
  );
}
