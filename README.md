# Dash Disponibilidade

Dashboard mensal de cálculo de variável para o time, consolidando:

- **ClickUp** — pontos de sprint entregues por pessoa (cumulativos no mês).
- **Zabbix self-hosted** — disponibilidade % dos servidores.

O cálculo é **atualizado diariamente** (parcial) e **fechado no fim do mês** (definitivo). Valores e tiers de SLA são editáveis pelo painel admin. Frontend responsivo com gamificação (streak, conquistas, XP, confetti).

## Stack

Next.js 15 (App Router, TS) · TailwindCSS · shadcn-style UI (Radix) · Recharts · Framer Motion · Prisma · PostgreSQL · NextAuth v5 · Vitest · Playwright · Testcontainers · MSW · EasyPanel-ready.

## Rodando local

```bash
cp .env.example .env           # edite credenciais
docker compose up -d postgres  # ou seu postgres local
npm install --legacy-peer-deps
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Acesse http://localhost:3000 e logue com `admin@local.test / admin12345`.

### Usando o stack completo via Docker

```bash
docker compose up --build
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | build de produção (standalone) |
| `npm test` | unit + integration (Vitest) |
| `npm run test:e2e` | Playwright em mobile/tablet/desktop |
| `npm run typecheck` | TS strict |
| `npm run lint` | ESLint (security + sonarjs) |
| `npm run arch` | madge (ciclos) + ts-prune + depcruise |
| `npm run prisma:seed` | recarrega tiers/config/admin |

## Fluxo de apuração

1. **Diário (cron 03:00)** — `POST /api/calculate/daily` com header `x-cron-secret`:
   - Sync ClickUp → pontos acumulados até hoje.
   - Sync Zabbix → SLA médio do mês corrente.
   - Calcula `valorParcial` por pessoa e grava `DailySnapshot`.
2. **Fechamento (cron 00:10 do dia 1)** — `POST /api/calculate/close`:
   - Consolida o mês anterior em `MonthlyClose` (somente-leitura).
   - Avalia conquistas (`evaluateAchievements`) e dispara desbloqueios.

## Fórmula

```
pontosMes       = soma dos points das tasks fechadas no mês (ClickUp)
slaMedioMes     = média das disponibilidades dos hosts habilitados
tier            = SlaTier com maior minPct ≤ slaMedioMes
payoutPctSla    = tier.payoutPct

valorPontos          = pontosMes * valorPorPonto
valorDisponibilidade = valorDisponibilidade100 * (payoutPctSla / 100)
valorParcial         = valorPontos + valorDisponibilidade
```

Tudo (valores R$, metas, tiers %) é editável em `/admin/config`.

## Deploy EasyPanel

1. Crie um serviço **PostgreSQL** → anote `DATABASE_URL`.
2. Crie um serviço **App** apontando para este repositório (build via Dockerfile).
3. Defina variáveis:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (ex.: `https://variavel.seu-dominio.com`)
   - `NEXTAUTH_SECRET` (32+ chars)
   - `CRON_SECRET` (32+ chars)
   - `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID`
   - `ZABBIX_URL`, `ZABBIX_USER`, `ZABBIX_PASSWORD`
4. Scheduled Tasks:
   - `0 3 * * *` → `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://SEU-HOST/api/calculate/daily`
   - `10 0 1 * *` → `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://SEU-HOST/api/calculate/close`

O entrypoint roda `prisma migrate deploy && prisma db seed` antes de subir o servidor.

## TDD e qualidade

- **Unit** (`tests/unit`): fórmula, SLA tiers, gamificação.
- **Integration** (`tests/integration`): orchestrator com Postgres real via Testcontainers, APIs externas mockadas via MSW.
- **E2E** (`tests/e2e`): Playwright em 3 viewports.
- **Arch**: `madge --circular`, `ts-prune`, `dependency-cruiser` (impede UI importar serviços diretamente).
- **Security**: ESLint security/sonarjs, `npm audit`, `gitleaks`, `trivy`, CSP/HSTS via `next.config.ts`, rotas `cron` com comparação em tempo constante.

Cobertura mínima: **90%** em `src/lib/calculate.ts`, **75%** global.

## Segurança

- Senhas com `bcryptjs`.
- `CRON_SECRET` comparado em tempo constante (`src/lib/cron-auth.ts`).
- Variáveis de ambiente validadas por Zod no boot (`src/lib/env.ts`).
- Headers de segurança (CSP, HSTS, X-Frame-Options) em `next.config.ts`.
- CI bloqueia deploy se typecheck/lint/test/arch/audit/trivy falharem.

## Estrutura

```
src/
  app/
    (app)/              # área autenticada
      dashboard/
      admin/
    api/                # rotas
    login/
  components/
    ui/                 # botões, inputs etc
    layout/             # shell, sidebar
    game/               # streak, level ring, achievements
  lib/                  # db, auth, clickup, zabbix, calculate, gamification
prisma/
  schema.prisma
  seed.ts
tests/
  unit/
  integration/
  e2e/
  msw/
```

## Pendências do setup inicial

- Informar qual credencial falta (ClickUp ou Zabbix) e preencher `.env`.
- Confirmar `CLICKUP_TEAM_ID`.
- URL base do Zabbix self-hosted.
- Ajustar tiers de SLA e valor por ponto em `/admin/config`.
