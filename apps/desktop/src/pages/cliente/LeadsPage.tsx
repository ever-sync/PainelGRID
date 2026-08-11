import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import clsx from "clsx";
import { Search, ArrowLeft, Copy, Mail, Phone } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import type { Lead, User } from "../../types";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import { fetchAllLeads, mapApiLeadToLead } from "../../services/leads";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { pushToast } from "../../components/ui/Toast";

type OutletContext = {
  user: User;
};

// Mantido temporariamente apenas como referência visual durante a migração.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const INITIAL_MOCK_LEADS: Lead[] = [
  {
    id: "lead-1",
    client_id: "client-1",
    name: "Aparecido Pereira De Lima",
    email: "aparecido.lima@email.com",
    phone: "+5511948259604",
    channel_code: "77586",
    source: "whatsapp",
    crm_stage: "contactado",
    crm_stage_id: "stg-1",
    crm_pipeline_id: "pip-1",
    tags: ["Volkswagen", "T-Cross"],
    confirmation_status: "checked_in",
    assigned_vendor_id: "v-1",
    registered_by_id: "r-1",
    registered_by_name: "Rubinho IA",
    attendant_type: "external_agent",
    attendant_user_id: null,
    sold_by_vendor_id: null,
    event_interest: "Eventos Vendas SP",
    event_id: "evt-1",
    store_visit_datetime: "23/07 às 10:30",
    notes:
      "O lead deseja realizar uma simulação de financiamento para um veículo.",
    cpf: "***.***.**8-43",
    cpf_validated: true,
    city: "São Paulo",
    state: "SP",
    engagement_level: "medio",
    sentiment: "positivo",
    contact_consent: true,
    brand_interest: "Volkswagen",
    model_interest: "T-Cross 2026",
    store_name: "Alta Volkswagen | Saude",
    trade_vehicle: "new fiesta 2017",
    ai_status: "Lead interessado, aguardando visita à loja para simulação",
    ai_summary:
      "O lead deseja realizar uma simulação de financiamento para um veículo. O agente explicou que a simulação pode ser feita na loja Alta Volkswagen, com opções pelo programa Move Brasil ou pelo Santander, e orientou sobre os documentos necessários para agilizar o atendimento. O lead está na etapa inicial de interesse, buscando informações para avançar na negociação.",
    checkin_token: "chk-1",
    checkin_voucher: null,
    created_at: "2026-06-26T14:38:00Z",
    updated_at: "2026-07-31T13:12:00Z",
  },
  {
    id: "lead-2",
    client_id: "client-1",
    name: "Sidnei Caetano",
    email: "sidnei.caetano@email.com",
    phone: "+5511981795665",
    channel_code: "77586",
    source: "whatsapp",
    crm_stage: "contactado",
    crm_stage_id: "stg-1",
    crm_pipeline_id: "pip-1",
    tags: ["BYD", "Dolphin"],
    confirmation_status: "confirmed",
    assigned_vendor_id: "v-2",
    registered_by_id: "r-1",
    registered_by_name: "Rubinho IA",
    attendant_type: "external_agent",
    attendant_user_id: null,
    sold_by_vendor_id: null,
    event_interest: "Eventos BYD Pacaembu",
    event_id: "evt-2",
    store_visit_datetime: "31/07 às 15:00",
    notes: "Interessado na versão Dolphin Mini GL com entrada de 30%.",
    cpf: "***.***.**2-11",
    cpf_validated: true,
    city: "São Paulo",
    state: "SP",
    engagement_level: "medio",
    sentiment: "positivo",
    contact_consent: true,
    brand_interest: "BYD",
    model_interest: "DOLPHIN MINI GL",
    store_name: "Original BYD | Pacaembu",
    trade_vehicle: "Onix 1.0 2019",
    ai_status: "Visita confirmada na loja Pacaembu",
    ai_summary:
      "Cliente interessado no BYD Dolphin Mini GL. Confirmou presença para hoje no período da tarde para avaliação do seminovo na troca.",
    checkin_token: "chk-2",
    checkin_voucher: null,
    created_at: "2026-07-28T09:15:00Z",
    updated_at: "2026-07-31T11:04:00Z",
  },
  {
    id: "lead-3",
    client_id: "client-1",
    name: "Elton Nogueira",
    email: "elton.nogueira@email.com",
    phone: "+5511961010833",
    channel_code: "77586",
    source: "whatsapp",
    crm_stage: "novo",
    crm_stage_id: "stg-1",
    crm_pipeline_id: "pip-1",
    tags: ["Renault", "Kwid"],
    confirmation_status: "confirmed",
    assigned_vendor_id: "v-3",
    registered_by_id: "r-1",
    registered_by_name: "Rubinho IA",
    attendant_type: "external_agent",
    attendant_user_id: null,
    sold_by_vendor_id: null,
    event_interest: null,
    event_id: null,
    store_visit_datetime: null,
    notes: "Lead vindo de campanha digital de Kwid.",
    cpf: "***.***.**5-99",
    cpf_validated: false,
    city: "São Paulo",
    state: "SP",
    engagement_level: "medio",
    sentiment: "positivo",
    contact_consent: true,
    brand_interest: "Renault",
    model_interest: "Kwid",
    store_name: "R Point Renault | Vila Guilherme",
    trade_vehicle: "Sem troca",
    ai_status: "Em triagem inicial pela IA",
    ai_summary:
      "Lead capturado com interesse em Kwid zero km. Aguardando retorno da proposta enviada.",
    checkin_token: null,
    checkin_voucher: null,
    created_at: "2026-07-30T10:00:00Z",
    updated_at: "2026-07-31T10:25:00Z",
  },
  {
    id: "lead-4",
    client_id: "client-1",
    name: "Paulo Henrique Dos Santos Dias",
    email: "paulo.dias@email.com",
    phone: "+5511920035937",
    channel_code: "77586",
    source: "facebook_ads",
    crm_stage: "agendado",
    crm_stage_id: "stg-1",
    crm_pipeline_id: "pip-1",
    tags: ["Volkswagen", "Polo"],
    confirmation_status: "scheduled",
    assigned_vendor_id: "v-1",
    registered_by_id: "r-1",
    registered_by_name: "Rubinho IA",
    attendant_type: "external_agent",
    attendant_user_id: null,
    sold_by_vendor_id: null,
    event_interest: "Ofertas Suzano",
    event_id: "evt-3",
    store_visit_datetime: "01/08 às 11:00",
    notes: "Simulação de financiamento banco Santander.",
    cpf: "***.***.**4-22",
    cpf_validated: true,
    city: "Suzano",
    state: "SP",
    engagement_level: "baixo",
    sentiment: "positivo",
    contact_consent: true,
    brand_interest: "Volkswagen",
    model_interest: "Polo 2026",
    store_name: "Original Volkswagen | Suzano",
    trade_vehicle: "HB20 2018",
    ai_status: "Agendamento realizado para dia 01/08",
    ai_summary:
      "Cliente agendou visita na loja de Suzano para test drive no Polo 2026.",
    checkin_token: "chk-4",
    checkin_voucher: null,
    created_at: "2026-07-29T16:00:00Z",
    updated_at: "2026-07-30T18:34:00Z",
  },
];

