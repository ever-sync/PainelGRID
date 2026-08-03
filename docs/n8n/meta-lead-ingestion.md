# Ingestao automatica de leads Meta

O receptor global do n8n deve enviar os leads para:

```text
POST https://api.gpdevendas.app/api/integrations/v1/leads/facebook/auto
```

O workflow termina nessa chamada. Vínculo ao evento e movimentação de CRM são
responsabilidades da API, usando o mapeamento salvo no painel do gestor; não
adicione IDs fixos ou chamadas complementares no n8n.

## Autenticacao

Use um Header Auth do n8n, sem gravar o segredo diretamente no workflow:

```text
X-Leadflow-Meta-Ingestion-Key: <LEADFLOW_META_INGESTION_API_KEY>
Content-Type: application/json
```

O segredo precisa ter pelo menos 32 caracteres e ser diferente da chave legada
de integracao. Na API ele e configurado em
`LEADFLOW_META_INGESTION_API_KEY`.

## Corpo

O endpoint recebe um array, mesmo quando existe somente um lead:

```json
[
  {
    "lead_id": "1946096999403754",
    "nome": "Raphael",
    "email": "raphael@example.com",
    "telefone": "+5512981092776",
    "preferencia_atendimento": "whatsapp",
    "formulario_id": "27515534804767924",
    "anuncio_id": "120247888509270620",
    "anuncio": "Novo anuncio de Leads",
    "campanha_id": "120247888509250620",
    "campanha": "Campanha de teste",
    "criado_em": "2026-07-14T02:25:25+0000",
    "origem": "facebook_lead_ads",
    "todos_os_campos": {}
  }
]
```

Nao envie `client_id`. A API resolve o cliente por `formulario_id`, usando
somente formularios selecionados em uma conexao Meta ativa no painel do gestor.

## Respostas de seguranca

- `401`: chave ausente ou invalida.
- `403`: formulario nao vinculado a nenhum cliente ativo.
- `409`: formulario vinculado a mais de um cliente; a importacao e bloqueada
  para evitar vazamento entre clientes.
- `503`: o segredo exclusivo de ingestao ainda nao foi configurado na API.

Todos os formularios do lote sao resolvidos antes da primeira gravacao. Depois
da resolucao, a importacao reutiliza a deduplicacao existente por lead Meta,
telefone e e-mail.
