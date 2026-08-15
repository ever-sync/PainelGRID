---
tags: [arquitetura, dados, prisma]
tipo: arquitetura
status: mantido
atualizado: 2026-08-15
responsavel: equipe-arquitetura
criticidade: media
---

# Banco de Dados

PostgreSQL é a fonte central de estado. O schema Prisma está em `apps/api/prisma/schema.prisma` e as mudanças versionadas em `apps/api/prisma/migrations`.

## Núcleos do modelo

```mermaid
erDiagram
  Client ||--o{ User : possui
  Client ||--o{ Lead : possui
  Client ||--o{ Event : organiza
  Lead }o--|| Event : interesse
  Lead ||--o{ Conversation : conversa
  Conversation ||--o{ Message : contem
  Lead ||--o{ Appointment : agenda
  Event ||--o{ Appointment : recebe
  Lead ||--o{ Sale : gera
  Event ||--o{ Sale : contabiliza
  Client ||--o{ CrmPipeline : configura
  CrmPipeline ||--o{ CrmStage : contem
  Lead ||--o{ DispatchEvent : recebe
```

## Famílias de dados

- Identidade e tenancy: `User`, `Client`, `IntegrationCredential`.
- Funil: `Lead`, `CrmPipeline`, `CrmStage`, `CrmHistory`, `LeadTimeline`.
- Evento: `Event`, `EventParticipant`, `Appointment`, `Sale`, `ServiceRating`.
- Comunicação: `Conversation`, `Message`, `DispatchEvent`, `WhatsAppAttributionEvent`.
- Agente: `ConversationState`, `AgentActionLog`, `RubinhoAgent*`.
- Meta: conexões, ativos, formulários, campanhas, anúncios, importações e insights.
- Operação: `OperationalIssue`, `OperationalHeartbeat`, `ApiIdempotencyRequest`.

Veja [[Mapa de Dados]] para o catálogo completo.

O catálogo modelo a modelo, incluindo enums, permissões recentes e invariantes, está em [[Catalogo do Banco]].
