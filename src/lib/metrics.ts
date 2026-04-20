/**
 * Métricas puras (testáveis) derivadas de uma lista de tasks do ClickUp.
 */

export interface RichTask {
  id: string;
  points: number | null;
  status?: string;
  dateCreated: number | null;  // ms
  dateStarted: number | null;  // ms
  dateClosed: number | null;   // ms
  priority: "urgent" | "high" | "normal" | "low" | null;
  tags: string[];
  listId: string | null;
  folderId: string | null;
  /** Quantas vezes voltou pra um status de execução após sair. */
  returnedToExecution: number;
  /** Minutos REAIS em status de execução (soma do TIS by_minute). Exclui validação. */
  executionMinutes: number | null;
}

export type TaskType = "dev" | "support" | "ignored";

export interface TaskClassificationConfig {
  dev: { listIds: string[]; folderIds: string[] };
  support: { listIds: string[]; folderIds: string[] };
}

/**
 * Classifica uma task em `dev`, `support` ou `ignored`.
 *
 * Regra: 100% baseada nas listas/pastas configuradas pelo admin.
 * - `dev` = folders/listas de Sprint ou Backlog → pontuam
 * - `support` = folders/listas de Suporte → NÃO pontuam, mesmo com points
 * - `ignored` = qualquer outra coisa → NÃO pontuam
 *
 * Não há mais bypass automático "points > 0 → dev": isso permitia que
 * pontos preenchidos em tasks fora de sprint/backlog entrassem no total.
 * Agora pontos só contam quando a task está numa lista/folder explicitamente
 * marcada como `dev` no admin.
 */
export function classifyTask(
  task: Pick<RichTask, "listId" | "folderId" | "points">,
  config: TaskClassificationConfig,
): TaskType {
  const listId = task.listId;
  const folderId = task.folderId;

  if (listId != null && config.support.listIds.includes(listId)) return "support";
  if (folderId != null && config.support.folderIds.includes(folderId)) return "support";
  if (listId != null && config.dev.listIds.includes(listId)) return "dev";
  if (folderId != null && config.dev.folderIds.includes(folderId)) return "dev";
  return "ignored";
}

export interface PriorityBreakdown {
  urgent: number;
  high: number;
  normal: number;
  low: number;
}

export interface TypeMetrics {
  tasksClosed: number;
  tasksClosedLast7d: number;
  pointsSum: number;
  avgResolutionHours: number | null;
  avgCycleHours: number | null;
  /** MTTA — tempo até assumir: da criação até o primeiro entry em execução. */
  avgAckHours: number | null;
  throughputPerWeek: number | null;
  /** Quantos retornos à execução ocorreram no conjunto. */
  returnedToExecution: number;
  priorityBreakdown: PriorityBreakdown;
  tagsBreakdown: Array<{ tag: string; count: number }>;
}

/**
 * Métricas totais (dev + suporte). Mantém compatibilidade com os callers
 * antigos — os campos existentes continuam apontando pro total.
 *
 * `pointsSum` é calculado só sobre tasks DEV. Suporte e ignoradas não
 * pontuam, mesmo que tenham `points != null` no ClickUp.
 */
export interface TaskMetrics extends TypeMetrics {
  byType: {
    dev: TypeMetrics;
    support: TypeMetrics;
    ignored: TypeMetrics;
  };
}

const HOUR_MS = 3600_000;

function emptyTypeMetrics(): TypeMetrics {
  return {
    tasksClosed: 0,
    tasksClosedLast7d: 0,
    pointsSum: 0,
    avgResolutionHours: null,
    avgCycleHours: null,
    avgAckHours: null,
    throughputPerWeek: null,
    returnedToExecution: 0,
    priorityBreakdown: { urgent: 0, high: 0, normal: 0, low: 0 },
    tagsBreakdown: [],
  };
}

