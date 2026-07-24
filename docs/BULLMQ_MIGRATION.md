# Migração operacional Bull → BullMQ

Bull e BullMQ não compartilham um formato Redis compatível. A aplicação usa o
prefixo `bullmq` por padrão para impedir que os novos workers processem dados
criados pelo Bull.

Antes do deploy:

1. Pause a criação de novos jobs na versão antiga.
2. Aguarde as filas Bull `meta-sync` e `webhook-dispatch` ficarem vazias.
3. Faça o deploy da versão BullMQ.
4. Confirme a criação das chaves com prefixo `bullmq` e o processamento dos
   jobs recorrentes `token-refresh` e `cleanup-idempotency`.
5. Remova as chaves antigas com prefixo `bull` somente depois de confirmar que
   não existem jobs pendentes ou com falha que precisem ser preservados.

O prefixo pode ser alterado com `BULLMQ_PREFIX`, mas deve ser idêntico em todas
as instâncias produtoras e consumidoras.
