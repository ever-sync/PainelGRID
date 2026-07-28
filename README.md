# PainelGRID

Plataforma SaaS de gestao de leads, eventos e vendas da EverSync.

> Estado atual do repositorio: monorepo Node.js com API NestJS em producao de desenvolvimento e frontend administrativo React/Vite integrado a essa API.

## Estrutura

```text
apps/
  api/       Backend NestJS + Prisma
  desktop/   Frontend administrativo React + Vite
  web/       Artefato estatico gerado (dist) legado
packages/
  ui/        Componentes compartilhados
  types/     Tipos compartilhados
  utils/     Utilitarios compartilhados
docs/
  architecture/  Diagramas e arquitetura
```

Nao existe `apps/mobile` implementado neste checkout.

## Requisitos

- Node.js 20+
- npm 10+
- Docker Desktop com daemon ativo

## Setup Rapido

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:generate
npm run dev
```

## Banco Local ou Supabase

O backend funciona de 2 formas:

- Local: PostgreSQL e Redis via `docker compose`
- Gerenciado: PostgreSQL do Supabase + Redis local

Para usar Supabase, mantenha o projeto igual e troque apenas o `DATABASE_URL` no `.env` pela string de conexao do Postgres do seu projeto Supabase. As chaves opcionais `SUPABASE_PROJECT_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` foram reservadas para futuras integracoes de auth/storage, mas hoje a API depende diretamente do `DATABASE_URL`.

Exemplo de fluxo com Supabase:

```bash
npm install
cp .env.example .env
# edite DATABASE_URL para o Postgres do Supabase
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

## Scripts Principais

- `npm run dev`: inicia a API NestJS
- `npm run dev:desktop`: inicia o frontend React/Vite
- `npm run dev:full`: sobe API + desktop em paralelo
- `npm run build`: gera build da API raiz
- `npm run test`: roda testes unitarios da API
- `npm run test:integration`: roda testes de integracao da API
- `npm run test:e2e:ui`: roda Playwright para o frontend
- `npm run analyze:bundle --workspace=apps/desktop`: mede o peso inicial e por rota
- `npm run check:performance --workspace=apps/desktop`: valida o build contra o orçamento de performance
- `npm run lighthouse:ci`: executa Lighthouse nas rotas públicas e bloqueia regressões
- `npm run docker:up`: sobe PostgreSQL e Redis
- `npm run docker:down`: derruba os containers

O frontend mede LCP, CLS, INP, FCP e TTFB após o carregamento crítico e envia
automaticamente os valores anônimos para `POST /api/performance/web-vitals`.
`VITE_PERFORMANCE_ENDPOINT` pode sobrescrever esse destino durante o build.
Em desenvolvimento, os valores também ficam disponíveis em
`window.__GRID_WEB_VITALS__`.

Gestores podem consultar os percentis das últimas 24 horas em:

- `GET /api/performance/web-vitals/summary`
- `GET /api/performance/api/summary`

A API inclui `Server-Timing` e `x-request-id` nas respostas, registra todas as
requisições lentas e uma amostra configurável das demais. Os ajustes operacionais
são `API_SLOW_REQUEST_MS` (padrão 750), `PRISMA_SLOW_QUERY_MS` (padrão 200),
`API_PERFORMANCE_SAMPLE_RATE` (padrão 0.1) e
`PERFORMANCE_RETENTION_DAYS` (padrão 30).

## Documentacao

- `GP_ESCOPO_PROJETO.md`: escopo completo do produto
- `SPRINT_01.md`: encerramento da Sprint 01
- `SPRINT_02.md`: planejamento e execucao da Sprint 02
- `docs/architecture/ARQUITETURA.md`: arquitetura tecnica
- `docs/PADROES.md`: padroes de codigo e desenvolvimento
- `docs/n8n-ai-integracao.md`: guia operacional para IA no n8n atuar sobre leads e CRM

## Observacoes

- O backend ja possui autenticacao JWT, RBAC, Prisma, Redis, Swagger e modulos de negocio ativos.
- Credenciais de integracao por cliente sao criadas em
  `POST /api/clients/:clientId/integration-credentials`; o segredo e exibido uma unica vez.
  Rotacao e revogacao usam os endpoints `/:credentialId/rotate` e `/:credentialId/revoke`.
- A chave global por ambiente e apenas uma ponte de migracao. Em producao ela exige
  `LEADFLOW_INTEGRATION_CLIENT_ID` e `ALLOW_LEGACY_INTEGRATION_KEY=true`. Remova essas
  variaveis apos distribuir as credenciais por cliente.
- O desktop ja consome a API real para autenticacao, leads, eventos, clientes e integracoes Meta; ainda existem mocks residuais em partes especificas da UI.
- `apps/web` contem apenas build estatico legado e nao faz parte dos workspaces ativos.
- A documentacao detalhada de QA e rastreabilidade esta em `docs/qa/`.
