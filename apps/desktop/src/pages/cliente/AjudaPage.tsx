import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  MessageSquare,
  Video,
  FileQuestion,
  ChevronDown,
  Mail,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_LIST: FaqItem[] = [
  {
    question: "Como funciona a distribuição de leads na recepção?",
    answer:
      "A recepção visualiza todos os leads agendados ou que chegaram para o evento. Ao selecionar o lead, o sistema chama o vendedor vinculado através do celular com som e vibração continuada. Caso o vendedor esteja ausente ou offline, a recepção pode reatribuir o lead em 1 clique.",
  },
  {
    question: "Como lançar uma Venda Avulsa?",
    answer:
      "Na tela de Check-in da Recepção, basta clicar no botão verde [+ Venda Avulsa]. Em seguida, selecione o cliente pelo nome/CPF, escolha o vendedor vinculado e informe o veículo e valor.",
  },
  {
    question:
      "Onde posso ver o tempo de atendimento e tempo ausente dos vendedores?",
    answer:
      "No Relatório Executivo (Capítulo 7 - Ranking Comercial), você encontra a tabela completa com tempo em atendimento, tempo ausente e o gráfico visual comparativo de cada vendedor.",
  },
  {
    question: "Como cadastrar uma nova loja?",
    answer:
      "Acesse a página de Lojas no menu lateral e clique no botão [+ Nova loja]. Preencha os dados de endereço, cidade, estado e telefone e clique em Salvar.",
  },
];

export function AjudaPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const isDarkMode = readDashboardDarkEnabled(user.id);

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajuda e Suporte"
        subtitle="Central de suporte, tutoriais rápidos e dúvidas frequentes."
      />

      {/* CARDS DE SUPORTE RÁPIDO */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={clsx(
            "p-6 rounded-3xl border space-y-3 shadow-sm",
            isDarkMode
              ? "border-zinc-800 bg-[#121212]"
              : "border-zinc-200 bg-white",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF7A00]/10 text-[#FF7A00]">
            <MessageSquare size={24} />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Suporte via WhatsApp
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Fale diretamente com nossa equipe de atendimento em tempo real.
          </p>
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7A00] hover:underline pt-2"
          >
            <span>Iniciar Conversa</span>
            <ExternalLink size={14} />
          </a>
        </div>

        <div
          className={clsx(
            "p-6 rounded-3xl border space-y-3 shadow-sm",
            isDarkMode
              ? "border-zinc-800 bg-[#121212]"
              : "border-zinc-200 bg-white",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF7A00]/10 text-[#FF7A00]">
            <Video size={24} />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Vídeo Aulas
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Assista aos tutoriais passo a passo sobre como operar o sistema de
            vendas.
          </p>
          <button
            type="button"
            onClick={() => alert("Abrindo portal de vídeo aulas do cliente...")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7A00] hover:underline pt-2"
          >
            <span>Assistir Tutoriais</span>
            <ExternalLink size={14} />
          </button>
        </div>

        <div
          className={clsx(
            "p-6 rounded-3xl border space-y-3 shadow-sm",
            isDarkMode
              ? "border-zinc-800 bg-[#121212]"
              : "border-zinc-200 bg-white",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF7A00]/10 text-[#FF7A00]">
            <Mail size={24} />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Suporte via E-mail
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Envie sua dúvida ou solicitação técnica para nossa equipe de
            engenharia.
          </p>
          <a
            href="mailto:suporte@painelgrid.com.br"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7A00] hover:underline pt-2"
          >
            <span>suporte@painelgrid.com.br</span>
          </a>
        </div>
      </div>

      {/* SEÇÃO DÚVIDAS FREQUENTES (FAQ) */}
      <div
        className={clsx(
          "p-6 sm:p-8 rounded-3xl border space-y-6 shadow-sm",
          isDarkMode
            ? "border-zinc-800 bg-[#121212]"
            : "border-zinc-200 bg-white",
        )}
      >
        <div className="flex items-center gap-2">
          <FileQuestion size={20} className="text-[#FF7A00]" />
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
            Perguntas Frequentes (FAQ)
          </h3>
        </div>

        <div className="space-y-3">
          {FAQ_LIST.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={faq.question}
                className={clsx(
                  "rounded-2xl border transition-all overflow-hidden",
                  isDarkMode
                    ? "border-zinc-800 bg-zinc-900/50"
                    : "border-zinc-200 bg-zinc-50/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 flex items-center justify-between text-left font-bold text-xs sm:text-sm text-zinc-900 dark:text-white cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    size={16}
                    className={clsx(
                      "transition-transform text-zinc-400",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed border-t border-zinc-200 dark:border-zinc-800/60 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
