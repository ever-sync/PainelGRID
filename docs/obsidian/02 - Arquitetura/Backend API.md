---
tags: [arquitetura, backend, nestjs]
---

# Backend API

## Base técnica

- NestJS 11 e Express.
- Prisma 5 sobre PostgreSQL.
- JWT, RBAC, throttling e validação global.
- BullMQ/Redis para filas.
- Socket.IO para atualizações em tempo real.
- Sentry e métricas próprias para observabilidade.

## Inicialização

`apps/api/src/main.ts` configura prefixo `/api`, raw body para validação de webhook, Helmet/CSP, CORS, compressão, cookies, limite de payload, Swagger condicionado ao ambiente e filtros globais.

`apps/api/src/app.module.ts` agrega os módulos, registra guardas globais, interceptor de logging, middleware de performance e a conexão BullMQ.

## Organização

Cada domínio vive em `apps/api/src/modules/<dominio>` e normalmente contém controller, service, DTOs e testes. Os contratos públicos principais estão resumidos em [[Mapa de API]].

## Regras transversais

- `ValidationPipe` usa whitelist e rejeita propriedades desconhecidas.
- Exceções HTTP são normalizadas por filtro global.
- O escopo do cliente deve ser verificado nas consultas e integrações.
- Operações externas sensíveis usam chaves de integração ou automação.
- Webhooks preservam o body bruto para conferência de assinatura.

