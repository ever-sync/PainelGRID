# Scripts e Migrações

## Prisma

- Schema: `apps/api/prisma/schema.prisma`.
- Migrações: `apps/api/prisma/migrations/`.
- Seed e rotinas auxiliares ficam junto da API.
- `DATABASE_URL` atende a aplicação; `DIRECT_URL` é necessária para operações diretas do Prisma em ambientes que usam pooler.

## Comandos principais

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
npm run build
npm test
```

Para deploy de migração:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

## Scripts operacionais

O repositório contém scripts para:

- importação e reconciliação de leads;
- homologação do Rubinho;
- auditoria de eventos e relatórios;
- correções de dados e backfills;
- sincronização e diagnóstico de integrações;
- tarefas mobile e n8n.

Antes de executar um script:

1. Leia o arquivo inteiro.
2. Confirme ambiente e cliente-alvo.
3. Execute primeiro a modalidade de consulta ou dry-run, quando existir.
4. Registre contagens antes e depois.
5. Não reutilize tokens copiados em documentação ou logs.

## Regra para novas migrações

- Migração deve ser repetível no pipeline previsto e não depender de estado manual oculto.
- Enums exigem cuidado: a criação duplicada gera erro `42710`.
- Não altere migração já aplicada; crie uma nova correção.
- Atualize [[Mapa de Dados]] e [[Decisoes Arquiteturais]] quando houver impacto estrutural.

## Relacionamentos

- [[Banco de Dados]]
- [[Testes e CI]]
- [[Ambientes e Deploy]]
- [[Runbook Operacional]]

