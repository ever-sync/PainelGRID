---
tipo: referencia
status: gerado
atualizado: 2026-08-15
responsavel: equipe-engenharia
criticidade: alta
tags: [painelgrid, referencia, inventario, automatico]
---

# Inventário Automático

> [!warning] Arquivo gerado
> Não edite manualmente. Execute `npm run docs:sync` após alterar controllers, rotas do frontend, schema Prisma ou variáveis de ambiente.

## Resumo

| Item | Quantidade |
|---|---:|
| Rotas HTTP | 233 |
| Rotas do frontend | 55 |
| Models Prisma | 58 |
| Enums Prisma | 26 |
| Variáveis do backend detectadas | 70 |
| Variáveis públicas do frontend | 5 |

## Rotas HTTP

| Método | Rota | Controller |
|---|---|---|
| `POST` | `/api/agent/appointments` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/appointments/:id/cancel` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/appointments/:id/checkin-notification` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/appointments/:id/confirm` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/appointments/:id/no-show` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/appointments/:id/reschedule` | `apps/api/src/modules/appointments/appointments.controller.ts` |
| `POST` | `/api/agent/conversations/:id/action-logs` | `apps/api/src/modules/agent/agent.controller.ts` |
| `POST` | `/api/agent/conversations/:id/handoff` | `apps/api/src/modules/agent/agent.controller.ts` |
| `POST` | `/api/agent/conversations/:id/state` | `apps/api/src/modules/agent/agent.controller.ts` |
| `GET` | `/api/agent/events/availability` | `apps/api/src/modules/agent/agent.controller.ts` |
| `GET` | `/api/agent/whatsapp/context` | `apps/api/src/modules/agent/agent.controller.ts` |
| `POST` | `/api/appointments` | `apps/api/src/modules/appointments/panel-appointments.controller.ts` |
| `POST` | `/api/appointments/:id/check-in` | `apps/api/src/modules/appointments/panel-appointments.controller.ts` |
| `POST` | `/api/appointments/:id/reschedule` | `apps/api/src/modules/appointments/panel-appointments.controller.ts` |
| `POST` | `/api/auth/2fa/verify` | `apps/api/src/modules/auth/auth.controller.ts` |
| `GET` | `/api/auth/avatar/:id` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/login` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/logout` | `apps/api/src/modules/auth/auth.controller.ts` |
| `GET` | `/api/auth/me` | `apps/api/src/modules/auth/auth.controller.ts` |
| `PATCH` | `/api/auth/me` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/me/avatar` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/mobile/2fa/verify` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/mobile/login` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/mobile/logout` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/mobile/refresh` | `apps/api/src/modules/auth/auth.controller.ts` |
| `PATCH` | `/api/auth/password` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/password/forgot` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/password/reset` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/password/setup` | `apps/api/src/modules/auth/auth.controller.ts` |
| `GET` | `/api/auth/password/setup/:token` | `apps/api/src/modules/auth/auth.controller.ts` |
| `POST` | `/api/auth/refresh` | `apps/api/src/modules/auth/auth.controller.ts` |
| `GET` | `/api/campaigns` | `apps/api/src/modules/campaigns/campaigns.controller.ts` |
| `GET` | `/api/client-staff` | `apps/api/src/modules/users/client-staff.controller.ts` |
| `PATCH` | `/api/client-staff/:id/approval` | `apps/api/src/modules/users/client-staff.controller.ts` |
| `POST` | `/api/client-staff/:id/resend-setup-email` | `apps/api/src/modules/users/client-staff.controller.ts` |
| `GET` | `/api/clients` | `apps/api/src/modules/clients/clients.controller.ts` |
| `POST` | `/api/clients` | `apps/api/src/modules/clients/clients.controller.ts` |
| `GET` | `/api/clients/:clientId/integration-credentials` | `apps/api/src/modules/integration/integration-credentials.controller.ts` |
| `POST` | `/api/clients/:clientId/integration-credentials` | `apps/api/src/modules/integration/integration-credentials.controller.ts` |
| `POST` | `/api/clients/:clientId/integration-credentials/:credentialId/revoke` | `apps/api/src/modules/integration/integration-credentials.controller.ts` |
| `POST` | `/api/clients/:clientId/integration-credentials/:credentialId/rotate` | `apps/api/src/modules/integration/integration-credentials.controller.ts` |
| `DELETE` | `/api/clients/:id` | `apps/api/src/modules/clients/clients.controller.ts` |
| `GET` | `/api/clients/:id` | `apps/api/src/modules/clients/clients.controller.ts` |
| `PATCH` | `/api/clients/:id` | `apps/api/src/modules/clients/clients.controller.ts` |
| `POST` | `/api/clients/:id/vendor-signup-link/rotate` | `apps/api/src/modules/clients/clients.controller.ts` |
| `GET` | `/api/conversations` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `GET` | `/api/conversations/:id/agent-actions` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `POST` | `/api/conversations/:id/media` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `GET` | `/api/conversations/:id/messages` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `POST` | `/api/conversations/:id/messages` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `POST` | `/api/conversations/ensure` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `GET` | `/api/conversations/messages/:messageId/media` | `apps/api/src/modules/conversations/conversations.controller.ts` |
| `GET` | `/api/courses` | `apps/api/src/modules/courses/courses.controller.ts` |
| `PATCH` | `/api/courses/:courseId/lessons/:lessonId/progress` | `apps/api/src/modules/courses/courses.controller.ts` |
| `GET` | `/api/courses/:id` | `apps/api/src/modules/courses/courses.controller.ts` |
| `GET` | `/api/courses/progress/me` | `apps/api/src/modules/courses/courses.controller.ts` |
| `GET` | `/api/courses/progress/vendor` | `apps/api/src/modules/courses/courses.controller.ts` |
| `POST` | `/api/crm/idempotency/cleanup` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/leads/:leadId/duplicates` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/leads/:leadId/history` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/leads/:leadId/merge` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/leads/:leadId/move` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/leads/:leadId/timeline` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/leads/bulk-move` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/leads/stage-counts` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/pipelines` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/pipelines` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/pipelines/:id` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/pipelines/:pipelineId/stages` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/pipelines/:pipelineId/stages` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/pipelines/code/:code` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/reports/dashboard` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/stages/code/:code` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/crm/tasks` | `apps/api/src/modules/crm/crm.controller.ts` |
| `POST` | `/api/crm/tasks` | `apps/api/src/modules/crm/crm.controller.ts` |
| `PATCH` | `/api/crm/tasks/:taskId` | `apps/api/src/modules/crm/crm.controller.ts` |
| `GET` | `/api/dispatches/emails` | `apps/api/src/modules/dispatch-tracking/dispatch-tracking.controller.ts` |
| `GET` | `/api/events` | `apps/api/src/modules/events/events.controller.ts` |
| `POST` | `/api/events` | `apps/api/src/modules/events/events.controller.ts` |
| `DELETE` | `/api/events/:id` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/:id` | `apps/api/src/modules/events/events.controller.ts` |
| `PATCH` | `/api/events/:id` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/:id/dashboard-tv` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/:id/executive-report` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/active-summary` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/audit-logs` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/events/reports/operational` | `apps/api/src/modules/events/events.controller.ts` |
| `GET` | `/api/health` | `apps/api/src/modules/health/health.controller.ts` |
| `POST` | `/api/integrations/v1/automations/credential-delivery` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/credential-email` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/email-attempt-2/next` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/email-attempt-2/status` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/initial-template/next` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/initial-template/pilot` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/initial-template/status` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/no-show-rescue` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/reconcile-scheduled-lead` | `apps/api/src/modules/integration/automation.controller.ts` |
| `POST` | `/api/integrations/v1/automations/whatsapp/statuses` | `apps/api/src/modules/integration/automation.controller.ts` |
| `GET` | `/api/integrations/v1/dispatches` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/dispatches` | `apps/api/src/modules/integration/integration.controller.ts` |
| `GET` | `/api/integrations/v1/events` | `apps/api/src/modules/integration/integration.controller.ts` |
| `GET` | `/api/integrations/v1/events/:id` | `apps/api/src/modules/integration/integration.controller.ts` |
| `GET` | `/api/integrations/v1/leads` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads` | `apps/api/src/modules/integration/integration.controller.ts` |
| `PATCH` | `/api/integrations/v1/leads/:id` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads/:id/crm/move-by-suffix` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads/:id/crm/move` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads/:id/crm/stage/:suffix` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads/facebook` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/leads/facebook/auto` | `apps/api/src/modules/integration/meta-lead-ingestion.controller.ts` |
| `POST` | `/api/integrations/v1/leads/reconcile` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/operations/heartbeat` | `apps/api/src/modules/operations/operations-integration.controller.ts` |
| `POST` | `/api/integrations/v1/operations/issues` | `apps/api/src/modules/operations/operations-integration.controller.ts` |
| `GET` | `/api/integrations/v1/rubinho/config` | `apps/api/src/modules/integration/integration.controller.ts` |
| `POST` | `/api/integrations/v1/rubinho/resolve-context` | `apps/api/src/modules/integration/rubinho-context.controller.ts` |
| `POST` | `/api/integrations/v1/whatsapp/text` | `apps/api/src/modules/integration/integration.controller.ts` |
| `GET` | `/api/leads` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads` | `apps/api/src/modules/leads/leads.controller.ts` |
| `DELETE` | `/api/leads/:id` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/:id` | `apps/api/src/modules/leads/leads.controller.ts` |
| `PATCH` | `/api/leads/:id` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/accept-vendor-call` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/assign-to-me` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/call-vendor` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/change-attendance-vendor` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/close-attendance` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/expire-vendor-call` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/:id/reject-vendor-call` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/check-in-by-token` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/check-phone` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/export` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/fipe/:plate` | `apps/api/src/modules/leads/leads.controller.ts` |
| `POST` | `/api/leads/import` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/lookup` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/reception-queue` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/vendor-attendance/current` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/leads/vendor-availability` | `apps/api/src/modules/leads/leads.controller.ts` |
| `PATCH` | `/api/leads/vendor-status` | `apps/api/src/modules/leads/leads.controller.ts` |
| `GET` | `/api/meta/businesses` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/campaign-assignments` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/campaign-assignments/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/campaign-assignments/:clientId/linked` | `apps/api/src/modules/meta/meta.controller.ts` |
| `DELETE` | `/api/meta/campaign-assignments/:metaCampaignId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/campaigns-report/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/connect/callback` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/connect/callback/window` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/connect/start` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/disconnect` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/events/:eventId/spend` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/gestor/connect/start` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/gestor/disconnect` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/gestor/status` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/lead-routing/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `PUT` | `/api/meta/lead-routing/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `DELETE` | `/api/meta/lead-routing/:clientId/:formId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/lead-routing/:clientId/whatsapp-templates` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/select-assets` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/status/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/summary/:clientId` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/sync/full` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/sync/leads` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/webhook` | `apps/api/src/modules/meta/meta.controller.ts` |
| `POST` | `/api/meta/webhook` | `apps/api/src/modules/meta/meta.controller.ts` |
| `GET` | `/api/meta/whatsapp/channels` | `apps/api/src/modules/meta/meta.controller.ts` |
| `PUT` | `/api/meta/whatsapp/channels` | `apps/api/src/modules/meta/meta.controller.ts` |
| `DELETE` | `/api/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `GET` | `/api/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `PATCH` | `/api/notifications/:id/read` | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `PATCH` | `/api/notifications/read-all` | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `GET` | `/api/operations/conversations/:id/audit` | `apps/api/src/modules/operations/operations.controller.ts` |
| `GET` | `/api/operations/dashboard` | `apps/api/src/modules/operations/operations.controller.ts` |
| `PATCH` | `/api/operations/issues/:id/reopen` | `apps/api/src/modules/operations/operations.controller.ts` |
| `PATCH` | `/api/operations/issues/:id/resolve` | `apps/api/src/modules/operations/operations.controller.ts` |
| `GET` | `/api/operations/rubinho-template-leads` | `apps/api/src/modules/operations/operations.controller.ts` |
| `GET` | `/api/operations/rubinho-thermometer` | `apps/api/src/modules/operations/operations.controller.ts` |
| `GET` | `/api/performance/api/summary` | `apps/api/src/modules/performance/performance.controller.ts` |
| `GET` | `/api/performance/database/connections` | `apps/api/src/modules/performance/performance.controller.ts` |
| `POST` | `/api/performance/web-vitals` | `apps/api/src/modules/performance/performance.controller.ts` |
| `GET` | `/api/performance/web-vitals/summary` | `apps/api/src/modules/performance/performance.controller.ts` |
| `GET` | `/api/public/check-in/preview` | `apps/api/src/modules/public/public.controller.ts` |
| `GET` | `/api/public/rating/:token` | `apps/api/src/modules/public/public.controller.ts` |
| `POST` | `/api/public/rating/:token` | `apps/api/src/modules/public/public.controller.ts` |
| `GET` | `/api/public/vendor-signup/:token` | `apps/api/src/modules/public/public.controller.ts` |
| `POST` | `/api/public/vendor-signup/:token` | `apps/api/src/modules/public/public.controller.ts` |
| `GET` | `/api/rubinho` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `POST` | `/api/rubinho` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `DELETE` | `/api/rubinho/:id` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `GET` | `/api/rubinho/:id` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `PATCH` | `/api/rubinho/:id` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `POST` | `/api/rubinho/:id/documents` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `POST` | `/api/rubinho/:id/faqs` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `DELETE` | `/api/rubinho/documents/:docId` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `PATCH` | `/api/rubinho/documents/:docId` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `DELETE` | `/api/rubinho/faqs/:faqId` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `PATCH` | `/api/rubinho/faqs/:faqId` | `apps/api/src/modules/rubinho/rubinho.controller.ts` |
| `GET` | `/api/sales-teams` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `POST` | `/api/sales-teams` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `DELETE` | `/api/sales-teams/:id` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `PATCH` | `/api/sales-teams/:id` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `POST` | `/api/sales-teams/:id/members` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `DELETE` | `/api/sales-teams/:id/members/:userId` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `PATCH` | `/api/sales-teams/:id/members/order` | `apps/api/src/modules/sales-teams/sales-teams.controller.ts` |
| `GET` | `/api/sales` | `apps/api/src/modules/sales/sales.controller.ts` |
| `POST` | `/api/sales` | `apps/api/src/modules/sales/sales.controller.ts` |
| `DELETE` | `/api/sales/:id` | `apps/api/src/modules/sales/sales.controller.ts` |
| `PATCH` | `/api/sales/:id` | `apps/api/src/modules/sales/sales.controller.ts` |
| `GET` | `/api/sales/buyers` | `apps/api/src/modules/sales/sales.controller.ts` |
| `GET` | `/api/sales/mine` | `apps/api/src/modules/sales/sales.controller.ts` |
| `GET` | `/api/sales/pending` | `apps/api/src/modules/sales/sales.controller.ts` |
| `POST` | `/api/sales/quick` | `apps/api/src/modules/sales/sales.controller.ts` |
| `GET` | `/api/service-ratings/summary` | `apps/api/src/modules/service-ratings/service-ratings.controller.ts` |
| `GET` | `/api/service-ratings/vendor/:vendorId` | `apps/api/src/modules/service-ratings/service-ratings.controller.ts` |
| `GET` | `/api/stores` | `apps/api/src/modules/stores/stores.controller.ts` |
| `POST` | `/api/stores` | `apps/api/src/modules/stores/stores.controller.ts` |
| `DELETE` | `/api/stores/:id` | `apps/api/src/modules/stores/stores.controller.ts` |
| `GET` | `/api/stores/:id` | `apps/api/src/modules/stores/stores.controller.ts` |
| `PATCH` | `/api/stores/:id` | `apps/api/src/modules/stores/stores.controller.ts` |
| `GET` | `/api/users` | `apps/api/src/modules/users/users.controller.ts` |
| `POST` | `/api/users` | `apps/api/src/modules/users/users.controller.ts` |
| `DELETE` | `/api/users/:id` | `apps/api/src/modules/users/users.controller.ts` |
| `GET` | `/api/users/:id` | `apps/api/src/modules/users/users.controller.ts` |
| `PUT` | `/api/users/:id` | `apps/api/src/modules/users/users.controller.ts` |
| `PATCH` | `/api/users/:id/active` | `apps/api/src/modules/users/users.controller.ts` |
| `GET` | `/api/vehicles` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `POST` | `/api/vehicles` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `DELETE` | `/api/vehicles/:id` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `GET` | `/api/vehicles/:id` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `PATCH` | `/api/vehicles/:id` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `PATCH` | `/api/vehicles/bulk-status` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `POST` | `/api/vehicles/catalog/import` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `POST` | `/api/vehicles/catalog/sync` | `apps/api/src/modules/vehicles/vehicles.controller.ts` |
| `GET` | `/api/vendor/score-ranking` | `apps/api/src/modules/score-events/vendor-score.controller.ts` |
| `GET` | `/api/vendor/score-summary` | `apps/api/src/modules/score-events/vendor-score.controller.ts` |

## Rotas do frontend

| Rota |
|---|
| `*` |
| `/` |
| `/avaliacao/:token` |
| `/cadastro-vendedor/:token` |
| `/cliente/ajuda` |
| `/cliente/auditoria` |
| `/cliente/campanhas` |
| `/cliente/configuracao` |
| `/cliente/conversas` |
| `/cliente/cursos` |
| `/cliente/dashboard` |
| `/cliente/emails` |
| `/cliente/eventos` |
| `/cliente/faq-rag` |
| `/cliente/leads` |
| `/cliente/lojas` |
| `/cliente/relatorio` |
| `/cliente/veiculos` |
| `/cliente/vendedores` |
| `/convite` |
| `/definir-senha/:token` |
| `/esqueci-senha` |
| `/eventos/:id/tv` |
| `/eventos/:id/tv-fila` |
| `/gestor/auditoria` |
| `/gestor/chat` |
| `/gestor/clientes` |
| `/gestor/clientes/:id` |
| `/gestor/configuracao` |
| `/gestor/crm` |
| `/gestor/cursos` |
| `/gestor/dashboard` |
| `/gestor/eventos` |
| `/gestor/eventos/:eventId/operacao/:clientId` |
| `/gestor/eventos/:id` |
| `/gestor/lojas` |
| `/gestor/operacoes` |
| `/gestor/performance` |
| `/gestor/relatorio` |
| `/gestor/relatorio-executivo` |
| `/gestor/rubinho` |
| `/gestor/vendedores/:id` |
| `/login` |
| `/recepcao/checkin` |
| `/recepcao/configuracao` |
| `/recepcao/fila` |
| `/recepcao/ordem-vendedores` |
| `/vendedor/chat` |
| `/vendedor/configuracao` |
| `/vendedor/cursos` |
| `/vendedor/dashboard` |
| `/vendedor/fila` |
| `/vendedor/leads` |
| `/vendedor/ranking` |
| `/vendedor/vendas` |

## Models Prisma

- `AgentActionLog`
- `ApiIdempotencyRequest`
- `ApiRequestMetric`
- `Appointment`
- `Campaign`
- `CampaignVendor`
- `Client`
- `Conversation`
- `ConversationState`
- `Course`
- `CourseProgress`
- `CrmHistory`
- `CrmPipeline`
- `CrmStage`
- `CrmTask`
- `DispatchEvent`
- `Event`
- `EventParticipant`
- `FacebookAdAccount`
- `IntegrationCredential`
- `Lead`
- `LeadTimeline`
- `Lesson`
- `Message`
- `MetaAd`
- `MetaAdSet`
- `MetaAssetSelection`
- `MetaCampaign`
- `MetaCampaignAssignment`
- `MetaConnection`
- `MetaCreative`
- `MetaDailyInsight`
- `MetaLeadForm`
- `MetaLeadImport`
- `MetaLeadRoutingRule`
- `MetaSyncJob`
- `Notification`
- `OperationalHeartbeat`
- `OperationalIssue`
- `RubinhoAgent`
- `RubinhoAgentDocument`
- `RubinhoAgentEvent`
- `RubinhoAgentFaq`
- `Sale`
- `SalesTeam`
- `SalesTeamMember`
- `ScoreEvent`
- `ServiceRating`
- `Store`
- `User`
- `Vehicle`
- `VehicleCatalog`
- `VendorAttendance`
- `VendorAvailability`
- `WebVitalMetric`
- `WebhookEvent`
- `WhatsAppAttributionEvent`
- `leads_bitrix24`

## Enums Prisma

- `AppointmentActorType`
- `AppointmentChannel`
- `AppointmentSource`
- `AppointmentStatus`
- `CampaignStatus`
- `ConfirmationStatus`
- `ConversationChannel`
- `CrmTaskStatus`
- `CrmTaskType`
- `DistributionMethod`
- `EventStatus`
- `FacebookAccountStatus`
- `LeadSource`
- `LeadTimelineEventType`
- `LeadTimelineOrigin`
- `MetaConnectionStatus`
- `MetaSyncJobStatus`
- `NotificationType`
- `Role`
- `SaleType`
- `ScoreEventKind`
- `SenderType`
- `UserApprovalStatus`
- `VendorAttendanceStatus`
- `VendorCategory`
- `VendorOperationalStatus`

## Variáveis detectadas no backend

- `ALLOW_LEGACY_INTEGRATION_KEY`
- `ALLOW_PASSWORD_RESET_TOKEN_RESPONSE`
- `APIBRASIL_DEVICE_TOKEN`
- `APIBRASIL_TOKEN`
- `API_PERFORMANCE_SAMPLE_RATE`
- `API_PREFIX`
- `API_PUBLIC_URL`
- `API_SLOW_REQUEST_MS`
- `BULLMQ_PREFIX`
- `DATABASE_URL`
- `DIRECT_URL`
- `ENABLE_SWAGGER`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_REDIRECT_URI`
- `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
- `FRONTEND_URL`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_SECRET`
- `LEADFLOW_CHECKIN_VOUCHER_SECRET`
- `LEADFLOW_INTEGRATION_ACTOR_USER_ID`
- `LEADFLOW_INTEGRATION_API_KEY`
- `LEADFLOW_INTEGRATION_CLIENT_ID`
- `LEADFLOW_META_INGESTION_API_KEY`
- `LOG_FORMAT`
- `META_API_VERSION`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_SCOPES`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `N8N_ALLOW_UPDATE_EXISTING`
- `N8N_API_KEY`
- `N8N_AUTOMATION_API_KEY`
- `N8N_AUTOMATION_SOURCE_WORKFLOW_ID`
- `N8N_BASE_URL`
- `N8N_EXPECT_HOMOLOGATION_ACTIVE`
- `N8N_EXPECT_PRODUCTION_ACTIVE`
- `N8N_HOMOLOGATION_WORKFLOW_ID`
- `N8N_PRODUCTION_WORKFLOW_ID`
- `N8N_SOURCE_WORKFLOW_ID`
- `N8N_TARGET_WORKFLOW_ID`
- `N8N_TRIGGER_WEBHOOK_ID`
- `NODE_ENV`
- `PERFORMANCE_RETENTION_DAYS`
- `PLATFORM_LOGO_URL`
- `PORT`
- `POSTGRES_URL`
- `PRISMA_CONNECTION_LIMIT`
- `PRISMA_POOL_TIMEOUT`
- `PRISMA_SLOW_QUERY_MS`
- `RAILWAY_ENVIRONMENT`
- `RAILWAY_PUBLIC_DOMAIN`
- `RAILWAY_STATIC_URL`
- `REDIS_URL`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SERVERLESS`
- `SMTP_FROM`
- `SMTP_PASS`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_BUCKET`
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_SECRET_ACCESS_KEY`
- `VERCEL`

## Variáveis públicas detectadas no frontend

- `DEV`
- `VITE_API_URL`
- `VITE_PERFORMANCE_DEBUG`
- `VITE_PERFORMANCE_ENDPOINT`
- `VITE_PUBLIC_WEB_URL`

## Relacionamentos

- [[Catalogo Backend]]
- [[Catalogo Frontend]]
- [[Catalogo do Banco]]
- [[Configuracao e Variaveis]]
