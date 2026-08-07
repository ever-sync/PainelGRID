# Publicação do PainelGRID na App Store

App Capacitor 6.2.1 (`apps/desktop`), bundle ID `space.eversync.painelgrid`,
target iOS 13.0, **somente iPhone**, Xcode 26.6.

## 1. Pré-requisitos (fora do repo)

| Item | Status | Observação |
| --- | --- | --- |
| Conta Apple Developer Program | ✅ | |
| Xcode 26.6 | ✅ instalado | SDK iOS 26.5 |
| CocoaPods | ❌ **ausente** | Bloqueia o build. Ver passo 2. |
| Política de privacidade publicada | **pendente** | URL obrigatória no App Store Connect. |
| Conta demo para a revisão | **pendente** | O app abre em tela de login; a Apple rejeita se não conseguir entrar. |

## 2. Instalar CocoaPods (bloqueio atual)

O Ruby do sistema é o 2.6.10, antigo demais para as versões atuais do
CocoaPods. Caminho recomendado — Homebrew, que traz o próprio Ruby:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install cocoapods
```

Alternativa sem Homebrew (usa o Ruby do sistema, pode falhar em versões novas):

```bash
sudo gem install cocoapods -n /usr/local/bin
```

Confirme com `pod --version`.

## 3. Build do bundle web + sync

```bash
cd apps/desktop
npm run mobile:build     # build:capacitor + cap sync
```

`build:capacitor` usa `.env.capacitor`, que aponta para a API de produção
(`leadflowapi-production-5dd5.up.railway.app`). **As `VITE_*` entram no bundle em
build-time** — conferir os valores antes de gerar o build que vai para a loja.

Com CocoaPods instalado, o `cap sync` roda o `pod install` sozinho. Sem ele, o
sync avisa `Skipping pod install because CocoaPods is not installed` e o
workspace não compila.

## 4. Assinatura no Xcode

```bash
cd apps/desktop && npx cap open ios
```

No target **App** → aba **Signing & Capabilities**:

- Marcar *Automatically manage signing*
- Selecionar o **Team** da conta Apple Developer
- Conferir o bundle ID: `space.eversync.painelgrid`

O `DEVELOPMENT_TEAM` ainda não está no `project.pbxproj` — é preenchido nesse
passo e passa a versionar junto.

## 5. Versão e build

Hoje: `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`. Serve para o
primeiro envio. A cada novo upload **o build precisa subir** (1 → 2 → 3…),
mesmo que a versão de marketing não mude.

## 6. Archive e upload

No Xcode: destino **Any iOS Device (arm64)** → *Product > Archive* → *Distribute
App* → *App Store Connect* → *Upload*.

## 7. App Store Connect

1. Criar o app (bundle ID `space.eversync.painelgrid`).
2. Preencher: nome, subtítulo, descrição, palavras-chave, categoria e
   screenshots. O app é **iPhone-only** (`TARGETED_DEVICE_FAMILY = "1"`), então
   só são exigidos os tamanhos de iPhone (6,9" e 6,5") — nada de iPad.
3. **App Privacy**: as respostas precisam bater com o
   `ios/App/App/PrivacyInfo.xcprivacy` deste repo (e-mail, nome, telefone,
   fotos/vídeos, conteúdo do usuário — todos vinculados ao usuário, sem
   rastreamento).
4. **App Review Information**: usuário e senha de demonstração + observações
   explicando que é uma ferramenta B2B para concessionárias.
5. Export compliance: já respondido no Info.plist
   (`ITSAppUsesNonExemptEncryption = false`, pois o app só usa HTTPS padrão).

## 8. Pontos que costumam gerar rejeição aqui

- **Exclusão de conta (5.1.1(v))** — hoje **não há cadastro pelo app**: as contas
  são provisionadas pela EverSync. Escrever isso nas notas da revisão, com
  estas palavras ou equivalentes:

  > Não há criação de conta no aplicativo. As credenciais são provisionadas pela
  > EverSync para funcionários da concessionária cliente. Segue abaixo um acesso
  > de demonstração.

  **Quando o cadastro aberto for lançado, a diretriz passa a valer** e o app
  precisará de exclusão de conta pela própria interface, senão a atualização é
  rejeitada.
- **Notificações**: o código usa a Web Notification API, que **não existe** no
  WKWebView. No iOS não há banner nativo — só o sino dentro do app. Para
  notificação de verdade seria preciso `@capacitor/local-notifications` e/ou
  `@capacitor/push-notifications` (APNs). Não instalados.
- **"Web wrapper" (4.2)** — apps que são só um site embrulhado são rejeitados.
  Ajuda ter câmera/QR, haptics, share e armazenamento seguro nativos, que o app
  já usa.
- **iPad** — resolvido: o target é iPhone-only, então a Apple não testa em iPad
  nem cobra screenshots de iPad.

## 9. Opcional

- `IPHONEOS_DEPLOYMENT_TARGET` está em 13.0; a Apple recomenda 15.0 no SDK atual.
  Subir reduz avisos dos pods, mas corta iPhones anteriores ao 6s.
- `localStorage` no WKWebView pode ser limpo pelo iOS. O feed de notificações e
  outras preferências ganhariam robustez migrando para `@capacitor/preferences`,
  que já é dependência do projeto.
