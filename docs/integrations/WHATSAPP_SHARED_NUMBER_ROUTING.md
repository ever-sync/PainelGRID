# Roteamento de um número WhatsApp compartilhado

## Responsabilidades

### Fluxo do formulário Meta

O fluxo de entrada apenas:

1. resolve `form_id` em cliente, evento, pipeline, etapa e template;
2. cria ou atualiza o lead dentro do cliente resolvido;
3. persiste `event_interest_id`, origem Meta e contexto de CRM;
4. cria/atualiza a conversa usada pelo template;
5. envia o template e registra um `DispatchEvent`;
6. encerra sem executar o Rubinho.

### Fluxo receptivo do Rubinho

O Rubinho só é acionado depois de uma mensagem real do lead. Antes disso, o
resolvedor valida o contexto nesta ordem:

1. `context.id` da mensagem respondida contra `provider_message_id` do disparo;
2. último template rastreado para o telefone no número compartilhado;
3. compatibilidade legada somente quando existe um único cliente/evento possível.

Se houver dois contextos possíveis sem evidência de disparo, a mensagem não é
entregue ao agente. Uma ocorrência `CLIENT_NOT_IDENTIFIED` é criada no painel de
exceções para tratamento operacional.

## Endpoint para n8n

`POST /api/integrations/v1/rubinho/resolve-context`

Header: `X-Leadflow-Meta-Ingestion-Key`

```json
{
  "phone_number_id": "123456789",
  "customer_phone": "5511999999999",
  "provider_message_id": "wamid.template.respondido"
}
```

O workflow deve continuar somente quando `authorized` for `true`. A resposta
autorizada contém lead, cliente, evento, conversa, pipeline, etapa e o motivo
auditável do roteamento. O agente nunca deve substituir esses IDs nem resolver
cliente ou evento pelo texto da conversa.
