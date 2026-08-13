# Riscos e Dívida Técnica

## Alta prioridade

| Risco | Impacto | Mitigação |
|---|---|---|
| Workflows n8n mutáveis fora do Git | produção diverge do código e da documentação | exportar versões, homologar e registrar mudança |
| Roteamento de um WhatsApp para vários clientes | conversa recebe evento incorreto | resolver por lead, dispatch, formulário, cliente e evento; default deny |
| Credenciais e tokens operacionais | expiração, vazamento ou escopo errado | cofre, rotação, health check e mínimo privilégio |
| Entrega de QR dependente de vários passos | lead agenda mas não recebe credencial | idempotência, agendamento ativo, auditoria e retentativa |
| Relatórios com atribuição incompleta | decisão executiva errada | fonte e cobertura explícitas, dados reais e reconciliação |

## Média prioridade

- Nomes de campanha ausentes em imports antigos.
- Scripts de backfill e migrações podem divergir do schema atual.
- Prompts grandes aumentam latência e tornam a decisão menos determinística.
- Memória do agente pode carregar tool messages inválidas ou contexto de outra jornada.
- Algumas interfaces têm estados mockados ou fallbacks permissivos.
- Limites distintos de paginação entre frontend e API causam erros como `take > 300`.
- Socket e cache precisam de invalidação coerente para não exibir conversas antigas.

## Princípios de redução

1. Estado de negócio no banco, não apenas na memória do agente.
2. Uma operação transacional por mudança crítica.
3. Idempotência para webhook, disparo, agendamento e credencial.
4. Métrica com fonte e cobertura visíveis.
5. Fallback explícito para intervenção humana.
6. Workflows exportados e versionados.
7. Testes de contrato para integrações externas.

## Relacionamentos

- [[Auditoria e Estado]]
- [[Observabilidade]]
- [[Testes e CI]]
- [[Decisoes Arquiteturais]]

