# Configuração e Variáveis

## Categorias

| Categoria | Exemplos de finalidade |
|---|---|
| Banco | URL de runtime e URL direta para migrações |
| Redis | conexão das filas e cache |
| Auth | assinatura de access/refresh token |
| Meta | app, webhook, tokens e WhatsApp |
| n8n | URL, chave pública e chave de automação |
| E-mail | provedor, remetente e credenciais |
| Storage | bucket, endpoint e chaves |
| Veículos | provedor de placa/FIPE |
| Observabilidade | Sentry e flags de métricas |

## Princípios

- Nunca versionar valores reais.
- Separar desenvolvimento, homologação e produção.
- Rotacionar imediatamente qualquer chave exposta em chat, log ou commit.
- `DIRECT_URL` é necessária para comandos Prisma que usam `directUrl`.
- A chave enviada pelo n8n deve ser exatamente a aceita pelo endpoint de automação.
- Configurações do frontend só podem conter valores públicos.

## Checklist de rotação

1. Gerar a nova credencial no provedor.
2. Atualizar o ambiente de runtime.
3. Atualizar credenciais do n8n sem expor o valor em nós.
4. Reiniciar/reimplantar os serviços.
5. Testar o caso real.
6. Revogar a credencial antiga.

Relacionados: [[Ambientes e Deploy]], [[Meta]], [[n8n]], [[Runbook Operacional]].

