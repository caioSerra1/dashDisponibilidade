"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Target, Coins, RefreshCw, Lock, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberField } from "@/components/ui/number-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker, RenderIcon } from "@/components/ui/icon-picker";

type Kind = "POINTS" | "TASKS_CLOSED" | "SLA" | "AVG_RESOLUTION" | "CUSTOM";
type Period = "MONTH" | "WEEK" | "CONTINUOUS";
type Category = "METRIC" | "MILESTONE";

type MilestoneRuleType =
  | "SLA_MIN"
  | "POINTS_MIN_MONTH"
  | "FIRST_MONTH_CLOSED"
  | "GOAL_HITS_IN_MONTH"
  | "CYCLE_HOURS_MAX"
  | "RESOLUTION_HOURS_MAX"
  | "TASKS_CLOSED_MIN_MONTH";

type MilestoneRule =
  | { type: "SLA_MIN"; value: number }
  | { type: "POINTS_MIN_MONTH"; value: number }
  | { type: "FIRST_MONTH_CLOSED" }
  | { type: "GOAL_HITS_IN_MONTH"; value: number }
  | { type: "CYCLE_HOURS_MAX"; value: number }
  | { type: "RESOLUTION_HOURS_MAX"; value: number }
  | { type: "TASKS_CLOSED_MIN_MONTH"; value: number };

interface UserSlim {
  id: string;
  name: string;
  email: string;
}