export function LeadsPage() {
  const { user } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const isDarkMode = readDashboardDarkEnabled(user.id);
  const clientId = resolveClientId(user);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void fetchAllLeads({ client_id: clientId }, token, {
      signal: controller.signal,
      maxItems: 10_000,
    })
      .then((rows) => setLeads(rows.map(mapApiLeadToLead)))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar os leads.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clientId]);

  // Filtros Avançados (Conforme Imagem 1)
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterEngagement, setFilterEngagement] = useState("todos");
  const [filterSentiment, setFilterSentiment] = useState("todos");
  const [filterStore, setFilterStore] = useState("todas");
  const [filterChannel, setFilterChannel] = useState("todos");
  const [filterBrand, setFilterBrand] = useState("todas");
  const [filterCity, setFilterCity] = useState("");
  const [filterUf, setFilterUf] = useState("todas");
  const [filterCpfValidated, setFilterCpfValidated] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone.includes(search) ||
        (lead.cpf && lead.cpf.includes(search));

      const matchStatus =
        filterStatus === "todos"
          ? true
          : (lead.crm_stage_name || lead.crm_stage) === filterStatus;

      const matchEngagement =
        filterEngagement === "todos"
          ? true
          : lead.engagement_level === filterEngagement;

      const matchSentiment =
        filterSentiment === "todos" ? true : lead.sentiment === filterSentiment;

      const matchStore =
        filterStore === "todas"
          ? true
          : lead.store_name?.toLowerCase().includes(filterStore.toLowerCase());

      const matchBrand =
        filterBrand === "todas"
          ? true
          : lead.brand_interest?.toLowerCase() === filterBrand.toLowerCase();

      const matchCity = !filterCity.trim()
        ? true
        : lead.city?.toLowerCase().includes(filterCity.toLowerCase());

      const matchUf =
        filterUf === "todas"
          ? true
          : lead.state?.toUpperCase() === filterUf.toUpperCase();

      const matchCpf =
        filterCpfValidated === "todos"
          ? true
          : filterCpfValidated === "sim"
            ? lead.cpf_validated === true
            : lead.cpf_validated === false;

      const matchChannel =
        filterChannel === "todos" ? true : lead.source === filterChannel;
      const createdAt = new Date(lead.created_at);
      const parseDate = (value: string, endOfDay = false) => {
        const [day, month, year] = value.split("/").map(Number);
        if (!day || !month || !year) return null;
        return new Date(
          year,
          month - 1,
          day,
          endOfDay ? 23 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 59 : 0,
        );
      };
      const from = parseDate(dateFrom);
      const to = parseDate(dateTo, true);
      const matchDate =
        (!from || createdAt >= from) && (!to || createdAt <= to);

      return (
        matchSearch &&
        matchStatus &&
        matchEngagement &&
        matchSentiment &&
        matchStore &&
        matchBrand &&
        matchCity &&
        matchUf &&
        matchCpf &&
        matchChannel &&
        matchDate
      );
    });
  }, [
    leads,
    search,
    filterStatus,
    filterEngagement,
    filterSentiment,
    filterStore,
    filterBrand,
    filterCity,
    filterUf,
    filterCpfValidated,
    filterChannel,
    dateFrom,
    dateTo,
  ]);

  const storeOptions = useMemo(
    () =>
      Array.from(
        new Set(leads.map((lead) => lead.store_name?.trim()).filter(Boolean)),
      ).sort((a, b) => a!.localeCompare(b!, "pt-BR")) as string[],
    [leads],
  );
  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map((lead) => lead.crm_stage_name || lead.crm_stage)
            .filter(Boolean),
        ),
      ).sort((a, b) => a!.localeCompare(b!, "pt-BR")) as string[],
    [leads],
  );
  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads.map((lead) => lead.brand_interest?.trim()).filter(Boolean),
        ),
      ).sort((a, b) => a!.localeCompare(b!, "pt-BR")) as string[],
    [leads],
  );
  const channelOptions = useMemo(
    () =>
      Array.from(
        new Set(leads.map((lead) => lead.source?.trim()).filter(Boolean)),
      ).sort((a, b) => a!.localeCompare(b!, "pt-BR")) as string[],
    [leads],
  );
  const stateOptions = useMemo(
    () =>
      Array.from(
        new Set(leads.map((lead) => lead.state?.trim()).filter(Boolean)),
      ).sort() as string[],
    [leads],
  );

  const exportCsv = () => {
    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredLeads.map((lead) => [
      lead.name,
      lead.phone,
      lead.email,
      lead.crm_stage_name ?? lead.crm_stage,
      lead.source,
      lead.event_interest ?? "",
      new Date(lead.created_at).toLocaleString("pt-BR"),
    ]);
    const csv = [
      ["Nome", "Telefone", "E-mail", "Etapa", "Origem", "Evento", "Cadastro"],
      ...rows,
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    if (!selectedLead) return;
    const textToCopy = `Resumo IA - ${selectedLead.name}\nStatus IA: ${selectedLead.ai_status || "Não informado"}\nResumo: ${selectedLead.ai_summary || selectedLead.notes || "Não informado"}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      pushToast({ message: "Resumo do lead copiado.", type: "success" });
    } catch {
      pushToast({
        message: "Não foi possível copiar o resumo.",
        type: "error",
      });
    }
  };

  if (!clientId) return <MissingClientScope />;

  return (
    <div className="space-y-6">
      {/* SE VISÃO DE DETALHES ESTIVER ABERTA (CONFORME IMAGEM 2) */}
      {selectedLead ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Breadcrumbs e Botão Voltar */}
          <div className="flex items-center justify-between border-b pb-4 border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setSelectedLead(null)}
              className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span className="uppercase tracking-widest text-[11px]">
                PAINEL · LEADS · DETALHE
              </span>
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-300">
              ?
            </span>
          </div>

          {/* Nome do Lead e Badges do Topo */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-zinc-900 dark:text-white">
              {selectedLead.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {selectedLead.crm_stage_name ||
                  selectedLead.crm_stage ||
                  "Sem etapa"}
              </span>
              <span>·</span>
              <span>
                engajamento {selectedLead.engagement_level || "não informado"}
              </span>
              <span>·</span>
              <span>
                sentimento {selectedLead.sentiment || "não informado"}
              </span>
            </div>
          </div>

          {/* Barra com os 5 Botões de Ação do Lead */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/cliente/conversas?client_id=${encodeURIComponent(clientId)}&lead_id=${encodeURIComponent(selectedLead.id)}`,
                )
              }
              className={clsx(
                "h-10 px-4 rounded-full border text-xs font-bold transition-all active:scale-95 cursor-pointer",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
              )}
            >
              Ver conversa
            </button>

            <a
              href={`https://wa.me/${selectedLead.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className={clsx(
                "h-10 px-4 rounded-full border text-xs font-bold transition-all active:scale-95 inline-flex items-center gap-1.5 cursor-pointer",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-emerald-400 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-emerald-600 hover:bg-zinc-100",
              )}
            >
              <Phone size={14} className="fill-current" />
              <span>WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className={clsx(
                "h-10 px-4 rounded-full border text-xs font-bold transition-all active:scale-95 inline-flex items-center gap-1.5 cursor-pointer",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
              )}
            >
              <Copy size={14} />
              <span>Copiar resumo</span>
            </button>

            {selectedLead.email ? (
              <a
                href={`mailto:${selectedLead.email}`}
                className={clsx(
                  "h-10 px-4 rounded-full border text-xs font-bold transition-all active:scale-95 inline-flex items-center gap-1.5 cursor-pointer",
                  isDarkMode
                    ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
                )}
              >
                <Mail size={14} />
                <span>Enviar por e-mail</span>
              </a>
            ) : null}
          </div>

          {/* GRID COM AS 4 SEÇÕES DE INFORMAÇÃO DO LEAD (CONFORME IMAGEM 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            {/* SEÇÃO 1: IDENTIFICAÇÃO */}
            <div className="space-y-3">
              <h3 className="text-xl font-normal text-zinc-900 dark:text-white">
                Identificação
              </h3>
              <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p className="flex items-center gap-2">
                  <span>Telefone:</span>
                  <span className="font-semibold">{selectedLead.phone}</span>
                  <span className="text-emerald-500">🟢</span>
                </p>

                <p className="flex items-center gap-2">
                  <span>CPF:</span>
                  <span className="font-mono">
                    {selectedLead.cpf || "Não informado"}
                  </span>
                  {selectedLead.cpf ? (
                    <span
                      className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold",
                        selectedLead.cpf_validated
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                      )}
                    >
                      {selectedLead.cpf_validated ? "validado" : "não validado"}
                    </span>
                  ) : null}
                </p>

                <p>
                  <span>Cidade: </span>
                  <span className="font-semibold">
                    {[selectedLead.city, selectedLead.state]
                      .filter(Boolean)
                      .join("/") || "Não informado"}
                  </span>
                </p>

                <p>
                  <span>Consentimento de contato: </span>
                  <span className="font-semibold">
                    {selectedLead.contact_consent !== false ? "sim" : "não"}
                  </span>
                </p>
              </div>
            </div>

            {/* SEÇÃO 2: INTERESSE */}
            <div className="space-y-3">
              <h3 className="text-xl font-normal text-zinc-900 dark:text-white">
                Interesse
              </h3>
              <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>
                  <span>Marcas: </span>
                  <span className="font-semibold">
                    {selectedLead.brand_interest || "Não informado"}
                  </span>
                </p>

                <p>
                  <span>Modelo: </span>
                  <span className="font-semibold">
                    {selectedLead.model_interest || "Não informado"}
                  </span>
                </p>

                <p>
                  <span>Loja: </span>
                  <span className="font-semibold">
                    {selectedLead.store_name || "Não informada"}
                  </span>
                </p>

                <p>
                  <span>Preferência de visita: </span>
                  <span className="font-semibold">
                    {selectedLead.store_visit_datetime || "Não informada"}
                  </span>
                </p>
              </div>
            </div>

            {/* SEÇÃO 3: TROCA (VEÍCULO ATUAL) */}
            <div className="space-y-3 md:col-span-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-normal text-zinc-900 dark:text-white">
                Troca (veículo atual)
              </h3>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {selectedLead.trade_vehicle || "Não informado"}
              </p>
            </div>

            {/* SEÇÃO 4: ATENDIMENTO (IA) */}
            <div className="space-y-3 md:col-span-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-normal text-zinc-900 dark:text-white">
                Atendimento (IA)
              </h3>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Status IA: {selectedLead.ai_status || "Não informado"}
              </p>

              {/* Caixa de Texto do Resumo IA */}
              <div
                className={clsx(
                  "p-5 rounded-2xl border leading-relaxed text-xs sm:text-sm",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-zinc-300"
                    : "border-zinc-200 bg-[#fafafa] text-zinc-700",
                )}
              >
                {selectedLead.ai_summary ||
                  selectedLead.notes ||
                  "Ainda não há resumo de atendimento para este lead."}
              </div>

              {/* Rodapé de Datas */}
              <p className="text-xs text-zinc-400 pt-1">
                Criado{" "}
                {new Date(selectedLead.created_at).toLocaleDateString("pt-BR")}{" "}
                às{" "}
                {new Date(selectedLead.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · atualizado{" "}
                {new Date(selectedLead.updated_at).toLocaleDateString("pt-BR")}{" "}
                às{" "}
                {new Date(selectedLead.updated_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* TABELA DE LEADS COM OS 11 FILTROS NO TOPO (CONFORME IMAGEM 1) */
        <div className="space-y-4">
          <PageHeader
            title="Leads"
            subtitle={`${filteredLeads.length} de ${leads.length} lead(s) da sua empresa.`}
          />

          {loading ? (
            <p className="text-sm text-zinc-500">Carregando leads...</p>
          ) : null}
          {loadError ? (
            <p className="text-sm font-semibold text-red-500">{loadError}</p>
          ) : null}

          {/* BARRA COM OS 11 FILTROS DO TOPO (CONFORME IMAGEM 1) */}
          <div className="space-y-3">
            {/* LINHA 1 DE FILTROS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className={clsx(
                    "absolute left-3.5 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
                <input
                  type="text"
                  placeholder="nome ou telefone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={clsx(
                    "w-full h-10 rounded-full border pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                  )}
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">status: todos</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={filterEngagement}
                onChange={(e) => setFilterEngagement(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">engajamento</option>
                <option value="alto">alto</option>
                <option value="medio">medio</option>
                <option value="baixo">baixo</option>
              </select>

              <select
                value={filterSentiment}
                onChange={(e) => setFilterSentiment(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">sentimento</option>
                <option value="positivo">positivo</option>
                <option value="neutro">neutro</option>
                <option value="negativo">negativo</option>
              </select>

              <select
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todas">loja</option>
                {storeOptions.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>

              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">canal</option>
                {channelOptions.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </div>

            {/* LINHA 2 DE FILTROS E DATAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todas">marca de interesse</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="cidade"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-4 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                )}
              />

              <select
                value={filterUf}
                onChange={(e) => setFilterUf(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todas">UF</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>

              <select
                value={filterCpfValidated}
                onChange={(e) => setFilterCpfValidated(e.target.value)}
                className={clsx(
                  "h-10 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <option value="todos">CPF validado?</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>

              <div className="flex items-center gap-1 col-span-2">
                <span className="text-xs text-zinc-400">de</span>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={clsx(
                    "w-full h-10 rounded-full border px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                  )}
                />
                <span className="text-xs text-zinc-400">até</span>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={clsx(
                    "w-full h-10 rounded-full border px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                  )}
                />
              </div>
            </div>

            {/* BOTÕES DE EXPORTAÇÃO */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!filteredLeads.length}
                className={clsx(
                  "h-9 px-4 rounded-full border text-xs font-semibold transition-all active:scale-95 cursor-pointer",
                  isDarkMode
                    ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                Exportar CSV
              </button>
            </div>
          </div>

          {/* TABELA DE LEADS (CONFORME IMAGEM 1) */}
          <div
            className={clsx(
              "rounded-2xl border overflow-x-auto shadow-sm",
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
                  <th className="py-3.5 px-4">LEAD</th>
                  <th className="py-3.5 px-4">CANAL</th>
                  <th className="py-3.5 px-4">TELEFONE</th>
                  <th className="py-3.5 px-4">STATUS</th>
                  <th className="py-3.5 px-4">ENGAJ.</th>
                  <th className="py-3.5 px-4">SENT.</th>
                  <th className="py-3.5 px-4">INTERESSE</th>
                  <th className="py-3.5 px-4">LOJA</th>
                  <th className="py-3.5 px-4">ATUALIZADO</th>
                  <th className="py-3.5 px-4 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={clsx(
                      "transition-colors cursor-pointer",
                      isDarkMode ? "hover:bg-zinc-900/50" : "hover:bg-zinc-50",
                    )}
                  >
                    <td className="py-4 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{lead.name}</span>
                        {lead.sentiment === "positivo" ? (
                          <span
                            className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-extrabold text-red-500 border border-red-500/20"
                            title="Alta probabilidade de fechamento"
                          >
                            🔥 Quente
                          </span>
                        ) : lead.sentiment === "negativo" ? (
                          <span
                            className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-extrabold text-blue-500 border border-blue-500/20"
                            title="Baixo engajamento ou insatisfação"
                          >
                            ❄️ Frio
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-500 border border-amber-500/20"
                            title="Interesse intermediário"
                          >
                            🟡 Morno
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-zinc-500">
                      {lead.channel_code || lead.source || "—"}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {lead.phone}
                        <span className="text-emerald-500">🟢</span>
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {lead.crm_stage_name || lead.crm_stage || "Sem etapa"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400">
                      {lead.engagement_level || "—"}
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400">
                      {lead.sentiment || "—"}
                    </td>
                    <td className="py-4 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                      {lead.model_interest || "—"}
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400">
                      {lead.store_name || "—"}
                    </td>
                    <td className="py-4 px-4 text-zinc-500 dark:text-zinc-400 font-mono text-xs whitespace-nowrap">
                      {new Date(lead.updated_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}{" "}
                      {new Date(lead.updated_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className={clsx(
                          "px-3 py-1 rounded-full border text-xs font-semibold transition-all active:scale-95 cursor-pointer",
                          isDarkMode
                            ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                        )}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
