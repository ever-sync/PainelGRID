---
tipo: dominio
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-engenharia
criticidade: media
tags: [painelgrid, dominio]
---

# Eventos e Agendamentos

## Responsabilidade

Modela o evento comercial, datas, endereço, participantes, credenciamento, agendamento, confirmação, check-in e presença.

## Componentes

- API: `apps/api/src/modules/events` e `apps/api/src/modules/appointments`.
- Persistência: `Event`, `EventParticipant` e `Appointment`.
- Interfaces: gestão do evento, operação, recepção, painel TV e relatórios.

## Regras centrais

- A data escolhida deve ser uma opção publicada pelo evento.
- Um agendamento ativo deve ser reutilizado ou reconciliado de forma idempotente.
- `scheduled`, confirmação final, check-in, conclusão e no-show são estados diferentes.
- Ao escolher a data, o fluxo pode mover silenciosamente o card para presença agendada sem considerar o credenciamento concluído.
- A credencial depende de um agendamento ativo coerente com lead e evento.
- Permissões do evento controlam separadamente check-in/FIPE do vendedor, venda e manutenção de lead para vendedor e recepção.
- As permissões operacionais nascem desabilitadas; API e interface devem validar a mesma flag.

## Linha de estado

```mermaid
stateDiagram-v2
  [*] --> Pendente
  Pendente --> Agendado: escolhe data
  Pendente --> PreAgendado: intenção registrada
  PreAgendado --> Agendado: data válida definida
  Agendado --> Confirmado: conclui credenciamento
  Agendado --> Reagendado: troca a data
  Agendado --> Cancelado
  Confirmado --> CheckIn
  CheckIn --> Concluido
  Confirmado --> NoShow
```

## Relacionamentos

- [[Credenciamento Rubinho e QR Code]]
- [[Check-in e Fila de Atendimento]]
- [[Vendas Scores e Relatorios]]
