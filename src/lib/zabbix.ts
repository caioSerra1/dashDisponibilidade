import { env } from "./env";

interface RpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
  id: number;
  auth?: string;
}

interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: string };
}

let nextId = 1;

async function rpc<T>(method: string, params: unknown, auth?: string): Promise<T> {
  const { ZABBIX_URL } = env();
  if (!ZABBIX_URL) throw new Error("Zabbix URL not configured");
  const body: RpcRequest = { jsonrpc: "2.0", method, params, id: nextId++ };
  if (auth) body.auth = auth;
  const res = await fetch(ZABBIX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json-rpc" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zabbix HTTP ${res.status}`);
  const json = (await res.json()) as RpcResponse<T>;
  if (json.error) {
    const details = json.error.data ? ` — ${json.error.data}` : "";
    throw new Error(`Zabbix RPC error [${method}]: ${json.error.message}${details}`);
  }
  return json.result as T;
}

async function login(): Promise<string> {
  const { ZABBIX_USER, ZABBIX_PASSWORD } = env();
  if (!ZABBIX_USER || !ZABBIX_PASSWORD) throw new Error("Zabbix credentials missing");
  return rpc<string>("user.login", { username: ZABBIX_USER, password: ZABBIX_PASSWORD });
}

async function logout(auth: string): Promise<void> {
  await rpc("user.logout", {}, auth).catch(() => undefined);
}

export interface ZabbixHostInfo {
  hostId: string;
  name: string;
}

export async function listHosts(): Promise<ZabbixHostInfo[]> {
  const auth = await login();
  try {
    const hosts = await rpc<Array<{ hostid: string; name: string; host: string }>>(
      "host.get",
      { output: ["hostid", "host", "name"] },
      auth,
    );
    return hosts.map((h) => ({ hostId: h.hostid, name: h.name || h.host }));
  } finally {
    await logout(auth);
  }
}

export interface HostAvailability {
  hostId: string;
  pct: number;
}

/**
 * Keys de items que indicam "host respondendo" no Zabbix. Por host pegamos
 * o primeiro disponível dessa lista, na ordem.
 *
 * - `icmpping` retorna 1 quando o host responde ao ping ICMP, 0 quando não.
 * - `agent.ping` é o equivalente via Zabbix Agent.
 *
 * O dashboard nativo do Zabbix calcula "Disponibilidade %" via avg() do
 * mesmo item — replicamos exatamente essa lógica aqui.
 */
const AVAILABILITY_ITEM_KEYS = ["icmpping", "agent.ping"];

export async function getAvailability(
  hostIds: readonly string[],
  from: Date,
  to: Date,
): Promise<HostAvailability[]> {
  if (hostIds.length === 0) return [];
  const auth = await login();
  try {
    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000);

    // 1. Busca itens de ping/agent ping pra cada host. Cada host pode ter
    //    mais de um item — pegamos o primeiro na ordem de preferência.
    const items = await rpc<Array<{
      itemid: string;
      hostid: string;
      key_: string;
      value_type: string;
    }>>(
      "item.get",
      {
        hostids: hostIds,
        search: { key_: "ping" },
        searchByAny: true,
        output: ["itemid", "hostid", "key_", "value_type"],
        monitored: true,
      },
      auth,
    );

    // Escolhe o melhor item por host (icmpping > agent.ping > qualquer outro com "ping")
    const itemByHost = new Map<string, { itemid: string; valueType: number }>();
    for (const key of AVAILABILITY_ITEM_KEYS) {
      for (const item of items) {
        if (itemByHost.has(item.hostid)) continue;
        if (item.key_.startsWith(key)) {
          itemByHost.set(item.hostid, {
            itemid: item.itemid,
            valueType: Number(item.value_type),
          });
        }
      }
    }
    // Fallback: qualquer item com "ping" no nome
    for (const item of items) {
      if (itemByHost.has(item.hostid)) continue;
      itemByHost.set(item.hostid, {
        itemid: item.itemid,
        valueType: Number(item.value_type),
      });
    }

    // 2. Pra cada host com item, busca histórico do período.
    //    history=3 = unsigned int (icmpping), history=0 = float (agent.ping retorna 1.0 ou 0.0).
    const results = await Promise.all(
      Array.from(itemByHost.entries()).map(async ([hostid, info]) => {
        try {
          const history = await rpc<Array<{ value: string }>>(
            "history.get",
            {
              itemids: [info.itemid],
              time_from: fromTs,
              time_till: toTs,
              history: info.valueType,
              output: ["value"],
            },
            auth,
          );
          if (history.length === 0) return { hostid, pct: 100 };
          const sum = history.reduce((acc, h) => acc + Number(h.value), 0);
          const pct = (sum / history.length) * 100;
          return {
            hostid,
            pct: Math.max(0, Math.min(100, Math.round(pct * 100) / 100)),
          };
        } catch (e) {
          console.error(`[zabbix] history.get falhou pra ${hostid}`, (e as Error).message);
          return { hostid, pct: 100 };
        }
      }),
    );

    // 3. Pra hosts sem item de ping disponível, retorna 100% (não tem como medir).
    const byHost = new Map(results.map((r) => [r.hostid, r.pct]));
    return hostIds.map((hostId) => ({
      hostId,
      pct: byHost.get(hostId) ?? 100,
    }));
  } finally {
    await logout(auth);
  }
}

export async function testZabbix(): Promise<{ ok: boolean; message: string }> {
  try {
    const auth = await login();
    await logout(auth);
    return { ok: true, message: "Conectado" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
