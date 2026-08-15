---
tipo: dominio
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-engenharia
criticidade: media
tags: [painelgrid, dominio]
---

# Leads e CRM

## Responsabilidade

Centraliza captação, deduplicação, perfil, origem, vínculo com cliente/evento, etapa do funil e histórico do lead.

## Componentes

- API: `apps/api/src/modules/leads` e `apps/api/src/modules/crm`.
- Interface: CRM Kanban, lista de leads do cliente e aba de leads do evento.
- Persistência: `Lead`, `CrmPipeline`, `CrmStage`, `CrmHistory`, `LeadTimeline` e `CrmTask`.
- Integrações: Meta Lead Ads, WhatsApp, importações e criação manual.

## Regras centrais

- O lead pertence a um cliente e pode estar associado a evento, campanha, vendedor e equipe.
- Telefone e e-mail são normalizados para reduzir duplicidade.
- Movimentações de etapa devem gerar histórico e timeline.
- Próximas ações podem ser criadas como ligação, WhatsApp, agendamento, proposta, follow-up ou outra; possuem prazo, responsável e estado.
- Exclusão deve remover conversas, mensagens, estados, auditorias e demais rastros dependentes de forma transacional.
- Um vendedor não deve reivindicar para si um lead já atribuído no mesmo evento.

## Estados relevantes

As etapas são configuráveis por pipeline. O funil padrão atual possui 24 etapas e introduz `PRE_AGENDADO` entre `EM_CONTATO` e `PRESENCA_AGENDADA`. A lista completa e a ordem estão em [[Catalogo do Banco]].

## Agenda do CRM

O detalhe do lead cria e lista tarefas. O painel **Meu Dia** agrega pendentes atrasadas, de hoje e futuras. `GET /api/crm/tasks`, `POST /api/crm/tasks` e `PATCH /api/crm/tasks/:taskId` atendem gestor, cliente e vendedor, sempre com validação do escopo do cliente.

## Pontos de atenção

- Não confundir etapa do CRM com `confirmation_status`.
- Sempre resolver o contexto por `client_id + event_id + lead_id`; telefone isolado é ambíguo entre clientes.
- Importações e webhooks precisam ser idempotentes.
- A deduplicação de telefone ativo considera cliente e evento; não impor unicidade global.
- Consultas intensivas da recepção usam índices por cliente, evento, confirmação e etapa; filtros devem permanecer compatíveis com esses acessos.

## Relacionamentos

- [[Eventos e Agendamentos]]
- [[Rubinho e Conversas]]
- [[Campanhas e Meta]]
- [[Exclusao de Lead]]
