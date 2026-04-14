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
}

export interface PriorityBreakdown {
  urgent: number;
  high: number;
  normal: number;
  low: number;
}

export interface TaskMetrics {
  tasksClosed: number;
  tasksClosedLast7d: number;
  pointsSum: number;
  avgResolutionHours: number | null;
  avgCycleHours: number | null;
  throughputPerWeek: number | null;
  priorityBreakdown: PriorityBreakdown;
  tagsBreakdown: Array<{ tag: string; count: number }>;
}

const HOUR_MS = 3600_000;

export function computeTaskMetrics(
  tasks: readonly RichTask[],
  now: number = Date.now(),
): TaskMetrics {
  const closed = tasks.filter((t) => typeof t.dateClosed === "number");
  const tasksClosed = closed.length;

  const pointsSum = tasks.reduce(
    (acc, t) => acc + (typeof t.points === "number" ? t.points : 0),
    0,
  );

  const resolutionHours = closed
    .filter((t) => typeof t.dateCreated === "number")
    .map((t) => ((t.dateClosed as number) - (t.dateCreated as number)) / HOUR_MS)
    .filter((h) => h >= 0);

  const cycleHours = closed
    .filter((t) => typeof t.dateStarted === "number")
    .map((t) => ((t.dateClosed as number) - (t.dateStarted as number)) / HOUR_MS)
    .filter((h) => h >= 0);

  const avgResolutionHours = avg(resolutionHours);
  const avgCycleHours = avg(cycleHours);

  const sevenDaysAgo = now - 7 * 24 * HOUR_MS;
  const tasksClosedLast7d = closed.filter(
    (t) => (t.dateClosed as number) >= sevenDaysAgo,
  ).length;

  const throughputPerWeek = tasksClosed > 0 ? tasksClosedLast7d : null;

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
    throughputPerWeek,
    priorityBreakdown,
    tagsBreakdown,
  };
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
