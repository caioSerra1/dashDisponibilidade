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
 * GET /api/admin/debug-zabbix-dashboard
 * Estuda a estrutura do Zabbix do user:
 *  - Lista dashboards (procura "Disponibilidade")
 *  - Pra cada widget, expõe os items referenciados
 *  - Compara lastvalue vs avg(history últimos 30d) pra cada item de %
 *  - Retorna o histórico bruto do item "Disponibilidade (%) - 30 dias"
 *    pra entender por que o avg dá 99.99 quando o widget mostra 100
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { ZABBIX_USER, ZABBIX_PASSWORD } = env();
  const authToken = await rpc<string>("user.login", {
    username: ZABBIX_USER,
    password: ZABBIX_PASSWORD,
  });

  try {
    // 1. Versão do Zabbix
    const version = await rpc<string>("apiinfo.version", {}).catch(() => "?");

    // 2. Lista dashboards
    const dashboards = await rpc<Array<{
      dashboardid: string;
      name: string;
      pages?: Array<{
        widgets?: Array<{
          widgetid: string;
          type: string;
          name: string;
          fields?: Array<{ type: number; name: string; value: string }>;
        }>;
      }>;
    }>>(
      "dashboard.get",
      { output: "extend", selectPages: "extend" },
      authToken,
    ).catch((e) => ({ error: (e as Error).message } as never));

    // 3. Foca no item "Disponibilidade (%) - 30 dias" pra cada host habilitado
    //    Pega lastvalue + history (30 dias) + trends (30 dias) e compara avg
    const enabled = await rpc<Array<{
      hostid: string;
      name: string;
    }>>(
      "host.get",
      {
        hostids: ["10680", "10681", "10685"],
        output: ["hostid", "name"],
      },
      authToken,
    );

    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 3600;

    const hostAnalysis = await Promise.all(
      enabled.map(async (h) => {
        // Items de % com nome contendo "disponib"
        const items = await rpc<Array<{
          itemid: string;
          name: string;
          key_: string;
          value_type: string;
          units: string;
          lastvalue?: string;
          lastclock?: string;
        }>>(
          "item.get",
          {
            hostids: [h.hostid],
            output: ["itemid", "name", "key_", "value_type", "units", "lastvalue", "lastclock"],
            search: { name: "disponib" },
          },
          authToken,
        );

        // Pra cada item de %, busca history (datapoints) e trend (avg/min/max diários)
        const itemAnalysis = await Promise.all(
          items.filter((i) => i.units === "%").map(async (item) => {
            const valueType = Number(item.value_type);
            const history = await rpc<Array<{ clock: string; value: string }>>(
              "history.get",
              {
                itemids: [item.itemid],
                time_from: thirtyDaysAgo,
                time_till: now,
                history: valueType,
                output: ["clock", "value"],
                sortfield: "clock",
                sortorder: "DESC",
                limit: 200,
              },
              authToken,
            ).catch((e) => ({ error: (e as Error).message } as never));

            // Trends: agregação diária do Zabbix (mais leve, mais antiga)
            const trends = await rpc<Array<{ clock: string; num: string; value_min: string; value_avg: string; value_max: string }>>(
              "trend.get",
              {
                itemids: [item.itemid],
                time_from: thirtyDaysAgo,
                time_till: now,
                output: "extend",
              },
              authToken,
            ).catch((e) => ({ error: (e as Error).message } as never));

            const histArr = Array.isArray(history) ? history : [];
            const histAvg = histArr.length > 0
              ? histArr.reduce((acc, h) => acc + Number(h.value), 0) / histArr.length
              : null;

            const trendArr = Array.isArray(trends) ? trends : [];
            const trendAvg = trendArr.length > 0
              ? trendArr.reduce((acc, t) => acc + Number(t.value_avg), 0) / trendArr.length
              : null;

            return {
              itemid: item.itemid,
              name: item.name,
              key_: item.key_,
              units: item.units,
              value_type: item.value_type,
              lastvalue: item.lastvalue,
              lastclock: item.lastclock,
              historyCount: histArr.length,
              historyAvg: histAvg,
              historySample: histArr.slice(0, 5),
              trendCount: trendArr.length,
              trendAvg,
              trendSample: trendArr.slice(0, 5),
            };
          }),
        );

        return { host: h.name, hostid: h.hostid, items: itemAnalysis };
      }),
    );

    return NextResponse.json({
      zabbixVersion: version,
      dashboards: Array.isArray(dashboards)
        ? dashboards.map((d) => ({
            dashboardid: d.dashboardid,
            name: d.name,
            widgetCount: d.pages?.reduce(
              (acc, p) => acc + (p.widgets?.length ?? 0),
              0,
            ),
            widgets: d.pages?.flatMap((p) =>
              (p.widgets ?? []).map((w) => ({
                type: w.type,
                name: w.name,
                fields: (w.fields ?? []).filter((f) =>
                  /item|host/i.test(f.name),
                ),
              })),
            ),
          }))
        : dashboards,
      hostAnalysis,
    });
  } finally {
    await rpc("user.logout", {}, authToken).catch(() => undefined);
  }
}
