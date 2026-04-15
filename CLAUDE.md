# CLAUDE.md

Dashboard mensal de variável do time (Next.js 15 App Router + Prisma + Postgres). Integra ClickUp (pontos/tarefas) e Zabbix (SLA), fecha o mês via cron externo e expõe um painel admin para tiers/config/usuários. Em cima disso roda uma camada de gamificação: carteira de moedas, loja com retiradas, metas, conquistas, mural de atividades e notificações.

## Comandos

```bash
npm run dev                 # dev server
npm run build               # build standalone (Docker)
npm test                    # vitest unit + integration
npm run test:unit           # só unit
npm run test:integration    # integration (sobe Postgres via Testcontainers)
npm run test:e2e            # Playwright (mobile/tablet/desktop)
npm run typecheck           # tsc --noEmit, strict
npm run lint                # ESLint + security + sonarjs
npm run arch                # madge circular + ts-prune + depcruise
npm run prisma:seed         # recarrega tiers/config/admin
npm run db:reset            # DROP + migrate + seed (destrutivo)
```

Instalar deps: `npm install --legacy-peer-deps` (React 19 + NextAuth 5 beta têm peer conflicts).

## Stack

- Next.js 15 (App Router, output `standalone`), React 19, TypeScript strict + `noUncheckedIndexedAccess`.
- Prisma 6 + PostgreSQL. Client singleton em [src/lib/db.ts](src/lib/db.ts).
- NextAuth 5 (beta) — Credentials provider, sessão JWT. Config em [src/lib/auth.ts](src/lib/auth.ts).
- UI: Tailwind + Radix + Lucide + Framer Motion + Recharts.
- Testes: Vitest (jsdom) + Playwright (mobile/tablet/desktop) + MSW + Testcontainers.
- Lint/arquitetura: ESLint (security + sonarjs), `dependency-cruiser`, `madge`, `ts-prune`, husky + lint-staged.

## Arquitetura

- [src/app/(app)/](src/app/(app)/) — área autenticada. Páginas de usuário: `dashboard`, `dashboard/produtividade`, `perfil`, `metas`, `achievements`, `loja`, `loja/minhas-retiradas`, `tasks`, `mural`, `notificacoes`. Páginas admin: `admin/config`, `admin/users`, `admin/zabbix`, `admin/integrations`, `admin/jobs`, `admin/goals`, `admin/achievements`, `admin/loja`, `admin/loja/itens`, `admin/loja/pedidos`, `admin/notifications`.
- [src/app/api/](src/app/api/) — rotas. `calculate/daily` e `calculate/close` são protegidas por `x-cron-secret` ([src/lib/cron-auth.ts](src/lib/cron-auth.ts), comparação em tempo constante). O restante é protegido via `auth()` nos server components/handlers com checagem de role.
- [src/middleware.ts](src/middleware.ts) — **no-op proposital**. Nada é enforçado no edge porque o Prisma não roda em edge. Proteção é nos layouts/handlers.
- [src/lib/](src/lib/) — camada de serviços. UI **não pode** importar `clickup`/`zabbix`/`orchestrator` — `dependency-cruiser` quebra o build. Componentes consomem via rota/API ou server component.
- [src/lib/calculate.ts](src/lib/calculate.ts) — fórmula: `pontos * valorPorPonto + valorDisponibilidade100 * payoutPctSla / 100`.
- [src/lib/orchestrator.ts](src/lib/orchestrator.ts) — fluxo diário (ClickUp → Zabbix → calcula → grava `DailySnapshot` + `TaskMetricSnapshot`) e fechamento mensal (consolida em `MonthlyClose`, dispara gamificação). Cada execução loga um `JobRun`.
- [src/lib/env.ts](src/lib/env.ts) — validação Zod no boot. Env nova **tem que** passar por aqui.
- [prisma/schema.prisma](prisma/schema.prisma) — `MonthlyClose` é **read-only** após fechamento; só o `calculate/close` grava.

### Serviços em `src/lib/`

- `clickup.ts` / `zabbix.ts` — integrações externas (pontos/tasks e SLA por host).
- `metrics.ts` — cálculo de produtividade (fechadas, throughput, avg resolution/cycle).
- `goals.ts` — avaliação pura de metas (tipos: POINTS, TASKS_CLOSED, SLA, AVG_RESOLUTION, CUSTOM). Suporta metas **renovaveis** (resetam por período) e definitivas (`endedAt`).
- `achievement-rules.ts` — regras declarativas de conquista (JSON no campo `Achievement.rule`).
- `achievement-icons.ts` — catálogo do icon picker. Formato `"lucide:<nome>"` ou `"emoji:<char>"`, armazenado em `Achievement.icon`.
- `wallet.ts` — crédito/débito de moedas + `CoinTxn`. Toda mutação de carteira passa por aqui.
- `gamification.ts` — orquestra unlock de conquistas e crédito de recompensas. **Só roda no `calculate/close`**, nunca no diário.
- `notifications.ts` — cria notificações (sistema, metas, conquistas, retiradas, broadcast).
- `upload.ts` — storage nativo em disco (`UPLOAD_ROOT`). Categorias: `avatars`, `produtos`, `logo`. PNG/JPEG/WebP, 2 MB, normaliza path (bloqueia `..`), sobrescreve versões antigas do mesmo id. **Não usar S3/CDN por enquanto.**
- `config.ts` — key-value em `Config` (tiers, integrações, chaves gerais).
- `sla-tiers.ts` — lookup de payout por faixa de SLA.
- `date.ts` / `duration.ts` / `money.ts` / `cn.ts` — utilitários.

