# Rubinho v2 — inventário técnico

Data do inventário: 06/08/2026  
Workflow: `Rubinho v2`  
Workflow ID: `rQ92Kohukkw7X7ex`  
Versão analisada: `b6a533c8-adb8-4af6-acd9-5897ea0c0d2d`  
Estado: desativado  
Origem: cópia estrutural do `Rubinho v1`

## Resumo estrutural

- 75 nós.
- 70 grupos de conexões.
- 65 nós alcançáveis pelo gatilho principal.
- 4 nós pertencentes ao fluxo legado de QR Code.
- 6 nós de IA conectados por portas especiais de modelo, memória ou ferramenta.
- 3 nós de QR Code estão desativados.

### Tipos de nós

| Quantidade | Tipo |
|---:|---|
| 16 | HTTP Request |
| 11 | Set/Edit Fields |
| 9 | IF |
| 7 | Redis |
| 7 | WhatsApp |
| 5 | Code |
| 3 | Switch |
| 3 | OpenAI |
| 3 | HTTP Request Tool |
| 2 | Postgres |
| 1 | WhatsApp Trigger |
| 1 | AI Agent |
| 1 | Postgres Chat Memory |
| 1 | Split in Batches |
| 1 | Wait |
| 1 | Merge |
| 1 | Execute Workflow Tool |

## Entrada principal

O fluxo começa em `WhatsApp Trigger`, usando a credencial `GridLABs`.

Campos consumidos do webhook:

- `metadata.display_phone_number`
- `metadata.phone_number_id`
- `contacts[0].profile.name`
- `messages[0].from`
- `messages[0].type`
- `messages[0].text.body`
- dados de áudio, imagem, documento e botão

O primeiro controle de escopo é:

`WhatsApp Trigger → VALIDAR CLIENTE PELO PHONE ID → PHONE ID AUTORIZADO?`

A consulta identifica o cliente pelo `phone_number_id`, mas ainda exige explicitamente o cliente `99640561-bdb7-4bfb-9236-f27ecaedf538`. Portanto, o validador ainda não é multiempresa.

## Contexto fixo atual

O nó `EverSync` contém:

- cliente resolvido pelo validador;
- evento fixo `20bb5e36-1bbb-4f4e-956f-93e34969f2de`;
- pipeline fixo `PL_99640561BDB74BFB`;
- API `https://api.gpdevendas.app/`.

Existem ramificações antigas com dados de outros clientes:

- `EverSync1`: cliente `2ba9e258-d2f2-4fef-87a7-549f71035e65` e evento `294fa389-e81a-4a6d-b9f3-37035af57aeb`;
- `Ford Sonnervig`: cliente `84b55a6d-7bcf-47a8-b004-2a07fa06d09d` e evento `387c1d92-e42a-43ce-93fa-dc934b2867fa`;
- `Switch5`: telefones de teste `5512997548852` e `5512997548853`.

Essas ramificações não devem integrar a arquitetura final do v2.

## Resolução de lead e evento

Sequência atual:

1. Consulta o lead pelo telefone e `client_id`.
2. Se não existir, tenta criar o lead.
3. Consulta novamente o lead e sua etapa.
4. Consulta o evento usando o `event_id` do lead.
5. Monta `RESUMO DO LEAD/EVENTO/RUBINHO`.

Pontos observados:

- a URL de `CRIAR LEAD` possui um espaço ao final;
- não existe contrato único e tipado para o contexto;
- os dados são recuperados repetidamente em vários nós;
- o evento configurado no início é fixo, embora a consulta posterior também use o evento do lead.

## Tipos de mensagem

O `Switch4` trata:

- texto;
- áudio;
- imagem;
- `ExtendedTextMessage`;
- documento;
- botão.

Texto, botão e mídias alimentam Redis, uma espera de agrupamento e a montagem da mensagem completa. Áudios usam transcrição; imagens passam por interpretação visual.

Não existe uma barreira inicial exclusiva para ignorar callbacks da Meta sem `messages[0]`. Esse controle será redesenhado no v2, mas não deve ser copiado de forma isolada para o v1.

## Memória e agrupamento

O fluxo usa dois mecanismos:

