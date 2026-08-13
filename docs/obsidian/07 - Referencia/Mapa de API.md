# Mapa de API

> [!info] Objetivo
> Índice de consulta rápida dos contratos HTTP. A implementação fica em `apps/api/src`; este mapa organiza as rotas por responsabilidade, sem substituir Swagger nem os DTOs.

## Entrada e identidade

| Grupo | Responsabilidade |
|---|---|
| `auth` | login, renovação de sessão, recuperação e definição de senha |
| `users` | usuários e vínculos de acesso |
| `clients` | clientes, configuração e equipe |
| `client-staff` | convites, aprovações e membros do cliente |
| `health` | disponibilidade da API |

## Núcleo comercial

| Grupo | Responsabilidade |
|---|---|
| `leads` | busca, criação, edição, exclusão e perfil do lead |
| `crm` | pipelines, etapas, movimentação, histórico e timeline |
| `events` | eventos, participantes, resumo, auditoria e relatórios |
| `appointments` | agendamentos, check-in, cancelamento e reagendamento |
| `sales` | vendas e atribuição a vendedor/equipe |
| `sales-teams` | equipes e membros |
| `stores` | lojas e concessionárias |
| `vehicles` | placa, veículo, FIPE e dados automotivos |

## Atendimento

| Grupo | Responsabilidade |
|---|---|
| `conversations` | conversas, mensagens, mídia e ações humanas |
| `agent` | contexto do agente, estado, eventos, auditoria e handoff |
| `rubinho` | resolução determinística de contexto |
| `rubinho-agent` | configuração, FAQ e documentos do agente |
| `vendor` / `performance` | disponibilidade, fila, atendimento e indicadores do vendedor |
| `notifications` | notificações internas e leitura |

## Meta, WhatsApp e automações

| Grupo | Responsabilidade |
|---|---|
| `meta` | conexão, ativos, campanhas, formulários, roteamento, templates, sync e webhook |
| `integrations/v1/leads` | contrato externo de consulta e atualização de lead |
| `integrations/v1/crm` | operações externas de pipeline e etapa |
| `integrations/v1/dispatches` | registro e status dos disparos |
| `integrations/v1/config` | contexto seguro das integrações |
| `automations` | template inicial, segunda tentativa, reconciliação e entrega de credencial |
| `dispatches` | consulta operacional de disparos e e-mails |

## Operação e relatórios

| Grupo | Responsabilidade |
|---|---|
| `operations` | issues, heartbeat, termômetro, auditoria e intervenções |
| `integration-credentials` | credenciais externas criptografadas |
| `events/*report*` | painéis, relatório executivo e métricas do evento |
| `campaigns` | visão comercial das campanhas |
| `vendor-score` | score e ranking de vendedores |

## Rotas públicas

- Check-in e avaliação por token.
- Cadastro de vendedor por convite.
- Telas públicas de fila e TV do evento.

## Convenções críticas

- Rotas de automação exigem a chave prevista pelo backend; uma credencial n8n genérica não é equivalente.
- Operações mutáveis devem respeitar cliente, evento e lead do contexto autenticado.
- Disparos e reconciliações usam chaves idempotentes.
- DTOs rejeitam campos extras em rotas sensíveis; enviar somente o contrato aceito.
- `scheduled_at` deve ser ISO 8601 válido.

## Relacionamentos

- [[Backend API]]
- [[Mapa de Dados]]
- [[Auditoria e Estado]]
- [[n8n]]
- [[Runbook Operacional]]

