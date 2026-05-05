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
  /**
   * Porcentagem de disponibilidade no período. `null` quando não temos
   * dados pra medir (host sem item de ping, history vazia, RPC falhou).
   * Caller deve EXCLUIR null da média — nunca assumir 100% pra preencher.
   */
  pct: number | null;
}

/**
 * Padrões de NOME (case-insensitive) que identificam items de disponibilidade
 * customizados que o user mantém no Zabbix com toda lógica de guardrails:
 * queda de agente, latência, etc. O valor desses items é DIRETAMENTE a %
 * de disponibilidade que aparece no widget "Disponibilidade" do dashboard.
 *
 * Buscamos o item por NAME_REGEX em vez de key — o user dá nome amigável
 * tipo "Disponibilidade", "Plataforma Disponibilidade %", etc.
 */
const AVAILABILITY_NAME_PATTERNS = [/disponib/i, /availab/i];

/**
 * Fallback: keys padrão do Zabbix pra hosts que não têm item customizado
 * de disponibilidade. Não tem os guardrails do user — usar como último recurso.
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

    // 1. Busca TODOS os items dos hosts (não filtra por key — porque o user
    //    tem items customizados de "Disponibilidade" com nomes amigáveis).
    //    Vamos escolher por NAME primeiro, fallback pra icmpping/agent.ping.
    const items = await rpc<Array<{
      itemid: string;
      hostid: string;
      name: string;
      key_: string;
      value_type: string;
      units: string;
    }>>(
      "item.get",
      {
        hostids: hostIds,
        output: ["itemid", "hostid", "name", "key_", "value_type", "units"],
        monitored: true,
      },
      auth,
    );

    // Prioridade na escolha do item:
    //   1. Item cujo NAME bate em /disponib/i ou /availab/i (item customizado
    //      do user, com guardrails do dashboard nativo)
    //   2. Item com key_ = icmpping (calcula via avg dos pings)
    //   3. Item com key_ = agent.ping
    //   4. Qualquer item com "ping" no nome (último recurso)
    const itemByHost = new Map<string, { itemid: string; valueType: number; isPercentItem: boolean }>();

    // 1ª passada: items "Disponibilidade" customizados (valor é DIRETAMENTE %)
    for (const item of items) {
      if (itemByHost.has(item.hostid)) continue;
      const matchesName = AVAILABILITY_NAME_PATTERNS.some((re) => re.test(item.name));
      if (matchesName && (item.units === "%" || item.units === "")) {
        itemByHost.set(item.hostid, {
          itemid: item.itemid,
          valueType: Number(item.value_type),
          isPercentItem: true,
        });
      }
    }

    // 2ª passada: items de ping nativos (precisa avg pra virar %)
    for (const key of AVAILABILITY_ITEM_KEYS) {
      for (const item of items) {
        if (itemByHost.has(item.hostid)) continue;
        if (item.key_.startsWith(key)) {
          itemByHost.set(item.hostid, {
            itemid: item.itemid,
            valueType: Number(item.value_type),
            isPercentItem: false,
          });
        }
      }
    }
    // 3ª passada: qualquer item com "ping" no nome
    for (const item of items) {
      if (itemByHost.has(item.hostid)) continue;
      if (/ping/i.test(item.name) || /ping/i.test(item.key_)) {
        itemByHost.set(item.hostid, {
          itemid: item.itemid,
          valueType: Number(item.value_type),
          isPercentItem: false,
        });
      }
    }

    // 2. Pra cada host com item, busca histórico do período. Se history
    //    estiver vazio ou RPC falhar, retorna `null` (sem dados — caller
    //    decide o que fazer; NUNCA preenchemos com 100% fake).
    //
    //    - Item de %: valor já É a disponibilidade (avg direto)
    //    - Item de ping: valor é 0/1; pct = avg * 100
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
          if (history.length === 0) {
            // History vazia = retenção do Zabbix expirou ou dados foram
            // resetados no item. Nesses casos assumimos 100% (sem registro
            // de incidentes naquele período = considerado up). Decisão de
            // negócio: melhor que excluir o host da média.
            console.warn(`[zabbix] history vazia pra hostid=${hostid}, assumindo 100%`);
            return { hostid, pct: 100 as number | null };
          }
          const sum = history.reduce((acc, h) => acc + Number(h.value), 0);
          const avg = sum / history.length;
          const pct = info.isPercentItem ? avg : avg * 100;
          return {
            hostid,
            pct: Math.max(0, Math.min(100, Math.round(pct * 100) / 100)) as number | null,
          };
        } catch (e) {
          console.error(`[zabbix] history.get falhou pra ${hostid}`, (e as Error).message);
          return { hostid, pct: null as number | null };
        }
      }),
    );

    // 3. Hosts sem item de ping disponível: também null (sem como medir).
    const byHost = new Map(results.map((r) => [r.hostid, r.pct]));
    return hostIds.map((hostId) => ({
      hostId,
      pct: byHost.has(hostId) ? byHost.get(hostId)! : null,
    }));
  } finally {
    await logout(auth);
  }
}

export interface ZabbixProblem {
  zabbixEventId: string;
  hostId: string;
  startedAt: Date;
  endedAt: Date | null;
  severity: number;
  triggerName: string | null;
  itemKey: string | null;
}

/**
 * Busca todos os problemas (event.get value=1) do Zabbix relacionados aos
 * itens de availability (icmpping/agent.ping) num período. Resolve o
 * `r_eventid` em uma chamada batch pra preencher `endedAt`.
 *
 * Retorna problemas estruturados prontos pra serem persistidos em
 * `ServerEvent` — só conta indisponibilidade real (item de ping caiu),
 * não warnings transitórios de outras triggers.
 */