- Redis para agrupar mensagens próximas e evitar respostas fragmentadas;
- Postgres Chat Memory para histórico do agente.

O agrupamento possui nós duplicados para texto, áudio e botão. A versão final deve produzir um único envelope de mensagem normalizado antes de acessar a memória.

## Agente e ferramentas

O `AI Agent1` usa:

- `OpenAI Chat Model`;
- `Postgres Chat Memory`;
- `mover_lead_crm`;
- `atualizar_dados_lead`;
- `atualizar_status_lead`;
- `enviar_qrcode`.

### Ferramentas HTTP

`mover_lead_crm`:

- move por sufixo de etapa;
- aceita decisão livre do modelo dentro da lista descrita.

`atualizar_dados_lead`:

- envia nome, sobrenome, acompanhantes, visita e veículo;
- depende de `$fromAI` para montar os parâmetros.

`atualizar_status_lead`:

- altera `confirmation_status`;
- pode disparar efeitos posteriores da API.

`enviar_qrcode`:

- ainda referencia o workflow ID do v1: `MWIRTrZl44bVjTZW`;
- contém uma entrada `key-cliente` baseada em um campo que não está definido em `EverSync`;
- não pode ser utilizado pelo v2 até ser substituído.

## Validador posterior

Após o agente, o fluxo:

1. consulta novamente o lead;
2. verifica campos obrigatórios;
3. tenta corrigir `confirmation_status`;
4. tenta corrigir a etapa do CRM;
5. encaminha a resposta para WhatsApp.

Limitação crítica: a mensagem final enviada pelo nó WhatsApp referencia diretamente `AI Agent1.output`. Assim, uma correção textual produzida pelo validador pode não chegar ao cliente.

O validador também não cria nem sincroniza o registro de agendamento. Status, etapa e `active_appointment` podem divergir.

## Saídas

Saídas identificadas:

- mensagem de texto pelo WhatsApp;
- áudio gerado e enviado pelo WhatsApp;
- handoff para atendimento humano;
- atualização de lead pela API;
- movimentação no CRM;
- atualização de status;
- QR Code pelo fluxo legado desativado ou pela API.

Todos os nós de envio usam atualmente o `phoneNumberId` fixo `1158769897321849`.

## Credenciais referenciadas

Nenhum segredo foi copiado para este documento.

| Credencial | Uso |
|---|---|
| `GridLABs` | WhatsApp Trigger |
| `WhatsApp account` | download, upload e envio de mensagens |
| `PainelGRID - Integration Key` | APIs de lead, evento, CRM e validador |
| `PainelGRID - Meta Account Discovery` | descoberta de mídia/Meta |
| `PainelGRID - WhatsApp Cloud API` | download de mídia Cloud API |
| `OpenAI account` | chat, transcrição, visão e áudio |
| `Redis account` | agrupamento e memória temporária |
| `Postgres account` | memória e validação de cliente |

## Problemas encontrados

### Prioridade crítica

1. Cliente, evento, pipeline e número de envio ainda possuem valores fixos.
2. A ferramenta `enviar_qrcode` do v2 referencia o workflow v1.
3. A saída corrigida pelo validador não é necessariamente a mensagem enviada.
4. Status, etapa e agendamento são operações separadas e não transacionais.
5. O modelo pode executar diretamente alterações críticas no CRM.

### Prioridade alta

1. Os campos adicionais de `RESUMO DO LEAD/EVENTO/RUBINHO` usam expressões no formato `={ ... }`, em vez de `={{ ... }}`. Isso pode entregar texto literal ou valor inválido ao agente.
2. Existem ramificações legadas de clientes e telefones de teste.
3. O lead e o evento são consultados várias vezes sem um contexto normalizado.
4. Não existe estado explícito da etapa da conversa.
5. Não existe idempotência visível em todas as mutações.

### Prioridade média

1. Nomes genéricos como `If`, `If1`, `Switch` e `HTTP Request2` dificultam manutenção.
2. Texto, mídia e botão possuem caminhos duplicados.
3. Erros e retries não seguem um padrão único.
4. Não há uma outbox única para registrar envio, entrega, leitura e falha.

