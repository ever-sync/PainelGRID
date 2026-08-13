# Redis e Filas

## Responsabilidades

- Filas BullMQ para processamento assíncrono.
- Coordenação de jobs e redução de trabalho no request principal.
- Apoio a rotinas de sincronização, disparo e processamento pesado.

## Cuidados

- Jobs precisam de chave idempotente.
- Retry deve distinguir falha transitória de erro de dados.
- Backoff e concorrência devem respeitar limites da Meta e do WhatsApp.
- Acúmulo de fila deve gerar alerta operacional.
- Nunca usar a fila como única fonte do status; persistir o resultado no PostgreSQL.

## Indicadores

- Aguardando, ativos, concluídos e falhos.
- Idade do job mais antigo.
- Taxa de execução e de erro.
- Número de retries e dead letters.

Relacionados: [[Realtime e Filas]], [[Observabilidade]], [[Disparos e Recuperacao]].

