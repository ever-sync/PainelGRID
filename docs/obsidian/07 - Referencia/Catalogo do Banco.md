---
tags: [referencia, banco, prisma, postgresql]
status: mantido
atualizado: 2026-08-15
tipo: referencia
responsavel: equipe-engenharia
criticidade: media
---

# Catálogo do Banco

> [!info] Fonte da verdade
> Tipos, nulabilidade, defaults, índices e relações exatos estão em `apps/api/prisma/schema.prisma`. Esta nota explica a função operacional dos 58 models e dos enums do schema atual.

## Identidade e tenancy

| Model | Papel |
|---|---|
| `User` | identidade, papel, cliente, categorias de vendedor, aprovação, autenticação externa e relações de autoria/atribuição |
| `Client` | tenant principal; agrega configuração, usuários, leads, eventos, integrações e operação |
| `IntegrationCredential` | chave externa armazenada por hash, com prefixo, expiração, revogação, último uso e escopo de clientes permitido |
| `Store` | loja/concessionária do cliente, endereço, canais, horário e status |
| `Notification` | notificação interna por usuário/cliente, tipo, payload, leitura e expiração |

`IntegrationCredential.client_id` define o proprietário. `allowed_client_ids` permite escopo adicional explícito; não deve ser interpretado como acesso global.

## Lead e CRM

| Model | Papel |
|---|---|
| `Lead` | agregado central: identidade, origem, evento, campanha, CRM, confirmação, vendedor, equipe, veículo e atribuição |
| `CrmPipeline` | funil por cliente, identificado também por código estável |
| `CrmStage` | etapa ordenada, colorida e final/não final |
| `CrmHistory` | mudança de etapa com origem, autor e notas |
| `LeadTimeline` | eventos normalizados da jornada do lead |
| `CrmTask` | próxima ação do lead, com tipo, prazo, responsável, criador, status e conclusão |
| `Campaign` | campanha comercial local e status |
| `CampaignVendor` | associação de vendedores a campanhas |

O funil padrão atual possui 24 etapas, em ordem: `NOVO_LEAD`, `TENTATIVA_CONTATO`, `TENTATIVA_2_EMAIL`, `LIGACAO`, `EM_CONTATO`, `PRE_AGENDADO`, `PRESENCA_AGENDADA`, `ENVIAR_CONFIRMACAO`, `AGENDADOS_CONFIRMADOS`, `PRESENCA_REAGENDADA`, `PRESENCA_CANCELADA`, `LEMBRETE`, `RECUPERACAO_VENDA`, `RECUPERACAO_PRESENCA`, `RECUPERACAO_RESPONDIDA`, `DESINTERESSE`, `AGUARDANDO`, `PRESENCA_CONFIRMADA`, `COMPRARAM`, `LEAD_PERDIDO`, `LEAD_AUSENTE`, `ATENDIMENTO_ENCERRADO`, `FEEDBACK` e `RESPONDEU_FEEDBACK`.

> [!warning] Duas máquinas de estado
> `Lead.crm_stage_id` representa a etapa comercial. `Lead.confirmation_status` representa confirmação/presença. Elas se correlacionam, mas não são equivalentes.

### Próximas ações

`CrmTask` permite planejar ligação, WhatsApp, agendamento, proposta, follow-up ou outra ação. Os estados são `pending`, `completed` e `cancelled`. Os índices priorizam agenda do cliente, tarefas do responsável e histórico do lead. Criar e concluir tarefas também amplia a timeline com `task_created`, `task_completed` e `action_recorded`.

## Evento, agenda e resultado

| Model | Papel |
|---|---|
| `Event` | evento, período/dias, capacidade, metas, investimento, imagens e permissões operacionais |
| `EventParticipant` | participação independente de um cliente em um evento |
| `Appointment` | agendamento, status, canal, fonte/ator, check-in, QR e cadeia de reagendamento |
| `Sale` | venda real ligada a um único agendamento, lead, vendedor, tipo, modelo, valor, equipe e número de pedido |
| `ServiceRating` | avaliação de atendimento, evento, NPS e trilha de pedido de review |
| `ScoreEvent` | evento idempotente de pontuação: contato, agendamento, check-in ou venda |

