---
tipo: referencia
status: mantido
atualizado: 2026-08-15
responsavel: equipe-engenharia
criticidade: media
tags: [painelgrid, referencia]
---

# Mapa de Telas

## Públicas

- Login e recuperação de senha.
- Aceite de convite e definição de senha.
- Avaliação por token.
- Cadastro público de vendedor.
- Painel TV e fila pública do evento.

## Gestor

| Área | Função |
|---|---|
| Dashboard | visão consolidada de clientes, eventos e operação |
| Clientes | cadastro, integrações, equipe, campanhas, Rubinho e leads |
| CRM & Leads | kanban e operação comercial multicliente |
| Eventos | configuração, leads, equipes, campanhas, check-in e resultados |
| Conversas | atendimento e histórico omnicanal |
| Relatório | leitura operacional enxuta |
| Relatório executivo | mídia, funil, atribuição, Rubinho, vendedores e resultado |
| Operações | exceções, alertas, heartbeat e intervenção humana |
| Auditoria | decisões e rastros do agente |
| Configurações | parâmetros globais e conta |

## Cliente

- Dashboard próprio.
- Eventos e relatório.
- Leads e vendedores.
- Campanhas e e-mails.
- Veículos e FAQ/RAG.
- Conversas, auditoria, ajuda e configurações.

## Vendedor

- Dashboard individual.
- Cadastro rápido e carteira de leads.
- Fila de atendimento.
- Vendas e ranking.
- Chat, cursos e configurações.

## Recepção

- Check-in.
- Fila de chegada.
- Ordem geral e por categoria dos vendedores.
- Venda rápida quando autorizada pelo evento.
- Configurações operacionais.

## Regras de navegação

- As rotas são protegidas por perfil e escopo de cliente.
- Gestor enxerga visão agregada; cliente e vendedor recebem recortes.
- Telas de detalhe de lead devem convergir para o mesmo perfil e timeline.
- Estado em tempo real chega por Socket.IO e é conciliado com a API.

## Relacionamentos

- [[Frontend e Mobile]]
- [[Perfis e Permissoes]]
- [[Leads e CRM]]
- [[Vendedores e Atendimento]]
- [[Vendas Scores e Relatorios]]
