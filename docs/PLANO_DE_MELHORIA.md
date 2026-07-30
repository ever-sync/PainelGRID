# Plano de melhoria

Levantado em 30/07/2026 a partir de medições em produção, não de suposição. As
fontes são a tabela `api_request_metrics` (3160 requests gravados desde 28/07),
benchmarks diretos contra o banco e leitura do código.

Cada item tem: o problema, a evidência que o sustenta, a correção e o risco.
Prioridade por relação impacto/esforço, não por gravidade isolada.

---

## P0 — fazer agora

### 1. `DATABASE_URL` está na porta errada do pooler

**O maior ganho isolado do sistema, e é uma variável de ambiente.**

A aplicação usa a porta `6543` (transaction mode) com `pgbouncer=true`. Esse flag
manda o Prisma **desligar prepared statements**, porque transaction mode não os
suporta. O Postgres passa a replanejar a mesma query a cada execução.

Medição direta, mesma máquina, mesmo banco, mesma rede:

| Operação | 6543 (atual) | 5432 (session) | Ganho |
| --- | --- | --- | --- |
| `select 1` | 726 ms | 139 ms | 81% |
| `findMany` 50 leads com join | 1020 ms | 337 ms | 67% |
| 10 queries em sequência | 7400 ms | 1532 ms | 79% |

Projeção sobre o p50 real das rotas em produção:

```
DELETE /api/clients/:id   5855ms -> ~1200ms   (37 queries por request)
POST   /api/leads         9144ms -> ~1900ms   (12 queries)
GET    /api/leads         2473ms ->  ~520ms
mediana de todo request   1454ms ->  ~300ms
```

**Correção:** na `DATABASE_URL` do serviço da API, trocar `6543` por `5432` e
remover `pgbouncer=true`. Manter `connection_limit=5&pool_timeout=20`.

**Risco:** session mode segura uma conexão de backend por conexão do pool.
Medido em 30/07: 18 de 60 conexões em uso (30%). A API somaria no máximo 10
(2 réplicas × `connection_limit=5`), ficando em ~28/60. Com `max_connections=60`
o teto prático é ~10 réplicas; passando disso, aumentar a instância do Supabase
em vez de voltar para transaction mode.

O `MIGRATION_DATABASE_URL` já usa essa porta e modo desde 30/07 sem problema.

### 2. Os dois segredos de JWT são o mesmo segredo

```
JWT_SECRET         = "dasdasdDSAD11231sadasdasdasdasdas@!@"
JWT_REFRESH_SECRET = "dasdasdDSAD11231sadasdasdasdasdas@!@teste"
```

O refresh é o access **mais o sufixo `teste`** — 36 caracteres idênticos de
prefixo. A validação em `env.validation.ts` só rejeita se forem *exatamente*
iguais, então isso passa. Mas anula o propósito de ter dois segredos: quem
descobrir um deriva o outro trivialmente.

**Correção:** gerar dois valores independentes.

```
node -e "const c=require('crypto');console.log('JWT_SECRET='+c.randomBytes(48).toString('base64url'));console.log('JWT_REFRESH_SECRET='+c.randomBytes(48).toString('base64url'))"
```

**Risco:** desloga todos. Fazer junto de outra mudança que já cause logout.

### 3. O auto-deploy por push não é confiável

Em 30/07 o push para `main` **não disparou deploy em nenhum dos dois serviços**,
sem qualquer sinal de erro. Pior: um `railway redeploy` simples reexecutou o
deployment *antigo* e exibiu `SUCCESS` — dando a impressão de que estava tudo
certo enquanto produção seguia num commit de dois dias atrás.

**Correção enquanto a causa não for encontrada:** após cada push, disparar
manualmente nos **dois** serviços e conferir o commit, não só o status:

```
railway redeploy --from-source -y -s <api>
railway redeploy --from-source -y -s <frontend>
railway deployment list --json   # confira o commitHash
```

Atenção ao `SKIPPED`: o serviço tem `watchPatterns`, então um commit que só toca
`apps/api/**` legitimamente pula o build do frontend. O problema é quando um
commit que toca `apps/desktop/**` também não constrói.

---

## P1 — próxima janela

### 4. Queries demais por request

Com ~700ms de ida e volta, cada query custa caro. As piores rotas:

```
37 queries  DELETE /api/clients/:id
14 queries  POST /api/appointments
13 queries  GET /api/meta/summary/:id
12 queries  POST /api/leads
```

O `deleteForUser` (`clients.service.ts`) faz ~30 `deleteMany` sequenciais dentro
de uma transação. Boa parte poderia virar `ON DELETE CASCADE` no schema, ou ao
menos rodar em paralelo onde não há dependência.

Depois do item 1 isso deixa de ser urgente, mas continua sendo a causa de o
delete bater no `statement_timeout` de 60s da role `prisma_runtime`.

### 5. A aplicação roda como superusuário do banco

`DATABASE_URL` usa `postgres`. Existe a role `prisma_runtime`, criada por
`scripts/configure-supabase-runtime-role.cjs` exatamente para isso, com
`SELECT/INSERT/UPDATE/DELETE` no schema `public`, `statement_timeout=60s` e
`lock_timeout=10s`.

**Correção:** trocar a `DATABASE_URL` para `prisma_runtime`.

**Risco:** se faltar algum privilégio, a API quebra em produção. Testar antes as
operações de escrita mais complexas — em especial o `deleteForUser`, que mexe em
~30 tabelas.

