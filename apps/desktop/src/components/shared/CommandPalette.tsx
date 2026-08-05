import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Users,
  Store,
  Calendar,
  CarFront,
  MessageSquare,
  Sparkles,
  Settings,
  BarChart3,
  Moon,
  Sun,
  KanbanSquare,
  Building2,
  X,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";

interface CommandItem {
  id: string;
  category: "Navegação" | "Ações Rápidas" | "Módulos";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  badge?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items: CommandItem[] = [
    {
      id: "nav-dashboard",
      category: "Navegação",
      title: "Dashboard Geral",
      subtitle: "Indicadores principais de desempenho e conversão",
      icon: <BarChart3 className="size-4 text-[#FF0636]" />,
      action: () => {
        navigate("/gestor");
        onClose();
      },
    },
    {
      id: "nav-clientes",
      category: "Navegação",
      title: "Clientes & Contratantes",
      subtitle: "Gestão de empresas ativas e parametrização",
      icon: <Building2 className="size-4 text-blue-500" />,
      action: () => {
        navigate("/gestor/clientes");
        onClose();
      },
    },
    {
      id: "nav-crm",
      category: "Navegação",
      title: "CRM & Funil de Leads",
      subtitle: "Kanban de acompanhamento de vendas e propostas",
      icon: <KanbanSquare className="size-4 text-amber-500" />,
      action: () => {
        navigate("/gestor/crm");
        onClose();
      },
    },
    {
      id: "nav-eventos",
      category: "Navegação",
      title: "Eventos & Feirões",
      subtitle: "Gestão de equipes, metas e telão ao vivo",
      icon: <Calendar className="size-4 text-purple-500" />,
      action: () => {
        navigate("/gestor/eventos");
        onClose();
      },
    },
    {
      id: "nav-chat",
      category: "Navegação",
      title: "Central de Mensagens (Chat)",
      subtitle: "Atendimento multicanal via WhatsApp Business API",
      icon: <MessageSquare className="size-4 text-emerald-500" />,
      action: () => {
        navigate("/gestor/chat");
        onClose();
      },
    },
    {
      id: "nav-rubinho",
      category: "Navegação",
      title: "IA Rubinho (Copilot de Vendas)",
      subtitle: "Treinamento de FAQ, prompts e suporte inteligente",
      icon: <Sparkles className="size-4 text-pink-500" />,
      action: () => {
        navigate("/gestor/rubinho");
        onClose();
      },
    },
    {
      id: "nav-lojas",
      category: "Módulos",
      title: "Lojas & Unidades",
      subtitle: "Cadastro de filiais e endereços do cliente",
      icon: <Store className="size-4 text-indigo-500" />,
      action: () => {
        navigate("/cliente/lojas");
        onClose();
      },
    },
    {
      id: "nav-veiculos",
      category: "Módulos",
      title: "Estoque de Veículos",
      subtitle: "Gerenciamento de inventário e tabela FIPE",
      icon: <CarFront className="size-4 text-cyan-500" />,
      action: () => {
        navigate("/cliente/veiculos");
        onClose();
      },
    },
    {
      id: "nav-vendedores",
      category: "Módulos",
      title: "Equipe de Vendedores",
      subtitle: "Links de auto-cadastro e metas por vendedor",
      icon: <Users className="size-4 text-orange-500" />,
      action: () => {
        navigate("/cliente/vendedores");
        onClose();
      },
    },
    {
      id: "nav-configuracao",
      category: "Navegação",
      title: "Configurações Globais",
      subtitle: "Integrações n8n, Meta Ads e chaves de API",
      icon: <Settings className="size-4 text-zinc-400" />,
      action: () => {
        navigate("/configuracao");
        onClose();
      },
    },
    {
      id: "action-dark-mode",
      category: "Ações Rápidas",
      title: isDarkMode
        ? "Alternar para Modo Claro"
        : "Alternar para Modo Escuro",
      subtitle: "Mudar o tema visual de toda a aplicação",
      icon: isDarkMode ? (
        <Sun className="size-4 text-amber-400" />
      ) : (
        <Moon className="size-4 text-indigo-400" />
      ),
      action: () => {
        onToggleDarkMode();
        onClose();
      },
      badge: "Tema",
    },
    {
      id: "action-novo-cliente",
      category: "Ações Rápidas",
      title: "Novo Cliente (Pop-up CNPJ)",
      subtitle: "Abrir cadastro rápido de cliente com autocompletar da Receita",
      icon: <Building2 className="size-4 text-[#FF0636]" />,
      action: () => {
        navigate("/gestor/clientes");
        onClose();
      },
      badge: "Formulário",
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle &&
        item.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      item.category.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev + 1) % Math.max(1, filteredItems.length),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) =>
          (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/60 backdrop-blur-sm animate-fadeIn p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          "w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden transition-all transform animate-scaleUp",
          isDarkMode
            ? "bg-[#0c0d11] border-zinc-800 text-zinc-100"
            : "bg-white border-zinc-200 text-zinc-900",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Barra de Busca Topo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="size-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para buscar páginas, clientes, relatórios ou ações... (Ex: CRM, CNPJ, Dark)"
            className="w-full bg-transparent text-sm sm:text-base outline-none placeholder:text-zinc-400 font-medium"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Lista de Resultados */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1 divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Nenhum comando ou página encontrada para "
              <span className="font-bold text-zinc-600 dark:text-zinc-300">
                {query}
              </span>
              "
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={clsx(
                    "flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all",
                    isSelected
                      ? isDarkMode
                        ? "bg-zinc-800/80 text-white"
                        : "bg-zinc-100 text-zinc-900"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-600 dark:text-zinc-300",
                  )}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={clsx(
                        "p-2.5 rounded-xl border shrink-0",
                        isDarkMode
                          ? "bg-zinc-900 border-zinc-800"
                          : "bg-white border-zinc-200",
                      )}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-md bg-[#FF0636]/10 text-[#FF0636] text-[10px] font-bold">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-zinc-400 truncate">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {item.category}
                    </span>
                    <ArrowRight
                      className={clsx(
                        "size-4 transition-transform",
                        isSelected
                          ? "translate-x-1 text-[#FF0636]"
                          : "opacity-0",
                      )}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Dicas de Atalho */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-[11px] text-zinc-400 font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                ↑
              </kbd>{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                ↓
              </kbd>{" "}
              Navegar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                ↵
              </kbd>{" "}
              Selecionar
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              ESC
            </kbd>{" "}
            Fechar
          </span>
        </div>
      </div>
    </div>
  );
};