## Contrato recomendado para a próxima fase

O v2 deve transformar qualquer webhook em um envelope único:

```json
{
  "message_id": "...",
  "phone_number_id": "...",
  "client_id": "...",
  "lead_phone": "+55...",
  "lead_id": "...",
  "event_id": "...",
  "conversation_id": "...",
  "message_type": "text",
  "message_text": "...",
  "received_at": "..."
}
```

Esse envelope será a única entrada da máquina de estados e eliminará referências cruzadas frágeis entre dezenas de nós.

## Condição de encerramento da fase 3

- workflow v2 permaneceu desativado;
- workflow v1 não foi alterado;
- entradas, credenciais, ferramentas e saídas foram identificadas;
- valores fixos e ramificações legadas foram registrados;
- riscos foram classificados para orientar a implementação.

## Fase 4 — resolução dinâmica implementada

Versão resultante do workflow: `893af06c-3f27-432b-b784-6846ded162a1`  
Estado após a implementação: desativado  
Quantidade de nós: 80

### Alterações realizadas

- adicionado `V2 - NORMALIZAR ENTRADA` antes de qualquer consulta;
- callbacks sem mensagem, remetente ou `phone_number_id` não avançam;
- removida a autorização fixa de um único `client_id` da consulta de número;
- o cliente agora é resolvido exclusivamente pelo `phone_number_id` conectado;
- o contexto inicial transporta dinamicamente `client_id`, empresa, `phone_number_id` e `waba_id`;
- removidos evento e pipeline fixos do nó principal `EverSync`;
- contatos sem lead não são cadastrados automaticamente em evento arbitrário;
- adicionado encerramento auditável para lead não encontrado;
- adicionado controle de pertencimento do lead ao cliente resolvido;
- o fluxo só continua quando o lead possui um evento vinculado;
- a consulta do evento passou a usar o evento resolvido do lead;
- todos os nós WhatsApp passaram a usar o `phone_number_id` resolvido;
- corrigidas as expressões malformadas dos campos persistidos no resumo.

### Testes executados

| Entrada | Resultado esperado | Resultado |
|---|---|---|
| `1158769897321849` | Original Volkswagen SJC | autorizado, cliente correto |
| `1320727864451243` | sem vínculo cadastrado | bloqueado |
| ID inexistente | sem vínculo | bloqueado |

O teste foi executado em workflow temporário isolado, posteriormente desativado e removido. Nenhuma mensagem foi enviada e nenhum lead foi alterado.

### Garantias verificadas

- Rubinho v1 continua ativo com 75 nós;
- Rubinho v1 não recebeu nenhum nó da fase 4;
- Rubinho v2 continua desativado;
- Rubinho v2 não contém número WhatsApp fixo nos nós de envio;
- Rubinho v2 não contém as expressões malformadas identificadas no inventário;
- contatos sem correspondência única são encerrados sem mutações.

## Fase 5 — máquina de estados persistente

Versão resultante do workflow: `7f9e292f-6ff0-452d-bb9d-440f353f5d06`  
Estado após a implementação: desativado  
Quantidade de nós: 89

### Persistência utilizada

A fase reutiliza o estado já existente no backend (`conversation_states`), sem
criar uma segunda fonte de verdade. O contexto é carregado por
`GET /api/agent/whatsapp/context` e persistido por
`POST /api/agent/conversations/:conversationId/state`.

O payload persistido registra:

- etapa atual e pergunta pendente;
- campos coletados e campos faltantes;
- intenção e última ação do agente;
- resultado da última ferramenta e contador de tentativas;
- mensagem que originou a atualização;
- status de handoff e dados do evento/horário oferecido.

### Estados implementados

- `WAITING_FULL_NAME`
- `WAITING_COMPANIONS`
- `WAITING_COMPANION_NAMES`
- `WAITING_EVENT_DATE`
- `WAITING_TRADE_IN`
- `WAITING_VEHICLE_PLATE`
- `WAITING_VEHICLE_DETAILS`
- `WAITING_FINAL_CONFIRMATION`
- `COMPLETED`
- `CANCELLED`
- `HUMAN_HANDOFF`

