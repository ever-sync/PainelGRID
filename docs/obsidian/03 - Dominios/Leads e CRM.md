# Leads e CRM

## Responsabilidade

Centraliza captação, deduplicação, perfil, origem, vínculo com cliente/evento, etapa do funil e histórico do lead.

## Componentes

- API: `apps/api/src/modules/leads` e `apps/api/src/modules/crm`.
- Interface: CRM Kanban, lista de leads do cliente e aba de leads do evento.
- Persistência: `Lead`, `CrmPipeline`, `CrmStage`, `CrmHistory` e `LeadTimeline`.
- Integrações: Meta Lead Ads, WhatsApp, importações e criação manual.

## Regras centrais

- O lead pertence a um cliente e pode estar associado a evento, campanha, vendedor e equipe.
- Telefone e e-mail são normalizados para reduzir duplicidade.
- Movimentações de etapa devem gerar histórico e timeline.
- Exclusão deve remover conversas, mensagens, estados, auditorias e demais rastros dependentes de forma transacional.
- Um vendedor não deve reivindicar para si um lead já atribuído no mesmo evento.

## Estados relevantes

As etapas são configuráveis por pipeline. Códigos operacionais recorrentes incluem `NOVO_LEAD`, `TENTATIVA_CONTATO`, `EM_CONTATO`, `PRESENCA_AGENDADA`, reagendamento e cancelamento.

## Pontos de atenção

- Não confundir etapa do CRM com `confirmation_status`.
- Sempre resolver o contexto por `client_id + event_id + lead_id`; telefone isolado é ambíguo entre clientes.
- Importações e webhooks precisam ser idempotentes.

## Relacionamentos

- [[Eventos e Agendamentos]]
- [[Rubinho e Conversas]]
- [[Campanhas e Meta]]
- [[Exclusao de Lead]]

