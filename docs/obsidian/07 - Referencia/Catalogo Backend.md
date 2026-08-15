---
tags: [referencia, backend, api, nestjs]
status: mantido
atualizado: 2026-08-15
tipo: referencia
responsavel: equipe-engenharia
criticidade: media
---

# Catálogo Backend

> [!info] Convenção
> Todas as rotas HTTP recebem o prefixo `/api` configurado em `main.ts`. A tabela omite esse prefixo. Controllers e DTOs continuam sendo a referência exata de método, payload, query, papel e resposta.

## Composição da aplicação

| Módulo | Responsabilidade | Dependências relevantes |
|---|---|---|
| `AuthModule` | JWT web/mobile, refresh, 2FA, senha, perfil e avatar | Passport, JWT, storage, password setup |
| `UsersModule` | usuários, equipe do cliente e aprovações | password setup |
| `ClientsModule` | tenancy, configuração e cadastro de clientes | Prisma |
| `LeadsModule` | lead, importação, recepção, fila e atendimento | CRM, score, realtime, timeline, clientes |
| `CrmModule` | pipelines, etapas, movimentação, relatórios e webhook do cliente | timeline e integração |
| `EventsModule` | evento, dashboard TV, relatório executivo e auditoria | clientes |
| `AppointmentsModule` | agenda, confirmação, check-in, reagendamento e no-show | CRM, realtime, score |
| `SalesModule` | venda, venda rápida, edição, exclusão e compradores | score, realtime, dispatch |
| `SalesTeamsModule` | equipes, membros e ordem da fila | Prisma |
| `ScoreEventsModule` | pontuação e ranking | clientes |
| `ServiceRatingsModule` | avaliação por vendedor/evento | clientes e score |
| `ConversationsModule` | conversas, mensagens, mídia e ações do agente | storage, realtime e clientes |
| `AgentModule` | estado determinístico, auditoria e handoff | CRM e agenda |
| `RubinhoModule` | agentes, FAQ e documentos de conhecimento | clientes |
| `MetaModule` | OAuth, ativos, campanha, roteamento, WhatsApp, sync e webhook | BullMQ, clientes, integração |
| `IntegrationModule` | API para n8n/agentes, credenciais e automações | diversos módulos de domínio |
| `OperationsModule` | issues, heartbeat, termômetro e auditoria operacional | Prisma |
| `RealtimeModule` | Socket.IO autenticado e eventos de sala | JWT, clientes, notificações |
| `PerformanceModule` | Web Vitals, API timing e conexões do banco | Prisma |
| `VehiclesModule` | estoque e catálogo de marca/modelo | clientes |
| `StoresModule` | lojas do cliente | clientes |
| `CampaignsModule` | listagem comercial de campanhas | clientes |
| `CoursesModule` | cursos, aulas e progresso | Prisma |
| `NotificationsModule` | caixa interna e leitura | Prisma |
| `PublicModule` | avaliação, convite e cadastro por token | usuários |
| `HealthModule` | probe de saúde | Prisma/serviços de infraestrutura |

`DispatchTrackingModule`, `LeadTimelineModule` e `WhatsappContextModule` são módulos de apoio importados por módulos de negócio, mesmo não aparecendo diretamente na lista raiz do `AppModule`.

## Segurança transversal

1. `JwtAuthGuard`, `UserAwareThrottlerGuard` e `RolesGuard` são globais e executam nesta ordem.
2. Rotas públicas usam o decorator próprio para dispensar JWT.
3. Papel não substitui tenancy: services devem restringir por `client_id` e, quando necessário, por evento.
4. Integrações usam credencial por cliente, chave de automação ou chave específica de ingestão Meta.
5. A chave global legada só é aceita em produção quando explicitamente habilitada e vinculada a um cliente.
6. `ValidationPipe` usa whitelist e rejeita propriedades não declaradas.
7. Throttling padrão: 120 requisições por minuto, com identidade consciente do usuário.

## Contratos HTTP por controller

### Identidade, usuários e clientes

| Base | Operações |
|---|---|
| `auth` | login web/mobile, verificação 2FA, refresh web/mobile, logout web/mobile, forgot/reset/setup de senha, `me`, troca de senha, perfil e avatar |
| `users` | listar, criar, obter, atualizar, ativar/desativar e excluir |
| `client-staff` | listar colaboradores, aprovar/rejeitar e reenviar e-mail de setup |
| `clients` | listar, obter, criar, atualizar, excluir e rotacionar link público de vendedor |
| `clients/:clientId/integration-credentials` | listar, criar, rotacionar e revogar credenciais por cliente |

### Comercial e evento

| Base | Operações |
|---|---|
| `leads` | exportar/importar/listar, fila da recepção, verificar telefone, lookup, check-in por token, FIPE por placa, disponibilidade, atendimento atual, status do vendedor, detalhe, criação, atribuição, encerramento, chamada/troca/aceite/recusa/expiração de vendedor, edição e exclusão |
| `crm` | tarefas/próximas ações, pipelines, relatório do dashboard, contagens por etapa, histórico/timeline, movimentação e limpeza de idempotência |
| `events` | listar, auditoria, resumo ativo, relatório operacional, dashboard TV, relatório executivo, detalhe, criação, edição e exclusão |
| `agent/appointments` | criar, confirmar, notificar check-in, reagendar, cancelar e marcar no-show por integração/agente |
| `appointments` | criar pelo painel, check-in e reagendar |
| `sales` | minhas vendas, listar, compradores, pendentes, criar, venda rápida, editar e excluir |
| `sales-teams` | listar/criar/editar/excluir equipe, adicionar/remover membro e reordenar membros |
| `vendor` | resumo de score e ranking |
| `service-ratings` | resumo e avaliações por vendedor |
| `campaigns` | listagem filtrada de campanhas |
| `stores` | CRUD de lojas |
| `vehicles` | CRUD, sincronização/importação do catálogo e alteração de status em lote |

