# PainelGRID no Obsidian

Este diretório é um vault Obsidian autocontido que documenta o produto, a arquitetura, os domínios, as jornadas, as integrações e a operação do PainelGRID.

## Como abrir

1. Abra o Obsidian.
2. Selecione **Open folder as vault**.
3. Escolha `docs/obsidian`.
4. Comece por [[00 - Inicio]].

O vault não contém credenciais, tokens ou valores de variáveis de ambiente. Ele referencia o código como fonte da verdade e conecta a documentação preexistente em `docs/`.

## Documentação preexistente relacionada

- [Plano de melhoria](../PLANO_DE_MELHORIA.md)
- [Migração BullMQ](../BULLMQ_MIGRATION.md)
- [Roteamento de número compartilhado](../integrations/WHATSAPP_SHARED_NUMBER_ROUTING.md)
- [Índice n8n](../n8n/README.md)
- [Ingestão de leads Meta](../n8n/meta-lead-ingestion.md)
- [Métricas do relatório gestor](../reports/RELATORIO_GESTOR_METRICS.md)

## Convenções

- Ligações internas usam a sintaxe de wikilink do Obsidian, com dois colchetes ao redor do nome da nota.
- Caminhos de código aparecem relativos à raiz do repositório.
- `#fonte-da-verdade`: comportamento confirmado no código.
- `#operacao`: procedimento operacional.
- `#risco`: ponto que exige monitoramento ou decisão.
