import { env } from "./env";
import type { RichTask } from "./metrics";

interface ClickUpRawTask {
  id: string;
  custom_id?: string | null;
  name?: string;
  points: number | null;
  status?: { status?: string; type?: string };
  priority?: { priority?: string } | null;
  tags?: Array<{ name: string }>;
  date_created?: string | null;
  date_started?: string | null;
  date_closed?: string | null;
  assignees?: { id: number }[];
}

interface ClickUpTasksResponse {
  tasks: ClickUpRawTask[];
  last_page?: boolean;
}

const BASE = "https://api.clickup.com/api/v2";
const MAX_PAGES = 20;

function normalizePriority(raw: string | undefined): RichTask["priority"] {
  if (!raw) return null;
  const p = raw.toLowerCase();
  if (p === "urgent" || p === "high" || p === "normal" || p === "low") return p;
  return null;
}

function toRich(task: ClickUpRawTask): RichTask {
  return {
    id: task.id,
    points: typeof task.points === "number" ? task.points : null,
    status: task.status?.status,
    dateCreated: task.date_created ? Number(task.date_created) : null,
    dateStarted: task.date_started ? Number(task.date_started) : null,
    dateClosed: task.date_closed ? Number(task.date_closed) : null,
    priority: normalizePriority(task.priority?.priority),
    tags: (task.tags ?? []).map((t) => t.name),
  };
}

interface ClickUpRawTaskWithAssignees extends ClickUpRawTask {
  assignees?: { id: number }[];
}