### Permissões do evento

O `Event` controla permissões específicas e todas têm default seguro `false` no schema atual:

- vendedor: check-in, FIPE, criar/editar/excluir venda e editar/excluir o próprio lead;
- recepção: criar/editar/excluir venda, editar/excluir lead e cadastro rápido;
- evento: exigência de pulseira.

Interface e API devem validar a mesma permissão; esconder o botão não autoriza nem protege a operação.

## Atendimento presencial

| Model | Papel |
|---|---|
| `VendorAvailability` | estado atual do vendedor (`online`, `away`, `busy`) e última atribuição |
| `VendorAttendance` | oferta/sessão entre lead e vendedor, com evento, expiração, autor e resultado |
| `SalesTeam` | equipe do cliente, opcionalmente vinculada ao evento, com identidade visual |
| `SalesTeamMember` | vínculo do vendedor e suas posições na fila |

`SalesTeamMember.queue_position` preserva a posição geral. `queue_positions` é JSON para posições independentes por categoria de vendedor. A ordenação deve permanecer única e coerente dentro do mesmo escopo.

## Conversa, agente e dispatch

| Model | Papel |
|---|---|
| `Conversation` | conversa de um lead/cliente, canal `whatsapp` ou `internal` e contexto operacional |
| `Message` | mensagem, autoria (`system`, `user`, `lead`), IDs externos e mídia |
| `ConversationState` | estado determinístico persistido do Rubinho e última oferta/evento |
| `AgentActionLog` | decisão, ferramenta, entrada, saída, erro e correlação do agente |
| `DispatchEvent` | ciclo de envio: fila, envio, entrega, leitura, resposta, falha e conversão |
| `WebhookEvent` | recepção e processamento idempotente de eventos externos |
| `ApiIdempotencyRequest` | resposta/estado de uma operação mutável repetível |
| `OperationalIssue` | exceção operacional deduplicável e resolvível |
| `OperationalHeartbeat` | sinal de vida por workflow/componente |

`DispatchEvent` é único por `client_id + dispatch_key` e pode apontar para evento, conversa, mensagem, agendamento e venda. Ele é a base para provar que uma comunicação foi enviada e se converteu.

## Meta e atribuição

| Model | Papel |
|---|---|
| `FacebookAdAccount` | conta de anúncios descoberta/conectada |
| `MetaConnection` | conexão OAuth e estado dos tokens |
| `MetaAssetSelection` | ativos escolhidos pelo cliente |
| `MetaLeadRoutingRule` | formulário → cliente/evento/pipeline/etapa/template/canal |
| `MetaCampaign` | campanha sincronizada |
| `MetaCampaignAssignment` | campanha vinculada a evento e nome operacional |
| `MetaAdSet` | conjunto de anúncios |
| `MetaAd` | anúncio |
| `MetaCreative` | criativo e imagem |
| `MetaLeadForm` | formulário de lead |
| `MetaLeadImport` | controle de importação/deduplicação de leadgen |
| `MetaDailyInsight` | métricas diárias de mídia |
| `WhatsAppAttributionEvent` | eventos de atribuição do canal WhatsApp |
| `MetaSyncJob` | estado persistido de sincronização |

Roteamento não pode usar apenas telefone ou formulário sem validar tenant, ativos, regra ativa e evento. O canal WhatsApp configurado resolve o `phone_number_id` correto quando um mesmo número/ambiente atende mais de um cliente.

## Conteúdo, conhecimento e veículos

| Model | Papel |
|---|---|
| `RubinhoAgent` | configuração e prompt do agente por cliente |
| `RubinhoAgentEvent` | eventos atendidos por um agente |
| `RubinhoAgentFaq` | perguntas e respostas do conhecimento |
| `RubinhoAgentDocument` | documentos textuais do conhecimento |
| `Course` | curso de capacitação |
| `Lesson` | aula ordenada |
| `CourseProgress` | progresso de usuário/aula |
| `Vehicle` | estoque do cliente, imagem/galeria, preço, km, condição, categoria e status |
| `VehicleCatalog` | catálogo global normalizado de marca/modelo, único por códigos |