O estado é recalculado a partir dos dados efetivamente salvos antes do turno e
novamente depois do validador. Assim, a memória textual não pode avançar o
atendimento quando os campos obrigatórios ainda não foram persistidos.

### Nós adicionados

- `V2 - CARREGAR ESTADO`
- `V2 - DERIVAR ESTADO`
- `V2 - CONVERSA ENCONTRADA?`
- `V2 - ENCERRAR SEM CONVERSA`
- `V2 - PERSISTIR ESTADO INICIAL`
- `V2 - ESTADO PRONTO`
- `V2 - CALCULAR ESTADO POS TURNO`
- `V2 - PERSISTIR ESTADO POS TURNO`
- `V2 - RESTAURAR SAIDA APOS ESTADO`

### Testes executados

- 12 cenários determinísticos de transição passaram, incluindo acompanhantes
  com nomes pendentes, veículo incompleto, conclusão, cancelamento e handoff;
- 3 testes unitários do `ConversationStateService` passaram: upsert, bloqueio de
  evento fora do cliente e proteção durante handoff;
- conexões de entrada, persistência pré-turno, persistência pós-turno e retorno
  ao envio foram auditadas;
- Rubinho v1 permaneceu ativo, com 75 nós e a mesma versão congelada;
- Rubinho v2 permaneceu desativado.

### Limite desta fase

O envio final ainda passa pelo validador legado. A separação completa entre
decisão do agente, execução transacional e outbox de mensagens pertence às
fases seguintes e não foi antecipada para evitar mudança no fluxo em produção.

## Fase 6 — finalização transacional

Versão resultante do workflow: `1a2b7e2b-772f-4b31-ac3c-d26b5c687e87`  
Estado após a implementação: desativado  
Quantidade de nós: 90

### Operação escolhida

Foi reutilizado o endpoint seguro já existente:

`POST /api/agent/appointments`

Esse endpoint valida lead, evento, cliente, conversa, capacidade e duplicidade.
Na mesma transação ele:

- cria o agendamento vinculado ao lead, evento e conversa;
- sincroniza `store_visit_datetime`;
- atualiza `confirmation_status` para `scheduled`;
- gera o token de check-in quando necessário;
- move o lead para a etapa de presença agendada;
- registra histórico do CRM.

O header `Idempotency-Key` usa o ID da mensagem Meta que confirmou o resumo,
prefixado por `rubinho-v2-finalize-`.

### Alterações no workflow

- adicionada a ferramenta `finalizar_credenciamento`;
- a ferramenta usa IDs e horário já resolvidos no contexto, sem permitir que o
  modelo invente esses valores;
- `atualizar_status_lead` foi desativada e desconectada do agente;
- `mover_lead_crm` foi restrita a etapas não finais;
- os corretores legados de status e etapa foram desativados;
- o validador agora apenas bloqueia uma confirmação falsa, sem realizar
  mutações compensatórias fora da transação;
- o estado `COMPLETED` exige status final e `active_appointment` real;
- o envio de texto passou a usar a saída aprovada pelo validador, em vez de
  acessar diretamente `AI Agent1.output`.

### Testes executados

- 13 testes do `AppointmentsService` passaram;
- criação e sincronização da data passaram;
- bloqueio de agendamento ativo duplicado passou;
- replay idempotente passou;
- movimentação para a etapa agendada passou;
- confirmação, reagendamento, cancelamento e no-show passaram;
- conexões e expressões do v2 foram auditadas;
- nenhuma chamada mutável foi executada contra um lead real;
- Rubinho v1 permaneceu ativo e inalterado;
- Rubinho v2 permaneceu desativado.

## Fase 10 — validação completa e liberação gradual

Estado inicial do rollout: Rubinho v1 ativo; Rubinho v2 desativado.

### Gates de qualidade

- lint da API e do painel sem avisos;
- typecheck completo da API e do painel;
- 43 suítes e 312 testes da API aprovados;
- 8 suítes e 53 testes do painel aprovados;
- builds de produção da API e do painel aprovados;
- orçamento de performance do painel aprovado;
- `git diff --check` sem erros.

### Estratégia de publicação

