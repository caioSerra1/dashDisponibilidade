"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RULE_LABELS, RULE_TYPES, type AchievementRule } from "@/lib/achievement-rules";

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  coinsReward: number;
  rule: AchievementRule | null;
  active: boolean;
}

const RULE_OPTIONS = RULE_TYPES.map((t) => ({ value: t, label: RULE_LABELS[t] }));

export function AchievementsAdminView() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    icon: "trophy",
    xp: 100,
    coinsReward: 50,
    ruleType: "POINTS_MIN_MONTH" as AchievementRule["type"],
    ruleValue: 40,
  });
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/achievements").then((x) => x.json());
    setItems(r.achievements ?? []);
  }

  useEffect(() => {
    reload();
  }, []);

  function buildRule(): AchievementRule {
    if (form.ruleType === "FIRST_MONTH_CLOSED") return { type: "FIRST_MONTH_CLOSED" };
    return { type: form.ruleType, value: form.ruleValue } as AchievementRule;
  }

  async function create() {
    setError(null);
    const r = await fetch("/api/admin/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
        name: form.name,
        description: form.description,
        icon: form.icon,
        xp: form.xp,
        coinsReward: form.coinsReward,
        rule: buildRule(),
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Erro ao criar conquista");
      return;
    }
    setForm({ ...form, code: "", name: "", description: "" });
    reload();
  }

  async function toggle(a: Achievement) {
    await fetch(`/api/admin/achievements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta conquista?")) return;
    await fetch(`/api/admin/achievements/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova conquista
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Código (único, A-Z, _)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EX: CYCLE_GOLD"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cycle Time de Ouro"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="O que precisa ser feito para desbloquear"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ícone (lucide id)</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="trophy, flame, target, sparkles…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Regra</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.ruleType}
                onChange={(e) =>
                  setForm({ ...form, ruleType: e.target.value as AchievementRule["type"] })
                }
              >
                {RULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {form.ruleType !== "FIRST_MONTH_CLOSED" && (
              <div className="space-y-1.5">
                <Label>Valor da regra</Label>
                <NumberField
                  value={form.ruleValue}
                  onChange={(v) => setForm({ ...form, ruleValue: v })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>XP</Label>
              <NumberField
                value={form.xp}
                onChange={(v) => setForm({ ...form, xp: v })}
                allowDecimals={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moedas de recompensa</Label>
              <NumberField
                value={form.coinsReward}
                onChange={(v) => setForm({ ...form, coinsReward: v })}
                allowDecimals={false}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={create} disabled={!form.code || !form.name}>
                Criar conquista
              </Button>
              {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Conquistas ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conquista cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{a.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {a.code}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Regra: <strong>{a.rule ? RULE_LABELS[a.rule.type] : "—"}</strong>
                      {a.rule && "value" in a.rule ? ` (${a.rule.value})` : ""}
                      {" · "}
                      {a.xp} XP · {a.coinsReward} moedas
                    </p>
                  </div>
                  <Switch checked={a.active} onCheckedChange={() => toggle(a)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
