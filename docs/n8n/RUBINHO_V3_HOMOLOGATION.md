# Rubinho v3 — homologação e liberação gradual

## Isolamento

- Workflow de produção: `rQ92Kohukkw7X7ex` (`Rubinho v2`).
- Workflow de homologação: `tBDavTDvbhc4QTWD`.
- Estado inicial da homologação: inativo.
- Commit usado como baseline: `8bf316a2b6f28dea5b0eb54367b6963c2444ce9a`.
- SHA-256 do export de produção: `084914a37a7f4d56508b7b79871c4b64b3ae4eb613d6e82005d77b34705ca8eb`.

O script `patch-rubinho-v2-deterministic-scheduling.ts` cria uma cópia
inativa por padrão. Atualizar um workflow existente exige informar um alvo
separado; atualizar o próprio workflow de origem exige ainda
`N8N_ALLOW_UPDATE_EXISTING=true`.

## Contratos da versão

1. A API deriva a etapa canônica usando somente dados persistidos do lead.
2. Campos vazios enviados pelo n8n são descartados e não apagam dados válidos.
3. A primeira data válida cria/reutiliza o agendamento, muda o status para
   `scheduled`, move para `PRESENCA_AGENDADA` e adiciona `agendado`.
4. A movimentação é silenciosa; a mensagem seguinte pergunta apenas sobre a
   troca de veículo.
5. O validador bloqueia avanço, conclusão ou anúncio de QR sem evidência.
6. Toda ação bloqueada registra `block_reason`, estado anterior, ferramenta,
   entrada, resposta e estado resultante.
7. A recuperação é `dry-run` por padrão e nunca envia mensagens.
8. Conversas em `COMPLETED` permanecem concluídas quando o lead faz perguntas
   posteriores; uma dúvida não reabre a confirmação final.
9. O tom V4 evita bordões automáticos, repetição integral da mesma resposta e
   promessas de QR sem evidência da API.

## Matriz mínima de homologação

- Lead novo com e sem nome de perfil.
- Um, vários e nenhum acompanhante.
- Nome de acompanhante enviado corretamente e resposta numérica inválida.
- Três formas de escolher data: número, data e dia da semana.
- Data ambígua e data fora do evento.
- Com e sem carro na troca.
- Placa válida e falha de consulta FIPE.
- Correção de nome, acompanhante, data e placa fora de ordem.
- Resposta automática de empresa.
- Confirmação final com sucesso e com falha da API.
- Retentativa idempotente da confirmação e da entrega do QR.
- Cliente e evento diferentes usando o mesmo número do Rubinho.
- Handoff humano e retomada autorizada.

## Gate para canário

Antes de ativar a homologação para qualquer tráfego:

- typecheck sem erros;
- testes unitários e determinísticos verdes;
- zero alteração no workflow de produção;
- zero `Oi, !` nos cenários;
- uma pergunta por mensagem;
- 100% dos bloqueios com motivo;
- nenhum anúncio de QR sem registro de entrega;
- cliente, evento e lead iguais antes e depois de cada turno.

## Canário

1. Selecionar um único cliente de teste e dois números internos.
2. Direcionar somente esses números ao workflow de homologação.
3. Executar a matriz completa e observar no mínimo 20 turnos.
4. Auditar manualmente lead, estado, appointment, timeline, action log e
   dispatch do QR.
5. Expandir para 10% do tráfego de um cliente apenas se todos os gates
   permanecerem verdes.
6. Manter o canário por pelo menos duas horas antes de ampliar.

## Rollback

1. Remover o roteamento do canário para `tBDavTDvbhc4QTWD`.
2. Manter `rQ92Kohukkw7X7ex` como workflow ativo.
3. Não apagar a homologação; desativá-la para preservar as execuções.
4. Rodar a recuperação em `dry-run` para listar estados afetados.
5. Aplicar recuperação somente por cliente ou conversa e com confirmação
   explícita.

## Recuperação controlada

Somente leitura:

```bash
npm --workspace @leadflow/api run rubinho:recover -- --hours=24
```

Aplicação limitada a uma conversa:

```bash
npm --workspace @leadflow/api run rubinho:recover -- \
  --conversation-id=UUID \
  --apply \
  --confirm=RECOVER_RUBINHO_STATE
```

O modo `apply` exige `--conversation-id` ou `--client-id` e grava um
`AgentActionLog` para cada correção.

## Evidências da homologação

- Validador determinístico: 6 cenários aprovados, incluindo dúvida depois de
  `COMPLETED`.
- Estrutura n8n: 14 verificações aprovadas.
- API: build e typecheck aprovados.
- Suíte crítica: 81 testes aprovados.
- Recovery de 24 horas: 510 conversas inspecionadas em `dry-run`; nenhuma
  alteração aplicada automaticamente.
- Produção permaneceu ativa e sem alteração durante todo o processo.
