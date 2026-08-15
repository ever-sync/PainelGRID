---
tipo: jornada
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-operacao
criticidade: media
tags: [painelgrid, jornada]
---

# Atendimento ate Venda

## Fluxo

1. Vendedor aceita a oferta.
2. Atendimento fica ativo e mantém o vendedor ocupado.
3. O vendedor finaliza explicitamente.
4. O sistema pergunta se houve compra.
5. Em caso positivo, registra venda, valor, vendedor, equipe, lead e evento.
6. Em ambos os casos, encerra atendimento e devolve o vendedor ao estado online.

## Integridade

- Uma venda não pode ser atribuída apenas por inferência.
- `vendor_id`, `team_id` e `value` da venda são a fonte da receita real.
- Encerramento precisa ser idempotente.
- A fila só redistribui após liberação confirmada.
- A venda exige também tipo/modelo e pode guardar número do pedido.
- Gestor, vendedor e recepção chegam à venda por caminhos diferentes; as flags do evento determinam criar, editar e excluir.
- Venda rápida da recepção ainda precisa produzir o mesmo estado final, score, atribuição e realtime de uma venda originada no atendimento.

## Auditoria

Registrar oferta, aceite/recusa, início, conclusão, resposta “comprou?”, venda e mudanças de disponibilidade.

## Relacionamentos

- [[Vendedores e Atendimento]]
- [[Vendas Scores e Relatorios]]
