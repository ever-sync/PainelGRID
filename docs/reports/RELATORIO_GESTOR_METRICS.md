# Contrato de métricas — Relatório do Gestor

Este documento congela o comportamento do relatório operacional antes da
refatoração. Seu objetivo é impedir que valores estimados ou demonstrativos
sejam apresentados como dados operacionais reais.

| Indicador               | Classificação atual | Fonte atual                  | Limitação conhecida                                         |
| ----------------------- | ------------------- | ---------------------------- | ----------------------------------------------------------- |
| Total de leads          | Real                | `Lead` agregado no backend   | Filtros e totalização são executados no servidor            |
| Funil do CRM            | Real                | `Appointment`, timeline e `Sale` | Não depende mais do nome textual da etapa                |
| Agendamentos            | Real                | `Appointment`                | Conta leads únicos com agendamento operacional              |
| Check-ins               | Real                | `Appointment.completed_at` e timeline | Usa evidência real de presença                    |
| Vendas                  | Real                | `Sale`                       | Conta vendas e receita registradas                          |
| Origem dos leads        | Real                | `Lead.source` agregado no backend | Abrange todo o conjunto filtrado                        |
| Campanhas Meta          | Real                | Insights Meta atribuídos ao evento | Restritas às campanhas vinculadas                       |
| Investimento por evento | Real                | `MetaCampaignInsight.spend`  | Disponível ao selecionar um evento                          |
| Receita por evento      | Real                | `Sale.value`                 | Disponível ao selecionar um evento                          |
| Ranking de vendedores   | Real/indisponível   | Dashboard TV                 | Exibe estado vazio quando não existe snapshot real           |
| Ranking de equipes      | Real/indisponível   | Dashboard TV                 | Não cria equipes, metas ou quantidades demonstrativas        |
| Exportação              | Real                | Endpoint operacional paginado | Gera CSV completo com os filtros de cliente e evento       |

Os rankings não possuem mais nomes, equipes, metas ou volumes demonstrativos.
Na ausência de snapshot real do evento, a interface apresenta um estado vazio.

## Associação de evento

O relatório inclui um lead no evento somente quando seu `event_id` coincide
exatamente com o evento selecionado. A participação do cliente controla quais
eventos ficam disponíveis no seletor, mas não transfere todos os leads daquele
cliente para o evento.

## Regra de evolução

Cada fase seguinte deve atualizar este contrato e seus testes. Uma métrica só
pode ser classificada como `real` quando sua fonte operacional primária estiver
implementada e validada.
