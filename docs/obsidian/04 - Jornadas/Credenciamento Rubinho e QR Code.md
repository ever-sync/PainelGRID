---
tipo: jornada
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-operacao
criticidade: media
tags: [painelgrid, jornada]
---

# Credenciamento Rubinho e QR Code

## Sequência

```mermaid
sequenceDiagram
  participant L as Lead
  participant R as Rubinho
  participant A as API
  participant M as Meta WhatsApp
  L->>R: Garantir minha vaga
  R->>L: nome completo
  L->>R: nome
  R->>A: salvar nome
  R->>L: opções de data
  L->>R: data
  R->>A: salvar e reconciliar agendamento
  R->>L: acompanhantes
  R->>L: troca e placa, se aplicável
  R->>L: resumo
  L->>R: confirmação clara
  R->>A: finalizar credenciamento
  A->>A: validar agendamento e gerar credencial
  A->>M: enviar QR Code
  M-->>A: id/status real
  A-->>R: entrega comprovada
  R-->>L: confirmação final
```

## Contrato de finalização

- `lead_id`, `event_id` e `scheduled_at` precisam ser coerentes.
- `scheduled_at` deve ser ISO 8601 válido.
- A finalização é idempotente.
- Entrega da credencial exige agendamento ativo.
- O agente só afirma envio do QR após retorno real.
- E-mail pode ser enviado pela aplicação, mas ausência de e-mail não deve impedir o QR no WhatsApp.

## Falhas conhecidas a prevenir

- Chave de automação inválida.
- Data `undefined` ou fora do evento.
- Agendamento inexistente.
- ToolMessage órfã na memória do agente.
- QR enviado duas vezes por fluxos concorrentes.

## Relacionamentos

- [[Rubinho e Conversas]]
- [[Eventos e Agendamentos]]
- [[WhatsApp e Templates]]

