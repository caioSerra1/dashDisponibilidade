# Deploy no EasyPanel — `indicadores.portaledtech.com`

## Pré-requisitos

- Cloudflare (ou seu DNS) com `indicadores.portaledtech.com` apontando pro IP do EasyPanel — **já feito**.
- Postgres `dados_postgres` rodando no EasyPanel (já existe — vamos usar o schema `dash_variavel` pra isolar).

## 1. Criar o serviço App no EasyPanel

1. **Project** → **Create Service** → **App**
2. **Source**: GitHub (selecione este repositório) ou Git URL.
3. **Build**: `Dockerfile` (já incluído na raiz).
4. **Port**: `3000`.

## 2. Configurar o domínio

Aba **Domains** do serviço:
- Adicione `indicadores.portaledtech.com`
- Marque **HTTPS** (Let's Encrypt automático)
- O EasyPanel cuida do certificado.

## 3. Variáveis de ambiente

Aba **Environment**:

```env
NODE_ENV=production
NEXTAUTH_URL=https://indicadores.portaledtech.com
NEXTAUTH_SECRET=<gere com: openssl rand -base64 32>
CRON_SECRET=<gere com: openssl rand -base64 32>

DATABASE_URL=postgresql://postgres:<SENHA>@dados_postgres:5432/dados?sslmode=disable&schema=dash_variavel

CLICKUP_API_TOKEN=pk_111900966_VKR3ZBO08YZQ5Y3LH2A3TW9XEGTOX8MT
CLICKUP_TEAM_ID=90132606974

ZABBIX_URL=https://monitoramento.cursosdoportal.com.br/api_jsonrpc.php
ZABBIX_USER=admin
ZABBIX_PASSWORD="Qc+U,/P|rII4udo,^KtGT#1>U]vGK?XJ"

SEED_ADMIN_EMAIL=tecnologia@cursosdoportal.com.br
SEED_ADMIN_PASSWORD=<trocar no primeiro login>
```

> **Importante:**
> - `NEXTAUTH_URL` precisa bater **exatamente** com a URL pública (sem barra final).
> - O app usa `trustHost: true` então funciona atrás de proxy/Cloudflare sem ajuste extra.
> - Se a senha do Zabbix tem `#`, manter as aspas duplas.

## 4. Volume persistente para uploads

Aba **Volumes**:
- Mount path: `/app/uploads`
- Nome: `dash-uploads`

Isso garante que as fotos de perfil sobrevivem a redeploys.

## 5. Cron / Scheduled Tasks

Aba **Scheduled Tasks** do serviço (ou usar o Cron do EasyPanel apontando pro endpoint público).
Como o cron usa `x-cron-secret`, qualquer agendador serve:

| Cron | Comando |
|---|---|
| `0 3 * * *` | `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://indicadores.portaledtech.com/api/calculate/daily` |
| `10 0 1 * *` | `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://indicadores.portaledtech.com/api/calculate/close` |

## 6. Deploy

Clica em **Deploy**. O `docker-entrypoint.sh` roda automaticamente:
1. `prisma migrate deploy` (cria tabelas no schema `dash_variavel`)
2. `prisma db seed` (cria admin + tiers + conquistas iniciais)
3. `node server.js`

## 7. Primeiro acesso

1. Abra `https://indicadores.portaledtech.com/login`
2. Login com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
3. Vá em **Perfil** e troque a senha imediatamente
4. Em **Cadastros → Usuários** adicione o segundo colaborador com o `clickupUserId` correto
5. Em **Sistema → Integrações** clique em **Testar conexões** (ClickUp + Zabbix)
6. Em **Operação → Servidores Zabbix** clique em **Sincronizar** e habilite os hosts que entram no cálculo
7. Em **Sistema → Configuração** ajuste valores R$ e tiers de disponibilidade
8. Em **Cadastros → Metas** crie metas individuais
9. Em **Cadastros → Itens da Loja** cadastre os primeiros prêmios

## Troca de domínio futura

Se for trocar o domínio (ex: `dashboard.portaledtech.com`):
1. Atualize na aba **Domains** do EasyPanel
2. Atualize a env `NEXTAUTH_URL` pra refletir
3. Redeploy (ou só "Restart" — Next.js relê env no start)

Não precisa mexer no código.

## Logs

- Aba **Logs** do EasyPanel mostra stdout/stderr em tempo real.
- Erros de auth aparecem como `[auth][error]`.
- O cron grava cada execução em `JobRun` (visível em **Operação → Execuções**).
