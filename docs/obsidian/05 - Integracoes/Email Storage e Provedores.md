---
tipo: integracao
status: mantido
atualizado: 2026-08-15
responsavel: equipe-integracoes
criticidade: alta
tags: [painelgrid, integracao]
---

# Email, Storage e Provedores

## E-mail

E-mails operacionais devem sair pela API da plataforma, com histórico e idempotência. Casos principais:

- Credencial/QR Code após agendamento ou conclusão.
- Tentativa 2 para contatos sem resposta.
- Convites, redefinição de senha e notificações.

Ausência de e-mail não deve bloquear o agendamento nem a entrega via WhatsApp.

## Storage

Arquivos e mídias incluem QR Codes, anexos de conversa, documentos do Rubinho e materiais de cursos. A persistência deve guardar URL, tipo, proprietário e vínculo de domínio.

## Provedores externos

- Meta Graph API e WhatsApp Cloud API.
- Provedor de e-mail configurado por ambiente.
- API de consulta de veículo/FIPE.
- Sentry para erros e performance.

## Segurança

- Segredos somente em variáveis ou cofres de credenciais.
- URLs assinadas quando o conteúdo não for público.
- Retenção compatível com LGPD.
- Nunca registrar corpo completo contendo token.

Relacionados: [[WhatsApp]], [[Veiculos e FIPE]], [[Configuracao e Variaveis]], [[Observabilidade]].

