---
tags: [arquitetura, realtime, bullmq, redis]
tipo: arquitetura
status: mantido
atualizado: 2026-08-15
responsavel: equipe-arquitetura
criticidade: media
---

# Realtime e Filas

## Tempo real

Socket.IO atualiza conversas, filas e telas operacionais sem polling agressivo. O frontend precisa manter reconexão e revalidar o estado pela API após perda de conexão.

## BullMQ

BullMQ usa Redis para tarefas assíncronas. A configuração global está no `AppModule`; processadores ficam próximos aos domínios que executam trabalho em segundo plano.

Casos adequados:

- ingestão e sincronização Meta;
- processamento de dispatch e e-mail;
- importações extensas;
- recuperação/reconciliação;
- tarefas com retry e backoff.

## Regras operacionais

- Requisição HTTP deve confirmar enfileiramento, não aguardar trabalho lento.
- Jobs devem possuir chave idempotente.
- Retry não pode duplicar template, agendamento, QR ou venda.
- Fila acumulada, falhas e latência precisam gerar alerta.

Veja [[Redis e Filas]], [[Observabilidade]] e a documentação [BullMQ](../../BULLMQ_MIGRATION.md).

