"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/date";

interface Host {
  hostId: string;
  name: string;
  enabled: boolean;
  lastSync: string | null;
}

export function ZabbixView() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/zabbix-hosts").then((x) => x.json());
    setHosts(r.hosts);
  }

  useEffect(() => {
    reload();
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

  return (
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
  );
}
