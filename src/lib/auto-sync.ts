import { runDaily } from "./orchestrator";
import { loadConfig, saveConfig } from "./config";

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

export function startAutoSync() {
  if (started) return;
  started = true;
  console.log("[auto-sync] agendado a cada 30 min");

  setTimeout(async () => {
    try {
      await ensureTaskClassification();
      await runDaily();
      console.log("[auto-sync] primeira execução ok");
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
