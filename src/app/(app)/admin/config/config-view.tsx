"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Save, Upload, Image as ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatBRL } from "@/lib/money";
import { applySlaTiers } from "@/lib/sla-tiers";

interface Tier {
  minPct: number;
  payoutPct: number;
}

interface ConfigState {
  valorDisponibilidade100: number;
  valorPorPonto: number;
  metaPontosMes: number;
  metaSlaStreak: number;
  gamificationEnabled: boolean;
  executionStatuses: string[];
}

const DEFAULT: ConfigState = {
  valorDisponibilidade100: 1500,
  valorPorPonto: 50,
  metaPontosMes: 40,
  metaSlaStreak: 99,
  gamificationEnabled: true,
  executionStatuses: ["em execução", "em andamento", "in progress"],
};

export function ConfigView() {
  const [cfg, setCfg] = useState<ConfigState>(DEFAULT);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [previewSla, setPreviewSla] = useState(99.5);
  const [previewPts, setPreviewPts] = useState(20);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d: { config: ConfigState; tiers: Tier[] }) => {
        setCfg(d.config);
        setTiers(d.tiers);
      });
  }, []);

  const preview = useMemo(() => {
    const payoutPct = applySlaTiers(previewSla, tiers);
    const valorDisp = cfg.valorDisponibilidade100 * (payoutPct / 100);
    const valorPts = previewPts * cfg.valorPorPonto;
    return { valorDisp, valorPts, total: valorDisp + valorPts, payoutPct };
  }, [cfg, tiers, previewSla, previewPts]);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cfg, tiers }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Valores base</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>R$ por 100% de disponibilidade</Label>
            <NumberField
              value={cfg.valorDisponibilidade100}
              onChange={(v) => setCfg({ ...cfg, valorDisponibilidade100: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>R$ por ponto de sprint</Label>
            <NumberField
              value={cfg.valorPorPonto}
              onChange={(v) => setCfg({ ...cfg, valorPorPonto: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Meta de pontos no mês</Label>
            <NumberField
              value={cfg.metaPontosMes}
              onChange={(v) => setCfg({ ...cfg, metaPontosMes: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Meta de disponibilidade para sequência (%)</Label>
            <NumberField
              value={cfg.metaSlaStreak}
              onChange={(v) => setCfg({ ...cfg, metaSlaStreak: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Conquistas & progresso</Label>
              <p className="text-xs text-muted-foreground">
                Ativa sequências, conquistas, XP e animações.
              </p>
            </div>
            <Switch
              checked={cfg.gamificationEnabled}
              onCheckedChange={(v) => setCfg({ ...cfg, gamificationEnabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status de execução (tempo de ciclo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Liste os nomes de status do ClickUp que contam como{" "}
            <strong>&quot;em execução&quot;</strong>. O tempo de resolução só começa a
            contar quando a task entra em algum desses status. Tasks que vão direto pra{" "}
            <em>concluída</em> sem passar por execução são <strong>excluídas</strong> da
            média de tempo. Comparação tolerante a maiúsculas/acentos.
          </p>
          <ExecutionStatusEditor
            values={cfg.executionStatuses}
            onChange={(v) => setCfg({ ...cfg, executionStatuses: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            Requer o <strong>ClickApp &quot;Time in Status&quot;</strong> habilitado no
            workspace ClickUp (Settings → ClickApps). Sem ele, o tempo é calculado
            usando criada → fechada como fallback.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faixas de disponibilidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Quando a disponibilidade média do mês atingir o mínimo da faixa, paga o
            percentual correspondente do bônus de disponibilidade.
          </p>
          {tiers.map((t, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Disponibilidade ≥ (%)</Label>
                <NumberField
                  value={t.minPct}
                  onChange={(v) =>
                    setTiers(tiers.map((x, j) => (j === i ? { ...x, minPct: v } : x)))
                  }
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Paga (%)</Label>
                <NumberField
                  value={t.payoutPct}
                  onChange={(v) =>
                    setTiers(tiers.map((x, j) => (j === i ? { ...x, payoutPct: v } : x)))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                aria-label="remover faixa"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTiers([...tiers, { minPct: 0, payoutPct: 0 }])}
          >
            <Plus className="h-4 w-4" />
            Adicionar faixa
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Identidade visual</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoUploader />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 glass">
        <CardHeader>
          <CardTitle>Simulação ao vivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Disponibilidade simulada (%)</Label>
              <NumberField value={previewSla} onChange={setPreviewSla} />
            </div>
            <div className="space-y-1.5">
              <Label>Pontos simulados</Label>
              <NumberField value={previewPts} onChange={setPreviewPts} />
            </div>
          </div>
          <div className="rounded-md border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">
              Com {previewSla}% de disponibilidade → a faixa paga{" "}
              <strong>{preview.payoutPct}%</strong> do bônus
            </p>
            <p className="text-sm">
              Bônus de disponibilidade:{" "}
              <strong>{formatBRL(preview.valorDisp)}</strong>
            </p>
            <p className="text-sm">
              Valor dos pontos: <strong>{formatBRL(preview.valorPts)}</strong>
            </p>
            <p className="text-xl font-bold mt-2 text-primary">
              Total: {formatBRL(preview.total)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            {saved && <span className="text-sm text-success">Salvo com sucesso!</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutionStatusEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  }

  function remove(i: number) {
    onChange(values.filter((_, j) => j !== i));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2rem]">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum status configurado.</span>
        )}
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1 border border-primary/20"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-primary/70 hover:text-destructive"
              aria-label={`remover ${v}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ex: em execução"
          className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function LogoUploader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [hasCustom, setHasCustom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/logo", { method: "HEAD" })
      .then((r) => setHasCustom(r.ok))
      .catch(() => setHasCustom(false));
  }, [version]);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/admin/logo", { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg(j.error ?? "Erro no upload");
      return;
    }
    setVersion((v) => v + 1);
    setMsg("Logo atualizado");
    setTimeout(() => setMsg(null), 2500);
  }

  async function remove() {
    if (!confirm("Remover o logo personalizado e voltar ao padrão?")) return;
    const r = await fetch("/api/admin/logo", { method: "DELETE" });
    if (r.ok) {
      setVersion((v) => v + 1);
      setMsg("Logo padrão restaurado");
      setTimeout(() => setMsg(null), 2500);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Envie um logo personalizado (PNG, JPG ou WEBP, até 2 MB). Aparece no sidebar e
        nas páginas de login.
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center h-20 w-40 rounded-md border bg-card overflow-hidden">
          {hasCustom ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/logo?v=${version}`}
              alt="Logo atual"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handle}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4" />
            {hasCustom ? "Substituir logo" : "Enviar logo"}
          </Button>
          {hasCustom && (
            <Button variant="ghost" size="sm" onClick={remove}>
              Voltar ao logo padrão
            </Button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-success">{msg}</p>}
    </div>
  );
}