1. Publicar somente a API no serviço `PainelGRID - api` do Railway.
2. Confirmar o healthcheck `/api/health` e a existência protegida do endpoint de
   entrega do QR Code.
3. Manter o Rubinho v1 ativo durante o smoke test.
4. Manter o Rubinho v2 desativado até que credenciais, webhook e teste canário
   estejam aprovados, evitando processamento duplo de mensagens.
5. No corte final, desativar o v1 antes de ativar o v2 e monitorar logs, handoff,
   estado persistente e envio do QR Code.

### Rollback

Se o canário apresentar erro, o v2 deve permanecer ou voltar a ficar
desativado e o v1 deve continuar ativo. A publicação do endpoint novo é
compatível com o v1 e não exige rollback do backend.

## Fase 9 — correção estrutural do workflow

Versão resultante do workflow: `d56796de-a1d0-46ae-aeb9-f9c4cfd4434c`  
Estado após a implementação: desativado  
Quantidade de nós: 78

### Roteamento corrigido

O caminho de entrada ainda continha uma decisão baseada em campos de outro
provedor (`fromMe` e `wasSentByApi`). Mensagens válidas podiam cair em um switch
com apenas dois telefones de teste e terminar sem chegar ao contexto dinâmico.

Como `V2 - NORMALIZAR ENTRADA` já aceita somente mensagens recebidas válidas da
Cloud API, `Dados Unicos` agora segue diretamente para `EverSync`, que resolve o
cliente pelo `phone_number_id`.

### Nós removidos

Foram removidos 22 nós obsoletos:

- roteador de telefones de teste;
- contextos fixos EverSync1 e Ford Sonnervig;
- consultas e merge da ramificação multi-cliente antiga;
- workflow legado de QR Code;
- ferramenta antiga que chamava o Rubinho v1;
- criação de lead fixa e etapa sem entrada;
- atualização direta de status;
- corretores legados de status e etapa já substituídos pela transação.

Após a limpeza não restaram:

- IDs fixos dos clientes/eventos antigos;
- telefones de teste;
- referência ao workflow `Rubinho v1`;
- referência à antiga `keychaveaut`;
- nós desativados;
- expressões apontando para nós inexistentes.

### Nós renomeados

Doze nós genéricos receberam nomes operacionais, incluindo:

- `ROTEAR TIPO DE ENTRADA`
- `NORMALIZAR TEXTO OU BOTAO`
- `LEAD ENCONTRADO?`
- `ROTEAR TIPO DE RESPOSTA`
- `BAIXAR AUDIO META`
- `NORMALIZAR MIME AUDIO`
- `BAIXAR IMAGEM META`
- `FORMATAR DESCRICAO IMAGEM`
- `ETAPA ENVIAR CONFIRMACAO?`
- `PREPARAR SESSAO MEMORIA`
- `RESPOSTA SIM EM TEXTO?`
- `NORMALIZAR BOTAO`

Conexões e expressões foram atualizadas automaticamente para os novos nomes.

### Testes executados

- 26 testes de appointments, estado, auditoria/handoff e segurança passaram;
- typecheck completo da API passou;
- todas as referências entre nós foram validadas;
- todos os Code nodes foram compilados em auditoria estática;
- os endpoints e garantias das fases 4–8 foram preservados;
- Rubinho v1 permaneceu ativo, com a versão congelada;
- Rubinho v2 permaneceu desativado.

### Próximo limite

O disparo e a auditoria do QR Code/mensagem de confirmação devem seguir pela
camada de saída controlada da próxima fase. O agente não anuncia envio de QR
Code apenas com base na própria resposta.

## Fase 7 — saída controlada e QR Code auditável

Versão resultante do workflow: `7bb9e834-caad-4268-bb94-6f3434e4254f`  
Estado após a implementação: desativado  
Quantidade de nós: 93

### Endpoint de entrega

Adicionado ao backend:

`POST /api/agent/appointments/:id/checkin-notification`

O endpoint:

