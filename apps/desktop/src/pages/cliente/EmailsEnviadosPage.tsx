import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Calendar as CalendarIcon,
  History,
  LayoutTemplate,
  Mail,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/ui/Modal";
import type { User } from "../../types";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import {
  listEmailHistory,
  type ApiEmailHistoryItem,
} from "../../services/emailHistory";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";

type OutletContext = {
  user: User;
};

export type SentEmailLog = {
  id: string;
  when: string;
  origin: "agendamento" | "checkin" | "notificacao" | "disparo_manual";
  status: "sent" | "failed" | "pending";
  recipients: string;
  subject: string;
  storeId: string;
  actor: string;
  error: string;
  bodyContent?: string;
};

// Mantido temporariamente apenas como referência do layout legado.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const INITIAL_EMAILS_LOGS: SentEmailLog[] = [
  {
    id: "e-1",
    when: "21/07/2026 13:40",
    origin: "agendamento",
    status: "sent",
    recipients:
      "automobvolks@clientelydia.com.br, volkswagenautomob@clientelydia.com.br",
    subject:
      "🎉 Novo lead agendado — Everton Ricardo (Original Volkswagen | Guarulhos)",
    storeId: "31",
    actor: "—",
    error: "—",
    bodyContent:
      "Olá Equipe!\nUm novo lead acabou de agendar uma visita para o evento Original Volkswagen | Guarulhos.\nLead: Everton Ricardo\nTelefone: (11) 98888-1111\nData Agendada: 22/07 às 10:00",
  },
  {
    id: "e-2",
    when: "20/07/2026 12:34",
    origin: "agendamento",
    status: "sent",
    recipients: "automobpeugeotcitroen@clientelydia.com.br",
    subject: "🎉 Novo lead agendado — Joao (Original Citroën | Guarulhos)",
    storeId: "6",
    actor: "—",
    error: "—",
    bodyContent:
      "Olá Equipe!\nUm novo lead agendou visita para Original Citroën | Guarulhos.\nLead: Joao\nTelefone: (11) 97777-2222",
  },
  {
    id: "e-3",
    when: "20/07/2026 12:34",
    origin: "agendamento",
    status: "sent",
    recipients: "automobfiat@clientelydia.com.br",
    subject:
      "🎉 Novo lead agendado — Massagem E Vida (Original Fiat | São Miguel)",
    storeId: "11",
    actor: "—",
    error: "—",
    bodyContent:
      "Novo agendamento realizado para a loja Original Fiat | São Miguel.",
  },
  {
    id: "e-4",
    when: "20/07/2026 12:19",
    origin: "agendamento",
    status: "sent",
    recipients:
      "automobvolks@clientelydia.com.br, volkswagenautomob@clientelydia.com.br",
    subject: "🎉 Novo lead agendado — Kayque (Green Volkswagen | Aricanduva)",
    storeId: "45",
    actor: "—",
    error: "—",
    bodyContent:
      "Novo agendamento realizado para a loja Green Volkswagen | Aricanduva.",
  },
  {
    id: "e-5",
    when: "20/07/2026 12:19",
    origin: "agendamento",
    status: "sent",
    recipients: "lidivan.lima@originalautos.com.br",
    subject: "🎉 Novo lead agendado — Matheus (Jaracaty)",
    storeId: "53",
    actor: "—",
    error: "—",
    bodyContent: "Novo agendamento realizado para a loja Jaracaty.",
  },
  {
    id: "e-6",
    when: "20/07/2026 12:19",
    origin: "agendamento",
    status: "sent",
    recipients:
      "automobvolks@clientelydia.com.br, volkswagenautomob@clientelydia.com.br",
    subject: "🎉 Novo lead agendado — Andre (Alta Volkswagen | Braz Leme)",
    storeId: "40",
    actor: "—",
    error: "—",
    bodyContent:
      "Novo agendamento realizado para a loja Alta Volkswagen | Braz Leme.",
  },
];

