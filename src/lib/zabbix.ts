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
    const totalSeconds = Math.max(1, toTs - fromTs);

    // Estratégia: contar tempo real em "host down" via eventos no período.
    // service.getsla foi removido do Zabbix 6+, então calculamos direto:
    //   SLA% = 100 - (tempo_total_em_problema / período_total) * 100
    // Considera triggers de severidade "high" ou "disaster" pra evitar
    // contar warnings transitórios como indisponibilidade.
    const events = await rpc<Array<{
      eventid: string;
      hosts: Array<{ hostid: string }>;
      clock: string;
      r_clock?: string;
      value: string;
      severity?: string;
    }>>(
      "problem.get",
      {
        time_from: fromTs,
        time_till: toTs,
        hostids: hostIds,
        recent: false,
        sortfield: ["eventid"],
        sortorder: "ASC",
        selectHosts: ["hostid"],
        severities: [4, 5], // high + disaster
      },
      auth,
    );

    // Soma duração de cada problema por host. Problemas ainda abertos contam até `to`.
    const downSecondsByHost = new Map<string, number>();
    for (const ev of events) {
      const start = Math.max(Number(ev.clock), fromTs);
      const end = ev.r_clock && Number(ev.r_clock) > 0 ? Math.min(Number(ev.r_clock), toTs) : toTs;
      const duration = Math.max(0, end - start);
      for (const h of ev.hosts ?? []) {
        downSecondsByHost.set(h.hostid, (downSecondsByHost.get(h.hostid) ?? 0) + duration);
      }
    }

    return hostIds.map((hostId) => {
      const down = downSecondsByHost.get(hostId) ?? 0;
      const pct = Math.max(0, Math.min(100, ((totalSeconds - down) / totalSeconds) * 100));
      return { hostId, pct: Math.round(pct * 100) / 100 };
    });
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