`VehicleCatalog` auxilia seleção e padronização; não substitui `Vehicle`, que representa o estoque comercial do cliente, nem os campos de intenção/troca armazenados em `Lead`.

## Observabilidade

| Model | Papel |
|---|---|
| `WebVitalMetric` | LCP, CLS, INP, FCP e TTFB reportados pelo frontend |
| `ApiRequestMetric` | latência, status, rota e contexto de requisições da API |

Retenção e amostragem são configuráveis. Métricas não devem carregar corpo, token ou PII desnecessária.

## Legado

`leads_bitrix24` representa uma tabela composta legada com RLS e exige cuidado adicional em migrações. Não é o agregado `Lead` do produto atual.

## Enums atuais

| Enum | Valores/uso |
|---|---|
| `Role` | `gestor`, `cliente`, `vendedor`, `recepcao` |
| `VendorCategory` | `novo`, `semininovo`, `pdc`, `consorcio`, `assinatura` |
| `VendorOperationalStatus` | `online`, `away`, `busy` |
| `VendorAttendanceStatus` | `pending`, `accepted`, `rejected`, `expired`, `finished` |
| `LeadSource` | Meta/Facebook, formulário, WhatsApp, Excel ou manual |
| `ConfirmationStatus` | `pending`, `scheduled`, `confirmed`, `cancelled`, `checked_in`, `closed` |
| `EventStatus` | `draft`, `active`, `completed`, `cancelled` |
| `AppointmentStatus` | proposta, agendado, confirmado, cancelado, concluído, no-show ou reagendado |
| `AppointmentChannel` | WhatsApp, interno ou manual |
| `AppointmentSource` | agente n8n, gestor, cliente, vendedor, recepção ou sistema |
| `AppointmentActorType` | usuário, sistema ou agente externo |
| `DistributionMethod` | round-robin, ponderado ou manual |
| `ConversationChannel` | `whatsapp`, `internal` |
| `SenderType` | sistema, usuário ou lead |
| `SaleType` | novo, seminovo, venda direta ou PCD |
| `ScoreEventKind` | agendado, check-in, venda ou contato |
| `LeadTimelineEventType` | criação, etapa, status, atribuição, tag, nota ou mensagem |
| `LeadTimelineOrigin` | CRM, WhatsApp, vendedor, gestor, automação, integração, n8n ou sistema |
| `CrmTaskType` | ligação, WhatsApp, agendamento, proposta, follow-up ou outro |
| `CrmTaskStatus` | pendente, concluída ou cancelada |

O schema também possui enums de status de campanha, conta/conexão Meta e job de sincronização.

## Invariantes e exclusão

1. Toda consulta operacional deve carregar o tenant correto.
2. Telefone ativo é deduplicado no escopo cliente + evento, não globalmente.
3. Venda possui agendamento único; edição/exclusão deve reconciliar lead, score e realtime.
4. Score usa chaves únicas para impedir pontos duplicados.
5. Reagendamento preserva a cadeia entre appointments.
6. Exclusão lógica do lead usa `deleted_at`; operações que exigem desaparecimento completo tratam dependências em transação.
7. Relações com `Cascade` apagam dependências; `SetNull` preserva evidência quando a entidade associada deixa de existir.
8. Migrações já aplicadas são imutáveis; correções entram em nova pasta cronológica.

## Índices de desempenho importantes

- Leads: cliente/telefone, cliente/data, evento/status de confirmação e pipeline/etapa.
- Eventos: cliente/status/data.
- Agendamentos: cliente/status/data.
- Vendas e score: cliente/data e cliente/vendedor/tipo.
- Dispatch: cliente/evento/lead por data e ID do provedor.
- Atendimento: cliente, lead, vendedor, expiração e status.

## Relacionamentos

- [[Banco de Dados]]
- [[Mapa de Dados]]
- [[Catalogo Backend]]
- [[Leads e CRM]]
- [[Vendedores e Atendimento]]
- [[Scripts e Migracoes]]
