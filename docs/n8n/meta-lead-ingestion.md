# Ingestao automatica de leads Meta

O receptor global do n8n deve enviar os leads para:

```text
POST https://api.gpdevendas.app/api/integrations/v1/leads/facebook/auto
```

O workflow termina nessa chamada. Vínculo ao evento e movimentação de CRM são
responsabilidades da API, usando o mapeamento salvo no painel do gestor; não
adicione IDs fixos ou chamadas complementares no n8n.

O envio inicial do WhatsApp também pertence à API. Não adicione ao workflow um
node com token da Meta, `phone_number_id`, nome de template ou telefone fixo.

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
    "conjunto_id": "120247888509260620",
    "conjunto": "Publico amplo",
    "criativo_id": "120247888509280620",
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
`conjunto_id`, `conjunto` e `criativo_id` sao opcionais. Quando nao vierem do
n8n, a API completa a hierarquia pelo `anuncio_id` ja sincronizado da Meta.

## Roteamento e template

No painel do gestor, abra o cliente e configure cada formulário selecionado com:

- evento;
- pipeline;
- etapa para ligação;
- etapa para WhatsApp;
- template aprovado do WhatsApp, opcional, e o conteúdo de cada parâmetro.

Quando `preferencia_atendimento` for `ligacao`, a API move o lead para a etapa
de ligação e nunca envia WhatsApp. Quando for `whatsapp`, move para a etapa de
WhatsApp e envia o template configurado usando o número e a credencial Meta do
próprio cliente. Um reenvio exato do mesmo `lead_id` é deduplicado e não dispara
o template novamente.

O resultado de cada item inclui `whatsapp_dispatch`:

- `sent`: template aceito pela Meta;
- `not_requested`: o canal escolhido foi ligação;
- `skipped`: entrega duplicada, telefone ausente ou template não configurado;
- `failed`: o lead foi salvo, mas a Meta recusou ou não concluiu o envio.

Falha de envio não desfaz o cadastro e o roteamento já confirmados no banco. A
fila de retries e alertas será tratada na fase operacional seguinte.

## Respostas de seguranca

- `401`: chave ausente ou invalida.
- `403`: formulario nao vinculado a nenhum cliente ativo.
- `409`: formulario vinculado a mais de um cliente; a importacao e bloqueada
  para evitar vazamento entre clientes.
- `422`: formulario selecionado, mas sem evento/pipeline/etapas configurados.
- `503`: o segredo exclusivo de ingestao ainda nao foi configurado na API.

Todos os formularios do lote sao resolvidos antes da primeira gravacao. Depois
da resolucao, a importacao reutiliza a deduplicacao existente por lead Meta,
telefone e e-mail.

## Atribuicao para relatorios

Na mesma transacao do cadastro, a API grava uma entrada de atribuicao com lead,
formulario, evento, campanha, conjunto, anuncio, criativo, canal e data original.
Esse historico e usado para cruzar os dados comerciais com o investimento diario
sincronizado da Meta nos tres niveis:

- leads, agendamentos, comparecimentos e vendas;
- receita atribuida;
- CPL, custo por agendamento e custo por venda;
- ROAS e ROI sobre a receita atribuida.

Para leads anteriores a esta versao, a migracao recupera campanha, conjunto e
anuncio usando os IDs que ja estavam salvos. Ela nao reenvia templates nem cria
mensagens de WhatsApp.
