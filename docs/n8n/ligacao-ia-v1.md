# Ligação IA — workflow isolado V1

Este workflow é separado do `rubinho-v1` e está inativo por padrão.

## Importação

Importe `workflows/ligacao-ia-v1.json` em uma workflow nova do n8n. Não sobrescreva o workflow atual.

Webhook de produção esperado:

```text
POST https://SEU_N8N/webhook/ligacao-ia-v1
```

## Retell AI

No Retell, configure este endereço como webhook do agente. O Retell envia eventos como `call_started`, `call_ended`, `call_analyzed` e `transcript_updated`. O normalizador aceita o formato padrão com `event` e `call.from_number`/`call.call_id`.

Antes de ativar, configure a verificação da assinatura `x-retell-signature` em uma camada de autenticação do n8n ou em um endpoint intermediário. Não deixe o webhook público sem validação em produção.

O workflow aceita eventos com estes aliases:

- telefone: `phone`, `from` ou `caller_phone`;
- chamada: `call_id`, `callId` ou `id`;
- transcrição: `transcript`, `text` ou `utterance`;
- evento: `event_id` ou `eventId`.

## Estado atual

Este é o ponto de entrada seguro. Ele apenas normaliza e valida o evento e responde ao provedor. Ainda não deve ser ativado para leads reais até conectarmos:

1. agente e número do Retell;
2. consulta autenticada do lead por telefone;
3. agente de voz e ferramentas do CRM;
4. persistência da transcrição e resultado da ligação;
5. testes com número interno.

O prompt pronto para colar no agente está em `retell-agent-system-prompt.md` e o contrato das ferramentas está em `retell-tool-contract.json`.

O workflow não altera o fluxo atual de WhatsApp e não chama endpoints de movimentação do CRM.
