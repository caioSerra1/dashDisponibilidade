import { runDaily, runClose, runZabbixSync } from "./orchestrator";
import { runWebMonitorCheck } from "./web-monitor";
import { loadConfig, saveConfig } from "./config";
import { prisma } from "./db";

const INTERVAL_MS = 30 * 60 * 1000;
const ZABBIX_INTERVAL_MS = 2 * 60 * 60 * 1000;
const WEB_MONITOR_INTERVAL_MS = 5 * 60 * 1000;
const SPRINTS_FOLDER_ID = "901314217806";
let started = false;

async function ensureTaskClassification() {
  const config = await loadConfig();
  const devFolders = config.taskClassification.dev.folderIds;
  if (!devFolders.includes(SPRINTS_FOLDER_ID)) {
    console.log("[auto-sync] adicionando folder Sprints Semanais à classificação dev");
    await saveConfig({
      taskClassification: {
        ...config.taskClassification,
        dev: {
          ...config.taskClassification.dev,
          folderIds: [...devFolders, SPRINTS_FOLDER_ID],
        },
      },
    });
  }
}

async function backfillMissingMonths() {
  const users = await prisma.user.findMany({
    where: { active: true, clickupUserId: { not: null } },
    select: { id: true, name: true },
  });

  const now = new Date();
  let filled = 0;
  let refilled = 0;

  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;

    const existingCloses = await prisma.monthlyClose.findMany({
      where: { year, month },
      select: { userId: true },
    });
    const closedUserIds = new Set(existingCloses.map((c) => c.userId));

    // Quais users faltam (sem MonthlyClose)
    const missingUsers = users.filter((u) => !closedUserIds.has(u.id));

    // Quais users TÊM MonthlyClose mas NÃO TÊM TaskMetricSnapshot do mês —
    // sintoma de close legado pré-reforma, com dados potencialmente errados.
    const userIdsWithSnapshot = new Set(
      (
        await prisma.taskMetricSnapshot.findMany({
          where: { year, month, userId: { in: Array.from(closedUserIds) } },
          select: { userId: true },
          distinct: ["userId"],
        })
      ).map((s) => s.userId),
    );
    const staleUsers = users.filter(
      (u) => closedUserIds.has(u.id) && !userIdsWithSnapshot.has(u.id),
    );

    if (missingUsers.length === 0 && staleUsers.length === 0) continue;

    if (missingUsers.length > 0) {
      console.log(
        `[backfill] ${month}/${year}: ${missingUsers.length} users sem MonthlyClose (${missingUsers.map((u) => u.name).join(", ")})`,
      );
    }
    if (staleUsers.length > 0) {
      console.log(
        `[backfill] ${month}/${year}: ${staleUsers.length} users com MonthlyClose mas sem TaskMetricSnapshot (recalculando: ${staleUsers.map((u) => u.name).join(", ")})`,
      );
    }

    try {
      // force=true se há users com close legado sem snapshot (recalcula valores)
      const force = staleUsers.length > 0;
      const result = await runClose({ year, month, force });
      if (force) refilled += result.closed;
      else filled += result.closed;
      console.log(
        `[backfill] ${month}/${year}: ${result.closed} closes ${force ? "recalculados" : "criados"}`,
      );
    } catch (e) {
      console.error(`[backfill] ${month}/${year} falhou`, e);
    }
  }

  console.log(`[backfill] total: ${filled} criados, ${refilled} recalculados`);
}

export function startAutoSync() {
  if (started) return;
  started = true;
  console.log("[auto-sync] agendado a cada 30 min");

  setTimeout(async () => {
    try {
      await ensureTaskClassification();
      await runDaily();
      console.log("[auto-sync] primeira execução ok");
      await backfillMissingMonths();
    } catch (e) {
      console.error("[auto-sync] falhou na primeira execução", e);
    }
  }, 60_000);

  setInterval(() => {
    console.log("[auto-sync] executando runDaily...");
    runDaily()
      .then((r) => console.log(`[auto-sync] ok, processed=${r.processed}`))
      .catch((e) => console.error("[auto-sync] falhou", e));
  }, INTERVAL_MS);

  // Job dedicado de Zabbix a cada 2h: atualiza SLA do mês corrente sem
  // tocar no ClickUp. Garante que disponibilidade reflita incidentes em
  // andamento mesmo se o runDaily estiver com algum problema.
  setInterval(() => {
    console.log("[auto-sync] executando runZabbixSync...");
    runZabbixSync()
      .then((r) => console.log(`[auto-sync] zabbix ok, sla=${r.sla.toFixed(2)}% updated=${r.updated}`))
      .catch((e) => console.error("[auto-sync] zabbix falhou", e));
  }, ZABBIX_INTERVAL_MS);

  // Monitor de aplicações (URLs) a cada 5 min: faz GET nas WebApps
  // habilitadas e registra eventos de transição up/down pro cálculo de SLA.
  setTimeout(() => {
    runWebMonitorCheck()
      .then((r) => console.log(`[auto-sync] web-monitor ok, checked=${r.checked} down=${r.downNow}`))
      .catch((e) => console.error("[auto-sync] web-monitor falhou", e));
  }, 90_000);

  setInterval(() => {
    runWebMonitorCheck()
      .then((r) => console.log(`[auto-sync] web-monitor ok, checked=${r.checked} down=${r.downNow}`))
      .catch((e) => console.error("[auto-sync] web-monitor falhou", e));
  }, WEB_MONITOR_INTERVAL_MS);
}
