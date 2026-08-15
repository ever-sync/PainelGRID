---
tags: [referencia, frontend, react, mobile]
status: mantido
atualizado: 2026-08-15
tipo: referencia
responsavel: equipe-engenharia
criticidade: media
---

# Catálogo Frontend

## Inicialização e sessão

`main.tsx` monta a aplicação e inicializa monitoramento. `App.tsx` restaura a sessão, escolhe o roteador por plataforma, faz lazy loading de todas as páginas e aplica `ProtectedRoute`, `TvProtectedRoute` e `RoleGuard`.

- Browser/PWA: `BrowserRouter`.
- Capacitor iOS/Android: `HashRouter`, evitando 404 em origem local.
- Web: refresh token em cookie HTTP-only.
- Mobile: endpoints móveis e token de renovação em storage seguro.
- Uma renovação concorrente é compartilhada para impedir múltiplos refreshes e logout em cascata.

## Rotas públicas

| Rota | Página/finalidade |
|---|---|
| `/login` | autenticação |
| `/esqueci-senha` | solicitar recuperação |
| `/convite` | entrada por convite |
| `/avaliacao/:token` | avaliação pública |
| `/cadastro-vendedor/:token` | auto-cadastro público |
| `/definir-senha/:token` | primeiro acesso/reset |
| `/eventos/:id/tv` | dashboard TV, autenticado para gestor/cliente |
| `/eventos/:id/tv-fila` | fila TV, autenticada para gestor/cliente |

## Rotas do gestor

| Rota | Função |
|---|---|
| `/gestor/dashboard` | visão consolidada |
| `/gestor/clientes` e `/:id` | clientes e detalhe operacional |
| `/gestor/vendedores/:id` | perfil do vendedor |
| `/gestor/crm` | kanban multicliente |
| `/gestor/relatorio` | relatório operacional |
| `/gestor/relatorio-executivo` | mídia, funil, atribuição e resultado |
| `/gestor/eventos` e `/:id` | eventos e configuração |
| `/gestor/eventos/:eventId/operacao/:clientId` | operação do participante |
| `/gestor/rubinho` | agentes e conhecimento |
| `/gestor/operacoes` | exceções e saúde |
| `/gestor/chat` | conversa operacional |
| `/gestor/lojas` | lojas |
| `/gestor/cursos` | capacitação |
| `/gestor/performance` | métricas técnicas |
| `/gestor/auditoria` | trilha do agente |
| `/gestor/configuracao` | conta/configuração |

## Rotas do cliente

`/cliente/dashboard`, `/eventos`, `/relatorio`, `/lojas`, `/leads`, `/vendedores`, `/campanhas`, `/emails`, `/veiculos`, `/cursos`, `/faq-rag`, `/conversas`, `/auditoria`, `/ajuda` e `/configuracao`.

## Rotas do vendedor

`/vendedor/dashboard`, `/leads`, `/vendas`, `/fila`, `/ranking`, `/chat`, `/cursos` e `/configuracao`.

## Rotas da recepção

`/recepcao/checkin`, `/fila`, `/ordem-vendedores` e `/configuracao`.

## Camada de acesso à API

| Service | Domínio |
|---|---|
| `http.ts` | base URL, headers, refresh, erros e request comum |
| `auth.ts`, `auth-session.ts` | login, 2FA, sessão web/mobile e perfil |
| `clients.ts`, `users.ts`, `staff.ts`, `stores.ts` | identidade organizacional |
| `leads.ts`, `crm.ts`, `appointments.ts` | jornada do lead |
| `events.ts`, `salesTeams.ts`, `sales.ts`, `vendorScore.ts` | operação do evento e resultado |
| `conversations.ts`, `realtime.ts`, `rubinho.ts` | comunicação e agente |
| `meta.ts`, `campaigns.ts`, `emailHistory.ts` | aquisição e disparos |
| `vehicles.ts` | estoque, catálogo e FIPE |
| `operations.ts`, `audit.ts`, `performance.ts`, `notifications.ts` | operação técnica |
| `publicCheckin.ts`, `publicVendorSignup.ts`, `serviceRatings.ts` | jornadas por token/públicas |
| `coursesApi.ts` | treinamento |

## Componentes de maior responsabilidade

- `AppLayout`: navegação por perfil, seleção de contexto e notificações.
- `CRMPage` e `components/gestor/crm`: kanban, filtros, drag-and-drop e perfil do lead.
- `MyDayPanel`: próximas ações atrasadas, de hoje e futuras, com conclusão e abertura do lead.
- `ClienteDetailPage`: composição ampla das configurações e dados de um cliente.
- `EventDetailPage`: participantes, permissões, equipes, campanhas, metas e operação do evento.
- `CheckinPage`: câmera/QR, busca, dados do lead e entrada no evento.
- `FilaPage`: fila, disponibilidade, chamada, troca e encerramento de atendimento.
- `OrdemVendedoresPage`: ordenação geral e posições por categoria.
- `QuickSaleModal`: venda rápida com regras condicionadas pelo papel e evento.
- `VeiculosPage`: estoque, galeria, catálogo de marca/modelo, importação e status em lote.
- `RelatorioExecutivoPage`: composição das métricas executivas.

## Estado, tempo real e cache

- A sessão autenticada vive no topo da aplicação.
- `useGestorClient` mantém o cliente selecionado pelo gestor.
- `useLeadRealtimeSync` transforma eventos do socket em revalidação coordenada.
- `realtime.ts` administra conexão/reconexão Socket.IO.
- A API é sempre a fonte final; eventos do socket não substituem uma busca após reconexão.
- Operações de CRM devem preservar rolagem horizontal e distinguir clique, scroll e arraste.

## PWA e servidor estático

`public/manifest.json` e `public/sw.js` definem a instalação/cache. `server.mjs` serve `dist`, faz fallback para `index.html`, aplica Brotli/Gzip, ETag, cache imutável para assets versionados e cabeçalhos CSP/HSTS/anti-frame. HTML e service worker usam `no-cache` para evitar clientes presos em versões antigas.

## Mobile

O aplicativo Capacitor tem ID `space.eversync.painelgrid` e nome `PainelGRID`. Utilitários locais abstraem haptics, clipboard, compartilhamento/download, plataforma, áudio e shell nativo. Recursos sensíveis — câmera no QR, armazenamento de sessão, retomada e permissões — exigem teste nativo além do navegador.

## Performance

- Páginas são carregadas com `React.lazy` e `Suspense`.
- Gráficos e scanner QR também usam carregamento diferido onde relevante.
- Web Vitals coletados: LCP, CLS, INP, FCP e TTFB.
- `VITE_PERFORMANCE_ENDPOINT` pode alterar o destino; em desenvolvimento, medições ficam em `window.__GRID_WEB_VITALS__`.
- `performance-budget.json`, o relatório de bundle e Lighthouse formam as barreiras de regressão.

## Variáveis públicas de build

| Nome | Uso |
|---|---|
| `VITE_API_URL` | origem da API |
| `VITE_PUBLIC_WEB_URL` | origem web usada em links públicos |
| `VITE_PERFORMANCE_ENDPOINT` | coleta de Web Vitals |
| `VITE_PERFORMANCE_DEBUG` | diagnóstico local de métricas |

Variáveis `VITE_*` entram no bundle em build-time e nunca podem conter segredo.

## Relacionamentos

- [[Frontend e Mobile]]
- [[Mapa de Telas]]
- [[Catalogo Backend]]
- [[Perfis e Permissoes]]
- [[Guia de Desenvolvimento Local]]