### 6. Bug de precedência no fallback de Redis

`redis.service.ts:170`:

```ts
if (url && (isVercel && isLocalhostRedisUrl(url) || isUnreachableRedisUrl(url))) {
```

Isso avalia como `(isVercel && isLocalhostRedisUrl(url)) || isUnreachableRedisUrl(url)`.
O fallback em memória para Redis local **só vale na Vercel**. Em qualquer outro
ambiente a aplicação tenta conectar de verdade, falha, e o Node mata o processo
por unhandled rejection.

Foi a causa de produção ficar fora do ar em 30/07 às 04:06, quando `REDIS_URL`
apontava para `localhost`.

**Correção:** parênteses explícitos e decidir a regra pretendida.

### 7. `FRONTEND_URL` faz dois trabalhos

A mesma variável é lista de origens de CORS **e** base das URLs de e-mail
(`mail.service.ts` usa `FRONTEND_URL.split(',')[0]`).

Consequência prática: e-mails gerados em desenvolvimento apontam para o site de
produção. Um link de definir senha criado localmente leva a `gpdevendas.app`,
onde o token nem existe — ele está no Redis da máquina local.

**Correção:** variável dedicada `PUBLIC_APP_URL` para os links de e-mail,
deixando `FRONTEND_URL` só para CORS.

---

## P2 — dívida registrada

### 8. Instância do Supabase é pequena

`shared_buffers: 224MB`, `max_connections: 60`, banco com 28MB. Mesmo em session
mode, um `select 1` custa ~139ms — o normal seria ~5ms. Parte é distância
geográfica (API em Railway `sfo`, banco em `aws-1-us-east-1`), parte é o tamanho
da instância.

Depois do item 1, medir de novo antes de decidir se vale subir de plano ou
aproximar as regiões.

### 9. Divergência de schema em `events`

`allow_vendor_checkin` e `allow_vendor_fipe` estão **nuláveis** no banco, mas o
`schema.prisma` as declara não-nuláveis. Resíduo da migration
`20260728150000_add_event_vendor_permissions`, que falhou e foi resolvida como
`applied` em 30/07 para destravar o deploy.

Zero linhas com NULL hoje, então não quebra nada. Corrigir com uma migration
nova e idempotente quando houver janela.

### 10. Token de acesso em `localStorage` com validade de 7 dias

O refresh está em cookie `httpOnly` (correto), mas o access token fica em
`localStorage`, legível por qualquer JS da página. `JWT_EXPIRES_IN=7d` significa
que um token vazado vale uma semana, sem revogação.

**Correção:** reduzir para `15m` ou `1h`. O refresh em cookie já cobre a
renovação, então não afeta a experiência.

### 11. Contas de gestor não são gerenciáveis pelo painel

`ensureGestorCanManageUser` impede um gestor de editar, desativar ou excluir
outro gestor. Como gestor é o papel mais alto, as contas de gestor só podem ser
alteradas por SQL direto. Criar é livre; remover é impossível pela interface.

Decidir se isso é intencional. Se não for, o caminho é um fluxo administrativo
explícito, não afrouxar o guard.

### 12. Rotas inexistentes devolvem 200

O `server.mjs` do frontend faz fallback para `index.html` em qualquer caminho
desconhecido. `/data-deletion`, `/exclusao-de-dados` e qualquer URL inventada
respondem **200** servindo o SPA. Isso engana monitoramento, crawlers e revisores
(a Meta abriria o link e veria a tela de login).

### 13. Páginas legais com problemas para revisão da Meta

- O e-mail de contato na política de privacidade aparece como `[email protected]`
  por causa da ofuscação de e-mail do Cloudflare. O revisor e qualquer crawler
  veem esse texto quebrado, não um contato.
- Não existe URL de **instruções de exclusão de dados**, que a Meta exige como
  campo próprio, separado da política.
- `www.gpdevendas.app` não resolve, embora esteja listado em `FRONTEND_URL`.

### 14. Rotação de segredos

Em 30/07 vários segredos de produção foram colados em transcript de conversa:
chave da Resend, `META_APP_SECRET`, `WHATSAPP_TOKEN`, chaves de storage, chave de
integração e senhas do banco. Se o transcript não for privado, rotacionar — a
mais sensível é a da Resend, que permite enviar e-mail em nome do domínio.

---

## Como medir de novo

A aplicação grava métricas de cada request em `api_request_metrics`
(`duration_ms`, `database_duration_ms`, `database_query_count`,
`slowest_query_ms`). Para comparar antes e depois de qualquer mudança:

```sql
select
  percentile_disc(0.5)  within group (order by duration_ms)::int p50,
  percentile_disc(0.95) within group (order by duration_ms)::int p95,
  percentile_disc(0.5)  within group (order by database_duration_ms)::int db_p50,
  avg(database_query_count)::numeric(10,1) queries_media
from api_request_metrics
where sampled_at > now() - interval '1 hour';
```

E por rota:

```sql
select method, path, count(*)::int chamadas,
       percentile_disc(0.5) within group (order by duration_ms)::int p50,
       max(database_query_count)::int max_queries
from api_request_metrics
where sampled_at > now() - interval '1 hour'
group by method, path
having count(*) >= 3
order by p50 desc limit 15;
```

Guardar o resultado antes de aplicar o item 1 para ter a linha de base.
