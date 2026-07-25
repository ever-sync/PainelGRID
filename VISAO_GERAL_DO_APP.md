# PainelGRID (EverSync) — Visão Geral do App

## O que é

SaaS de gestão de leads, eventos e vendas voltado principalmente pra concessionárias/lojas de veículos. A EverSync (empresa dona do produto) vende acesso ao painel pra esses clientes (donos de loja), que por sua vez cadastram seus próprios vendedores e recepcionistas dentro da conta.

**Fluxo de negócio ponta a ponta**: um lead chega (Facebook Ads, WhatsApp, formulário, importação manual) → cai no funil de CRM → é atendido no WhatsApp pelo agente de IA (Rubinho) ou por um vendedor humano → pode ser convidado/agendado pra um evento físico (feirão, test-drive) → confirma presença → faz check-in no dia → fecha venda. Cada etapa gera pontuação (`ScoreEvent`) usada pra ranking de vendedores.

Existe também uma tabela legada `leads_bitrix24` no banco — resquício de uma migração/integração anterior com o CRM Bitrix24, hoje isolada do fluxo principal.

## Arquitetura técnica

Monorepo Node.js:

```
apps/
  api/       Backend NestJS + Prisma + PostgreSQL (Supabase)
  desktop/   Frontend React + Vite + Tailwind (também empacotado como app nativo via Capacitor)
packages/
  ui/        Componentes compartilhados
  types/     Tipos compartilhados
  utils/     Utilitários compartilhados
```

- **Banco**: PostgreSQL via Supabase — `DATABASE_URL` usa o pooler (pgbouncer, porta 6543) pra runtime; `DIRECT_URL` (porta 5432) só pra migrations, não é alcançável de fora da rede Supabase/Railway.
- **ORM**: Prisma 5. ~45 models, todos multi-tenant por `client_id`.
- **Redis**: usado pra 4 coisas — cache de dados de cliente (`RedisService`), sessão/2FA/refresh-token/rate-limit de login, filas de job assíncrono via **BullMQ** (`webhook-dispatch`, `meta-sync`), e leitura de snapshot do dashboard de TV de evento.
- **E-mail**: Resend, via API HTTP direta (`https://api.resend.com/emails`) — não SMTP, porque a Railway bloqueia portas SMTP de saída (465/587) por padrão.
- **Storage de mídia**: bucket S3-compatível (Railway Buckets) pra cache de mídia do WhatsApp, evitando depender da URL temporária da Meta.
- **Deploy**: Railway, projeto `GPdeVendas`, 2 serviços (API e frontend) + Postgres + Redis, com réplicas.
- **Realtime**: WebSocket (Socket.IO) — `RealtimeEventsService` emite eventos de novo lead, nova mensagem, mudança de estágio etc. pros clientes conectados.
- **Automação externa**: n8n orquestra o agente de IA (function-calling) pra criar agendamentos — visível no enum `AppointmentSource.n8n_ai_agent` e nos endpoints de `/api/agent/*`.

## Perfis de usuário (roles)

Enum `Role` no schema: `gestor`, `cliente`, `vendedor`, `recepcao`. Cada um tem rotas protegidas por `RoleGuard` no frontend e `@Roles()` + `RolesGuard` na API.

| Papel | Quem é | Escopo de dados | Páginas principais |
|---|---|---|---|
| **gestor** | Equipe interna EverSync | Todos os clientes | Dashboard, Clientes, CRM, Relatório, Chat, Eventos (+ TV Dashboard/Queue), Cursos, Rubinho (config do agente), Perfil de vendedor |
| **cliente** | Dono da loja/concessionária | Só a própria empresa (`client_id`) | Dashboard, Leads, Eventos, Vendedores, Campanhas, Veículos, Cursos |
| **vendedor** | Vendedor cadastrado pelo cliente | Só os próprios leads atribuídos | Dashboard, Leads, Vendas, Ranking, Cursos |
| **recepcao** | Recepção de evento presencial | Check-in do evento | Check-in |

## Módulos — o que cada um faz e principais endpoints

### Leads (`/api/leads`)
CRUD completo + `export` (CSV), `import` (Excel), `check-phone` (evita duplicata), `lookup`, `fipe/:plate` (consulta tabela FIPE), `check-in-by-token` (check-in via QR/link), `assign-to-me`, `close-attendance`, `call-vendor`.

**Modelo `Lead`** (principais campos): `source` (facebook_ads/form_page/whatsapp/import_excel/manual), `crm_stage_id` + `crm_pipeline_id`, `confirmation_status` (pending/scheduled/confirmed/cancelled/checked_in/closed), `assigned_vendor_id`, `sold_by_vendor_id`, `event_interest_id`, `team_id`, `checkin_token`, `wristband_number` (pulseira do evento), dados de veículo (`vehicle_plate`, `vehicle_model`, `vehicle_year`), `tags[]`, `facebook_lead_id` (rastreio de origem Meta), soft-delete (`deleted_at`).

