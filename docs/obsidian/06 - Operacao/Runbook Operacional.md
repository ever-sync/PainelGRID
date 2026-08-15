---
tipo: runbook
status: mantido
atualizado: 2026-08-15
responsavel: equipe-plataforma
criticidade: alta
tags: [painelgrid, runbook]
---

# Runbook Operacional

## Lead Meta não entrou

1. Consultar o lead diretamente no formulário.
2. Confirmar assinatura `leadgen` da página.
3. Verificar regra de roteamento ativa.
4. Conferir webhook/polling e `MetaLeadImport`.
5. Reprocessar com a mesma chave idempotente.

## Rubinho não respondeu

1. Confirmar recebimento do webhook WhatsApp.
2. Validar `phone_number_id` e resolução de contexto.
3. Procurar execução do workflow e issue operacional.
4. Verificar memória inválida, timeout, fila e resposta da Meta.
5. Fazer teste controlado com um único número.

## Lead foi para o evento errado

1. Bloquear novos disparos ao contato durante a análise.
2. Conferir último `DispatchEvent`, formulário e vínculos ativos.
3. Verificar se há duplicidade do telefone entre clientes/eventos.
4. Corrigir o vínculo persistido; não depender da memória.

## QR Code não chegou

1. Confirmar agendamento ativo para lead e evento.
2. Verificar conclusão de `finalizar_credenciamento`.
3. Inspecionar `credential-delivery`, chave de automação e idempotência.
4. Conferir status do envio WhatsApp e e-mail separadamente.
5. Reenviar somente o canal faltante.

## Migração falhou

1. Confirmar `DATABASE_URL` e `DIRECT_URL`.
2. Consultar `_prisma_migrations`.
3. Verificar se objeto já existe antes de reaplicar SQL.
4. Nunca apagar produção para corrigir histórico.

## Incidente de segredo

Rotacionar, atualizar runtimes/workflows, reimplantar, revogar a chave antiga e revisar logs/commits.

Relacionados: [[Meta]], [[WhatsApp]], [[n8n]], [[Observabilidade]], [[Scripts e Migracoes]].

