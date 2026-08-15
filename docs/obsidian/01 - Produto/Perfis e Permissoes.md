---
tags: [produto, rbac, usuarios]
tipo: produto
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto
criticidade: media
---

# Perfis e Permissões

Os papéis estão definidos pelo enum `Role` e protegidos por JWT e `RolesGuard` na API.

| Perfil | Responsabilidade principal | Áreas típicas |
|---|---|---|
| Gestor | Configuração e visão transversal | clientes, eventos, CRM, relatórios, Rubinho, operações, auditoria |
| Cliente | Operação de sua organização | dashboard, eventos, leads, vendedores, campanhas, conversas, veículos |
| Vendedor | Atendimento e venda | dashboard, carteira, fila, chat, vendas, ranking |
| Recepção | Entrada e distribuição | check-in, fila de atendimento, configuração local |
| Público | Ações por token | check-in, avaliação, cadastro de vendedor, definição de senha |

## Segurança de acesso

- Login, refresh, logout, senha, avatar e perfil ficam em `apps/api/src/modules/auth`.
- Aprovação de colaboradores fica em `client-staff-approvals`.
- Guardas globais são registrados em `apps/api/src/app.module.ts`.
- Rotas e menus são separados por papel em `apps/desktop/src`.
- Operações sensíveis devem validar também `client_id`, não apenas o papel.

## Disponibilidade do vendedor

`VendorOperationalStatus` representa estados como online, ausente e ocupado. A distribuição só deve oferecer atendimento a vendedores elegíveis. Veja [[Vendedores e Atendimento]].

