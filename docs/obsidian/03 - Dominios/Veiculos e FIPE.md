# Veiculos e FIPE

## Responsabilidade

Enriquece a intenção de troca a partir da placa, armazenando marca, modelo, ano, cor, valor FIPE e dados retornados pelo provedor.

## Componentes

- API: `apps/api/src/modules/vehicles`.
- Persistência: `Vehicle` e campos de veículo no lead.
- Provedor externo: consulta veicular/APIBrasil e referência FIPE.

## Regra do Rubinho

O agente pede somente a placa. A API normaliza e consulta os demais dados; falha no enriquecimento não deve bloquear o credenciamento.

## Usos analíticos

- Potencial FIPE total de troca.
- Distribuição por marca, modelo e ano.
- Conversão por faixa FIPE.
- Demanda não convertida e inteligência de estoque.

## Riscos

- Indisponibilidade do provedor.
- Placa inválida ou sem retorno.
- Valores desatualizados.
- Exposição excessiva de dados veiculares.

