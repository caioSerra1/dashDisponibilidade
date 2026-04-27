import { prisma } from "./db";

export interface WebAppEventInterval {
  kind: string;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Calcula a porcentagem de disponibilidade ("SLA") de uma aplicação no
 * período [from, to), a partir dos eventos `down` que se sobrepõem ao
 * intervalo. Eventos ainda abertos (endedAt == null) contam até `to`.
 *
 * Função pura — não toca em Prisma. Recebe a lista pronta pra facilitar
 * testes e reutilização. Eventos `up` são descartados (servem só pra marcar
 * transição na timeline).
 */
export function computeWebAppSla(
  events: readonly WebAppEventInterval[],
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

/**
 * Busca SLA de uma WebApp no período via Prisma. Wrapper sobre `computeWebAppSla`.
 */
export async function getWebAppSla(
  webAppId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const events = await prisma.webAppEvent.findMany({
    where: {
      webAppId,
      kind: "down",
      OR: [
        { endedAt: null },
        { endedAt: { gte: from } },
      ],
      startedAt: { lt: to },
    },
    select: { kind: true, startedAt: true, endedAt: true },
  });
  return computeWebAppSla(events, from, to);
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

async function checkUrl(
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

    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), message: `checked=${checked} down=${downNow}` },
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
