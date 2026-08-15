---
tipo: operacao
status: mantido
atualizado: 2026-08-15
responsavel: equipe-plataforma
criticidade: alta
tags: [painelgrid, operacao]
---

# Configuração e Variáveis

## Categorias

| Categoria | Variáveis e finalidade |
|---|---|
| Runtime | `NODE_ENV`, `PORT`, `API_PREFIX`, `FRONTEND_URL`, `LOG_FORMAT` |
| Banco | `DATABASE_URL`/`POSTGRES_URL`, `DIRECT_URL`, `PRISMA_CONNECTION_LIMIT`, `PRISMA_POOL_TIMEOUT`, `PRISMA_SLOW_QUERY_MS` |
| Redis/filas | `REDIS_URL`, `BULLMQ_PREFIX` |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `LEADFLOW_CHECKIN_VOUCHER_SECRET` |
| Integrações | credenciais por cliente no banco; ponte legada `LEADFLOW_INTEGRATION_API_KEY`, `LEADFLOW_INTEGRATION_CLIENT_ID`, `LEADFLOW_INTEGRATION_ACTOR_USER_ID`, `ALLOW_LEGACY_INTEGRATION_KEY` |
| Meta | `META_APP_ID`/`FACEBOOK_APP_ID`, secrets, redirect, scopes, versão, callback e tokens de verificação |
| n8n | `N8N_AUTOMATION_API_KEY` no runtime; `N8N_BASE_URL`, `N8N_API_KEY` e IDs/flags nos scripts de manutenção |
| E-mail | `RESEND_API_KEY` ou `SMTP_PASS`, `SMTP_FROM`, `PLATFORM_LOGO_URL`, `API_PUBLIC_URL` |
| Storage | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` |
| Veículos | `APIBRASIL_TOKEN`, `APIBRASIL_DEVICE_TOKEN` |
| Observabilidade | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `API_SLOW_REQUEST_MS`, `API_PERFORMANCE_SAMPLE_RATE`, `PERFORMANCE_RETENTION_DAYS` |
| Frontend | `VITE_API_URL`, `VITE_PUBLIC_WEB_URL`, `VITE_PERFORMANCE_ENDPOINT`, `VITE_PERFORMANCE_DEBUG` |

## Obrigatórias no bootstrap da API

- URL PostgreSQL válida em `DATABASE_URL` ou `POSTGRES_URL`.
- `REDIS_URL`, exceto no modo serverless legado explicitamente detectado.
- Quatro parâmetros JWT: dois segredos com pelo menos 32 caracteres e duas durações no formato `15m`, `1h` ou `7d`.
- Em produção, segredos JWT devem ser diferentes, não podem usar defaults/placeholders e a resposta de token de recuperação não pode ser habilitada.

As demais categorias são condicionais: quando ausentes, a funcionalidade correspondente pode ficar desabilitada ou usar um fallback documentado no código. Não interprete “API iniciou” como “todas as integrações estão saudáveis”.

## Princípios

- Nunca versionar valores reais.
- Separar desenvolvimento, homologação e produção.
- Rotacionar imediatamente qualquer chave exposta em chat, log ou commit.
- `DIRECT_URL` é necessária para comandos Prisma que usam `directUrl`.
- A chave enviada pelo n8n deve ser exatamente a aceita pelo endpoint de automação.
- Configurações do frontend só podem conter valores públicos.
- `FRONTEND_URL` aceita uma lista de origens HTTP/HTTPS e a origem `capacitor:`; ela alimenta CORS e Socket.IO.
- `LEADFLOW_CHECKIN_VOUCHER_SECRET` separa vouchers de check-in do JWT geral; quando ausente, há fallback para `JWT_SECRET`.

## Checklist de rotação

1. Gerar a nova credencial no provedor.
2. Atualizar o ambiente de runtime.
3. Atualizar credenciais do n8n sem expor o valor em nós.
4. Reiniciar/reimplantar os serviços.
5. Testar o caso real.
6. Revogar a credencial antiga.

Relacionados: [[Ambientes e Deploy]], [[Meta]], [[n8n]], [[Runbook Operacional]].