export function EmailsEnviadosPage() {
  const { user } = useOutletContext<OutletContext>();
  const isDarkMode = readDashboardDarkEnabled(user.id);
  const clientId = resolveClientId(user);

  const [logs, setLogs] = useState<SentEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filterOrigin, setFilterOrigin] = useState("todas");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<SentEmailLog | null>(null);
  const [activeTab, setActiveTab] = useState<"templates" | "history">(
    "templates",
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const matchOrigin =
        filterOrigin === "todas" ? true : item.origin === filterOrigin;

      const matchStatus =
        filterStatus === "todos" ? true : item.status === filterStatus;

      return matchOrigin && matchStatus;
    });
  }, [logs, filterOrigin, filterStatus]);

  const mapHistoryItem = (item: ApiEmailHistoryItem): SentEmailLog => {
    const metadata = item.metadata ?? {};
    const subject =
      typeof metadata.subject === "string"
        ? metadata.subject
        : item.dispatch_type === "email_attempt_2"
          ? "Recuperação de credenciamento"
          : `Comunicação do evento ${item.event?.name ?? ""}`.trim();
    const origin: SentEmailLog["origin"] = item.dispatch_type.includes(
      "credential",
    )
      ? "checkin"
      : item.dispatch_type.includes("scheduled")
        ? "agendamento"
        : "notificacao";
    const status: SentEmailLog["status"] =
      item.status === "failed"
        ? "failed"
        : item.status === "queued"
          ? "pending"
          : "sent";
    return {
      id: item.id,
      when: new Date(
        item.sent_at ?? item.failed_at ?? item.created_at,
      ).toLocaleString("pt-BR"),
      origin,
      status,
      recipients: item.lead.email ?? "E-mail não informado",
      subject,
      storeId: item.event?.name ?? "Sem evento",
      actor: item.workflow_key,
      error: item.failure_reason ?? "—",
      bodyContent:
        typeof metadata.preview === "string" ? metadata.preview : undefined,
    };
  };

  const parseDate = (value: string, endOfDay = false) => {
    if (!value) return undefined;
    const [day, month, year] = value.split("/").map(Number);
    if (!day || !month || !year) return undefined;
    return new Date(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
    ).toISOString();
  };

  const loadHistory = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    void listEmailHistory(clientId, token, {
      status: filterStatus === "todos" ? undefined : filterStatus,
      dateFrom: parseDate(dateFrom),
      dateTo: parseDate(dateTo, true),
    })
      .then((items) => setLogs(items.map(mapHistoryItem)))
      .catch((reason: unknown) =>
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar o histórico de e-mails.",
        ),
      )
      .finally(() => setLoading(false));
  }, [clientId, dateFrom, dateTo, filterStatus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleApplyFilter = () => loadHistory();

  if (!clientId) return <MissingClientScope />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-mails"
        subtitle="Consulte os modelos utilizados nas automações e acompanhe os envios."
      />

      <div className="flex w-fit gap-1 rounded-2xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-[#121212]">
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={clsx(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            activeTab === "templates"
              ? "bg-[#ef233c] text-white shadow-sm"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900",
          )}
        >
          <LayoutTemplate size={16} /> Modelos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={clsx(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            activeTab === "history"
              ? "bg-[#ef233c] text-white shadow-sm"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900",
          )}
        >
          <History size={16} /> Histórico
        </button>
      </div>

      {activeTab === "templates" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#121212]">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-6 dark:border-zinc-800">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Ativo
                  </span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    Tentativa 2 — Email
                  </span>
                </div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                  Recuperação de credenciamento
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Enviado automaticamente após 24 horas sem avanço em Tentativa
                  contato.
                </p>
              </div>
              <div className="rounded-2xl bg-red-50 p-3 text-[#ef233c] dark:bg-red-950/40">
                <Mail size={22} />
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                  Assunto
                </p>
                <p className="mt-2 font-bold text-zinc-900 dark:text-white">
                  IMPORTANTE: VOCÊ AINDA NÃO FINALIZOU SEU CREDENCIAMENTO
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-7 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                <p>
                  Olá, <strong>{"{{primeiro_nome}}"}</strong>!
                </p>
                <p className="mt-3">
                  Sua inscrição no <strong>{"{{evento}}"}</strong> está quase
                  pronta. Finalize agora para garantir sua credencial e receber
                  as orientações do evento.
                </p>
                <div className="my-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  Condições especiais do evento são preenchidas automaticamente
                  quando cadastradas na descrição.
                </div>
                <div className="text-center">
                  <span className="inline-block rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">
                    GARANTIR MINHA VAGA
                  </span>
                </div>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#121212]">
            <h3 className="font-bold text-zinc-950 dark:text-white">
              Como este modelo funciona
            </h3>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-zinc-400">Provedor</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Resend
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Origem</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Automação do CRM
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Gatilho</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                  24h em Tentativa contato
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Após o aceite</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Move para Tentativa 2 — Email
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Botão</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Abre o WhatsApp da empresa
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      ) : (
        <>
          {loading ? (
            <p className="text-sm text-zinc-500">Carregando histórico...</p>
          ) : null}
          {loadError ? (
            <p className="text-sm font-semibold text-red-500">{loadError}</p>
          ) : null}
          {!loading && !loadError && !logs.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Nenhum e-mail foi registrado para os filtros selecionados.
            </div>
          ) : null}

          {/* PAINEL DE FILTROS DO TOPO (CONFORME IMAGEM DO USUÁRIO) */}
          <div className="space-y-3">
            {/* LINHA 1 DE DROPDOWNS */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value)}
                className={clsx(
                  "h-11 rounded-2xl border px-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer min-w-[160px]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todas">todas as origens</option>
                <option value="agendamento">agendamento</option>
                <option value="checkin">checkin</option>
                <option value="notificacao">notificacao</option>
                <option value="disparo_manual">disparo manual</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={clsx(
                  "h-11 rounded-2xl border px-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer min-w-[150px]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">todos os status</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
                <option value="pending">pending</option>
              </select>
            </div>

            {/* LINHA 2 DE DATAS E BOTÃO FILTRAR */}
            <div className="space-y-2 max-w-xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={clsx(
                    "w-full h-11 rounded-2xl border px-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                  )}
                />
                <CalendarIcon
                  size={16}
                  className={clsx(
                    "absolute right-4 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={clsx(
                    "w-full h-11 rounded-2xl border px-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                  )}
                />
                <CalendarIcon
                  size={16}
                  className={clsx(
                    "absolute right-4 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
              </div>

              <button
                type="button"
                onClick={handleApplyFilter}
                className="h-11 px-8 rounded-full bg-[#FF7A00] hover:bg-[#e06b00] text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer mt-1"
              >
                Filtrar
              </button>
            </div>
          </div>

          {/* TABELA DE E-MAILS ENVIADOS (CONFORME IMAGEM DO USUÁRIO) */}
          <div
            className={clsx(
              "rounded-3xl border overflow-x-auto shadow-sm",
              isDarkMode
                ? "border-zinc-800 bg-[#121212]"
                : "border-zinc-200 bg-white",
            )}
          >
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr
                  className={clsx(
                    "border-b font-semibold uppercase tracking-wider text-[11px]",
                    isDarkMode
                      ? "border-zinc-800 bg-zinc-900/50 text-zinc-400"
                      : "border-zinc-100 bg-zinc-50 text-zinc-500",
                  )}
                >
                  <th className="py-3.5 px-4">QUANDO</th>
                  <th className="py-3.5 px-4">ORIGEM</th>
                  <th className="py-3.5 px-4">STATUS</th>
                  <th className="py-3.5 px-4">DESTINATÁRIO</th>
                  <th className="py-3.5 px-4">ASSUNTO</th>
                  <th className="py-3.5 px-4">LOJA</th>
                  <th className="py-3.5 px-4">ATOR</th>
                  <th className="py-3.5 px-4">ERRO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredLogs.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedEmail(item)}
                    className={clsx(
                      "transition-colors cursor-pointer",
                      isDarkMode ? "hover:bg-zinc-900/50" : "hover:bg-zinc-50",
                    )}
                  >
                    <td className="py-4 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {item.when}
                    </td>
                    <td className="py-4 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                      {item.origin}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs text-zinc-600 dark:text-zinc-400 max-w-xs truncate font-mono">
                      {item.recipients}
                    </td>
                    <td className="py-4 px-4 font-semibold text-zinc-900 dark:text-zinc-100 max-w-md truncate">
                      {item.subject}
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                      {item.storeId}
                    </td>
                    <td className="py-4 px-4 text-zinc-400 font-mono text-xs">
                      {item.actor}
                    </td>
                    <td className="py-4 px-4 text-zinc-400 font-mono text-xs">
                      {item.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MODAL DE DETALHES DO E-MAIL SELECIONADO */}
          <Modal
            open={Boolean(selectedEmail)}
            onClose={() => setSelectedEmail(null)}
            title="Detalhes do E-mail Enviado"
            dark={isDarkMode}
          >
            {selectedEmail && (
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <p>
                    <span className="font-bold">Assunto: </span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {selectedEmail.subject}
                    </span>
                  </p>
                  <p>
                    <span className="font-bold">Destinatários: </span>
                    <span className="font-mono">
                      {selectedEmail.recipients}
                    </span>
                  </p>
                  <p>
                    <span className="font-bold">Disparado em: </span>
                    <span className="font-mono">{selectedEmail.when}</span>{" "}
                    (Origem: {selectedEmail.origin})
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">
                    Conteúdo do Mensagem
                  </label>
                  <div
                    className={clsx(
                      "p-4 rounded-2xl border text-xs font-mono whitespace-pre-wrap leading-relaxed",
                      isDarkMode
                        ? "border-zinc-800 bg-[#111] text-zinc-300"
                        : "border-zinc-200 bg-zinc-50 text-zinc-800",
                    )}
                  >
                    {selectedEmail.bodyContent ||
                      "Conteúdo HTML enviado pelo servidor SMTP."}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(null)}
                    className="px-6 py-2 rounded-full bg-[#FF7A00] text-white font-bold text-xs shadow-md"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}