### CRM (`/api/crm`) — o núcleo do produto
- **Pipelines customizáveis por cliente** (`CrmPipeline` → `CrmStage[]`): cada empresa define sua própria sequência de estágios, com `display_order`, `color` e `is_final_stage`. Em produção um cliente chegou a ter ~24 estágios (Novo Lead → Tentativa Contato → Ligação → Em Contato → Pré-agendamento → Presença Agendada → Enviar Confirmação → Confirmados → Presença Cancelada/Reagendada → Recuperação de Venda/Presença → Compraram → Lead Perdido/Ausente → Feedback...).
- `POST /crm/leads/:leadId/move` e `POST /crm/leads/bulk-move` — move lead(s) de estágio; toda movimentação vira uma linha em `CrmHistory` (quem mudou, de onde, pra onde) e também em `LeadTimeline` (histórico genérico do lead, que também registra `created`, `status_changed`, `assigned`, `tag_added`, `note`, `message`, com origem `crm`/`whatsapp`/outros).
- `GET /crm/leads/stage-counts` — contagem de leads por estágio (alimenta o board Kanban).
- `GET /crm/reports/dashboard` — funil agregado.
- Board Kanban no frontend (`@dnd-kit`) com drag-and-drop entre colunas, modal de detalhe do lead com stepper visual do estágio.
- Mudança de estágio dispara **webhook assíncrono** pro sistema do cliente (fila `webhook-dispatch` no BullMQ, com cleanup diário de idempotência via cron).

### Eventos (`/api/events`)
Feirões/test-drives presenciais. Campos: `event_date`, `location`, `capacity`, `status` (draft/active/completed/cancelled), `sales_target`, `require_wristband`, `event_days` (JSON, pra eventos multi-dia), `image_urls[]`.
- `GET /events/active-summary` — resumo dos eventos ativos.
- `GET /events/:id/dashboard-tv` — dados pro **Dashboard de TV** (tela grande na recepção com métricas ao vivo: fila, confirmados, ranking).
- `EventParticipant` — vínculo evento↔cliente (multi-cliente por evento, ex. feirão com várias lojas).
- Check-in dedicado (papel `recepcao`, `/api/leads/check-in-by-token`) — tela de leitura de QR/token pra confirmar presença física.

### Agendamentos (`/api/agent/appointments`, `/api/appointments`)
`Appointment` vincula lead + evento + conversa. Status: proposed/scheduled/confirmed/cancelled/completed/no_show/rescheduled. `source` indica quem criou: `n8n_ai_agent` (o agente de IA agenda sozinho via function-calling), `gestor`/`cliente`/`vendedor`/`recepcao`/`system`. Suporta cadeia de reagendamento (`rescheduled_from_appointment_id`). Endpoints: `confirm`, `reschedule`, `cancel`, `no-show`, mais `check-in` (painel de recepção).

### Vendas (`/api/sales`) e Pontuação
`Sale` (tipo NOVO/SEMINOVO/VENDA_DIRETA/PCD, valor, vinculada 1:1 a um `Appointment`) gera automaticamente `ScoreEvent` (kind: scheduled/checked_in/sold/contacted, com pontos) — é o que alimenta o **ranking de vendedores** e os relatórios de conversão. `GET /sales/mine` lista as vendas do vendedor logado.

### Vendedores e equipes (`/api/sales-teams`, `/client-staff`)
`SalesTeam` agrupa vendedores (`SalesTeamMember`), pode estar vinculada a um evento específico (equipe temporária de feirão) e tem logo própria. CRUD completo + adicionar/remover membro.

### Campanhas — dois conceitos diferentes que usam o mesmo nome
1. **`Campaign` (interna, `/api/campaigns`)**: regra de **distribuição automática de leads** entre vendedores — `lead_filter_rules` (JSON) define quais leads entram, `distribution_method` define como distribuir (`round_robin`, `weighted` via peso em `CampaignVendor`, ou `manual`), com limite de leads por vendedor (`max_leads`).
2. **Campanhas do Meta Ads (`/api/meta`)**: sincronização real de campanhas do Facebook/Instagram Ads (ver seção seguinte). É o que aparece na aba "Campanhas" do Relatório e no painel do cliente.

### Meta Ads / Facebook (`/api/meta`)
Integração via Graph API, com OAuth (`connect/start`, `connect/callback`) tanto no nível do **gestor** (`meta_gestor_*` no `User` — um token de Business Manager pra todos os clientes que o gestor administra) quanto por cliente individual (`MetaConnection`).
- Hierarquia sincronizada: `MetaConnection` → `MetaCampaign` → `MetaAdSet` → `MetaAd` (+ `MetaCreative`, `MetaLeadForm`), com `raw_payload` (JSON bruto da API) guardado pra auditoria/reprocessamento.
- `MetaDailyInsight` — métricas diárias por nível de granularidade (campanha/adset/ad): investimento, leads, custo por lead, impressões, conversas iniciadas, custo por conversa, contas alcançadas.
- `MetaLeadImport` — importação de leads de formulários nativos do Facebook direto pro CRM.
- `MetaSyncJob` — rastreio de execuções de sincronização (status pending/running/completed/failed), disparadas via fila `meta-sync` no BullMQ; inclui renovação automática diária de token de acesso.
- `WhatsAppAttributionEvent` — atribuição de conversas de WhatsApp a uma campanha/anúncio específico (rastreio de origem do clique).
- `POST /meta/webhook` — recebe eventos em tempo real da Meta (verificação de assinatura HMAC).

