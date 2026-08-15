---
tipo: dashboard
status: mantido
atualizado: 2026-08-15
responsavel: equipe-engenharia
criticidade: media
tags: [painelgrid, dashboard, documentacao]
---

# Painel da Documentação

Este painel transforma as propriedades das notas em visões operacionais. Use o seletor no topo da Base para alternar entre documentação completa, revisão necessária, alta criticidade e atualizações recentes.

![[Base da Documentacao.base#Toda documentação]]

## Governança

| Propriedade | Uso |
|---|---|
| `tipo` | natureza da nota: domínio, jornada, integração, operação, referência etc. |
| `status` | `mantido`, `rascunho`, `proposta`, `investigando`, `aberta` ou estado equivalente |
| `atualizado` | última validação contra código ou operação real |
| `responsavel` | equipe ou pessoa que deve revisar a nota |
| `criticidade` | impacto de uma informação incorreta: baixa, média ou alta |
| `tags` | descoberta transversal e agrupamento |

## Rotina recomendada

1. Antes de uma mudança, abrir a nota do domínio e seus backlinks.
2. Criar a nota operacional pelo template adequado.
3. Atualizar `status`, `responsavel` e `atualizado` durante o trabalho.
4. Rodar `npm run docs:sync` após alterações estruturais e `npm run docs:check` antes do commit.
5. Revisar semanalmente as visões **Revisão necessária** e **Alta criticidade**.

## Templates disponíveis

- [[ADR]]
- [[Runbook]]
- [[Funcionalidade]]
- [[Incidente]]
- [[Integracao]]
- [[Mudanca de API]]
- [[Migracao de Banco]]
- [[Release]]
- [[Divida Tecnica]]

## Relacionamentos

- [[00 - Inicio]]
- [[Inventario do Repositorio]]
- [[Testes e CI]]
