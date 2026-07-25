# Regras do projeto — PainelGRID

## Múltiplos agentes rodando em paralelo

O usuário roda **várias sessões do Claude Code ao mesmo tempo** neste repositório (janelas/terminais diferentes), às vezes trabalhando nos mesmos arquivos ou na mesma infra (Railway, Supabase). Isso já causou colisões reais nesta sessão: uma página foi apagada por um agente e reconstruída por outro minutos depois, uma validação nova quebrou um deploy feito por outro agente, e serviços do Railway foram renomeados por engano por uma sessão enquanto outra trabalhava neles.

Antes de fazer mudanças grandes ou destrutivas, **verifique se há sinais de outro agente ativo**:

```bash
ps aux | grep -i claude | grep -v grep
```

Se houver outros processos `claude` rodando, assuma que outro agente pode estar mexendo no mesmo repo/infra neste momento. Redobre a cautela antes de:
- Reescrever um arquivo inteiro (esvaziar página, refatoração grande)
- Fazer deploy/redeploy no Railway
- Renomear ou apagar recursos de infra (serviços, bancos, buckets)

## Git

- Sempre rode `git log --oneline -10` e `git status` antes de uma reescrita grande de arquivo — pode haver commits recentes de outro agente que você ainda não viu.
- Commits pequenos e frequentes, com mensagens claras — é como os outros agentes (e o usuário) entendem o que mudou, já que não há comunicação direta entre sessões.
- Nunca `git push --force`. Nunca `git reset --hard` sem checar `git status` e avisar o usuário antes.
- Se um arquivo que você não tocou mudou de tamanho/conteúdo inesperadamente entre uma leitura e outra, é sinal de outro agente escrevendo nele — pare e avise o usuário em vez de sobrescrever.

## Railway (infra de produção)

- Projeto: `GPdeVendas` (workspace `gridlabs002's Projects`). Serviços: API (`@leadflow/api`, mas o nome muda com frequência — confira antes de rodar comandos), frontend, Postgres, Redis.
- **Sempre rode `railway service list --json` logo antes de qualquer comando que referencie um serviço por nome** — os nomes não são estáveis (já mudaram 3x numa única sessão). Prefira usar o `service ID` quando possível, que não muda.
- `railway scale <regiao>=<n>` só aceita `us-east`/`us-west`/`eu-west`/`southeast-asia` como nome de região — **não** aceita `sfo` (nome legado que aparece em `service list`). Passar `sfo` direto cria uma região nova em vez de escalar a existente. Para escalar a região atual (`sfo`), use a mutação GraphQL `serviceInstanceUpdate` com `multiRegionConfig`.
- `DIRECT_URL` (porta 5432, usado por `prisma migrate`) não é alcançável de fora da rede da Railway/Supabase — use `DATABASE_URL` (pooler, porta 6543) para queries via Prisma Client a partir de máquinas locais.
- Antes de apagar qualquer recurso (serviço, banco, bucket), confirme com o usuário — mesmo que pareça órfão/não referenciado.

## Frontend

- O frontend (`apps/desktop`) está migrando da Vercel para o Railway. Ainda existem trechos de código/mensagens de erro que mencionam "Vercel" (ex.: `src/services/http.ts`) — não é bug, é resíduo da migração.
- `VITE_*` env vars são embutidas no bundle em **build-time**, não runtime — precisam estar configuradas no serviço do Railway *antes* do build, senão o deploy sobe com valores antigos/vazios.
