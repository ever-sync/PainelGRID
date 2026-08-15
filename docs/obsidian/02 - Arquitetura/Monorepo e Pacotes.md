---
tags: [arquitetura, monorepo]
tipo: arquitetura
status: mantido
atualizado: 2026-08-15
responsavel: equipe-arquitetura
criticidade: media
---

# Monorepo e Pacotes

```text
PainelGRID/
├── apps/
│   ├── api/          NestJS, Prisma, filas e integrações
│   └── desktop/      React, Vite, PWA e Capacitor
├── packages/
│   ├── types/        contratos TypeScript compartilhados
│   ├── ui/           componentes compartilháveis
│   └── utils/        utilidades comuns
├── docs/             documentação e workflows n8n
├── e2e/              testes de ponta a ponta
├── scripts/          automação de banco, n8n e operação
└── supabase/         scripts auxiliares de banco/RBAC
```

## Comandos principais

- `npm run dev`: somente a API em desenvolvimento.
- `npm run dev:desktop`: somente o frontend Vite.
- `npm run dev:full`: API e frontend em paralelo.
- `npm run build`: build da API e bundle de implantação.
- `npm run build:ci`: build API + desktop.
- `npm run test`, `npm run test:e2e`: testes.
- `npm run db:generate`, `npm run db:migrate`: Prisma.
- Scripts mobile constroem e abrem os projetos iOS/Android.

O workspace raiz coordena dependências; comandos específicos também podem ser executados nos workspaces `apps/api` e `apps/desktop`.

Inventário detalhado: [[Inventario do Repositorio]]. Setup reproduzível: [[Guia de Desenvolvimento Local]].
