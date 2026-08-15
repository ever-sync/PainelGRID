---
tags: [produto, visao]
tipo: produto
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto
criticidade: media
---

# Visão do Produto

## Problema resolvido

Concessionárias e organizadores de eventos precisam reunir mídia paga, captação, atendimento, credenciamento, presença e venda numa jornada auditável. O PainelGRID conecta essas etapas e separa operações por cliente e evento.

## Capacidades

- Cadastro de clientes, lojas, equipes, usuários e permissões.
- Eventos com datas, endereço, campanhas, equipes e metas.
- Captação Meta, importação de planilhas e criação manual de leads.
- CRM em kanban, histórico e timeline.
- Conversas WhatsApp, templates e mídia.
- Rubinho para credenciamento orientado por estado persistente.
- Agendamento, QR Code, e-mail e check-in público.
- Fila operacional da recepção e distribuição para vendedores.
- Registro de venda, avaliação, score e relatórios executivos.
- Auditoria, métricas, alertas e painel de exceções.

## Princípios do produto

1. **Isolamento multicliente:** cliente, evento, número, formulário e credenciais precisam estar no mesmo escopo.
2. **Estado persistente:** a automação não deve depender apenas da memória do modelo.
3. **Idempotência:** reprocessar webhooks, templates ou agendamentos não pode duplicar registros.
4. **Atribuição auditável:** origem humana, vendedor, Rubinho, campanha e automação devem permanecer distinguíveis.
5. **Operação humana segura:** automação deve permitir handoff, correção e tratamento de exceções.

## Indicadores centrais

Leads → contatados → responderam → agendados → confirmados → check-in → atendimento → venda. A leitura correta depende dos eventos persistidos, não de estimativas de interface. Veja [[Vendas Scores e Relatorios]] e [[Observabilidade]].

