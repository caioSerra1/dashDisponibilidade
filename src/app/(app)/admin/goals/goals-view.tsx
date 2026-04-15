"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Target, Coins, RefreshCw, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberField } from "@/components/ui/number-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type Kind = "POINTS" | "TASKS_CLOSED" | "SLA" | "AVG_RESOLUTION" | "CUSTOM";
type Period = "MONTH" | "WEEK" | "CONTINUOUS";

interface UserSlim {
  id: string;
  name: string;
  email: string;
}

interface Goal {
  id: string;
  userId: string;
  user: UserSlim;
  kind: Kind;
  period: Period;
  target: number;
  coinsReward: number;
  label: string | null;
  active: boolean;
  renewable: boolean;
  endedAt: string | null;
}

interface Metric {
  kind: Kind;
  label: string;
  unit: string;
  comparator: "≥" | "≤";
  supportsWeek: boolean;
}

const METRICS: Metric[] = [
  { kind: "POINTS", label: "Pontos de sprint entregues", unit: "pts", comparator: "≥", supportsWeek: false },
  { kind: "TASKS_CLOSED", label: "Tarefas concluídas", unit: "tarefas", comparator: "≥", supportsWeek: true },
  { kind: "SLA", label: "Disponibilidade média dos servidores", unit: "%", comparator: "≥", supportsWeek: false },
  { kind: "AVG_RESOLUTION", label: "Tempo médio de resolução", unit: "h", comparator: "≤", supportsWeek: false },
  { kind: "CUSTOM", label: "Meta personalizada (controle manual)", unit: "", comparator: "≥", supportsWeek: false },
];

const PERIOD_LABEL: Record<Period, string> = {
  MONTH: "mensal",
  WEEK: "semanal",
  CONTINUOUS: "contínua",
};

type Toast = { kind: "ok" | "err"; text: string } | null;

