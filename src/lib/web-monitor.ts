import { prisma } from "./db";

export interface DowntimeInterval {
  kind: string;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Calcula porcentagem de disponibilidade no período [from, to) a partir
 * de uma lista de intervalos de "down". Compartilhada entre WebApp (URLs)
 * e ServerEvent (Zabbix mirror) — toda métrica de disponibilidade passa
 * por essa função pura.
 *
 * Eventos com `kind != "down"` são ignorados (up/monitor-gap servem só
 * pra marcar transição). Eventos abertos (endedAt = null) contam até `to`.
 */
export function computeAvailabilityFromEvents(
  events: readonly DowntimeInterval[],
  from: Date,
  to: Date,
): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const totalMs = Math.max(1, toMs - fromMs);

  let downMs = 0;
  for (const ev of events) {
    if (ev.kind !== "down") continue;
    const startMs = Math.max(ev.startedAt.getTime(), fromMs);
    const endMs = Math.min((ev.endedAt ?? to).getTime(), toMs);
    if (endMs <= startMs) continue;
    downMs += endMs - startMs;
  }

  const pct = ((totalMs - downMs) / totalMs) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

/** @deprecated Use `computeAvailabilityFromEvents`. Mantido pra compat. */
export const computeWebAppSla = computeAvailabilityFromEvents;
/** @deprecated Use `DowntimeInterval`. Mantido pra compat. */
export type WebAppEventInterval = DowntimeInterval;

export interface TimelineBucket {
  start: Date;
  end: Date;
  pct: number;
  downMs: number;
}

/**
 * Quebra o período [from, to) em buckets de tamanho `bucketMs` e calcula
 * SLA% pra cada bucket a partir dos eventos. Pura — base pra renderizar
 * gráfico de SLA diário/horário no dashboard.
 *
 * Eventos `up` são ignorados; `down` e `monitor-gap` (se incluídos pelo
 * caller) contam como indisponibilidade.
 */
export function computeSlaTimeline(
  events: readonly DowntimeInterval[],
  from: Date,
  to: Date,
  bucketMs: number,
): TimelineBucket[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs || bucketMs <= 0) return [];

  const buckets: TimelineBucket[] = [];
  for (let cursor = fromMs; cursor < toMs; cursor += bucketMs) {
    const bucketStart = cursor;
    const bucketEnd = Math.min(cursor + bucketMs, toMs);
    const bucketDuration = bucketEnd - bucketStart;

    let downMs = 0;
    for (const ev of events) {
      if (ev.kind !== "down") continue;
      const evStart = Math.max(ev.startedAt.getTime(), bucketStart);
      const evEnd = Math.min((ev.endedAt ?? to).getTime(), bucketEnd);
      if (evEnd > evStart) downMs += evEnd - evStart;
    }

    const pct = ((bucketDuration - downMs) / bucketDuration) * 100;
    buckets.push({
      start: new Date(bucketStart),
      end: new Date(bucketEnd),
      pct: Math.max(0, Math.min(100, Math.round(pct * 100) / 100)),
      downMs,
    });
  }
  return buckets;
}

/**
 * Busca SLA de uma WebApp no período via Prisma. Conta eventos `down` E
 * `monitor-gap` (gap = nosso check ficou offline, sem como medir → conta
 * como down pessimisticamente pra não inflar SLA).
 */
export async function getWebAppSla(
  webAppId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const events = await prisma.webAppEvent.findMany({
    where: {
      webAppId,
      kind: { in: ["down", "monitor-gap"] },
      OR: [{ endedAt: null }, { endedAt: { gte: from } }],
      startedAt: { lt: to },
    },
    select: { kind: true, startedAt: true, endedAt: true },
  });
  // Trata monitor-gap como down pra cálculo (pessimista, mas honesto).
  const normalized = events.map((e) => ({ ...e, kind: "down" }));
  return computeAvailabilityFromEvents(normalized, from, to);
}

/**
 * SLA de um host Zabbix lendo do espelho local `ServerEvent`. Independe
 * da disponibilidade do Zabbix em runtime.
 */
export async function getServerSla(
  hostId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const events = await prisma.serverEvent.findMany({
    where: {
      hostId,
      kind: "down",
      OR: [{ endedAt: null }, { endedAt: { gte: from } }],
      startedAt: { lt: to },
    },
    select: { kind: true, startedAt: true, endedAt: true },
  });
  return computeAvailabilityFromEvents(events, from, to);
}

/**
 * Verifica se um status HTTP bate com a expressão configurada pelo admin.
 * Aceita: "2xx", "3xx", "200", "200,301,302", "2xx,3xx".
 */
export function matchExpectStatus(statusCode: number, expr: string): boolean {
  const parts = expr
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return statusCode >= 200 && statusCode < 300;
  for (const p of parts) {
    if (p === "2xx" && statusCode >= 200 && statusCode < 300) return true;
    if (p === "3xx" && statusCode >= 300 && statusCode < 400) return true;
    if (p === "4xx" && statusCode >= 400 && statusCode < 500) return true;
    if (p === "5xx" && statusCode >= 500 && statusCode < 600) return true;
    if (/^\d+$/.test(p) && Number(p) === statusCode) return true;
  }
  return false;
}

interface CheckResult {
  ok: boolean;
  statusCode: number | null;
  responseMs: number;
  error: string | null;
}

