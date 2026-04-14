# CLAUDE.md

Dashboard mensal de variável do time (Next.js 15 App Router + Prisma + Postgres). Integra ClickUp (pontos) e Zabbix (SLA), fecha o mês via cron e expõe admin pra editar tiers/valores.

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

Instalar deps: `npm install --legacy-peer-deps` (React 19 + next-auth beta têm peer conflicts).

## Arquitetura

- [src/app/(app)/](src/app/(app)/) — área autenticada (dashboard, admin).
- [src/app/api/](src/app/api/) — rotas. `calculate/daily` e `calculate/close` são protegidas por `x-cron-secret` ([src/lib/cron-auth.ts](src/lib/cron-auth.ts), comparação em tempo constante).
- [src/lib/](src/lib/) — camada de serviços. UI **não pode** importar daqui direto — `dependency-cruiser` quebra o build se importar. Componentes consomem via rota/API ou server component.
- [src/lib/calculate.ts](src/lib/calculate.ts) — fórmula (`pontos * valorPorPonto + valorDisponibilidade100 * payoutPctSla/100`). Coberta ≥ 90%.
- [src/lib/orchestrator.ts](src/lib/orchestrator.ts) — roda o fluxo diário: ClickUp → Zabbix → calcula → grava `DailySnapshot`.
- [src/lib/env.ts](src/lib/env.ts) — validação Zod no boot. Adicionar env nova? Tem que passar por aqui.
- [prisma/schema.prisma](prisma/schema.prisma) — `MonthlyClose` é **read-only** após fechamento; não editar em lugar nenhum fora do `calculate/close`.

## Convenções não-óbvias

- **Dinheiro** sempre via [src/lib/money.ts](src/lib/money.ts) (centavos, nunca float solto).
- **Datas** sempre via [src/lib/date.ts](src/lib/date.ts) — timezone do servidor pode não ser BR.
- **Gamificação** ([src/lib/gamification.ts](src/lib/gamification.ts), [src/lib/achievement-rules.ts](src/lib/achievement-rules.ts)) só dispara no `calculate/close`, nunca no diário.
- Testes de integration usam Testcontainers (Postgres real). Não mockar DB nesses testes.
- APIs externas (ClickUp/Zabbix) são mockadas via MSW em [tests/msw/](tests/msw/).
- Cobertura mínima: 90% em `calculate.ts`, 75% global. CI bloqueia abaixo disso.

## Segurança

- Nunca logar valores de `env.ts` (tem secrets).
- `CRON_SECRET` e senhas só comparados via funções em `cron-auth.ts` / `bcryptjs`.
- Headers (CSP/HSTS/X-Frame-Options) em [next.config.ts](next.config.ts) — não afrouxar sem avisar.

## Deploy

EasyPanel via [Dockerfile](Dockerfile). Entrypoint roda `prisma migrate deploy && prisma db seed` antes de subir. Detalhes em [DEPLOY-EASYPANEL.md](DEPLOY-EASYPANEL.md).
