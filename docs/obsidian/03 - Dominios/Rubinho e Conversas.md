---
tipo: dominio
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-engenharia
criticidade: media
tags: [painelgrid, dominio]
---

# Rubinho e Conversas

## Responsabilidade

O Rubinho conduz o credenciamento por WhatsApp usando contexto persistente, dados do evento e ferramentas transacionais.

## Componentes

- API: módulos `agent`, `rubinho`, `conversations` e `automations`.
- n8n: roteamento do webhook, consulta de contexto, agente, ferramentas e entrega da resposta.
- Persistência: `Conversation`, `Message`, `ConversationState`, `AgentActionLog`, `RubinhoAgent`, FAQs e documentos.

## Estado recomendado

1. `WAITING_FULL_NAME`
2. `WAITING_EVENT_DATE`
3. `WAITING_COMPANIONS`
4. `WAITING_COMPANION_NAMES`, quando aplicável
5. `WAITING_TRADE_IN`
6. `WAITING_VEHICLE_PLATE`, quando aplicável
7. `WAITING_FINAL_CONFIRMATION`
8. `COMPLETED`

## Princípios

- Estado persistente e dados do lead vencem a memória textual.
- A mensagem atual responde à pergunta pendente e deve ser persistida antes do avanço.
- Uma pergunta por mensagem.
- A descrição do evento é a única fonte comercial autorizada.
- A IA interpreta; mutações críticas ficam em endpoints e nós determinísticos.
- Após `COMPLETED`, dúvidas não reiniciam o credenciamento.

## Auditoria

Cada decisão deve registrar estado anterior, mensagem, próxima etapa, ferramenta, dados enviados, resposta, estado resultante e motivo de bloqueio/handoff.

## Relacionamentos

- [[Credenciamento Rubinho e QR Code]]
- [[WhatsApp e Templates]]
- [[Mapa de API]]
- [[Riscos e Divida Tecnica]]

