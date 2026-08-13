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

## Auditoria

Registrar oferta, aceite/recusa, início, conclusão, resposta “comprou?”, venda e mudanças de disponibilidade.

## Relacionamentos

- [[Vendedores e Atendimento]]
- [[Vendas Scores e Relatorios]]

