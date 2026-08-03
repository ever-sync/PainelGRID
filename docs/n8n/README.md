# Workflows do n8n

Os arquivos em `workflows/` são cópias sanitizadas para revisão e histórico no
Git. Eles não contêm o conteúdo das Credentials, dados fixados de execuções ou
IDs reais das Credentials.

## Exportar

Use uma chave da API do n8n somente como variável temporária do processo:

```bash
N8N_API_KEY='<chave-temporaria>' npm run n8n:export
```

Para conferir se os arquivos versionados correspondem aos workflows publicados:

```bash
N8N_API_KEY='<chave-temporaria>' npm run n8n:export -- --check
```

Nunca salve a chave no repositório nem exporte workflows brutos. A pasta
`docs/n8n/raw/` e arquivos `*.n8n-raw.json` são ignorados pelo Git.

## Backups na instância

Em 03/08/2026 foram criadas cópias inativas antes da migração dos segredos:

- `BACKUP SANITIZADO 2026-08-03 - Form - EVENTO`
- `BACKUP SANITIZADO 2026-08-03 - Rubinho v1`

As cópias inativas preservam a estrutura para recuperação e referenciam as
Credentials criptografadas da instância, sem repetir tokens nos parâmetros. Os
exports deste diretório devem sempre ser gerados a partir dos workflows ativos.

## Rotação segura

1. Gere uma credencial nova no provedor.
2. Atualize a Credential correspondente no n8n.
3. Teste a chamada e uma execução controlada.
4. Só então revogue a credencial antiga.
5. Gere novamente os exports sanitizados.