### Conversa, agente e conteúdo

| Base | Operações |
|---|---|
| `conversations` | listar, garantir conversa, listar mensagens, baixar mídia, ações do agente, enviar texto e enviar mídia |
| `agent` | resolver contexto WhatsApp, disponibilidade do evento, persistir estado, registrar ação e solicitar handoff |
| `rubinho` | CRUD do agente, FAQ e documentos |
| `courses` | catálogo, progresso próprio/do vendedor, detalhe e progresso da aula |
| `notifications` | listar, marcar todas/uma como lida e limpar |

### Meta

| Rota relativa | Finalidade |
|---|---|
| `POST meta/connect/start` | iniciar conexão de cliente |
| `POST meta/gestor/connect/start` | iniciar conexão de gestor |
| `GET meta/gestor/status` / `POST meta/gestor/disconnect` | estado e desligamento do gestor |
| `GET meta/connect/callback` / `callback/window` | concluir OAuth |
| `GET meta/businesses` | listar negócios/ativos disponíveis |
| `POST meta/select-assets` | persistir seleção de ativos |
| `GET/PUT meta/whatsapp/channels` | consultar/configurar canais WhatsApp por cliente |
| `GET meta/status/:clientId` / `summary/:clientId` | saúde e resumo da conexão |
| `GET meta/campaigns-report/:clientId` | métricas de campanha |
| `GET meta/campaign-assignments/:clientId` | atribuições de campanha |
| `GET .../linked`, `POST meta/campaign-assignments`, `DELETE .../:metaCampaignId` | consultar/vincular/desvincular campanhas |
| `GET/PUT meta/lead-routing/:clientId` | regras de roteamento de formulário |
| `GET .../whatsapp-templates` | templates disponíveis para a regra |
| `DELETE meta/lead-routing/:clientId/:formId` | remover regra |
| `GET meta/events/:eventId/spend` | investimento do evento |
| `POST meta/sync/full` / `sync/leads` | enfileirar sincronização |
| `POST meta/disconnect` | desconectar cliente |
| `GET/POST meta/webhook` | verificação e ingestão Meta |

### Integração e automação

| Base/rota | Finalidade |
|---|---|
| `POST integrations/v1/whatsapp/text` | enviar texto WhatsApp pelo canal resolvido |
| `GET/POST integrations/v1/dispatches` | consultar/registrar a jornada de um disparo |
| `GET integrations/v1/events`, `GET .../events/:id` | descobrir evento e configuração operacional |
| `GET/POST/PATCH integrations/v1/leads` | consultar, criar, reconciliar e atualizar lead |
| `POST integrations/v1/leads/facebook` | ingestão explícita de lead Meta |
| `POST integrations/v1/leads/facebook/auto` | ingestão com resolução automática |
| `POST integrations/v1/leads/:id/crm/*` | mover por etapa, sufixo ou código |
| `GET integrations/v1/rubinho/config` | configuração segura do agente |
| `POST integrations/v1/rubinho/resolve-context` | resolver contexto multicliente/WhatsApp |
| `POST integrations/v1/operations/issues` | registrar exceção externa |
| `POST integrations/v1/operations/heartbeat` | informar saúde de workflow |
| `GET dispatches/emails` | histórico de e-mails/disparos para o painel |

As automações em `integrations/v1/automations` expõem entrega de credencial por e-mail/WhatsApp, reconciliação de agendamento, estado e busca de template inicial, piloto, status de mensagens WhatsApp, segunda tentativa por e-mail e recuperação de no-show.

### Operação, desempenho e público

| Base | Operações |
|---|---|
| `operations` | dashboard, termômetro do Rubinho, leads de template, auditoria da conversa e resolução/reabertura de issue |
| `performance` | receber Web Vitals, resumos web/API e conexões do banco |
| `health` | saúde da API |
| `public` | preview de check-in, ler/enviar avaliação e ler/enviar cadastro de vendedor por token |

## Filas e processamento assíncrono

- BullMQ compartilha Redis, prefixado por `BULLMQ_PREFIX` (padrão `bullmq`).
- O processador Meta executa sincronizações e renovação relacionadas ao domínio.
- O processador de webhook CRM executa entregas externas com retry.
- A conexão mantém fila offline e reconexão com backoff; desligá-la impede o worker de iniciar corretamente.
- Falha do Redis não deve virar rejeição não tratada, mas deixa jobs críticos sem consumo e precisa de alerta.

## Realtime

Socket.IO autentica a conexão, separa salas por usuário, cliente e contexto e publica atualizações de lead, atendimento, fila, conversa, venda e notificações. Evento em tempo real é um sinal de invalidação; após reconexão, a interface deve buscar o estado canônico pela API.

## Onde alterar

| Mudança | Arquivos esperados |
|---|---|
| Novo campo persistido | schema, migração, DTO, service, tipos/service/tela do desktop e testes |
| Nova rota | DTO, controller, service, teste e service do frontend/integrador |
| Novo papel/permissão | enum/modelo, guard/service, política de rota, menu e testes de autorização |
| Novo job | producer, processor, idempotência, retry, observabilidade e runbook |
| Novo evento realtime | emissor, gateway/event service, consumidor e recuperação após reconnect |

## Relacionamentos

- [[Backend API]]
- [[Mapa de API]]
- [[Catalogo do Banco]]
- [[Realtime e Filas]]
- [[Configuracao e Variaveis]]
