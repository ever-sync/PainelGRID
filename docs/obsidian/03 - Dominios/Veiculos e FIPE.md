---
tipo: dominio
status: mantido
atualizado: 2026-08-15
responsavel: equipe-produto-engenharia
criticidade: media
tags: [painelgrid, dominio]
---

# Veiculos e FIPE

## Responsabilidade

Enriquece a intenção de troca a partir da placa, armazenando marca, modelo, ano, cor, valor FIPE e dados retornados pelo provedor.

## Componentes

- API: `apps/api/src/modules/vehicles`.
- Persistência: `Vehicle`, `VehicleCatalog` e campos de veículo no lead.
- Provedor externo: consulta veicular/APIBrasil e referência FIPE.

## Regra do Rubinho

O agente pede somente a placa. A API normaliza e consulta os demais dados; falha no enriquecimento não deve bloquear o credenciamento.

## Usos analíticos

- Potencial FIPE total de troca.
- Distribuição por marca, modelo e ano.
- Conversão por faixa FIPE.
- Demanda não convertida e inteligência de estoque.

## Estoque e catálogo

- `Vehicle` representa o estoque do cliente, incluindo imagem principal, galeria, categoria, condição, anos, km, preço, lojas e status.
- `VehicleCatalog` normaliza marcas e modelos por códigos e alimenta seletores.
- A API permite sincronizar/importar catálogo e ativar/desativar veículos em lote.
- Catálogo global, estoque e veículo pretendido pelo lead são conceitos diferentes.

## Riscos

- Indisponibilidade do provedor.
- Placa inválida ou sem retorno.
- Valores desatualizados.
- Exposição excessiva de dados veiculares.
