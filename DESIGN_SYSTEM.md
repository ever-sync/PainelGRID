# 🎨 Design System & UI/UX Directives — PainelGRID

> **DIRETRIZ OBRIGATÓRIA PARA AGENTES DE IA E DESENVOLVEDORES**
> Qualquer nova funcionalidade, componente, modal ou tela criada no PainelGRID **DEVE** seguir rigorosamente as especificações deste documento.

---

## 📌 1. Paleta de Cores e Identidade Visual

### 🔴 Cor Primária & Marca (Brand Color)
* **Vermelho Oficial GRID**: `#FF0636`
* **Hover State**: `#e1002d`
* **Active State**: `scale-[0.98]`
* **Focus Ring**: `ring-2 ring-[#FF0636] border-[#FF0636]`
* **Uso**: Botões de ação principal (CTAs), botões de destaque em modais, ícones ativos, indicadores de foco.

### 🌓 Modos Claro e Escuro (Theme System)
* **Modo Claro (Light Mode)**: Fundo branco limpo (`#ffffff`) ou cinza suave (`#f9fafb`), bordas sutis (`border-zinc-200`). **PROIBIDO** usar fundos amarelos, beges ou desbotados (`border-[#f0e4d4]`).
* **Modo Escuro (Dark Mode)**: Shell preto/cinza escuro (`#0c0d11`, `#111217`, `#121212`), bordas escuras (`border-zinc-800`).

---

## 📏 2. Padronização Obrigatória de Tamanho de Botões

**Nenhum botão de ação principal deve parecer fino ou pequeno demais.** Utilize a escala padrão abaixo via componente `<Button>` ou classes equivalentes:

| Tamanho | Altura (`height`) | Espaçamento (`padding`) | Fonte & Peso | Caso de Uso |
| :--- | :---: | :---: | :---: | :--- |
| **`xl` (Hero / Ação Principal)** | `h-12` (48px) | `px-6` (24px) | `text-sm font-extrabold` | Login, Salvar Cliente, Finalizar Venda |
| **`lg` (Cabeçalhos e Modais)** | `h-11` (44px) | `px-5` (20px) | `text-xs sm:text-sm font-bold` | CTAs de Modais (*Sincronizar*, *Conectar BM*, *Buscar CNPJ*) |
| **`default` / `md` (Padrão Médio)** | `h-10` (40px) | `px-4` (16px) | `text-xs sm:text-sm font-bold` | Botões em tabelas, ações em cards, filtros gerais |
| **`sm` (Compacto)** | `h-8` (32px) | `px-3` (12px) | `text-xs font-semibold` | Ações secundárias em linhas de tabela densa |
| **`xs` (Micro)** | `h-7` (28px) | `px-2.5` (10px) | `text-[11px] font-semibold` | Badges clicáveis, tags e chips |

---

## 📝 3. Padrão de Formulários e Modais (Pop-ups)

Em **TODOS** os modais e pop-ups de cadastro/edição no sistema (Clientes, Lojas, Vendedores, Veículos, Usuários):

1. **CNPJ na 1ª Posição**:
   * O campo **`CNPJ`** deve ser a posição número 1 no topo do formulário.
   * Deve possuir o botão integrado **`[ 🔍 Buscar ]`** que consulta a Receita Federal / BrasilAPI e preenche automaticamente Razão Social, Logradouro, Bairro, Cidade, Estado, CEP e Telefone.

2. **Ícones Dedicados em Cada Campo**:
   * Todo campo de entrada precisa ter um ícone dinâmico alinhado à esquerda (`absolute left-3.5` com `pointer-events-none text-zinc-400`).
   * Ícones padronizados:
     * `Building2`: CNPJ / Razão Social
     * `Store`: Nome Fantasia / Nome da Loja
     * `MapPin`: Logradouro / Endereço
     * `Hash`: Número
     * `Building`: Complemento
     * `Home`: Bairro
     * `Globe`: Cidade / Estado / Site
     * `FileText`: CEP / Documento
     * `Phone`: Telefone / WhatsApp
     * `Mail`: E-mail
     * `Lock`: Senha
     * `Tag`: Categoria / Marca

3. **Estilo dos Inputs**:
   ```tsx
   className="w-full h-11 pl-10 pr-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-[#FF0636] shadow-sm"
   ```

---

## 📊 4. Matriz de Ativos da Meta Ads & Conexões

Na aba **Ads (Facebook)** no Perfil do Cliente:
1. **Topo Limpo com 2 Botões à Direita**:
   * `[ 🔄 Sincronizar ]`: Sincronização em tempo real via Graph API.
   * `[ 🔗 Conectar / Trocar BM ]`: Fluxo de seleção de Business Manager.
2. **Tabela de Matriz com 6 Colunas Exatas**:
   * `BM (BUSINESS MANAGER)`
   * `PÁGINA`
   * `CA (CONTA ANÚNCIO)`
   * `FORM (FORMULÁRIOS)`
   * `WHATSAPP`
   * `STATUS`

---

## 🔔 5. Notificações e Navegação

* O sino de notificações (`<Bell />`) fica localizado no menu lateral, **imediatamente acima do botão de alternância do Dark Mode**.
* Badges numéricos estáticos e sem dados não devem ser exibidos em itens de menu fixos.

---

## 🤖 Diretiva para Agentes de IA

Ao receber instruções para criar ou editar qualquer tela:
1. Consulte a escala de botões em `Button.tsx`.
2. Garanta ícones nos formulários e CNPJ em 1º lugar onde couber.
3. Não utilize tons de fundo amarelados ou bege.
4. Execute `npm run build` ao finalizar a alteração para verificar que não há erros de compilação JSX.
