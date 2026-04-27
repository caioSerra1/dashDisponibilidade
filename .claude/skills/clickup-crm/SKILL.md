# ClickUp CRM Integration

Use quando o usuário pedir qualquer coisa relacionada ao ClickUp: novas métricas de tasks, mudanças na classificação dev/suporte, novos endpoints consumindo a API do ClickUp, debugging de dados do ClickUp, ou infraestrutura de integração CRM.

## Arquitetura atual

```
ClickUp API v2 (api.clickup.com)
    │
    ├─ src/lib/clickup.ts         ← wrapper único, toda call passa por aqui
    │   ├─ getTasksForUser()      ← tasks fechadas em período (filtro server-side)
    │   ├─ getClosedAndPendingTasks() ← otimizado: 2 calls paralelas
    │   ├─ getAllAssignedTasks()   ← todas tasks (legacy, mais lento)
    │   ├─ getTimeInStatus()      ← cycle time por task
    │   ├─ countReturnsToExecution() ← retornos à execução
    │   └─ testClickUp()          ← health check
    │
    ├─ src/lib/metrics.ts         ← classifyTask() + computeTaskMetrics()
    │   └─ TaskClassificationConfig: { dev: {listIds, folderIds}, support: {listIds, folderIds} }
    │
    ├─ src/lib/config.ts          ← loadConfig().taskClassification (persiste em Config table)
    │
    └─ src/lib/orchestrator.ts    ← runDaily() e runClose() consomem os dados
```

## ClickUp API v2 — Referência completa

### Autenticação

```
Header: Authorization: <api_token>
```

Token pessoal ou via OAuth2. Este projeto usa token pessoal via env var `CLICKUP_API_TOKEN`.

### Base URL

```
https://api.clickup.com/api/v2
```

### Endpoints principais

#### GET /team/{team_id}/task
Busca tasks do time. Suporta filtros server-side.

**Query params importantes:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `page` | int | Paginação (0-indexed, 100 tasks/page) |
| `include_closed` | bool | Incluir tasks fechadas |
| `subtasks` | bool | Incluir subtasks |
| `date_closed_gt` | ms epoch | Tasks fechadas DEPOIS de |
| `date_closed_lt` | ms epoch | Tasks fechadas ANTES de |
| `assignees[]` | int | Filtrar por assignee (pode repetir pra múltiplos) |
| `statuses[]` | string | Filtrar por status |
| `list_ids[]` | string | Filtrar por lista |
| `tags[]` | string | Filtrar por tag |
| `order_by` | string | `created`, `updated`, `due_date` |
| `reverse` | bool | Ordem reversa |

**Campos da resposta (ClickUpRawTask):**
```typescript
{
  id: string;                              // ID único
  custom_id: string | null;                // ID customizado (ex: TASK-845)
  name: string;                            // Título
  points: number | null;                   // Story points (null se não configurado)
  status: {
    status: string;                        // Nome do status (ex: "em execução")
    type: string;                          // Tipo: "open", "closed", "custom"
  };
  priority: {
    priority: string;                      // "urgent", "high", "normal", "low"
  } | null;
  tags: Array<{ name: string }>;           // Tags aplicadas
  date_created: string;                    // ms epoch como string
  date_started: string | null;             // ms epoch como string
  date_closed: string | null;              // ms epoch como string
  assignees: Array<{ id: number }>;        // Usuários atribuídos
  list: { id: string; name: string };      // Lista pai (home list)
  folder: { id: string; name: string; hidden: boolean };  // Pasta pai
  space: { id: string };                   // Space
}
```

**Resposta:**
```json
{
  "tasks": [...],
  "last_page": true
}
```

**Cuidados:**
- O filtro `date_closed_gt/lt` NÃO é confiável: ClickUp às vezes retorna tasks abertas ou fora do range. **Sempre revalidar client-side.**
- `assignees[]` usa o `id` numérico do ClickUp, não o email.
- Paginação: 100 tasks/page, `last_page: true` na última.

#### GET /task/{task_id}/time_in_status
Histórico de transições de status da task.

**Resposta:**
```json
{
  "current_status": {
    "status": "concluído",
    "total_time": {
      "by_minute": 1440,     // minutos no status
      "since": "1700000000"  // ms epoch quando entrou
    }
  },
  "status_history": [
    {
      "status": "to do",
      "total_time": { "by_minute": 60, "since": "1699990000" }
    },
    {
      "status": "em execução",
      "total_time": { "by_minute": 480, "since": "1699993600" }
    }
  ]
}
```

**Requer:** ClickApp "Time in Status" habilitado no workspace. Se desabilitado, retorna erro com `"No data for TIS"` no body.

**Uso no projeto:**
- `findExecutionStartMs()`: acha o primeiro momento em que a task entrou em status de execução
- `countReturnsToExecution()`: conta quantas vezes voltou pra execução após sair

#### GET /team/{team_id}
Verifica autenticação. Retorna info do time.

#### Outros endpoints úteis (não usados ainda)