function computeSegment(tasks: readonly RichTask[], now: number): TypeMetrics {
  if (tasks.length === 0) return emptyTypeMetrics();

  const closed = tasks.filter((t) => typeof t.dateClosed === "number");
  const tasksClosed = closed.length;

  const pointsSum = tasks.reduce(
    (acc, t) => acc + (typeof t.points === "number" ? t.points : 0),
    0,
  );

  // MTTR = execução → fechamento (todas as prioridades).
  // Só conta a partir do momento que a task foi pra execução.
  const resolutionHours = closed
    .filter((t) => typeof t.dateCreated === "number")
    .map((t) => ((t.dateClosed as number) - (t.dateCreated as number)) / HOUR_MS)
    .filter((h) => h >= 0);

  // Cycle time = tempo SOMENTE em execução (exclui validação, avaliação, etc).
  // Usa executionMinutes do TIS quando disponível, senão fallback pra dateStarted→dateClosed.
  const cycleHours = closed
    .filter((t) => t.executionMinutes != null || typeof t.dateStarted === "number")
    .map((t) => {
      if (t.executionMinutes != null) return t.executionMinutes / 60;
      return ((t.dateClosed as number) - (t.dateStarted as number)) / HOUR_MS;
    })
    .filter((h) => h >= 0);

  // MTTA — só tasks com prioridade alta ou urgente.
  // Tasks normais/baixas abertas há meses distorcem a média.
  const highPriorityClosed = closed.filter(
    (t) => t.priority === "urgent" || t.priority === "high",
  );
  const ackHours = highPriorityClosed
    .filter((t) => typeof t.dateCreated === "number" && typeof t.dateStarted === "number")
    .map((t) => ((t.dateStarted as number) - (t.dateCreated as number)) / HOUR_MS)
    .filter((h) => h >= 0);

  const avgResolutionHours = avg(resolutionHours);
  const avgCycleHours = avg(cycleHours);
  const avgAckHours = avg(ackHours);

  const sevenDaysAgo = now - 7 * 24 * HOUR_MS;
  const tasksClosedLast7d = closed.filter(
    (t) => (t.dateClosed as number) >= sevenDaysAgo,
  ).length;

  const throughputPerWeek = tasksClosed > 0 ? tasksClosedLast7d : null;

  const returnedToExecution = closed.reduce((acc, t) => acc + t.returnedToExecution, 0);

  const priorityBreakdown: PriorityBreakdown = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  for (const t of closed) {
    if (t.priority && t.priority in priorityBreakdown) {
      priorityBreakdown[t.priority] += 1;
    }
  }

  const tagCounts = new Map<string, number>();
  for (const t of closed) {
    for (const tag of t.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tagsBreakdown = Array.from(tagCounts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    tasksClosed,
    tasksClosedLast7d,
    pointsSum,
    avgResolutionHours,
    avgCycleHours,
    avgAckHours,
    throughputPerWeek,
    returnedToExecution,
    priorityBreakdown,
    tagsBreakdown,
  };
}

/**
 * Calcula métricas segmentadas por tipo (dev/support/ignored) e totais.
 *
 * - Os campos do nível superior (`tasksClosed`, `avgResolutionHours`, etc)
 *   são o total dev + suporte (sem ignoradas).
 * - `pointsSum` no total = apenas pontos DEV (suporte e ignoradas não
 *   pontuam, mesmo que tenham valor no ClickUp).
 * - `byType` traz o detalhe segmentado.
 */
export function computeTaskMetrics(
  tasks: readonly RichTask[],
  now: number = Date.now(),
  config: TaskClassificationConfig = EMPTY_CLASSIFICATION,
  maxExecDays: number = 0,
): TaskMetrics {
  const maxExecMinutes = maxExecDays > 0 ? maxExecDays * 24 * 60 : 0;

  const dev: RichTask[] = [];
  const support: RichTask[] = [];
  const ignored: RichTask[] = [];

  for (const task of tasks) {
    // Excluir tasks com mais de N dias em execução de TODAS as métricas
    if (maxExecMinutes > 0 && task.executionMinutes != null && task.executionMinutes > maxExecMinutes) {
      continue;
    }
    const type = classifyTask(task, config);
    if (type === "dev") dev.push(task);
    else if (type === "support") support.push(task);
    else ignored.push(task);
  }

  const devMetrics = computeSegment(dev, now);
  const supportMetrics = computeSegment(support, now);
  const ignoredMetrics = computeSegment(ignored, now);

  // Total = dev + suporte; ignoradas ficam de fora.
  const combined = computeSegment([...dev, ...support], now);

  // pointsSum no total = só dev (suporte não pontua)
  combined.pointsSum = devMetrics.pointsSum;

  return {
    ...combined,
    byType: {
      dev: devMetrics,
      support: supportMetrics,
      ignored: ignoredMetrics,
    },
  };
}

const EMPTY_CLASSIFICATION: TaskClassificationConfig = {
  dev: { listIds: [], folderIds: [] },
  support: { listIds: [], folderIds: [] },
};

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