export function GoalsAdminView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [users, setUsers] = useState<UserSlim[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const [form, setForm] = useState({
    userId: "",
    kind: "POINTS" as Kind,
    period: "MONTH" as Period,
    target: 40,
    coinsReward: 100,
    label: "",
    renewable: true,
  });

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  }

  async function reload() {
    setLoading(true);
    try {
      const [g, u] = await Promise.all([
        fetch("/api/admin/goals").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
      ]);
      setGoals(g.goals ?? []);
      setUsers(u.users ?? []);
      setForm((f) => (f.userId || !u.users?.[0] ? f : { ...f, userId: u.users[0].id }));
    } catch {
      showToast({ kind: "err", text: "Falha ao carregar dados" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMetric: Metric = useMemo(
    () => METRICS.find((m) => m.kind === form.kind) ?? METRICS[0]!,
    [form.kind],
  );

  // Se mudar pra métrica que não suporta semanal, volta pra mensal
  useEffect(() => {
    if (!currentMetric.supportsWeek && form.period === "WEEK") {
      setForm((f) => ({ ...f, period: "MONTH" }));
    }
  }, [currentMetric, form.period]);

  const selectedUser = users.find((u) => u.id === form.userId);
  const previewPerson = selectedUser?.name ?? "o colaborador";
  const previewMetric = currentMetric.label.toLowerCase();
  const previewTarget = `${form.target}${currentMetric.unit ? " " + currentMetric.unit : ""}`;
  const previewPeriod =
    form.period === "CONTINUOUS"
      ? "a qualquer momento"
      : form.period === "WEEK"
        ? "nesta semana"
        : "neste mês";
  const previewRenewal = form.renewable
    ? form.period === "CONTINUOUS"
      ? "Pode ser batida várias vezes."
      : `Ao fim do período, a meta reabre automaticamente pra próxima ${form.period === "WEEK" ? "semana" : "mês"}.`
    : form.period === "CONTINUOUS"
      ? "Meta definitiva — só pode ser batida uma vez."
      : "Meta definitiva — vale só esse período, não reabre.";

  async function create() {
    if (!form.userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.userId,
          kind: form.kind,
          period: form.period,
          target: Number(form.target),
          coinsReward: Number(form.coinsReward),
          label: form.label || undefined,
          renewable: form.renewable,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast({ kind: "err", text: j.error ?? "Erro ao criar meta" });
        return;
      }
      setForm((f) => ({ ...f, target: 40, coinsReward: 100, label: "" }));
      showToast({ kind: "ok", text: "Meta criada" });
      await reload();
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(g: Goal) {
    const res = await fetch(`/api/admin/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !g.active }),
    });
    if (res.ok) {
      showToast({ kind: "ok", text: "Meta atualizada" });
      reload();
    } else {
      showToast({ kind: "err", text: "Erro ao atualizar" });
    }
  }

  async function reopen(g: Goal) {
    const res = await fetch(`/api/admin/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reopen: true }),
    });
    if (res.ok) {
      showToast({ kind: "ok", text: "Meta reaberta" });
      reload();
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta meta?")) return;
    const res = await fetch(`/api/admin/goals/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast({ kind: "ok", text: "Meta excluída" });
      reload();
    } else {
      showToast({ kind: "err", text: "Erro ao excluir" });
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-md border px-4 py-2 text-sm shadow-lg ${
            toast.kind === "ok"
              ? "bg-success/10 border-success/40 text-success"
              : "bg-destructive/10 border-destructive/40 text-destructive"
          }`}
        >
          {toast.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova meta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Colaborador</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>O que medir</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
              >
                {METRICS.map((m) => (
                  <option key={m.kind} value={m.kind}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>
                Valor alvo {currentMetric.comparator}
                {currentMetric.unit && (
                  <span className="text-muted-foreground ml-1">({currentMetric.unit})</span>
                )}
              </Label>
              <NumberField
                value={form.target}
                onChange={(v) => setForm({ ...form, target: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-amber-600" />
                Recompensa em moedas
              </Label>
              <NumberField
                value={form.coinsReward}
                onChange={(v) => setForm({ ...form, coinsReward: v })}
                allowDecimals={false}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Duração</Label>
              <div className="flex flex-wrap gap-2">
                <PeriodButton
                  active={form.period === "MONTH"}
                  onClick={() => setForm({ ...form, period: "MONTH" })}
                  label="Mensal"
                  helper="vale o mês corrente"
                />
                {currentMetric.supportsWeek && (
                  <PeriodButton
                    active={form.period === "WEEK"}
                    onClick={() => setForm({ ...form, period: "WEEK" })}
                    label="Semanal"
                    helper="vale a semana corrente"
                  />
                )}
                <PeriodButton
                  active={form.period === "CONTINUOUS"}
                  onClick={() => setForm({ ...form, period: "CONTINUOUS" })}
                  label="Contínua"
                  helper="sem prazo fixo"
                />
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2 flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <Label className="cursor-pointer">Meta renovável</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.renewable
                    ? "Reabre automaticamente no fim de cada período."
                    : "Meta definitiva — encerra após ser batida uma vez."}
                </p>
              </div>
              <Switch
                checked={form.renewable}
                onCheckedChange={(v) => setForm({ ...form, renewable: v })}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Rótulo (opcional)</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: Meta de sprint de abril"
              />
            </div>

            <div className="md:col-span-2 rounded-md bg-accent/30 border border-accent px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
                <Target className="h-3.5 w-3.5" />
                Pré-visualização
              </div>
              <p>
                <strong>{previewPerson}</strong> precisa atingir{" "}
                <strong>
                  {currentMetric.comparator} {previewTarget}
                </strong>{" "}
                em <strong>{previewMetric}</strong> {previewPeriod}. Ao bater, ganha{" "}
                <strong>{form.coinsReward} moedas</strong>. {previewRenewal}
              </p>
            </div>

            <div className="md:col-span-2">
              <Button onClick={create} disabled={!form.userId || loading}>
                Criar meta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metas cadastradas ({goals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Colaborador</th>
                    <th className="py-2">Métrica</th>
                    <th className="py-2">Duração</th>
                    <th className="py-2">Alvo</th>
                    <th className="py-2">Moedas</th>
                    <th className="py-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g) => {
                    const metric = METRICS.find((m) => m.kind === g.kind);
                    const ended = g.endedAt != null;
                    return (
                      <tr key={g.id} className="border-b last:border-0">
                        <td className="py-2">{g.user.name}</td>
                        <td className="py-2">
                          <Badge variant="secondary">{metric?.label ?? g.kind}</Badge>
                        </td>
                        <td className="py-2 capitalize">
                          {PERIOD_LABEL[g.period]}
                          {!g.renewable && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              · definitiva
                            </span>
                          )}
                        </td>
                        <td className="py-2 font-medium">
                          {g.target}
                          {metric?.unit && (
                            <span className="text-muted-foreground"> {metric.unit}</span>
                          )}
                        </td>
                        <td className="py-2">{g.coinsReward}</td>
                        <td className="py-2">
                          {ended ? (
                            <Badge variant="outline" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Encerrada
                            </Badge>
                          ) : g.active ? (
                            <Switch checked onCheckedChange={() => toggleActive(g)} />
                          ) : (
                            <Switch checked={false} onCheckedChange={() => toggleActive(g)} />
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {ended && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reopen(g)}
                              title="Reabrir"
                            >
                              Reabrir
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => remove(g.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodButton({
  active,
  onClick,
  label,
  helper,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  helper: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left transition-colors min-w-[140px] ${
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40"
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{helper}</div>
    </button>
  );
}
