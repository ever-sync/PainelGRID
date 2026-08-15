---
tags: [arquitetura, mapa]
tipo: arquitetura
status: mantido
atualizado: 2026-08-15
responsavel: equipe-arquitetura
criticidade: media
---

# Arquitetura Geral

```mermaid
flowchart TB
  subgraph Canais
    Browser[Web/PWA]
    Mobile[iOS e Android]
    Meta[Meta Lead Ads]
    WA[WhatsApp Cloud API]
    N8N[n8n]
  end
  subgraph Plataforma
    UI[React + Vite + Capacitor]
    API[NestJS API]
    WS[Socket.IO]
    Jobs[BullMQ Workers]
  end
  subgraph Dados
    PG[(PostgreSQL)]
    Redis[(Redis)]
    Storage[(Object Storage)]
  end
  Browser --> UI
  Mobile --> UI
  UI --> API
  UI <--> WS
  Meta --> API
  WA --> API
  N8N <--> API
  API --> PG
  API --> Jobs
  Jobs --> Redis
  Jobs --> PG
  API --> Storage
```

## Camadas

- **Experiência:** React/Vite, rotas por perfil, PWA e Capacitor.
- **Aplicação:** módulos NestJS, DTOs validados e regras transacionais.
- **Automação:** n8n para orquestração conversacional e rotinas externas.
- **Assíncrono:** BullMQ e Redis para tarefas que não devem bloquear requisições.
- **Persistência:** Prisma/PostgreSQL com histórico, auditoria e idempotência.
- **Integração:** Meta, WhatsApp, e-mail, consulta veicular e storage.

## Fronteiras importantes

O n8n não deve ser a fonte exclusiva de estado de negócio. Leads, conversas, etapa, agendamento, dispatch e ações do agente são persistidos na API. As automações chamam contratos autenticados e idempotentes. Veja [[Rubinho e Conversas]] e [[n8n]].

