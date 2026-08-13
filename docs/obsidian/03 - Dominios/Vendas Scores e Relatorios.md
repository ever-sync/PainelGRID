# Vendas, Scores e Relatorios

## Responsabilidade

Consolida resultados comerciais, atribuição, receita, avaliação, performance de vendedores, equipes, campanhas e Rubinho.

## Fontes

- `Sale`: valor, vendedor, equipe e lead.
- `Appointment` e check-in: agendamento e presença.
- `DispatchEvent`, `Message` e `AgentActionLog`: atuação da automação.
- `MetaDailyInsight`: mídia.
- `ServiceRating`: avaliação.
- `ScoreEvent`: pontuação operacional.

## Regras de qualidade

- Receita por vendedor deve usar vendas reais, não ticket médio estimado.
- Horário de chegada deve usar check-in real, não criação do lead.
- Não atribuir toda venda do evento ao Rubinho.
- Classificar jornadas de forma exclusiva: Rubinho, vendedor, influenciada, recuperação ou manual.
- Exibir janela e cobertura de atribuição.
- Métricas sem instrumentação devem ser marcadas como estimativas ou removidas.

## Relatórios

- Gestor: visão operacional enxuta.
- Executivo: mídia, funil, presença, vendas, receita, atribuição e prova de valor.
- Evento: desempenho específico.
- Cliente: campanhas, leads e conversão.

## Relacionamentos

- [[Campanhas e Meta]]
- [[Eventos e Agendamentos]]
- [[Mapa de Dados]]

