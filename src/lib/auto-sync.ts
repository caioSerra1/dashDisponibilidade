import { runDaily } from "./orchestrator";

const INTERVAL_MS = 30 * 60 * 1000;
let started = false;

export function startAutoSync() {
  if (started) return;
  started = true;
  console.log("[auto-sync] agendado a cada 30 min");

  // Primeira execução após 60s (dá tempo pro app estabilizar)
  setTimeout(() => {
    runDaily().catch((e) => console.error("[auto-sync] falhou na primeira execução", e));
  }, 60_000);

  setInterval(() => {
    console.log("[auto-sync] executando runDaily...");
    runDaily()
      .then((r) => console.log(`[auto-sync] ok, processed=${r.processed}`))
      .catch((e) => console.error("[auto-sync] falhou", e));
  }, INTERVAL_MS);
}