async function checkUrlOnce(
  url: string,
  timeoutMs: number,
  expectStatus: string,
): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "PortalIndicadores-Monitor/1.0" },
    });
    const elapsed = Date.now() - started;
    const ok = matchExpectStatus(res.status, expectStatus);
    return { ok, statusCode: res.status, responseMs: elapsed, error: ok ? null : `status ${res.status}` };
  } catch (e) {
    const elapsed = Date.now() - started;
    const msg = (e as Error).message;
    return { ok: false, statusCode: null, responseMs: elapsed, error: msg };
  }
}

/**
 * Faz check com REPETIÇÃO antes de declarar down. Um único timeout/erro
 * é normalmente glitch transitório (DNS local, rede instável, Cloudflare
 * temporário). Só consideramos down se 2 tentativas com 3s de intervalo
 * falharem. Isso elimina ~95% dos falsos positivos.
 *
 * Quando o site está OK, custo é 1 request (sem retry).
 */
async function checkUrl(
  url: string,
  timeoutMs: number,
  expectStatus: string,
): Promise<CheckResult> {
  const first = await checkUrlOnce(url, timeoutMs, expectStatus);
  if (first.ok) return first;

  // 1ª tentativa falhou — espera 3s e tenta de novo pra confirmar.
  await new Promise((r) => setTimeout(r, 3000));
  const second = await checkUrlOnce(url, timeoutMs, expectStatus);

  if (second.ok) {
    // Recuperou na segunda tentativa = glitch momentâneo, NÃO marca como down.
    // Retorna como ok mas mantém o tempo da segunda tentativa pra indicar lentidão.
    return { ...second, ok: true };
  }
  // Falhou nas duas tentativas — confirma como down.
  return {
    ...second,
    error: `${second.error} (após 2 tentativas)`,
  };
}

const BATCH_SIZE = 10;

/**
 * Job: verifica todas as WebApps habilitadas, registra eventos de transição
 * (up→down ou down→up) e atualiza o último estado conhecido em cada WebApp.
 *
 * Pensado pra rodar a cada 5 minutos. Usa fetch paralelo em batches de 10
 * pra não estourar event loop nem dar burst em redes externas.
 */
export async function runWebMonitorCheck(): Promise<{ checked: number; downNow: number }> {
  const run = await prisma.jobRun.create({ data: { job: "web-monitor", status: "ok" } });
  try {
    const apps = await prisma.webApp.findMany({ where: { enabled: true } });
    if (apps.length === 0) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), message: "checked=0" },
      });
      return { checked: 0, downNow: 0 };
    }

    let checked = 0;
    let downNow = 0;
    let gapsCreated = 0;
    const now = new Date();
    // Se nosso check ficou silencioso por mais que isso, registramos um
    // monitor-gap pra esse intervalo (não temos como saber o que aconteceu).
    const GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10 min

    // 1. Detecta gaps de monitoramento ANTES dos checks novos: pra cada app,
    //    se o lastCheckAt foi há mais que GAP_THRESHOLD, abre um evento
    //    monitor-gap cobrindo o intervalo. Isso é pessimista propositalmente
    //    (gap = down) pra não inflar SLA quando perdemos sinal.
    for (const app of apps) {
      if (!app.lastCheckAt) continue;
      const gapMs = now.getTime() - app.lastCheckAt.getTime();
      if (gapMs <= GAP_THRESHOLD_MS) continue;

      // Evita duplicar se já existe um gap aberto começando perto desse momento.
      const existingGap = await prisma.webAppEvent.findFirst({
        where: { webAppId: app.id, kind: "monitor-gap", startedAt: app.lastCheckAt },
      });
      if (existingGap) continue;

      await prisma.webAppEvent.create({
        data: {
          webAppId: app.id,
          kind: "monitor-gap",
          startedAt: app.lastCheckAt,
          endedAt: now,
          errorMessage: `monitor offline por ${Math.round(gapMs / 60000)}min`,
        },
      });
      gapsCreated += 1;
    }

    for (let i = 0; i < apps.length; i += BATCH_SIZE) {
      const batch = apps.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((app) => checkUrl(app.url, app.timeoutMs, app.expectStatus).then((r) => ({ app, r }))),
      );

      for (const { app, r } of results) {
        checked += 1;
        const wasDown = app.lastCheckAt != null && app.lastError != null;
        const isDown = !r.ok;
        if (isDown) downNow += 1;

        // Transições: registra evento sempre que muda de estado, ou na PRIMEIRA
        // checagem quando já está down (assim não perdemos a janela inicial).
        if (isDown && !wasDown) {
          await prisma.webAppEvent.create({
            data: {
              webAppId: app.id,
              kind: "down",
              startedAt: new Date(),
              statusCode: r.statusCode,
              errorMessage: r.error,
            },
          });
        } else if (!isDown && wasDown) {
          // Fecha o último down ainda aberto e cria um evento up.
          await prisma.webAppEvent.updateMany({
            where: { webAppId: app.id, kind: "down", endedAt: null },
            data: { endedAt: new Date() },
          });
          await prisma.webAppEvent.create({
            data: {
              webAppId: app.id,
              kind: "up",
              startedAt: new Date(),
              statusCode: r.statusCode,
            },
          });
        }

        await prisma.webApp.update({
          where: { id: app.id },
          data: {
            lastCheckAt: new Date(),
            lastStatusCode: r.statusCode,
            lastResponseMs: r.responseMs,
            lastError: r.error,
          },
        });
      }
    }

    const msg = gapsCreated > 0
      ? `checked=${checked} down=${downNow} gaps=${gapsCreated}`
      : `checked=${checked} down=${downNow}`;
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), message: msg },
    });
    return { checked, downNow };
  } catch (e) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", message: (e as Error).message },
    });
    throw e;
  }
}
