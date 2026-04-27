# API Integrations

Use quando o usuário pedir integração com API externa, conectar serviços, criar/modificar endpoints que consomem APIs de terceiros, ou debugar problemas de conexão/autenticação com serviços externos.

## Princípios

1. **Nunca armazenar secrets no código.** Toda credencial vem de env var validada via Zod em `src/lib/env.ts`. Se precisar de uma nova secret, adicionar ao schema Zod primeiro.

2. **Wrapper dedicado por serviço.** Cada API externa vive em `src/lib/<servico>.ts`. Não fazer fetch direto em rotas/componentes. Exemplos: `src/lib/clickup.ts`, `src/lib/zabbix.ts`.

3. **Rate limiting e retry.** APIs externas falham. Sempre:
   - Tratar HTTP 429 com backoff exponencial
   - Timeout explícito (5-10s pra APIs rápidas, 30s pra lentas)
   - `cache: "no-store"` quando os dados mudam frequentemente
   - Log do erro sem vazar secrets (`console.error("[serviço] falhou", e)`)

4. **Paginação defensiva.** ClickUp, Zabbix, e a maioria das APIs paginam. Sempre:
   - Ter um `MAX_PAGES` pra evitar loops infinitos
   - Filtrar client-side quando o server-side é inconsistente (ClickUp ignora filtros às vezes)
   - Guard rail: se N páginas consecutivas não trazem resultados úteis, parar

5. **Classificação de dados.** Dados de APIs externas podem vir sujos. Normalizar:
   - Status names: normalizar acentos, casing (`normalizeStatusName` em clickup.ts)
   - Números: `typeof x === "number"` antes de usar
   - Datas: sempre em ms epoch ou `Date`, nunca string solta

6. **Performance.** Chamadas HTTP a APIs externas são o maior gargalo do app:
   - Paralelizar com `Promise.all` quando possível
   - Preferir queries com filtros server-side (ex: `date_closed_gt`) em vez de buscar tudo e filtrar
   - Cache server-side com TTL pra rotas que fazem muitas chamadas
   - Nunca fazer N chamadas sequenciais quando dá pra batchear (ex: `getClosedAndPendingTasks` faz 2 chamadas paralelas em vez de 5 sequenciais)

7. **Tipagem.** Cada API tem uma interface `Raw` (o que vem do JSON) e uma interface `Rich`/`Audited` (o que o app usa internamente). Conversão via `toRich()` / `toAudited()`. Nunca passar o raw pra fora do wrapper.

## Padrão de wrapper

```typescript
// src/lib/<servico>.ts
import { env } from "./env";

const BASE = "https://api.servico.com/v2";

interface RawResponse { /* ... */ }

async function fetchFromService(path: string, params?: Record<string, string>) {
  const { SERVICE_TOKEN } = env();
  if (!SERVICE_TOKEN) throw new Error("Credenciais do <Servico> ausentes");
  
  const url = new URL(`${BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`<Servico> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<RawResponse>;
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await fetchFromService("/ping");
    return { ok: true, message: "Conectado" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
```

## Integrações ativas neste projeto

| Serviço | Arquivo | Endpoints | Auth |
|---------|---------|-----------|------|
| ClickUp | `src/lib/clickup.ts` | Tasks, Time in Status | Bearer token via `CLICKUP_API_TOKEN` |
| Zabbix | `src/lib/zabbix.ts` | Disponibilidade hosts | API token via `ZABBIX_*` env vars |

## Integrações planejadas (v2)

| Serviço | Propósito |
|---------|-----------|
| Chatwoot | Tempo de atendimento real, métricas de suporte |
| Keycloak | SSO / OIDC, provisionamento de usuários |

## Checklist pra nova integração

- [ ] Env vars no `src/lib/env.ts` (Zod schema)
- [ ] Wrapper em `src/lib/<servico>.ts` com `testConnection()`
- [ ] Rota admin de teste em `src/app/api/admin/integrations/test/`
- [ ] Tela admin pra configurar credenciais se necessário
- [ ] Testes unitários mockados via MSW em `tests/msw/`
- [ ] Documentar rate limits e peculiaridades no header do arquivo