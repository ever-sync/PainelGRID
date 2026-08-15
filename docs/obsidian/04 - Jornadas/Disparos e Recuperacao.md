---
tipo: jornada
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-operacao
criticidade: media
tags: [painelgrid, jornada]
---

# Disparos e Recuperacao

## Tipos

- Template inicial.
- Nova tentativa e recuperação.
- Lembrete de evento.
- Reagendamento/no-show.
- Credencial e QR Code.
- E-mail de segunda tentativa.
- Solicitação de avaliação.

## Elegibilidade

Antes de enviar, verificar cliente/evento, canal, telefone/e-mail, consentimento, etapa, janela de 24 horas, histórico de disparo, status do template e idempotency key.

## Cadência

Para lotes, usar fila com taxa configurável, backoff e jitter. Cadências como um envio a cada três minutos devem ser modeladas no scheduler/fila, não por vários nós `Wait` mantendo execuções abertas.

## Observabilidade

Cada disparo registra:

- `event_id`, `client_id`, `lead_id`.
- workflow/tipo/canal/template.
- agendado, enviado, entregue, lido, respondido e falhou.
- conversão, agendamento, venda e receita atribuíveis.
- código e mensagem de erro.

## Recuperação

Falhas transitórias voltam com limite de tentativas. Falhas permanentes vão para [[Observabilidade|painel de exceções]] e não entram em loop.

