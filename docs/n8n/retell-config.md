# Configuração Retell — Ligação IA

## Variáveis necessárias

- `RETELL_AGENT_ID`
- `RETELL_API_KEY` (credencial do Retell, nunca no JSON exportado)
- `RETELL_PHONE_NUMBER`
- `PAINELGRID_INTEGRATION_KEY` (credencial HTTP do n8n)
- `PAINELGRID_CLIENT_ID`

## Regras do agente

O agente de voz deve reutilizar a mesma ordem do Rubinho:

1. nome completo;
2. acompanhantes;
3. data do evento;
4. interesse em carro na troca;
5. placa, modelo e ano quando aplicável;
6. resumo dos dados;
7. confirmação explícita;
8. atualização final e QR Code.

O agente não deve afirmar que salvou ou confirmou algo sem receber resposta de sucesso da ferramenta.

## Ferramentas que serão conectadas

- `consultar_lead_por_telefone`: somente leitura;
- `atualizar_dados_lead`: atualiza apenas campos informados;
- `mover_lead_crm`: permitido somente após validação final;
- `atualizar_status_lead`: `scheduled` somente após confirmação explícita;
- `registrar_resultado_ligacao`: salva transcrição, duração e resultado.

O QR Code não deve ser enviado durante a coleta. A API fará o envio depois da confirmação válida.
