---
tags: [arquitetura, frontend, mobile]
tipo: arquitetura
status: mantido
atualizado: 2026-08-15
responsavel: equipe-arquitetura
criticidade: media
---

# Frontend e Mobile

## Stack

- React 18, TypeScript, Vite e React Router.
- Capacitor para iOS e Android.
- Socket.IO client para tempo real.
- Recharts para gráficos, `html5-qrcode`/`qrcode` para QR.
- PWA e service worker.

## Organização de experiência

As páginas ficam em `apps/desktop/src/pages`, separadas por gestor, cliente, vendedor, recepção e rotas públicas. Serviços HTTP ficam em `apps/desktop/src/services`; componentes, hooks e contextos encapsulam comportamento compartilhado.

## Superfícies

- Gestor: configuração global, CRM, eventos, relatórios, Rubinho, operação e auditoria.
- Cliente: sua operação, campanhas, leads, equipe, conversas e veículos.
- Vendedor: disponibilidade, carteira, fila, atendimento e venda.
- Recepção: check-in e distribuição.
- Público: links por token.

Veja o inventário em [[Mapa de Telas]].

Rotas exatas, services, componentes de maior responsabilidade e variáveis públicas estão em [[Catalogo Frontend]].

## Mobile

Os diretórios `apps/desktop/ios` e `apps/desktop/android` são shells Capacitor do mesmo produto. Mudanças de autenticação, deep link, câmera e notificações precisam ser validadas também nos dispositivos.
