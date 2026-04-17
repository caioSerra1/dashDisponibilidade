import { runDaily, runClose } from "./orchestrator";
import { loadConfig, saveConfig } from "./config";
import { prisma } from "./db";

const INTERVAL_MS = 30 * 60 * 1000;
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

  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;

    const existingCloses = await prisma.monthlyClose.findMany({
      where: { year, month },
      select: { userId: true },
    });
    const closedUserIds = new Set(existingCloses.map((c) => c.userId));

    const missingUsers = users.filter((u) => !closedUserIds.has(u.id));
    if (missingUsers.length === 0) continue;

    console.log(
      `[backfill] ${month}/${year}: ${missingUsers.length} users sem MonthlyClose (${missingUsers.map((u) => u.name).join(", ")})`,
    );

    try {
      const result = await runClose({ year, month });
      filled += result.closed;
      console.log(`[backfill] ${month}/${year}: criados ${result.closed} MonthlyCloses`);
    } catch (e) {
      console.error(`[backfill] ${month}/${year} falhou`, e);
    }
  }

  if (filled > 0) {
    console.log(`[backfill] total: ${filled} MonthlyCloses criados`);
  } else {
    console.log("[backfill] nenhum mês faltando");
  }
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
}
