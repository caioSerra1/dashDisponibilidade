import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let nextId = 1;

async function rpc<T>(method: string, params: unknown, authToken?: string): Promise<T> {
  const { ZABBIX_URL } = env();
  if (!ZABBIX_URL) throw new Error("Zabbix URL not configured");
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, params, id: nextId++ };
  if (authToken) body.auth = authToken;
  const res = await fetch(ZABBIX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json-rpc" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zabbix HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string; data?: string } };
  if (json.error) throw new Error(`${json.error.message} ${json.error.data ?? ""}`);
  return json.result as T;
}

/**
 * GET /api/admin/zabbix-investigate?itemid=X
 *
 * Investiga um item específico do Zabbix:
 *  - lastvalue + lastclock
 *  - history.get últimos 30 dias (datapoints raw)
 *  - trend.get últimos 30 dias (avg/min/max diários)
 *  - Comparação: histAvg vs trendAvg vs lastvalue
 *
 * Útil pra entender por que o widget mostra X mas history retorna Y.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const itemid = url.searchParams.get("itemid");
  if (!itemid) {
    return NextResponse.json({ error: "itemid obrigatório" }, { status: 400 });
  }

  const { ZABBIX_USER, ZABBIX_PASSWORD } = env();
  const authToken = await rpc<string>("user.login", {
    username: ZABBIX_USER,
    password: ZABBIX_PASSWORD,
  });

  try {
    const items = await rpc<Array<{
      itemid: string;
      hostid: string;
      name: string;
      key_: string;
      value_type: string;
      units: string;
      lastvalue?: string;
      lastclock?: string;
      history?: string;
      trends?: string;
    }>>(
      "item.get",
      {
        itemids: [itemid],
        output: ["itemid", "hostid", "name", "key_", "value_type", "units", "lastvalue", "lastclock", "history", "trends"],
      },
      authToken,
    );
    const item = items[0];
    if (!item) {
      return NextResponse.json({ error: "item não encontrado" }, { status: 404 });
    }

    const valueType = Number(item.value_type);
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 3600;

    const [history, trends] = await Promise.all([
      rpc<Array<{ clock: string; value: string }>>(
        "history.get",
        {
          itemids: [itemid],
          time_from: thirtyDaysAgo,
          time_till: now,
          history: valueType,
          output: ["clock", "value"],
          sortfield: "clock",
          sortorder: "ASC",
        },
        authToken,
      ).catch((e) => ({ error: (e as Error).message } as never)),
      rpc<Array<{ clock: string; num: string; value_min: string; value_avg: string; value_max: string }>>(
        "trend.get",
        {
          itemids: [itemid],
          time_from: thirtyDaysAgo,
          time_till: now,
          output: "extend",
        },
        authToken,
      ).catch((e) => ({ error: (e as Error).message } as never)),
    ]);

    const histArr = Array.isArray(history) ? history : [];
    const histValues = histArr.map((h) => Number(h.value));
    const histAvg = histValues.length > 0
      ? histValues.reduce((a, b) => a + b, 0) / histValues.length
      : null;
    const histMin = histValues.length > 0 ? Math.min(...histValues) : null;
    const histMax = histValues.length > 0 ? Math.max(...histValues) : null;
    // Datapoints abaixo de 100 (problemas)
    const histBelow100 = histArr.filter((h) => Number(h.value) < 100);

    const trendArr = Array.isArray(trends) ? trends : [];
    const trendAvg = trendArr.length > 0
      ? trendArr.reduce((a, t) => a + Number(t.value_avg), 0) / trendArr.length
      : null;

    return NextResponse.json({
      item: {
        itemid: item.itemid,
        hostid: item.hostid,
        name: item.name,
        key_: item.key_,
        units: item.units,
        value_type: item.value_type,
        history_retention: item.history,
        trends_retention: item.trends,
        lastvalue: item.lastvalue,
        lastclock: item.lastclock,
        lastclockISO: item.lastclock ? new Date(Number(item.lastclock) * 1000).toISOString() : null,
      },
      analysis: {
        histCount: histArr.length,
        histAvg,
        histMin,
        histMax,
        histBelow100Count: histBelow100.length,
        histBelow100Sample: histBelow100.slice(0, 10).map((h) => ({
          clockISO: new Date(Number(h.clock) * 1000).toISOString(),
          value: h.value,
        })),
        trendCount: trendArr.length,
        trendAvg,
        trendSample: trendArr.slice(-7).map((t) => ({
          clockISO: new Date(Number(t.clock) * 1000).toISOString(),
          value_min: t.value_min,
          value_avg: t.value_avg,
          value_max: t.value_max,
        })),
      },
    });
  } finally {
    await rpc("user.logout", {}, authToken).catch(() => undefined);
  }
}
