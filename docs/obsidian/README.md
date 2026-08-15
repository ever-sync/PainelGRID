---
tipo: guia
status: mantido
atualizado: 2026-08-15
responsavel: equipe-engenharia
criticidade: media
tags: [painelgrid, guia]
---

# PainelGRID no Obsidian

Este diretório é um vault Obsidian autocontido que documenta o produto, a arquitetura, os domínios, as jornadas, as integrações e a operação do PainelGRID.

O conteúdo foi confrontado com o código-fonte em 15/08/2026. Os catálogos técnicos registram a estrutura atual; controllers, DTOs, services, testes e `schema.prisma` continuam sendo a fonte executável quando houver divergência.

## Como abrir

1. Abra o Obsidian.
2. Selecione **Open folder as vault**.
3. Escolha `docs/obsidian`.
4. Comece por [[00 - Inicio]].

Para localizar rapidamente uma área técnica, use [[Inventario do Repositorio]].

Para acompanhar status, criticidade, responsáveis e revisões, abra [[Painel da Documentacao]]. O plugin nativo Templates está configurado para `_templates`, e Bases fornece as visões do painel sem depender de plugins comunitários.

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
- Toda nota possui `tipo`, `status`, `atualizado`, `responsavel`, `criticidade` e `tags` no frontmatter.
- `#fonte-da-verdade`: comportamento confirmado no código.
- `#operacao`: procedimento operacional.
- `#risco`: ponto que exige monitoramento ou decisão.

## Manutenção automática

```bash
npm run docs:normalize  # adiciona propriedades ausentes e troca apenas o placeholder genérico de responsável
npm run docs:sync       # regenera inventários técnicos e normaliza propriedades
npm run docs:check      # valida propriedades, links, caminhos, models, endpoints, telas e variáveis
```

`docs:check` faz parte do comando agregado `npm run ci`.
