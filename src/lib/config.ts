import { prisma } from "./db";

export interface AppConfig {
  valorDisponibilidade100: number;
  valorPorPonto: number;
  metaPontosMes: number;
  metaSlaStreak: number;
  gamificationEnabled: boolean;
  /**
   * Nomes de status do ClickUp que contam como "em execução".
   * O tempo de resolução das tasks só é contabilizado a partir do momento
   * em que entram em algum desses status.
   */
  executionStatuses: string[];
}

const DEFAULT_EXECUTION_STATUSES = [
  "em execução",
  "execução",
  "em andamento",
  "executando",
  "em desenvolvimento",
  "in progress",
  "doing",
];

const DEFAULTS: AppConfig = {
  valorDisponibilidade100: 1500,
  valorPorPonto: 50,
  metaPontosMes: 40,
  metaSlaStreak: 99,
  gamificationEnabled: true,
  executionStatuses: DEFAULT_EXECUTION_STATUSES,
};

export async function loadConfig(): Promise<AppConfig> {
  const rows = await prisma.config.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: keyof AppConfig) => {
    const v = map.get(k as string);
    return v !== undefined ? Number(v) : (DEFAULTS[k] as number);
  };

  let executionStatuses = DEFAULT_EXECUTION_STATUSES;
  const rawExec = map.get("executionStatuses");
  if (rawExec) {
    try {
      const parsed = JSON.parse(rawExec);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        executionStatuses = parsed;
      }
    } catch {
      // mantém default em caso de JSON inválido
    }
  }

  return {
    valorDisponibilidade100: num("valorDisponibilidade100"),
    valorPorPonto: num("valorPorPonto"),
    metaPontosMes: num("metaPontosMes"),
    metaSlaStreak: num("metaSlaStreak"),
    gamificationEnabled: (map.get("gamificationEnabled") ?? "true") === "true",
    executionStatuses,
  };
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<void> {
  const entries = Object.entries(partial);
  await Promise.all(
    entries.map(([key, value]) => {
      const stringValue = Array.isArray(value) ? JSON.stringify(value) : String(value);
      return prisma.config.upsert({
        where: { key },
        update: { value: stringValue },
        create: { key, value: stringValue },
      });
    }),
  );
}
