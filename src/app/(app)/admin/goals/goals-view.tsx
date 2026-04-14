"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberField } from "@/components/ui/number-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface UserSlim {
  id: string;
  name: string;
  email: string;
}

interface Goal {
  id: string;
  userId: string;
  user: UserSlim;
  kind: "POINTS" | "TASKS_CLOSED" | "SLA" | "AVG_RESOLUTION" | "CUSTOM";
  period: "MONTH" | "WEEK";
  target: number;
  coinsReward: number;
  label: string | null;
  active: boolean;
}

const KINDS = [
  { value: "POINTS", label: "Pontos de sprint (≥)" },
  { value: "TASKS_CLOSED", label: "Tasks concluídas (≥)" },
  { value: "SLA", label: "Disponibilidade % (≥)" },
  { value: "AVG_RESOLUTION", label: "Tempo médio resolução em horas (≤)" },
  { value: "CUSTOM", label: "Personalizada (controle manual)" },
] as const;

export function GoalsAdminView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [users, setUsers] = useState<UserSlim[]>([]);
  const [form, setForm] = useState({
    userId: "",
    kind: "POINTS" as Goal["kind"],
    period: "MONTH" as Goal["period"],
    target: 40,
    coinsReward: 100,
    label: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [g, u] = await Promise.all([
      fetch("/api/admin/goals").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ]);
    setGoals(g.goals ?? []);
    setUsers(u.users ?? []);
    if (!form.userId && u.users?.[0]) {
      setForm((f) => ({ ...f, userId: u.users[0].id }));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setError(null);
    const r = await fetch("/api/admin/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, label: form.label || undefined }),
    });
    if (!r.ok) {
      setError("Erro ao criar meta");
      return;
    }
    setForm({ ...form, target: 40, coinsReward: 100, label: "" });
    reload();
  }

  async function toggleActive(g: Goal) {
    await fetch(`/api/admin/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !g.active }),
    });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta meta?")) return;
    await fetch(`/api/admin/goals/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova meta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Colaborador</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Goal["kind"] })}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Período</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value as Goal["period"] })}
              >
                <option value="MONTH">Mensal</option>
                <option value="WEEK">Semanal</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor da meta</Label>
              <NumberField value={form.target} onChange={(v) => setForm({ ...form, target: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Recompensa (moedas)</Label>
              <NumberField
                value={form.coinsReward}
                onChange={(v) => setForm({ ...form, coinsReward: v })}
                allowDecimals={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rótulo personalizado (opcional)</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button onClick={create} disabled={!form.userId}>
                Criar meta
              </Button>
              {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
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
                    <th className="py-2">Tipo</th>
                    <th className="py-2">Período</th>
                    <th className="py-2">Meta</th>
                    <th className="py-2">Moedas</th>
                    <th className="py-2">Ativa</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="py-2">{g.user.name}</td>
                      <td className="py-2">
                        <Badge variant="secondary">
                          {KINDS.find((k) => k.value === g.kind)?.label ?? g.kind}
                        </Badge>
                      </td>
                      <td className="py-2">{g.period === "MONTH" ? "Mensal" : "Semanal"}</td>
                      <td className="py-2 font-medium">{g.target}</td>
                      <td className="py-2">{g.coinsReward}</td>
                      <td className="py-2">
                        <Switch checked={g.active} onCheckedChange={() => toggleActive(g)} />
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(g.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
