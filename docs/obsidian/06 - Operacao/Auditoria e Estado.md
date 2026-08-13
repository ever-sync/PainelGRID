# Auditoria e Estado

## Fontes de auditoria

- `CrmHistory`: movimentações de etapa.
- `LeadTimeline`: acontecimentos do lead.
- `DispatchEvent`: ciclo de vida de mensagens e templates.
- `AgentActionLog`: decisões e ferramentas do agente.
- `ConversationState`: estado persistente do credenciamento.
- `OperationalIssue`: exceções que exigem ação.
- `WebhookEvent`: eventos externos recebidos.

## Estado do Rubinho

A decisão deve ser derivada dos dados persistidos, não apenas do histórico textual. Estados típicos:

1. `WAITING_FULL_NAME`
2. `WAITING_EVENT_DATE`
3. `WAITING_COMPANIONS`
4. `WAITING_COMPANION_NAMES`
5. `WAITING_TRADE_IN`
6. `WAITING_VEHICLE_PLATE`
7. `WAITING_FINAL_CONFIRMATION`
8. `COMPLETED`

O derivador precisa reconhecer dúvidas pós-credenciamento e não reiniciar o fluxo quando o lead já está concluído.

## Correlação

Toda ação automatizada deveria poder ser ligada a `client_id`, `lead_id`, `event_id`, `conversation_id`, workflow/agente e chave idempotente.

Relacionados: [[Rubinho e Conversas]], [[Credenciamento Rubinho e QR Code]], [[Observabilidade]].

