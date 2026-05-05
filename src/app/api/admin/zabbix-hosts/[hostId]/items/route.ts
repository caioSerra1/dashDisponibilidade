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
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

/**
 * GET /api/admin/zabbix-hosts/[hostId]/items
 * Lista items do host filtrados por nome/units relevantes pra SLA.
 * Usado pelo dropdown "Item de disponibilidade" no admin/zabbix.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hostId: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { hostId } = await params;
  const { ZABBIX_USER, ZABBIX_PASSWORD } = env();
  if (!ZABBIX_USER || !ZABBIX_PASSWORD) {
    return NextResponse.json({ error: "Zabbix credentials missing" }, { status: 500 });
  }

  try {
    const authToken = await rpc<string>("user.login", {
      username: ZABBIX_USER,
      password: ZABBIX_PASSWORD,
    });
    try {
      const items = await rpc<Array<{
        itemid: string;
        name: string;
        key_: string;
        value_type: string;
        units: string;
        lastvalue?: string;
      }>>(
        "item.get",
        {
          hostids: [hostId],
          output: ["itemid", "name", "key_", "value_type", "units", "lastvalue"],
          monitored: true,
        },
        authToken,
      );

      // Filtra items relevantes pra SLA (units=% ou nome contém disponib/availab/online/ping)
      const filtered = items.filter(
        (i) =>
          i.units === "%" ||
          /disponib|availab|online|offline|ping/i.test(i.name) ||
          /ping/i.test(i.key_),
      );

      // Ordena: items de % com "Disponibilidade" primeiro, depois ping, depois resto
      filtered.sort((a, b) => {
        const score = (i: typeof a) => {
          let s = 0;
          if (/disponibilidade/i.test(i.name)) s += 100;
          if (i.units === "%") s += 50;
          if (/30\s*dias/i.test(i.name)) s += 20;
          if (/ping/i.test(i.name)) s += 10;
          return s;
        };
        return score(b) - score(a);
      });

      return NextResponse.json({
        items: filtered.map((i) => ({
          itemid: i.itemid,
          name: i.name,
          key_: i.key_,
          units: i.units,
          lastvalue: i.lastvalue,
        })),
      });
    } finally {
      await rpc("user.logout", {}, authToken).catch(() => undefined);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