async function fetchTasksPaginated(
  clickupUserId: string,
  from: Date,
  to: Date,
): Promise<{ rich: RichTask[]; raw: ClickUpRawTaskWithAssignees[] }> {
  const { CLICKUP_API_TOKEN, CLICKUP_TEAM_ID } = env();
  if (!CLICKUP_API_TOKEN || !CLICKUP_TEAM_ID) {
    throw new Error("Credenciais do ClickUp ausentes");
  }

  const userIdNum = Number(clickupUserId);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const rich: RichTask[] = [];
  const raw: ClickUpRawTaskWithAssignees[] = [];
  let page = 0;
  let consecutiveEmpty = 0;

  while (page < MAX_PAGES) {
    const url = new URL(`${BASE}/team/${CLICKUP_TEAM_ID}/task`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("include_closed", "true");
    url.searchParams.set("subtasks", "true");
    url.searchParams.set("date_closed_gt", String(fromMs));
    url.searchParams.set("date_closed_lt", String(toMs));
    url.searchParams.append("assignees[]", clickupUserId);

    const res = await fetch(url, {
      headers: { Authorization: CLICKUP_API_TOKEN, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as ClickUpTasksResponse;
    const pageTasks = data.tasks ?? [];

    // Filtro client-side defensivo:
    //  - ClickUp ÀS VEZES retorna tasks abertas (date_closed=null) ignorando o filtro server.
    //  - Garantimos que o usuário queriado está realmente entre os assignees.
    //  - Garantimos que date_closed cai dentro do range [from, to).
    let pageMatches = 0;
    for (const task of pageTasks) {
      const closedMs = task.date_closed ? Number(task.date_closed) : null;
      if (closedMs == null) continue;
      if (closedMs < fromMs || closedMs >= toMs) continue;
      const assignees = (task.assignees ?? []) as { id: number }[];
      if (!assignees.some((a) => a.id === userIdNum)) continue;
      rich.push(toRich(task));
      raw.push(task);
      pageMatches += 1;
    }

    if (data.last_page || pageTasks.length === 0) break;
    // Guard rail: se 3 páginas seguidas não trazem matches, paramos.
    // (ClickUp pode estar retornando muitas tasks fora do filtro client-side.)
    if (pageMatches === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 3) break;
    } else {
      consecutiveEmpty = 0;
    }
    page += 1;
  }

  return { rich, raw };
}

export async function getTasksForUser(
  clickupUserId: string,
  from: Date,
  to: Date,
): Promise<RichTask[]> {
  const { rich } = await fetchTasksPaginated(clickupUserId, from, to);
  return rich;
}

/**
 * Versão "verbose" para a página de auditoria: retorna campos extras
 * úteis pra mostrar na UI (nome, status, custom_id).
 */
export interface AuditedTask {
  id: string;
  customId: string | null;
  name: string;
  status: string | null;
  points: number | null;
  priority: RichTask["priority"];
  dateCreated: number | null;
  dateClosed: number | null;
  url: string;
}

export async function getAuditedTasksForUser(
  clickupUserId: string,
  from: Date,
  to: Date,
): Promise<AuditedTask[]> {
  const { raw } = await fetchTasksPaginated(clickupUserId, from, to);
  return raw.map(toAudited);
}

function toAudited(t: ClickUpRawTaskWithAssignees): AuditedTask {
  return {
    id: t.id,
    customId: t.custom_id ?? null,
    name: t.name ?? t.id,
    status: t.status?.status ?? null,
    points: typeof t.points === "number" ? t.points : null,
    priority: t.priority?.priority
      ? (t.priority.priority.toLowerCase() as RichTask["priority"])
      : null,
    dateCreated: t.date_created ? Number(t.date_created) : null,
    dateClosed: t.date_closed ? Number(t.date_closed) : null,
    url: `https://app.clickup.com/t/${t.id}`,
  };
}

/**
 * Lista TODAS as tasks atribuídas ao usuário (sem filtro de data),
 * separando entre concluídas no período e pendentes.
 * Limite: 5 páginas (500 tasks). Ordenado client-side.
 */
export async function getAllAssignedTasks(
  clickupUserId: string,
  closedFrom: Date,
  closedTo: Date,
): Promise<{ closedInPeriod: AuditedTask[]; pending: AuditedTask[] }> {
  const { CLICKUP_API_TOKEN, CLICKUP_TEAM_ID } = env();
  if (!CLICKUP_API_TOKEN || !CLICKUP_TEAM_ID) {
    throw new Error("Credenciais do ClickUp ausentes");
  }
  const userIdNum = Number(clickupUserId);
  const fromMs = closedFrom.getTime();
  const toMs = closedTo.getTime();

  const closedInPeriod: AuditedTask[] = [];
  const pending: AuditedTask[] = [];
  const MAX = 5;
  let page = 0;
  let consecutiveEmpty = 0;

  while (page < MAX) {
    const url = new URL(`${BASE}/team/${CLICKUP_TEAM_ID}/task`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("include_closed", "true");
    url.searchParams.set("subtasks", "true");
    url.searchParams.append("assignees[]", clickupUserId);

    const res = await fetch(url, {
      headers: { Authorization: CLICKUP_API_TOKEN, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as ClickUpTasksResponse;
    const pageTasks = (data.tasks ?? []) as ClickUpRawTaskWithAssignees[];

    let pageMatches = 0;
    for (const t of pageTasks) {
      const assignees = t.assignees ?? [];
      if (!assignees.some((a) => a.id === userIdNum)) continue;
      pageMatches += 1;

      const closedMs = t.date_closed ? Number(t.date_closed) : null;
      const audited = toAudited(t);

      if (closedMs == null) {
        pending.push(audited);
      } else if (closedMs >= fromMs && closedMs < toMs) {
        closedInPeriod.push(audited);
      }
      // tasks fechadas fora do período são descartadas pra esta visão
    }

    if (data.last_page || pageTasks.length === 0) break;
    if (pageMatches === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
    }
    page += 1;
  }

  closedInPeriod.sort((a, b) => (b.dateClosed ?? 0) - (a.dateClosed ?? 0));
  pending.sort((a, b) => (b.dateCreated ?? 0) - (a.dateCreated ?? 0));

  return { closedInPeriod, pending };
}

/**
 * Wrapper fino: soma pontos das tasks fechadas no período.
 * Mantido para compatibilidade com o orchestrator atual.
 */
export async function getPointsForUser(
  clickupUserId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const tasks = await getTasksForUser(clickupUserId, from, to);
  return tasks.reduce((acc, t) => acc + (t.points ?? 0), 0);
}

export async function testClickUp(): Promise<{ ok: boolean; message: string }> {
  try {
    const { CLICKUP_API_TOKEN, CLICKUP_TEAM_ID } = env();
    if (!CLICKUP_API_TOKEN || !CLICKUP_TEAM_ID) {
      return { ok: false, message: "Credenciais ausentes" };
    }
    const res = await fetch(`${BASE}/team/${CLICKUP_TEAM_ID}`, {
      headers: { Authorization: CLICKUP_API_TOKEN },
      cache: "no-store",
    });
    return { ok: res.ok, message: res.ok ? "Conectado" : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ---------- Time in status (cycle time) ----------

export interface TimeInStatusEntry {
  status: string;
  /** Início desta entrada na timeline (ms epoch). */
  sinceMs: number;
  /** Tempo total em ms (acumulado em todas as vezes que entrou). */
  totalMs: number;
}

interface RawTotalTime {
  by_minute?: number;
  since?: string | number;
}

interface RawStatusEntry {
  status?: string;
  total_time?: RawTotalTime;
}

interface RawTimeInStatus {
  current_status?: RawStatusEntry;
  status_history?: RawStatusEntry[];
}

export interface TimeInStatusResult {
  ok: boolean;
  history: TimeInStatusEntry[];
  current: TimeInStatusEntry | null;
  /** Mensagem informativa quando ok=false (ex.: ClickApp desativado). */
  message?: string;
}

function parseEntry(raw: RawStatusEntry | undefined): TimeInStatusEntry | null {
  if (!raw?.status || raw.total_time?.since == null) return null;
  const sinceMs = Number(raw.total_time.since);
  if (!Number.isFinite(sinceMs)) return null;
  const totalMs =
    raw.total_time.by_minute != null ? Number(raw.total_time.by_minute) * 60_000 : 0;
  return {
    status: raw.status,
    sinceMs,
    totalMs,
  };
}

export async function getTimeInStatus(taskId: string): Promise<TimeInStatusResult> {
  const { CLICKUP_API_TOKEN } = env();
  if (!CLICKUP_API_TOKEN) {
    return { ok: false, history: [], current: null, message: "Token ClickUp ausente" };
  }
  const res = await fetch(`${BASE}/task/${taskId}/time_in_status`, {
    headers: { Authorization: CLICKUP_API_TOKEN, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (body.includes("No data for TIS")) {
      return {
        ok: false,
        history: [],
        current: null,
        message:
          "ClickApp 'Time in Status' desabilitado no workspace ClickUp. Habilite em Settings → ClickApps → Time in Status.",
      };
    }
    return { ok: false, history: [], current: null, message: `HTTP ${res.status}: ${body}` };
  }
  const data = (await res.json()) as RawTimeInStatus;
  const history = (data.status_history ?? [])
    .map(parseEntry)
    .filter((e): e is TimeInStatusEntry => e != null)
    .sort((a, b) => a.sinceMs - b.sinceMs);
  const current = parseEntry(data.current_status);
  return { ok: true, history, current };
}

/**
 * Procura no histórico o PRIMEIRO momento em que a task entrou em
 * algum dos status considerados "em execução". Comparação tolerante
 * a maiúsculas/acentos.
 *
 * Retorna `null` se a task nunca passou por nenhum desses status.
 */
export function findExecutionStartMs(
  history: readonly TimeInStatusEntry[],
  current: TimeInStatusEntry | null,
  executionStatuses: readonly string[],
): number | null {
  if (executionStatuses.length === 0) return null;
  const wanted = new Set(executionStatuses.map(normalizeStatusName));
  const all = (current ? [...history, current] : [...history]).sort(
    (a, b) => a.sinceMs - b.sinceMs,
  );
  for (const entry of all) {
    if (wanted.has(normalizeStatusName(entry.status))) return entry.sinceMs;
  }
  return null;
}

export function normalizeStatusName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