### Prisma — modelos principais

- Núcleo: `User`, `Config`, `SlaTier`, `ZabbixHost`, `DailySnapshot`, `MonthlyClose`, `TaskMetricSnapshot`.
- Gamificação: `Achievement` (com `icon`, `rule` JSON, `xp`, `coinsReward`), `UserAchievement`, `Goal` (com `renewable`, `endedAt`), `GoalHit`, `Wallet`, `CoinTxn`.
- Loja: `StoreItem`, `Redemption` (status `PENDING` → `APPROVED` → `DELIVERED` / `REJECTED`).
- Mensageria: `Notification`.
- Observabilidade: `JobRun` (job, status, timestamps, message). Visível em `admin/jobs`.

## Cron / Jobs

Não existe scheduler embutido. Cron é **externo** (EasyPanel / systemd / k8s) batendo nos endpoints com header `x-cron-secret`:

- `POST /api/calculate/daily` — sync ClickUp+Zabbix do dia, grava `DailySnapshot` + `TaskMetricSnapshot`.
- `POST /api/calculate/close` — fecha o mês, grava `MonthlyClose`, roda gamificação, credita metas/conquistas, dispara notificações.

Toda execução registra um `JobRun`. O painel `admin/jobs` mostra o histórico recente.

## Uploads

Arquivos servidos por rotas próprias, não pelo `/public`:

- `GET /api/avatars/[userId]`, `GET /api/store-images/[id]`, `GET /api/logo`.
- Upload: `POST /api/me/avatar`, `POST /api/admin/logo`, `POST /api/admin/store/items/[id]/image`.
- Raiz controlada por `UPLOAD_ROOT` (ver [src/lib/env.ts](src/lib/env.ts)). No Docker aponta pra um volume persistente; em dev cai em `./uploads`.

## Convenções não-óbvias

- **Dinheiro** (R$) sempre via [src/lib/money.ts](src/lib/money.ts) — centavos, nunca float solto.
- **Moedas da gamificação** são inteiros positivos e só mudam via [src/lib/wallet.ts](src/lib/wallet.ts) (sempre em transação com `CoinTxn`).
- **Datas** sempre via [src/lib/date.ts](src/lib/date.ts) — timezone do servidor pode não ser BR.
- **Gamificação** (`gamification.ts`, `achievement-rules.ts`) só dispara no `calculate/close`, nunca no diário.
- **Metas renovaveis** resetam sozinhas no começo do período; definitivas usam `endedAt` pra encerrar manualmente. Não duplicar lógica fora de `goals.ts`.
- **Ícones de conquista** sempre no formato `"lucide:<nome>"` ou `"emoji:<char>"`; parse via `achievement-icons.ts`.
- **Uploads** sempre via `src/lib/upload.ts` — nada de gravar direto no FS em rotas.
- **Notificações** sempre via `notifications.ts` — nunca inserir direto na tabela.
- Testes de integration usam Testcontainers (Postgres real). Não mockar DB nesses testes.
- APIs externas (ClickUp/Zabbix) são mockadas via MSW em [tests/msw/](tests/msw/).
- Cobertura mínima: 75% lines/functions/statements, 70% branches ([vitest.config.ts](vitest.config.ts)). CI bloqueia abaixo disso.

## Segurança

- Nunca logar valores de `env.ts` (tem secrets).
- `CRON_SECRET` e senhas só comparados via funções em `cron-auth.ts` / `bcryptjs`.
- Headers (CSP/HSTS/X-Frame-Options) em [next.config.ts](next.config.ts) — não afrouxar sem avisar.
- Upload valida MIME e tamanho e normaliza path — não relaxar sem conversar.

## Deploy

EasyPanel via [Dockerfile](Dockerfile). Entrypoint roda `prisma db push` + seed antes de subir (decisão atual — `migrate deploy` foi trocado por `db push` nos últimos fixes). Detalhes em [DEPLOY-EASYPANEL.md](DEPLOY-EASYPANEL.md). Volume persistente para `UPLOAD_ROOT`.