### Conversas / WhatsApp (`/api/conversations`)
`Conversation` (canal whatsapp/internal) tem `Message[]` (sender_type: system/user/lead). Envio/recebimento via WhatsApp Business Cloud API.
- `GET /conversations/messages/:messageId/media` — serve mídia (foto/áudio/documento): primeiro tenta o bucket S3 (cache), senão busca da Meta e cacheia pra próxima vez.
- `POST /conversations/:id/media` — envia mídia pro lead (salva simultaneamente no bucket).
- Enviar mensagem como usuário força `handoff_required = true` no `ConversationState` (atendimento manual assume da IA) e dispara webhook `handoff.requested`.

### Rubinho — agente de IA (`/api/rubinho`, `/api/agent`)
`RubinhoAgent` por cliente: `prompt` (system prompt), `tone`, `delay_minutes` (espera antes de responder, pra parecer humano), `status` (ligado/desligado), vinculado a eventos específicos (`RubinhoAgentEvent`) e com base de conhecimento própria: `RubinhoAgentFaq[]` (pergunta/resposta) e `RubinhoAgentDocument[]` (conteúdo livre).
- `ConversationState` guarda o "estado de conversa" da IA por lead: intenção atual, se está aguardando confirmação, último evento/horário oferecido, se precisa de handoff humano (e por quê).
- `AgentActionLog` — auditoria de toda decisão da IA: provider/model usado, tipo de gatilho, tipo de decisão, confiança, resumo de input/output, payload da ação, status do resultado, erro (se houver).
- `/api/agent/*` são os endpoints que o **n8n** (orquestrador externo da IA) consome: contexto da conversa, disponibilidade de horários de evento, atualizar estado, logar ação, forçar handoff.

### Veículos (`/api/vehicles`)
Catálogo/estoque do cliente: marca, modelo, ano/km, preço, lojas, categoria, condição, galeria de imagens, tags. Usado pra vincular o interesse do lead a um veículo específico.

### Cursos (`/api/courses`)
`Course` → `Lesson[]`, com `CourseProgress` por usuário (conclusão de aula). `GET /courses/progress/vendor` dá visão agregada pro gestor/cliente acompanhar o treinamento da equipe.

### Avaliação de atendimento (`/api/service-ratings`)
Nota + comentário do cliente final sobre o vendedor, opcionalmente vinculada a um evento. `GET /summary` e `GET /vendor/:vendorId` pra visão agregada.

### Relatórios (frontend, `/gestor/relatorio`)
3 abas: **Cliente** (funil geral, visão consolidada), **Eventos** (métricas por evento com seletor pra filtrar um evento específico — inclusive o funil do topo se ajusta ao evento escolhido), **Campanhas** (tabela hierárquica Campanha → Conjunto de Anúncios → Anúncio, com métricas do Meta Ads).

### Integrações externas via API (`/api/integrations/v1`)
Pra sistemas terceiros (n8n, scripts do cliente) criarem/consultarem leads e moverem estágio de CRM sem precisar de login de usuário — autenticação por **API key por cliente** (`IntegrationCredential`, com rotação e revogação, endpoint em `/api/clients/:clientId/integration-credentials`). Existe também uma chave legada global (`LEADFLOW_INTEGRATION_API_KEY` + `LEADFLOW_INTEGRATION_CLIENT_ID`), pensada só como ponte de migração até todo mundo ter credencial própria.

## Autenticação e segurança
- JWT (access token curto, 15min + refresh token 7 dias), refresh token guardado no Redis com TTL — `POST /auth/refresh` e variantes mobile.
- **2FA obrigatório por e-mail** em todo login: senha correta gera um código de 6 dígitos (`POST /auth/2fa/verify`) antes de liberar sessão — sem isso, não loga.
- Rate-limit de tentativas de login (`registerFailedLogin`/`clearFailedLoginAttempts` no Redis).
- `RolesGuard` (por papel) + `JwtAuthGuard` globais, mais checagem de escopo por `client_id` em cada service (um vendedor não acessa leads de outro cliente, etc.).
- `ApiIdempotencyRequest` — evita processar a mesma requisição de integração duas vezes (chave de idempotência + hash do payload).

## Apps móveis
O mesmo frontend React roda como app nativo (iOS/Android) via **Capacitor**, reaproveitando toda a base de código do painel web (rotas `/auth/mobile/*` dedicadas pra login/refresh/logout nesse contexto).
