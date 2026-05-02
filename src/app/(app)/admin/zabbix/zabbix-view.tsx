"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, ExternalLink, History, X } from "lucide-react";
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

interface AvailabilityEvent {
  id: string;
  kind: string;
  startedAt: string;
  endedAt: string | null;
  statusCode?: number | null;
  errorMessage?: string | null;
  triggerName?: string | null;
  severity?: number;
  durationMinutes: number;
  ongoing: boolean;
}

interface EventsModalState {
  type: "server" | "app";
  id: string;
  name: string;
}

export function ZabbixView() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [apps, setApps] = useState<WebApp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [appMsg, setAppMsg] = useState<string | null>(null);
  const [eventsModal, setEventsModal] = useState<EventsModalState | null>(null);
  const [eventsData, setEventsData] = useState<{
    slaPct: number;
    totalDownMinutes: number;
    eventCount: number;
    events: AvailabilityEvent[];
  } | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  // form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newExpect, setNewExpect] = useState("2xx");
  const [newTimeoutSec, setNewTimeoutSec] = useState("10");
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
    const timeoutMs = Math.max(1, Math.min(60, Number(newTimeoutSec) || 10)) * 1000;
    setCreating(true);
    setAppMsg(null);
    const r = await fetch("/api/admin/web-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        url: newUrl,
        expectStatus: newExpect,
        timeoutMs,
      }),
    }).then((x) => x.json());
    setCreating(false);
    if (r.ok) {
      setNewName("");
      setNewUrl("");
      setNewExpect("2xx");
      setNewTimeoutSec("10");
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

  async function openEvents(target: EventsModalState) {
    setEventsModal(target);
    setEventsData(null);
    setEventsLoading(true);
    try {
      const r = await fetch(
        `/api/admin/availability/events?type=${target.type}&id=${encodeURIComponent(target.id)}`,
      ).then((x) => x.json());
      setEventsData(r);
    } finally {
      setEventsLoading(false);
    }
  }

  function closeEvents() {
    setEventsModal(null);
    setEventsData(null);
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
                  <th className="py-2">Habilitado</th>
                  <th className="py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.hostId} className="border-t">
                    <td className="py-2">{h.name}</td>
                    <td className="py-2 text-muted-foreground">{h.hostId}</td>
                    <td className="py-2">{h.lastSync ? formatDate(h.lastSync) : "—"}</td>
                    <td className="py-2">
                      <Switch checked={h.enabled} onCheckedChange={(v) => toggle(h.hostId, v)} />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEvents({ type: "server", id: h.hostId, name: h.name })}
                        aria-label="Ver incidentes"
                        title="Ver incidentes do mês"
                      >
                        <History className="h-4 w-4" />
                      </Button>
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
          <div className="rounded-md border bg-muted/30 p-3 mb-4 space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Adicionar nova aplicação
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Nome
                </label>
                <Input
                  placeholder="Ex.: Portal Cursos"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  URL completa (https://...)
                </label>
                <Input
                  placeholder="https://exemplo.com"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Resposta HTTP esperada
                </label>
                <select
                  value={newExpect}
                  onChange={(e) => setNewExpect(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="2xx">2xx — Qualquer sucesso (200, 201, 204…)</option>
                  <option value="2xx,3xx">2xx ou 3xx — Sucesso ou redirecionamento</option>
                  <option value="200">Apenas 200 OK exato</option>
                  <option value="200,301,302">200, 301 ou 302</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Códigos HTTP que indicam que o site está no ar. Default: qualquer 2xx.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Timeout (segundos)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  placeholder="10"
                  value={newTimeoutSec}
                  onChange={(e) => setNewTimeoutSec(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Quanto esperar pela resposta antes de marcar como fora do ar.
                </p>
              </div>
            </div>
            <Button onClick={createApp} disabled={creating || !newName || !newUrl} size="sm">
              <Plus className="h-4 w-4" />
              {creating ? "Adicionando…" : "Adicionar aplicação"}
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
                        {a.slaMonthPct != null ? (
                          `${a.slaMonthPct.toFixed(2)}%`
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Ainda sem medições — excluído da média">sem dados</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Switch checked={a.enabled} onCheckedChange={(v) => toggleApp(a.id, v)} />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEvents({ type: "app", id: a.id, name: a.name })}
                          aria-label="Ver incidentes"
                          title="Ver incidentes do mês"
                        >
                          <History className="h-4 w-4" />
                        </Button>
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

      {eventsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeEvents}
        >
          <div
            className="bg-card rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold">Incidentes — {eventsModal.name}</h3>
                <p className="text-xs text-muted-foreground">Mês corrente</p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeEvents} aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-auto p-4">
              {eventsLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : !eventsData ? (
                <p className="text-sm text-red-500">Falha ao carregar.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">SLA</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {eventsData.slaPct.toFixed(2)}%
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Tempo fora</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {eventsData.totalDownMinutes}min
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Eventos</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {eventsData.eventCount}
                      </div>
                    </div>
                  </div>
                  {eventsData.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhum incidente no período. 🎉
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="py-2">Início</th>
                          <th className="py-2">Fim</th>
                          <th className="py-2">Duração</th>
                          <th className="py-2">Detalhe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventsData.events.map((e) => (
                          <tr key={e.id} className="border-t align-top">
                            <td className="py-2 tabular-nums whitespace-nowrap">
                              {formatDate(e.startedAt)}
                            </td>
                            <td className="py-2 tabular-nums whitespace-nowrap">
                              {e.ongoing ? (
                                <span className="text-red-500 font-medium">em andamento</span>
                              ) : e.endedAt ? (
                                formatDate(e.endedAt)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 tabular-nums">{e.durationMinutes}min</td>
                            <td className="py-2 text-xs text-muted-foreground">
                              {e.kind === "monitor-gap" && (
                                <span className="text-amber-600">monitor offline · </span>
                              )}
                              {e.statusCode != null && <span>HTTP {e.statusCode}</span>}
                              {e.severity != null && <span>severidade {e.severity}</span>}
                              {e.triggerName && <span> · {e.triggerName}</span>}
                              {e.errorMessage && <span> · {e.errorMessage}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