interface Goal {
  id: string;
  userId: string;
  user: UserSlim;
  category: Category;
  kind: Kind;
  period: Period;
  target: number;
  coinsReward: number;
  label: string | null;
  description: string | null;
  icon: string | null;
  rule: MilestoneRule | null;
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

interface MilestoneRuleDef {
  type: MilestoneRuleType;
  label: string;
  needsValue: boolean;
  valueLabel: string;
  valueUnit: string;
  defaultValue: number;
}

const MILESTONE_RULES: MilestoneRuleDef[] = [
  { type: "SLA_MIN", label: "SLA mínimo no mês", needsValue: true, valueLabel: "SLA ≥", valueUnit: "%", defaultValue: 100 },
  { type: "POINTS_MIN_MONTH", label: "Pontos mínimos no mês", needsValue: true, valueLabel: "Pontos ≥", valueUnit: "pts", defaultValue: 40 },
  { type: "FIRST_MONTH_CLOSED", label: "Primeiro mês fechado", needsValue: false, valueLabel: "", valueUnit: "", defaultValue: 0 },
  { type: "GOAL_HITS_IN_MONTH", label: "Metas batidas no mês", needsValue: true, valueLabel: "Qtd ≥", valueUnit: "metas", defaultValue: 3 },
  { type: "CYCLE_HOURS_MAX", label: "Tempo de ciclo médio máximo", needsValue: true, valueLabel: "Horas ≤", valueUnit: "h", defaultValue: 24 },
  { type: "RESOLUTION_HOURS_MAX", label: "Tempo de resolução médio máximo", needsValue: true, valueLabel: "Horas ≤", valueUnit: "h", defaultValue: 48 },
  { type: "TASKS_CLOSED_MIN_MONTH", label: "Tarefas concluídas no mês", needsValue: true, valueLabel: "Tarefas ≥", valueUnit: "tarefas", defaultValue: 20 },
];

type Toast = { kind: "ok" | "err"; text: string } | null;

interface FormState {
  userId: string;
  category: Category;
  // METRIC fields
  kind: Kind;
  period: Period;
  target: number;
  // MILESTONE fields
  ruleType: MilestoneRuleType;
  ruleValue: number;
  description: string;
  icon: string;
  // shared
  coinsReward: number;
  label: string;
  renewable: boolean;
}

export function GoalsAdminView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [users, setUsers] = useState<UserSlim[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const [form, setForm] = useState<FormState>({
    userId: "",
    category: "METRIC",
    kind: "POINTS",
    period: "MONTH",
    target: 40,
    ruleType: "SLA_MIN",
    ruleValue: 100,
    description: "",
    icon: "lucide:trophy",
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

  const currentRule = useMemo(
    () => MILESTONE_RULES.find((r) => r.type === form.ruleType) ?? MILESTONE_RULES[0]!,
    [form.ruleType],
  );

  // Ao trocar ruleType, aplica o valor default pro novo tipo
  useEffect(() => {
    setForm((f) => ({ ...f, ruleValue: currentRule.defaultValue }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ruleType]);

  // Se mudar pra métrica que não suporta semanal, volta pra mensal
  useEffect(() => {
    if (!currentMetric.supportsWeek && form.period === "WEEK") {
      setForm((f) => ({ ...f, period: "MONTH" }));
    }
  }, [currentMetric, form.period]);

  async function create() {
    if (!form.userId) return;
    setLoading(true);
    try {
      const base = {
        userId: form.userId,
        category: form.category,
        coinsReward: Number(form.coinsReward),
        label: form.label || undefined,
        renewable: form.renewable,
      };
      const body =
        form.category === "METRIC"
          ? {
              ...base,
              kind: form.kind,
              period: form.period,
              target: Number(form.target),
            }
          : {
              ...base,
              kind: "CUSTOM" as const,
              period: "MONTH" as const,
              target: 0,
              description: form.description || undefined,
              icon: form.icon || undefined,
              rule: currentRule.needsValue
                ? { type: form.ruleType, value: Number(form.ruleValue) }
                : { type: form.ruleType },
            };
      const res = await fetch("/api/admin/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast({ kind: "err", text: j.error ?? "Erro ao criar meta" });
        return;
      }
      setForm((f) => ({
        ...f,
        target: 40,
        coinsReward: 100,
        label: "",
        description: "",
      }));
      showToast({
        kind: "ok",
        text: form.category === "METRIC" ? "Meta criada" : "Marco criado",
      });
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

  const metricGoals = goals.filter((g) => g.category === "METRIC");
  const milestoneGoals = goals.filter((g) => g.category === "MILESTONE");

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
        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <CategoryButton
              active={form.category === "METRIC"}
              onClick={() => setForm({ ...form, category: "METRIC" })}
              icon={Target}
              label="Métrica"
              helper="alvo numérico por período"
            />
            <CategoryButton
              active={form.category === "MILESTONE"}
              onClick={() => setForm({ ...form, category: "MILESTONE" })}
              icon={Award}
              label="Marco"
              helper="conquista única no fechamento"
            />
          </div>

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

            {form.category === "METRIC" ? (
              <>
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
                      <span className="text-muted-foreground ml-1">
                        ({currentMetric.unit})
                      </span>
                    )}
                  </Label>
                  <NumberField
                    value={form.target}
                    onChange={(v) => setForm({ ...form, target: v })}
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
              </>
            ) : (
              <>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Regra do marco</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.ruleType}
                    onChange={(e) =>
                      setForm({ ...form, ruleType: e.target.value as MilestoneRuleType })
                    }
                  >
                    {MILESTONE_RULES.map((r) => (
                      <option key={r.type} value={r.type}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {currentRule.needsValue && (
                  <div className="space-y-1.5">
                    <Label>
                      {currentRule.valueLabel}{" "}
                      <span className="text-muted-foreground">({currentRule.valueUnit})</span>
                    </Label>
                    <NumberField
                      value={form.ruleValue}
                      onChange={(v) => setForm({ ...form, ruleValue: v })}
                    />
                  </div>
                )}

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Breve explicação do marco"
                    rows={2}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <RenderIcon value={form.icon} className="h-6 w-6" />
                    </div>
                    <Label>Ícone</Label>
                  </div>
                  <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} />
                </div>
              </>
            )}

            <div className="space-y-1.5 md:col-span-2 flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <Label className="cursor-pointer">Renovável</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.renewable
                    ? form.category === "METRIC"
                      ? "Reabre automaticamente no fim de cada período."
                      : "Pode ser batida novamente em meses futuros."
                    : form.category === "METRIC"
                      ? "Meta definitiva — encerra após ser batida uma vez."
                      : "Marco único — só pode ser desbloqueado uma vez."}
                </p>
              </div>
              <Switch
                checked={form.renewable}
                onCheckedChange={(v) => setForm({ ...form, renewable: v })}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Rótulo</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder={
                  form.category === "METRIC"
                    ? "Ex: Meta de sprint de abril"
                    : "Ex: Primeiro mês perfeito"
                }
              />
            </div>

            <div className="md:col-span-2">
              <Button onClick={create} disabled={!form.userId || loading}>
                Criar {form.category === "METRIC" ? "meta" : "marco"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Metas de período ({metricGoals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metricGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada.</p>
          ) : (
            <GoalTable
              goals={metricGoals}
              toggleActive={toggleActive}
              reopen={reopen}
              remove={remove}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Marcos ({milestoneGoals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {milestoneGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum marco cadastrado.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {milestoneGoals.map((g) => {
                const ended = g.endedAt != null;
                const ruleLabel = g.rule
                  ? MILESTONE_RULES.find((r) => r.type === g.rule!.type)?.label ?? g.rule.type
                  : "—";
                return (
                  <div
                    key={g.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <RenderIcon value={g.icon} className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate">
                          {g.label ?? "Marco"}
                        </p>
                        <Badge variant="outline">{g.coinsReward} moedas</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {g.user.name} · {ruleLabel}
                      </p>
                      {g.description && (
                        <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        {ended ? (
                          <Badge variant="outline" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Encerrado
                          </Badge>
                        ) : (
                          <Switch
                            checked={g.active}
                            onCheckedChange={() => toggleActive(g)}
                          />
                        )}
                        {ended && (
                          <Button variant="ghost" size="sm" onClick={() => reopen(g)}>
                            Reabrir
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => remove(g.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoalTable({
  goals,
  toggleActive,
  reopen,
  remove,
}: {
  goals: Goal[];
  toggleActive: (g: Goal) => void;
  reopen: (g: Goal) => void;
  remove: (id: string) => void;
}) {
  return (
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
                    <span className="ml-1 text-xs text-muted-foreground">· definitiva</span>
                  )}
                </td>
                <td className="py-2 font-medium">
                  {g.target}
                  {metric?.unit && <span className="text-muted-foreground"> {metric.unit}</span>}
                </td>
                <td className="py-2">{g.coinsReward}</td>
                <td className="py-2">
                  {ended ? (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" />
                      Encerrada
                    </Badge>
                  ) : (
                    <Switch
                      checked={g.active}
                      onCheckedChange={() => toggleActive(g)}
                    />
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {ended && (
                    <Button variant="ghost" size="sm" onClick={() => reopen(g)} title="Reabrir">
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
  );
}

function CategoryButton({
  active,
  onClick,
  icon: Icon,
  label,
  helper,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  helper: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md border px-4 py-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{helper}</div>
    </button>
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
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{helper}</div>
    </button>
  );
}
