"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";

interface Host {
  hostId: string;
  name: string;
  enabled: boolean;
  lastSync: string | null;
}

interface WebApp {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  timeoutMs: number;
  expectStatus: string;
  lastCheckAt: string | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
  lastError: string | null;
  slaMonthPct: number | null;
}

export function ZabbixView() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [apps, setApps] = useState<WebApp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [appMsg, setAppMsg] = useState<string | null>(null);

  // form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newExpect, setNewExpect] = useState("2xx");
  const [creating, setCreating] = useState(false);

  async function reload() {
    const r = await fetch("/api/admin/zabbix-hosts").then((x) => x.json());
    setHosts(r.hosts);
  }

  async function reloadApps() {
    const r = await fetch("/api/admin/web-apps").then((x) => x.json());
    setApps(r.apps);
  }

  useEffect(() => {
    reload();
    reloadApps();
  }, []);

  async function sync() {
    setSyncing(true);
    setMsg(null);
    const r = await fetch("/api/admin/sync?kind=hosts", { method: "POST" }).then((x) => x.json());
    setSyncing(false);
    setMsg(r.ok ? `Importados: ${r.imported}` : `Erro: ${r.error}`);
    await reload();
  }

  async function toggle(hostId: string, enabled: boolean) {
    await fetch("/api/admin/zabbix-hosts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId, enabled }),
    });
    setHosts((prev) => prev.map((h) => (h.hostId === hostId ? { ...h, enabled } : h)));
  }

  async function createApp() {
    if (!newName || !newUrl) return;
    setCreating(true);
    setAppMsg(null);
    const r = await fetch("/api/admin/web-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, url: newUrl, expectStatus: newExpect }),
    }).then((x) => x.json());
    setCreating(false);
    if (r.ok) {
      setNewName("");
      setNewUrl("");
      setNewExpect("2xx");
      await reloadApps();
    } else {
      setAppMsg(`Erro ao criar: ${typeof r.error === "string" ? r.error : "validação falhou"}`);
    }
  }

  async function toggleApp(id: string, enabled: boolean) {
    await fetch(`/api/admin/web-apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)));
  }

  async function deleteApp(id: string) {
    if (!confirm("Excluir esta aplicação? Eventos históricos também serão removidos.")) return;
    await fetch(`/api/admin/web-apps/${id}`, { method: "DELETE" });
    await reloadApps();
  }

  async function checkAll() {
    setChecking(true);
    setAppMsg(null);
    const r = await fetch("/api/admin/web-apps/check", { method: "POST" }).then((x) => x.json());
    setChecking(false);
    setAppMsg(r.ok ? `Verificadas: ${r.checked} (${r.downNow} fora)` : `Erro: ${r.error}`);
    await reloadApps();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Servidores Zabbix</CardTitle>
          <Button onClick={sync} disabled={syncing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </CardHeader>
        <CardContent>
          {msg && <p className="text-sm mb-2">{msg}</p>}
          {hosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum host. Clique em Sincronizar para buscar do Zabbix.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Servidor</th>
                  <th className="py-2">ID</th>
                  <th className="py-2">Última sinc.</th>
                  <th className="py-2 text-right">Habilitado</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.hostId} className="border-t">
                    <td className="py-2">{h.name}</td>
                    <td className="py-2 text-muted-foreground">{h.hostId}</td>
                    <td className="py-2">{h.lastSync ? formatDate(h.lastSync) : "—"}</td>
                    <td className="py-2 text-right">
                      <Switch checked={h.enabled} onCheckedChange={(v) => toggle(h.hostId, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Aplicações (URLs)</CardTitle>
          <Button onClick={checkAll} disabled={checking} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            Verificar agora
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto_auto] mb-4">
            <Input
              placeholder="Nome (ex.: Portal Cursos)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="https://exemplo.com"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <Input
              placeholder="2xx"
              className="w-24"
              value={newExpect}
              onChange={(e) => setNewExpect(e.target.value)}
              title="Status esperado: 2xx, 3xx, 200,301,302..."
            />
            <Button onClick={createApp} disabled={creating || !newName || !newUrl} size="sm">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
          {appMsg && <p className="text-sm mb-2">{appMsg}</p>}
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma aplicação cadastrada. Adicione uma URL para começar a monitorar.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Status</th>
                  <th className="py-2">Aplicação</th>
                  <th className="py-2">Última check</th>
                  <th className="py-2">SLA mês</th>
                  <th className="py-2">Habilitado</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  const isUp = a.lastError == null && a.lastStatusCode != null;
                  const dotColor = a.lastCheckAt == null
                    ? "bg-muted-foreground/40"
                    : isUp
                      ? "bg-emerald-500"
                      : "bg-red-500";
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                          <span className="text-xs text-muted-foreground">
                            {a.lastStatusCode != null ? a.lastStatusCode : "—"}
                          </span>
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="font-medium">{a.name}</div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                        >
                          {a.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {a.lastError && (
                          <div className="text-xs text-red-500 mt-0.5 truncate max-w-md" title={a.lastError}>
                            {a.lastError}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {a.lastCheckAt ? formatDate(a.lastCheckAt) : "—"}
                        {a.lastResponseMs != null && (
                          <span className="ml-1 text-xs">({a.lastResponseMs}ms)</span>
                        )}
                      </td>
                      <td className="py-2 tabular-nums">
                        {a.slaMonthPct != null ? `${a.slaMonthPct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2">
                        <Switch checked={a.enabled} onCheckedChange={(v) => toggleApp(a.id, v)} />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteApp(a.id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