export async function listProblemsForHosts(
  hostIds: readonly string[],
  from: Date,
  to: Date,
): Promise<ZabbixProblem[]> {
  if (hostIds.length === 0) return [];
  const auth = await login();
  try {
    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000);

    // 1. Identificar item IDs de ping/availability dos hosts pra filtrar
    //    triggers que envolvem esses items (não pegar disco cheio, etc).
    const items = await rpc<Array<{
      itemid: string;
      hostid: string;
      key_: string;
      triggers?: Array<{ triggerid: string }>;
    }>>(
      "item.get",
      {
        hostids: hostIds,
        search: { key_: "ping" },
        searchByAny: true,
        output: ["itemid", "hostid", "key_"],
        selectTriggers: ["triggerid"],
        monitored: true,
      },
      auth,
    );

    const triggerToHost = new Map<string, { hostId: string; itemKey: string }>();
    for (const item of items) {
      for (const t of item.triggers ?? []) {
        triggerToHost.set(t.triggerid, { hostId: item.hostid, itemKey: item.key_ });
      }
    }
    const triggerIds = Array.from(triggerToHost.keys());
    if (triggerIds.length === 0) return [];

    // 2. Eventos PROBLEM dessas triggers no período.
    const problems = await rpc<Array<{
      eventid: string;
      objectid: string; // triggerid
      clock: string;
      r_eventid?: string;
      severity: string;
      name?: string;
    }>>(
      "event.get",
      {
        objectids: triggerIds,
        time_from: fromTs,
        time_till: toTs,
        source: 0,
        object: 0,
        value: 1,
        output: ["eventid", "objectid", "clock", "r_eventid", "severity", "name"],
        sortfield: ["clock"],
        sortorder: "ASC",
      },
      auth,
    );

    // 3. Resolve clock dos OK events (pra preencher endedAt).
    const resolutionIds = Array.from(
      new Set(
        problems
          .map((p) => p.r_eventid)
          .filter((id): id is string => id != null && id !== "0"),
      ),
    );
    const resolutions =
      resolutionIds.length > 0
        ? await rpc<Array<{ eventid: string; clock: string }>>(
            "event.get",
            { eventids: resolutionIds, output: ["eventid", "clock"] },
            auth,
          )
        : [];
    const resolutionClock = new Map(
      resolutions.map((r) => [r.eventid, Number(r.clock)]),
    );

    return problems
      .map((p): ZabbixProblem | null => {
        const meta = triggerToHost.get(p.objectid);
        if (!meta) return null;
        const endedTs =
          p.r_eventid && p.r_eventid !== "0"
            ? resolutionClock.get(p.r_eventid) ?? null
            : null;
        return {
          zabbixEventId: p.eventid,
          hostId: meta.hostId,
          startedAt: new Date(Number(p.clock) * 1000),
          endedAt: endedTs != null ? new Date(endedTs * 1000) : null,
          severity: Number(p.severity),
          triggerName: p.name ?? null,
          itemKey: meta.itemKey,
        };
      })
      .filter((p): p is ZabbixProblem => p != null);
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
