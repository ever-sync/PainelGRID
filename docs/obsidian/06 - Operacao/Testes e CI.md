# Testes e CI

## GitHub Actions

O workflow `.github/workflows/ci.yml` usa Node 20 e executa, em essência:

1. Instalação com `npm ci`.
2. Geração do Prisma Client.
3. Comando agregado `npm run ci`.
4. Verificações Lighthouse.
5. Publicação de artefatos quando aplicável.

## Camadas de teste

- Unitários para serviços e regras de negócio.
- Integração para endpoints e persistência.
- E2E para jornadas críticas.
- Smoke tests pós-deploy.
- Scripts de homologação do Rubinho.

## Cenários mínimos

- Login e refresh sem logout inesperado.
- Importação idempotente de lead Meta.
- Roteamento correto quando um número atende vários clientes.
- Data escolhida cria agendamento e movimenta o card.
- Credenciamento envia QR uma única vez.
- Lead sem e-mail continua recebendo WhatsApp.
- Exclusão remove conversa, memória, auditoria e rastros previstos.
- Vendedor ocupado/ausente não recebe atendimento.

## Antes do push

```bash
npm run ci
git diff --check
```

Relacionados: [[Ambientes e Deploy]], [[Riscos e Divida Tecnica]], [[Runbook Operacional]].

