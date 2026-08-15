---
tags: [referencia, repositorio, inventario]
status: mantido
atualizado: 2026-08-15
tipo: referencia
responsavel: equipe-engenharia
criticidade: media
---

# Inventário do Repositório

> [!info] Escopo
> Este inventário descreve o checkout atual. Diretórios gerados, dependências instaladas, imagens e artefatos locais não são fonte de verdade do produto.

## Mapa raiz

| Caminho | Papel | Versionar mudanças? |
|---|---|---|
| `apps/api` | API NestJS, Prisma, jobs, integrações e testes do backend | sim |
| `apps/desktop` | SPA React/Vite, PWA e shells Capacitor iOS/Android | sim |
| `packages/types` | tipos TypeScript compartilhados | sim |
| `packages/ui` | componentes compartilháveis | sim |
| `packages/utils` | utilitários compartilhados | sim |
| `docs` | documentação, relatórios técnicos e workflows n8n exportados | sim |
| `docs/obsidian` | este vault | sim |
| `e2e` | configuração e cenários Playwright | sim |
| `scripts` | manutenção de banco, n8n e empacotamento | sim, após revisão |
| `supabase` | apoio a configuração/migração do PostgreSQL gerenciado | sim |
| `scratch` | diagnósticos e rotinas pontuais | avaliar antes de reutilizar |
| `logo`, `logo-times` | ativos visuais | sim |
| `relatorios` | exportações operacionais pontuais | contém dados; revisar antes de compartilhar |

## Backend

```text
apps/api/
├── prisma/
│   ├── schema.prisma       modelo canônico
│   ├── migrations/         histórico SQL imutável
│   ├── seed.ts             dados de desenvolvimento
│   └── *.ts                provisão, importação e backfills
├── src/
│   ├── common/             guards, decorators, filtros e utilitários
│   ├── config/             ambiente, Prisma, Redis, storage e Sentry
│   ├── mail/               envio de e-mail
│   ├── modules/            módulos de negócio NestJS
│   ├── scripts/            homologação e recuperação operacional
│   ├── main.ts             bootstrap HTTP
│   └── vercel.ts           entrada serverless legada/alternativa
└── test/                   integração e E2E da API
```

O `AppModule` registra autenticação, throttling e RBAC como guards globais, logging como interceptor global e métricas de requisição como middleware. O catálogo dos módulos e contratos está em [[Catalogo Backend]].

## Frontend e aplicativos

```text
apps/desktop/
├── src/
│   ├── components/         componentes por experiência e compartilhados
│   ├── hooks/              contexto de gestor, realtime e shell nativo
│   ├── layouts/            cascas autenticada e pública
│   ├── lib/                regras de apresentação e catálogos locais
│   ├── pages/              páginas por perfil
│   ├── routing/            políticas e guards de rota
│   ├── services/           cliente HTTP por domínio
│   ├── types/              tipos locais
│   └── utils/              plataforma, telefone, moeda, imagem e arquivo
├── android/                projeto Android Capacitor
├── ios/                    projeto iOS Capacitor
├── public/                 PWA, documentos públicos e mídia
├── server.mjs              servidor estático de produção
└── capacitor.config.ts     app `space.eversync.painelgrid`
```

O mesmo bundle React atende navegador/PWA e é sincronizado com os shells nativos. No navegador usa `BrowserRouter`; no Capacitor usa `HashRouter`. Veja [[Catalogo Frontend]].

## Pacotes compartilhados

Os workspaces `@leadflow/types`, `@leadflow/ui` e `@leadflow/utils` estabelecem o lugar previsto para contratos e primitivas reutilizáveis. Antes de duplicar um tipo entre API e desktop, verificar esses pacotes; parte do produto ainda mantém tipos locais por razões históricas.

## Automação e documentação adjacente

- `docs/n8n/workflows`: exportações versionadas dos workflows.
- `docs/n8n`: operação, ingestão Meta e integração do agente.
- `docs/integrations`: decisões específicas de canais externos.
- `apps/api/src/scripts` e `apps/api/prisma/*.ts`: rotinas que conhecem o modelo Prisma.
- `scripts/*.mjs`: exportação/refatoração de n8n e tarefas de repositório.

## Arquivos gerados ou não canônicos

| Caminho | Tratamento |
|---|---|
| `node_modules`, `apps/desktop/node_modules` | dependências instaladas; nunca documentar comportamento a partir delas |
| `apps/*/dist` | build; regenerar a partir do código-fonte |
| `.railway-config-pull-*` | captura temporária de configuração; conferir estado real antes de operar |
| `apps/api/*.err` | logs locais; podem estar obsoletos ou conter dados operacionais |
| `.env` | contém segredos; nunca copiar valores para o vault |
| `all_migrations.sql` | consolidação auxiliar; migrações Prisma individuais são o histórico principal |

## Fontes da verdade por pergunta

| Pergunta | Consultar primeiro |
|---|---|
| Quais campos existem? | `apps/api/prisma/schema.prisma` |
| Como o banco evoluiu? | `apps/api/prisma/migrations` |
| Qual regra de negócio vale? | service do módulo e seus testes |
| Qual endpoint existe? | controller e DTO correspondente |
| Quem pode executar? | decorators do controller, guards e validação de escopo do service |
| Qual tela expõe a função? | `apps/desktop/src/App.tsx`, página e service HTTP |
| Qual automação roda fora da API? | workflow exportado em `docs/n8n/workflows` e estado implantado |
| Como implantar? | manifests/scripts do repositório e estado atual do provedor |

O snapshot máquina-legível de rotas, telas, schema e variáveis está em [[Inventario Automatico]]. Ele é regenerado por `npm run docs:sync` e comparado com o código por `npm run docs:check`.

## Relacionamentos

- [[Monorepo e Pacotes]]
- [[Catalogo Backend]]
- [[Catalogo Frontend]]
- [[Catalogo do Banco]]
- [[Scripts e Migracoes]]
- [[Guia de Desenvolvimento Local]]
