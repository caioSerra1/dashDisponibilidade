import { prisma } from "./db";
import type { TaskClassificationConfig } from "./metrics";

export interface AppConfig {
  valorDisponibilidade100: number;
  valorPorPonto: number;
  metaPontosMes: number;
  metaSlaStreak: number;
  /**
   * Nomes de status do ClickUp que contam como "em execução".
   * O tempo de resolução das tasks só é contabilizado a partir do momento
   * em que entram em algum desses status.
   */
  executionStatuses: string[];
  /**
   * Mapeamento de listas/pastas do ClickUp em "dev" (pontua) ou "suporte"
   * (mede mas não pontua). Listas não mapeadas são tratadas como "ignored"
   * e não afetam a variável nem as métricas principais.
   */
  taskClassification: TaskClassificationConfig;
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

const DEFAULT_TASK_CLASSIFICATION: TaskClassificationConfig = {
  dev: { listIds: [], folderIds: [] },
  support: { listIds: [], folderIds: [] },
};

const DEFAULTS: AppConfig = {
  valorDisponibilidade100: 1500,
  valorPorPonto: 50,
  metaPontosMes: 40,
  metaSlaStreak: 99,
  executionStatuses: DEFAULT_EXECUTION_STATUSES,
  taskClassification: DEFAULT_TASK_CLASSIFICATION,
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

  let taskClassification = DEFAULT_TASK_CLASSIFICATION;
  const rawClassification = map.get("taskClassification");
  if (rawClassification) {
    try {
      const parsed = JSON.parse(rawClassification);
      taskClassification = normalizeTaskClassification(parsed);
    } catch {
      // mantém default em caso de JSON inválido
    }
  }

  return {
    valorDisponibilidade100: num("valorDisponibilidade100"),
    valorPorPonto: num("valorPorPonto"),
    metaPontosMes: num("metaPontosMes"),
    metaSlaStreak: num("metaSlaStreak"),
    executionStatuses,
    taskClassification,
  };
}

function normalizeTaskClassification(value: unknown): TaskClassificationConfig {
  const base = DEFAULT_TASK_CLASSIFICATION;
  if (!value || typeof value !== "object") return base;
  const v = value as {
    dev?: { listIds?: unknown; folderIds?: unknown };
    support?: { listIds?: unknown; folderIds?: unknown };
  };
  const toStringArray = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
  return {
    dev: {
      listIds: toStringArray(v.dev?.listIds),
      folderIds: toStringArray(v.dev?.folderIds),
    },
    support: {
      listIds: toStringArray(v.support?.listIds),
      folderIds: toStringArray(v.support?.folderIds),
    },
  };
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<void> {
  const entries = Object.entries(partial);
  await Promise.all(
    entries.map(([key, value]) => {
      const stringValue =
        Array.isArray(value) || (typeof value === "object" && value !== null)
          ? JSON.stringify(value)
          : String(value);
      return prisma.config.upsert({
        where: { key },
        update: { value: stringValue },
        create: { key, value: stringValue },
      });
    }),
  );
}
