---
tipo: migracao
status: proposta
atualizado: "{{date}}"
responsavel: a-definir
criticidade: alta
tags: [painelgrid, banco, migracao]
---

# Migração — {{title}}

## Objetivo

## Alteração do schema

- Models/campos:
- Índices/constraints:
- Relações e `onDelete`:

## Compatibilidade e dados existentes

- Volume estimado:
- Backfill necessário:
- Locks esperados:
- Compatibilidade com a versão anterior da API:

## Plano

1. Criar nova migração sem alterar histórico aplicado.
2. Validar em base de homologação representativa.
3. Aplicar código compatível.
4. Executar backfill/reconciliação, se necessário.

## Rollback ou roll-forward

Descrever a estratégia segura; não assumir que DDL destrutivo é reversível.

## Evidências

- [ ] `prisma generate`.
- [ ] Migração em banco vazio.
- [ ] Migração sobre estado existente.
- [ ] Contagens antes/depois.
- [ ] [[Catalogo do Banco]] atualizado.
