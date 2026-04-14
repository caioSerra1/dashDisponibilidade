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
    const results = await rpc<Array<{ hostid: string; sla?: number }>>(
      "service.getsla",
      {
        serviceids: hostIds,
        intervals: [{ from: fromTs, to: toTs }],
      },
      auth,
    );
    return results.map((r) => ({ hostId: r.hostid, pct: typeof r.sla === "number" ? r.sla : 100 }));
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