| Endpoint | Descrição |
|----------|-----------|
| `GET /team/{team_id}/space` | Lista spaces do time |
| `GET /space/{space_id}/folder` | Lista folders do space |
| `GET /folder/{folder_id}/list` | Lista listas da folder |
| `GET /list/{list_id}` | Detalhes de uma lista |
| `GET /list/{list_id}/member` | Membros de uma lista |
| `GET /task/{task_id}` | Task individual com todos os campos |
| `GET /team/{team_id}/member` | Membros do time |
| `GET /task/{task_id}/comment` | Comentários da task |
| `POST /list/{list_id}/task` | Criar task |
| `PUT /task/{task_id}` | Atualizar task |

### Rate Limits

- **100 requests/minuto** por token (API token pessoal)
- Retorna HTTP 429 com header `X-RateLimit-Remaining`
- Backoff recomendado: esperar `X-RateLimit-Reset` (epoch seconds)

### Webhooks (não usado, disponível)

ClickUp suporta webhooks pra eventos:
- `taskCreated`, `taskUpdated`, `taskDeleted`
- `taskStatusUpdated`, `taskAssigneeUpdated`
- `taskCommentPosted`

Endpoint: `POST /team/{team_id}/webhook`

## Classificação de tasks neste projeto

### Hierarquia ClickUp do cliente

```
Team: 90132606974
├─ Space: Tecnologia Portal Concursos
│   ├─ Folder: (raiz)
│   │   ├─ List: Product Backlog (id: 901321219372) → DEV
│   │   └─ List: Demandas de Suporte (id: 901321219373) → SUPORTE
│   └─ Folder: Sprints Semanais (id: ???)
│       ├─ List: Sprint 19
│       ├─ List: Sprint 20
│       ├─ ...
│       └─ List: Sprint 26
```

### Regra de classificação

```
classifyTask(task):
  1. Se task.list.id in support.listIds → "support"
  2. Se task.folder.id in support.folderIds → "support"
  3. Se task.list.id in dev.listIds → "dev"
  4. Se task.folder.id in dev.folderIds → "dev"
  5. Senão → "ignored"
```

- **Suporte ganha precedência** sobre dev em caso de conflito
- **list_id ganha precedência** sobre folder_id (mais específico)
- Tasks adicionadas (shortcut) à sprint mantêm a home list original

### Config atual (seed)

```json
{
  "dev": {
    "listIds": ["901321219372"],
    "folderIds": []
  },
  "support": {
    "listIds": ["901321219373"],
    "folderIds": []
  }
}
```

O `folderIds` de dev precisa ser preenchido com o folder_id da pasta "Sprints Semanais" via `/admin/config`.

## Métricas derivadas do ClickUp

| Métrica | Fórmula | Onde persiste |
|---------|---------|---------------|
| Pontos dev | Sum of `task.points` onde `type == "dev"` | `TaskMetricSnapshot.pointsMonthDev` |
| Tasks dev | Count de tasks fechadas tipo dev | `TaskMetricSnapshot.tasksClosedMonthDev` |
| Tasks suporte | Count de tasks fechadas tipo support | `TaskMetricSnapshot.tasksClosedMonthSupport` |
| MTTR (resolução) | Média de `(dateClosed - dateCreated)` em horas | `TaskMetricSnapshot.avgResolutionHoursDev/Support` |
| MTTA (acknowledge) | Média de `(dateStarted - dateCreated)` em horas | `TaskMetricSnapshot.avgAckHoursSupport` |
| Cycle time | Média de `(dateClosed - firstExecutionStart)` em horas | `TaskMetricSnapshot.avgCycleHoursDev` |
| Retornos à execução | Count de transições `nao-exec → exec` após a primeira | `TaskMetricSnapshot.returnedCountMonth` |
| Throughput | Tasks dev fechadas / semanas no período | Calculado on-the-fly |

## Fluxo de dados

```
Cron externo → POST /api/calculate/daily
    → orchestrator.runDaily()
        → clickup.getTasksForUser(userId, from, to)          # tasks fechadas
        → orchestrator.decorateWithExecutionStart(tasks)      # TIS pra cycle time + retornos
        → metrics.computeTaskMetrics(tasks, now, classification)  # segmenta dev/support
        → prisma.taskMetricSnapshot.upsert(...)               # persiste
        → prisma.dailySnapshot.upsert(...)                    # persiste valor R$
```

## Cuidados ao mexer na integração

1. **Nunca chamar ClickUp API em server components ou rotas síncronas sem cache.** Cada call leva 2-3s. O mural foi otimizado pra zero calls ao ClickUp (usa só Prisma).

2. **`getClosedAndPendingTasks` é o padrão otimizado.** Usar em vez de `getAllAssignedTasks` (que pagina tudo sem filtro). Faz 2 calls paralelas com filtros server-side.

3. **`getTimeInStatus` é caro — 1 call POR task.** Não usar em rotas de UI. O orchestrator roda 1x/dia e persiste os dados. A tela de tasks mostra só `resolutionHours` (não precisa de TIS).

4. **IDs são strings no ClickUp.** `task.id`, `list.id`, `folder.id` são strings. `assignee.id` é number. Não misturar tipos na comparação.

5. **Tasks podem estar em múltiplas listas** (via shortcut). A `task.list` retorna a HOME list. Classificação por home list é intencional — tasks de suporte adicionadas a sprints continuam como suporte.