# n8n

## Função

O n8n orquestra integrações e o agente conversacional. A API do PainelGRID continua sendo a autoridade para dados, status, etapas, agendamentos, auditoria e entrega de credenciais.

## Famílias de workflow

- Ingestão de leads Meta por webhook ou polling.
- Envio cadenciado de templates.
- Rubinho: entrada, resolução de contexto, estado, agente e resposta.
- Follow-up, lembretes e recuperação.
- Monitoramento e heartbeat.

## Contrato operacional

- Usar endpoints de `integrations/v1` e `automations`.
- Enviar a chave de automação no cabeçalho esperado pela API.
- Aplicar idempotência em importações, disparos, agendamentos e credenciais.
- Não consultar ou alterar diretamente tabelas quando existir endpoint transacional.
- Uma falha de e-mail não pode impedir o agendamento.
- Uma falha de FIPE não pode impedir o credenciamento.

## Rubinho

O workflow deve separar:

1. Normalização da mensagem.
2. Resolução determinística de cliente, lead, evento e conversa.
3. Carregamento do estado persistente.
4. Interpretação e execução de uma única ação.
5. Validação pós-ação.
6. Resposta ao WhatsApp.

Não usar a memória LangChain como fonte de verdade; pares órfãos de mensagens `tool` causam `INVALID_TOOL_RESULTS`.

## Referências existentes

- `docs/n8n/`
- `docs/integrations/`
- Scripts de operação em `apps/api/src/scripts/`.

Relacionados: [[Rubinho e Conversas]], [[Credenciamento Rubinho e QR Code]], [[Auditoria e Estado]], [[Observabilidade]].

