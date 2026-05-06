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
 * Padrões de NOME que identificam items de disponibilidade customizados
 * do dashboard nativo do Zabbix. ORDEM IMPORTA — primeiro match ganha.
 *
 * O user mantém items tipo:
 *   - "Disponibilidade (%) - 30 dias"  ← QUEREMOS
 *   - "Disponibilidade (%) - 1h"
 *   - "Plataforma HTTP - Disponibilidade (%) - 30 dias"
 *   - "Disponibilidade ICMP" (ping 0/1, items.units="")
 *
 * Items que NÃO devem matchar (apesar de conter "available"):
 *   - "Available memory in %"
 *   - "Active agent availability"
 *   - "Utilization of availability manager..."
 *
 * Por isso usamos regex bem específico em vez de "availab|disponib" amplo.
 */
const AVAILABILITY_NAME_PATTERNS: Array<{ pattern: RegExp; priority: number }> = [
  // Prioridade alta: "Disponibilidade (%) - 30 dias" (período mensal — bate com SLA do mês)
  { pattern: /disponibilidade.{0,5}\(.{0,3}%.{0,3}\).{0,5}30.{0,3}dias/i, priority: 100 },
  // Prioridade média: "Disponibilidade (%) - 1h" ou "- 24h"
  { pattern: /disponibilidade.{0,5}\(.{0,3}%.{0,3}\)/i, priority: 50 },
  // Prioridade baixa: "Disponibilidade ICMP" (item de ping 0/1)
  { pattern: /disponibilidade.{0,5}icmp/i, priority: 10 },
];

/**
 * Fallback: keys padrão do Zabbix pra hosts que não têm item customizado
 * de disponibilidade. Não tem os guardrails do user — usar como último recurso.
 */
const AVAILABILITY_ITEM_KEYS = ["icmpping", "agent.ping"];

