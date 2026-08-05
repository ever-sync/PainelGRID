# Follow-up — leads parados em EM_CONTATO há 1 hora

Workflow separado: `Follow-up - Em contato parado 1h`.

## Regra

Executa a cada 2 minutos e envia no máximo uma mensagem por execução. Assim, mantém um intervalo controlado entre os envios até esgotar os leads elegíveis. Seleciona somente leads que:

- estão em etapa `EM_CONTATO`;
- têm `updated_at` com pelo menos 60 minutos;
- possuem telefone;
- ainda não possuem a tag `followup_em_contato_1h`.

Depois do envio, adiciona essa tag para evitar repetição. Leads que já possuem essa tag nunca são selecionados novamente.

Mensagem:

```text
Opa, está por aí? Vamos terminar sua credencial 😊
```

## Configuração obrigatória

No node `Configuração do Follow-up`, preencher:

- `client_id`;
- `phone_number_id`.

Configurar duas credenciais no n8n:

- `PainelGRID - Integration Key`;
- `PainelGRID - WhatsApp Cloud API`.

O workflow deve permanecer inativo até testar com um único lead. Para contatos fora da janela de atendimento da WhatsApp Cloud API, use um template aprovado em vez de texto livre.
