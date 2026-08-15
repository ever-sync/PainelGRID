---
tipo: integracao
status: mantido
atualizado: 2026-08-15
responsavel: equipe-integracoes
criticidade: alta
tags: [painelgrid, integracao]
---

# Supabase e PostgreSQL

## Uso

PostgreSQL é a fonte de verdade do produto. O Prisma define o modelo principal em `apps/api/prisma/schema.prisma`; o Supabase fornece a infraestrutura gerenciada em parte dos ambientes.

## Acesso

- Runtime: `DATABASE_URL`, normalmente via pooler.
- Migrações e operações diretas: `DIRECT_URL`.
- n8n possui credencial própria e deve limitar SQL direto a consultas controladas.

## Regras

- Alterações de schema devem virar migração versionada.
- Não executar novamente uma migração que já criou enum, tabela ou índice.
- Endpoints transacionais são preferíveis a sequências de updates independentes.
- Toda busca multi-tenant precisa incluir `client_id` ou escopo equivalente.
- Telefones devem ser normalizados antes de comparação.

## Operações sensíveis

- Exclusão integral de lead e rastros relacionados.
- Reconciliação de agendamento.
- Associação Meta → cliente/evento.
- Filas de vendedores e distribuição concorrente.

Relacionados: [[Banco de Dados]], [[Scripts e Migracoes]], [[Configuracao e Variaveis]], [[Exclusao de Lead]].

