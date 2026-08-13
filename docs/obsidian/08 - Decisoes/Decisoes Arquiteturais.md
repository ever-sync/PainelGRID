# Decisões Arquiteturais

## Decisões vigentes

### Monorepo TypeScript

API, desktop e pacotes compartilhados vivem no mesmo repositório para compartilhar tipos, componentes e validações.

### PostgreSQL como fonte de verdade

CRM, estado do agente, auditoria, agendamentos e atribuição são persistidos. Memória de conversa não decide sozinha o próximo passo.

### Multi-tenant por cliente e evento

Telefone isolado não define contexto. Toda resolução sensível considera o vínculo operacional do lead.

### Operações críticas idempotentes

Webhooks, disparos, reconciliação de agendamento e entrega de credencial não podem duplicar efeitos.

### Rubinho híbrido

A IA cuida da linguagem e interpretação; o fluxo determinístico valida estado, datas, movimentação, status e entrega.

### QR Code após agendamento válido

A credencial depende de agendamento ativo e entrega comprovada. Não deve ser prometida apenas pelo texto do agente.

### Relatórios auditáveis

Receita, presença, vendas, mensagens e atribuição devem apontar para registros reais e declarar cobertura.

## Como registrar nova decisão

1. Copie [[ADR]].
2. Descreva contexto, alternativas e consequência.
3. Vincule os domínios afetados.
4. Atualize este índice.

## Relacionamentos

- [[Arquitetura Geral]]
- [[Riscos e Divida Tecnica]]
- [[Auditoria e Estado]]