export async function getAvailability(
  hostIds: readonly string[],
  from: Date,
  to: Date,
  /**
   * Override manual por host: mapa hostId → itemId. Quando definido pra
   * um host, força usar esse item (ignora auto-detecção). Permite o
   * admin escolher exatamente o item do widget do dashboard nativo.
   */
  itemOverrides: Record<string, string | null | undefined> = {},
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
      lastvalue?: string;
    }>>(
      "item.get",
      {
        hostids: hostIds,
        output: ["itemid", "hostid", "name", "key_", "value_type", "units", "lastvalue"],
        monitored: true,
      },
      auth,
    );

    // Prioridade na escolha do item:
    //   100. "Disponibilidade (%) - 30 dias" (item customizado, escala mensal)
    //   50.  "Disponibilidade (%) - 1h" / "24h" (qualquer outra escala)
    //   10.  "Disponibilidade ICMP" (item de ping 0/1)
    //   5.   key_=icmpping nativo (não tem guardrails do user)
    //   3.   key_=agent.ping nativo
    //
    // Empate de prioridade: prefere item value_type=0 (float) sobre 3 (uint)
    // porque float dá 99.99%, uint trunca pra 99% (perda de precisão).
    const itemByHost = new Map<string, {
      itemid: string;
      itemName: string;
      valueType: number;
      lastvalue: string | undefined;
      isPercentItem: boolean;
      priority: number;
    }>();

    function consider(
      hostid: string,
      item: { itemid: string; name: string; value_type: string; lastvalue?: string },
      isPercentItem: boolean,
      priority: number,
    ) {
      const valueType = Number(item.value_type);
      const existing = itemByHost.get(hostid);
      if (existing) {
        if (existing.priority > priority) return;
        // Mesma prioridade: prefere float (value_type=0) sobre uint (value_type=3)
        if (existing.priority === priority && existing.valueType === 0 && valueType !== 0) return;
      }
      itemByHost.set(hostid, {
        itemid: item.itemid,
        itemName: item.name,
        valueType,
        lastvalue: item.lastvalue,
        isPercentItem,
        priority,
      });
    }

    // 0ª passada: OVERRIDES manuais do admin têm prioridade máxima.
    for (const item of items) {
      const overrideItemId = itemOverrides[item.hostid];
      if (overrideItemId && item.itemid === overrideItemId) {
        const isPercentItem = item.units === "%";
        consider(item.hostid, item, isPercentItem, 1000);
      }
    }

    // 1ª passada: items "Disponibilidade (%)" customizados — valor é
    // DIRETAMENTE a porcentagem (units = "%"). Pega por prioridade.
    for (const item of items) {
      if (item.units !== "%") continue;
      for (const { pattern, priority } of AVAILABILITY_NAME_PATTERNS) {
        if (pattern.test(item.name)) {
          consider(item.hostid, item, true, priority);
          break; // pega o primeiro pattern que bater
        }
      }
    }

    // 2ª passada: items de ping nativos (precisa avg pra virar %)
    for (const key of AVAILABILITY_ITEM_KEYS) {
      for (const item of items) {
        if (item.key_.startsWith(key)) {
          const priority = key === "icmpping" ? 5 : 3;
          consider(item.hostid, item, false, priority);
        }
      }
    }
    // 3ª passada: qualquer item com "ping" no nome (último recurso)
    for (const item of items) {
      if (itemByHost.has(item.hostid)) continue;
      if (/ping/i.test(item.name) || /ping/i.test(item.key_)) {
        consider(item.hostid, item, false, 1);
      }
    }

    // 2. Pra cada host, calcula SLA via avg do history.get NO PERÍODO.
    //    Isso replica o que o widget do Zabbix mostra quando você filtra
    //    por "últimos 30 dias": media dos valores naquela janela.
    //
    //    - Item de %: avg dos valores diretamente
    //    - Item de ping: avg de 0/1 × 100
    // Items cujo NOME indica janela rolante (Zabbix calcula a janela
    // internamente — o lastvalue JÁ é o SLA acumulado dessa janela).
    // Ex: "Disponibilidade (%) - 30 dias", "Plataforma HTTP - 30d".
    // Pra esses, usar lastvalue direto. Calcular avg do history aqui
    // seria "média de uma média rolante" — número diferente do widget.
    const ROLLING_WINDOW_PATTERNS = [
      /\b30\s*dias\b/i,
      /\b30d\b/i,
      /\b7\s*dias\b/i,
      /\b7d\b/i,
      /\bmonth\b/i,
      /\bmensal\b/i,
    ];

    const results = await Promise.all(
      Array.from(itemByHost.entries()).map(async ([hostid, info]) => {
        const isRollingWindow =
          info.isPercentItem &&
          ROLLING_WINDOW_PATTERNS.some((p) => p.test(info.itemName));

        // Janela rolante → lastvalue direto (= o que aparece no widget)
        if (isRollingWindow) {
          if (info.lastvalue == null || info.lastvalue === "") {
            console.warn(`[zabbix] lastvalue ausente pra rolling item hostid=${hostid}`);
            return { hostid, pct: null as number | null };
          }
          const pct = Number(info.lastvalue);
          if (!Number.isFinite(pct)) return { hostid, pct: null as number | null };
          return {
            hostid,
            pct: Math.max(0, Math.min(100, Math.floor(pct * 100) / 100)) as number | null,
          };
        }

        // Itens instantâneos (1h, ping) → avg do history no período
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
            const fallback = info.lastvalue != null && info.lastvalue !== ""
              ? Number(info.lastvalue)
              : null;
            if (fallback == null || !Number.isFinite(fallback)) {
              console.warn(`[zabbix] history vazia + sem lastvalue pra hostid=${hostid}, assumindo 100%`);
              return { hostid, pct: 100 as number | null };
            }
            const pct = info.isPercentItem ? fallback : fallback * 100;
            return {
              hostid,
              pct: Math.max(0, Math.min(100, Math.floor(pct * 100) / 100)) as number | null,
            };
          }
          const sum = history.reduce((acc, h) => acc + Number(h.value), 0);
          const avg = sum / history.length;
          const pct = info.isPercentItem ? avg : avg * 100;
          return {
            hostid,
            pct: Math.max(0, Math.min(100, Math.floor(pct * 100) / 100)) as number | null,
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
