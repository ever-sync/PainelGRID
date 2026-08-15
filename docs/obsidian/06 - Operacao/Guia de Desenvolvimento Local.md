---
tags: [operacao, desenvolvimento, setup]
status: mantido
atualizado: 2026-08-15
tipo: operacao
responsavel: equipe-plataforma
criticidade: alta
---

# Guia de Desenvolvimento Local

## Pré-requisitos

- Node.js 20 ou superior.
- npm 10 ou superior.
- Docker com daemon ativo para PostgreSQL e Redis locais.
- Um `.env` válido na raiz ou no caminho reconhecido pela API.

> [!warning] Segredos
> Use o `.env` local como dado privado. Este vault lista nomes e finalidade, nunca valores reais.

## Primeira execução

```bash
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:full
```

`npm run dev` e `npm run dev:api` iniciam somente a API. `npm run dev:desktop` inicia somente o frontend. Para os dois processos, use `npm run dev:full`.

O Docker Compose disponibiliza PostgreSQL 16 na porta `5432` e Redis 7 na `6379`. O frontend Vite usa a porta informada no terminal e consome a base configurada em `VITE_API_URL` ou no fallback de `services/http.ts`.

## Banco local ou gerenciado

- **Local:** `DATABASE_URL` aponta para o PostgreSQL do Compose.
- **Supabase/PostgreSQL gerenciado:** a aplicação continua usando Prisma; troque a URL de runtime e configure a conexão direta exigida por migrações quando aplicável.
- `DATABASE_URL` pode usar pooler em runtime.
- `DIRECT_URL` deve apontar para uma conexão adequada a DDL/migração; disponibilidade depende da rede do provedor.

Depois de alterar `schema.prisma`:

```bash
npm run db:generate
npm run db:migrate
```

Em produção, aplique o histórico existente com `npm run db:migrate:deploy`; não use `migrate dev`.

## Validação antes de entregar

| Comando | Cobertura |
|---|---|
| `npm run lint` | ESLint nos workspaces |
| `npm run typecheck` | TypeScript da API e desktop |
| `npm run test:ci` | testes unitários de API e desktop |
| `npm run test:integration` | integração da API |
| `npm run test:e2e` | suíte E2E Jest da API |
| `npm run test:e2e:ui` | Playwright da interface |
| `npm run build:ci` | build dos dois aplicativos |
| `npm run ci` | lint, tipos, testes, build e orçamento de performance |
| `npm run lighthouse:ci` | rotas públicas e orçamento Lighthouse |

Para uma mudança pequena, execute os testes diretamente relacionados, `typecheck` e `git diff --check`. Para release ou alteração transversal, prefira `npm run ci`.

## Desenvolvimento mobile

```bash
npm run mobile:build
npm run mobile:ios
npm run mobile:android
```

`mobile:build` gera o bundle no modo Capacitor e sincroniza iOS/Android. Autenticação móvel usa endpoints próprios de login/refresh/logout e armazenamento seguro. Validar câmera/QR, compartilhamento, download, deep links, teclado e retomada do app em dispositivo ou simulador.

## Swagger e saúde

- A API usa prefixo `/api`.
- `GET /api/health` é o probe básico.
- Swagger é habilitado de forma condicionada no bootstrap; conferir configuração do ambiente antes de contar com a rota.
- Todas as respostas passam por instrumentação de request ID/tempo; endpoints de resumo ficam em `/api/performance`.

## Falhas comuns

| Sintoma | Verificação |
|---|---|
| API falha antes de subir | variáveis obrigatórias e formato dos JWTs/URLs |
| Job aceita mas não executa | alcance do Redis e worker BullMQ |
| Frontend chama host errado | `VITE_API_URL` no momento do build |
| Refresh/deep link falha no app | build Capacitor deve usar `HashRouter` |
| Prisma conecta mas migração falha | diferença entre URL de pooler e conexão direta |
| Meta parece sem configuração | variáveis vazias do shell podem sobrescrever arquivos; a validação reidrata chaves Meta conhecidas |

## Fluxo seguro de alteração

1. Verificar `git status` e os commits recentes.
2. Localizar a fonte da verdade e testes do domínio.
3. Alterar DTO, service, controller, schema e frontend somente onde necessário.
4. Criar nova migração; nunca editar uma já aplicada.
5. Testar o caminho feliz, autorização, tenancy, repetição idempotente e falha externa.
6. Atualizar a nota do domínio e este vault quando o contrato mudar.

## Relacionamentos

- [[Configuracao e Variaveis]]
- [[Testes e CI]]
- [[Ambientes e Deploy]]
- [[Scripts e Migracoes]]
- [[Runbook Operacional]]