- exige uma credencial de integração válida e com escopo do cliente;
- aceita somente appointments `scheduled` ou `confirmed`;
- exige telefone e token de check-in;
- gera o QR Code no backend;
- usa o canal WhatsApp principal vinculado ao cliente;
- envia a imagem pela Cloud API;
- registra a mensagem, `wamid`, `media_id` e `media_url` na conversa;
- atualiza `last_message_at`;
- publica a mensagem em tempo real no chat;
- dispara o webhook auditável `conversation.message.sent`;
- protege retries com `Idempotency-Key` por appointment.

### Controle no workflow

Foram adicionados:

- `V2 - DEVE ENVIAR QRCODE?`
- `V2 - ENVIAR QRCODE CONTROLADO`
- `V2 - VALIDAR ENVIO QRCODE`

O disparo ocorre somente quando:

- o agente acabou de concluir o credenciamento;
- o validador não bloqueou a resposta;
- o status real é `scheduled` ou `confirmed`;
- existe `active_appointment.id`.

O texto ao lead é determinado pelo retorno real do endpoint:

- `sent`: informa que o QR Code foi enviado;
- `failed`: informa que o agendamento está salvo, mas o QR não foi enviado;
- o agente nunca define sozinho o resultado da entrega.

O estado persistente registra `checkin_notification_sent` ou
`checkin_notification_failed`, permitindo auditoria e recuperação posterior.

### Testes executados

- 15 testes do serviço de appointments passaram;
- envio de mídia, persistência na conversa e replay idempotente foram testados;
- 6 testes do guard de integração passaram;
- typecheck completo da API passou;
- Rubinho v1 permaneceu ativo e inalterado;
- Rubinho v2 permaneceu desativado.

### Condição para teste integrado

O endpoint precisa ser publicado no ambiente da API antes de executar o v2.
Até essa publicação, o workflow deve permanecer desativado.

## Fase 8 — auditoria, retries e handoff operacional

Versão resultante do workflow: `0d2460d7-92e1-4d47-a6dd-6319b423007a`  
Estado após a implementação: desativado  
Quantidade de nós: 100

### Auditoria por turno

Cada turno processado registra em
`POST /api/agent/conversations/:id/action-logs`:

- ID da mensagem recebida;
- etapa anterior e etapa resultante;
- ação tomada pelo agente;
- campos ainda faltantes;
- resultado da ferramenta;
- contador de falhas consecutivas;
- resultado do envio do QR Code;
- resumo da resposta entregue ao lead;
- mensagem de erro, quando houver.

Falhas na própria gravação de auditoria não impedem a resposta ao cliente.

### Retry controlado

As operações críticas usam até três tentativas, com intervalo de dois segundos:

- persistência do estado inicial;
- persistência do estado após o turno;
- envio controlado do QR Code;
- gravação do log de auditoria;
- solicitação de handoff.

O envio do QR mantém a mesma chave idempotente durante os retries, evitando
duplicidade quando a API conclui a operação mas a resposta de rede é perdida.

O contador é zerado após um turno bem-sucedido. Portanto, o handoff exige três
falhas realmente consecutivas.

### Handoff e alerta

Após três falhas consecutivas, desde que a conversa não esteja concluída ou
cancelada, o workflow chama:

`POST /api/agent/conversations/:id/handoff`

Isso:

- marca `handoff_required` no estado;
- registra a decisão em `agent_action_logs`;
- dispara o webhook `handoff.requested` para alertar a operação;
- envia ao lead uma mensagem curta de continuidade humana;
- impede novas respostas automáticas enquanto o handoff estiver ativo.

### Nós adicionados

- `V2 - IA PERMITIDA?`
- `V2 - ENCERRAR HANDOFF ATIVO`
- `V2 - REGISTRAR AUDITORIA`
- `V2 - RESTAURAR APOS AUDITORIA`
- `V2 - PRECISA HANDOFF?`
- `V2 - SOLICITAR HANDOFF`
- `V2 - FINALIZAR HANDOFF`

### Testes executados

- 26 testes de appointments, estado, auditoria/handoff e segurança passaram;
- typecheck completo da API passou;
- cenários de incremento, limiar e reset do retry foram validados;
- todos os Code nodes e todas as conexões foram auditados;
- Rubinho v1 permaneceu ativo e inalterado;
- Rubinho v2 permaneceu desativado.
