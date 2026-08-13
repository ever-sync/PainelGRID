# Lead Meta ate CRM

## Fluxo principal

```mermaid
sequenceDiagram
  participant M as Meta Lead Ads
  participant W as Webhook ou polling
  participant A as API PainelGRID
  participant D as PostgreSQL
  participant Q as Disparo
  M->>W: page_id, form_id, leadgen_id
  W->>M: consulta dados completos
  W->>A: importação normalizada
  A->>D: resolve regra form→cliente/evento
  A->>D: upsert idempotente do lead
  A->>D: vincula pipeline e etapa inicial
  A->>Q: agenda template quando elegível
```

## Validações

1. App inscrito na página no campo `leadgen`.
2. Token com `leads_retrieval`, acesso à página e pertencente ao app correto.
3. Formulário ativo e mapeado uma única vez.
4. Cliente, evento, pipeline e etapa ativos.
5. Nome, telefone, e-mail e preferência de contato normalizados.
6. `meta_lead_id` tratado como idempotency key.
7. Falhas enviadas ao painel de exceções.

## Contingência

O polling recupera perdas do webhook. Ele não deve duplicar leads nem reenviar templates já confirmados como enviados.

## Evidências

- Importação registrada em `MetaLeadImport`.
- Timeline do lead com origem e formulário.
- `DispatchEvent` para o template.
- Métricas de atraso entre `created_time` e importação.

## Relacionamentos

- [[Campanhas e Meta]]
- [[Meta]]
- [[Disparos e Recuperacao]]

