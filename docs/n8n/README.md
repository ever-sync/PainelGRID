# Workflows do n8n

Os arquivos em `workflows/` são cópias sanitizadas para revisão e histórico no
Git. Eles não contêm o conteúdo das Credentials, dados fixados de execuções ou
IDs reais das Credentials.

## Arquitetura do webhook da Meta

A mesma URL pública usa workflows separados por método HTTP:

- `Meta Leads - Verificação GET`: valida `hub.mode`, o hash do token e devolve
  `hub.challenge`. Execuções de sucesso e erro não são armazenadas.
- `Form - EVENTO`: recebe somente eventos `POST`, busca os dados completos na
  Graph API, normaliza o payload e envia para o endpoint global de ingestão.
  Cliente, evento, pipeline, etapas e template de WhatsApp nunca ficam gravados
  no workflow; a API resolve tudo pelo formulário configurado no painel.

Separar os métodos evita que alterações na validação do callback afetem o
processamento dos leads.

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
- `BACKUP FASE 5 2026-08-03 - Form - EVENTO`

As cópias inativas preservam a estrutura anterior à separação GET/POST e
referenciam as Credentials criptografadas da instância, sem repetir tokens nos
parâmetros. Os exports deste diretório devem sempre ser gerados a partir dos
workflows ativos.

## Refatorar o Form - EVENTO

O script abaixo valida a transformação sem alterar o n8n:

```bash
N8N_API_KEY='<chave-temporaria>' npm run n8n:refactor:form-evento
```

Para criar o backup inativo e publicar a versão sem dados fixos:

```bash
N8N_API_KEY='<chave-temporaria>' npm run n8n:refactor:form-evento -- --apply
```

## Rotação segura

1. Gere uma credencial nova no provedor.
2. Atualize a Credential correspondente no n8n.
3. Teste a chamada e uma execução controlada.
4. Só então revogue a credencial antiga.
5. Gere novamente os exports sanitizados.
