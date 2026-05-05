import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  if (json.error) throw new Error(`Zabbix error: ${json.error.message} ${json.error.data ?? ""}`);
  return json.result as T;
}

/**
 * Endpoint temporário de debug: lista TODOS os items dos hosts habilitados
 * + último valor + value_type + units. Pra entender qual item devemos
 * priorizar pra cálculo de SLA.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { ZABBIX_USER, ZABBIX_PASSWORD } = env();
  const authToken = await rpc<string>("user.login", { username: ZABBIX_USER, password: ZABBIX_PASSWORD });

  try {
    const enabled = await prisma.zabbixHost.findMany({ where: { enabled: true } });
    const hostIds = enabled.map((h) => h.hostId);

    const items = await rpc<Array<{
      itemid: string;
      hostid: string;
      name: string;
      key_: string;
      value_type: string;
      units: string;
      lastvalue?: string;
      lastclock?: string;
    }>>(
      "item.get",
      {
        hostids: hostIds,
        output: ["itemid", "hostid", "name", "key_", "value_type", "units", "lastvalue", "lastclock"],
        monitored: true,
      },
      authToken,
    );

    // Filtra só items que matcham padrões de disponibilidade pra ver qual será usado
    const matchingDisponib = items.filter((i) => /disponib|availab/i.test(i.name));

    return NextResponse.json({
      enabledHosts: enabled,
      totalItemsFetched: items.length,
      matchingDisponib: matchingDisponib.map((i) => ({
        ...i,
        host: enabled.find((h) => h.hostId === i.hostid)?.name,
      })),
      allItemsByHost: enabled.map((h) => ({
        hostId: h.hostId,
        name: h.name,
        items: items
          .filter((i) => i.hostid === h.hostId)
          .map((i) => ({
            itemid: i.itemid,
            name: i.name,
            key_: i.key_,
            value_type: i.value_type,
            units: i.units,
            lastvalue: i.lastvalue,
          })),
      })),
    });
  } finally {
    await rpc("user.logout", {}, authToken).catch(() => undefined);
  }
}
