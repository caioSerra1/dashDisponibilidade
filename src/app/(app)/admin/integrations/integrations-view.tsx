"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Play, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TestResult {
  ok: boolean;
  message: string;
}
interface TestResponse {
  clickup: TestResult;
  zabbix: TestResult;
}

export function IntegrationsView() {
  const [result, setResult] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function test() {
    setLoading(true);
    const r = await fetch("/api/admin/integrations/test").then((x) => x.json());
    setResult(r);
    setLoading(false);
  }

  useEffect(() => {
    test();
  }, []);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const r = await fetch("/api/admin/sync?kind=daily", { method: "POST" }).then((x) => x.json());
    setSyncing(false);
    setSyncMsg(r.ok ? `OK — ${r.processed} pessoas processadas` : `Erro: ${r.error}`);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <IntegrationCard
        name="ClickUp"
        description="Pontos de sprint por pessoa"
        result={result?.clickup}
        loading={loading}
      />
      <IntegrationCard
        name="Zabbix"
        description="Disponibilidade dos hosts"
        result={result?.zabbix}
        loading={loading}
      />
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={test} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Testar conexões
          </Button>
          <Button onClick={syncNow} disabled={syncing}>
            <Play className="h-4 w-4" />
            Sincronizar agora
          </Button>
          {syncMsg && <p className="text-sm self-center">{syncMsg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationCard({
  name,
  description,
  result,
  loading,
}: {
  name: string;
  description: string;
  result?: TestResult;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {name}
          {loading ? (
            <span className="text-xs text-muted-foreground">testando…</span>
          ) : result?.ok ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        {result && (
          <p className={`mt-2 text-sm ${result.ok ? "text-success" : "text-destructive"}`}>
            {result.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
