import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Store,
  Plus,
  FileSpreadsheet,
  Search,
  X,
  Upload,
  Building2,
  MapPin,
  Hash,
  Building,
  Home,
  FileText,
  Globe,
  Navigation,
  Phone,
  Tag,
  Loader2,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/ui/Modal";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";

export type StoreItem = {
  id: string;
  brand: string;
  cnpj?: string;
  name: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  zipCode: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  instagram?: string;
  status: "ativa" | "desativada";
  emailResp?: string;
  businessHours?: Record<
    string,
    { open: string; close: string; active: boolean }
  >;
};

const INITIAL_STORES: StoreItem[] = [
  {
    id: "1",
    brand: "BYD",
    name: "Original BYD | Guarulhos",
    street: "Av. Tiradentes",
    number: "1800",
    neighborhood: "Centro",
    zipCode: "07090-000",
    city: "Guarulhos",
    state: "SP",
    phone: "(11) 2440-1000",
    website: "https://bydoriginal.com.br",
    instagram: "@bydoriginal",
    status: "ativa",
    emailResp: "",
  },
  {
    id: "2",
    brand: "BYD",
    name: "Original BYD | Colinas - SJC",
    street: "Av. São João",
    number: "2200",
    neighborhood: "Jardim das Colinas",
    zipCode: "12242-000",
    city: "São José dos Campos",
    state: "SP",
    phone: "(12) 3940-2000",
    website: "https://bydoriginal.com.br",
    status: "ativa",
    emailResp: "",
  },
  {
    id: "3",
    brand: "BYD",
    name: "Original BYD | São José dos Campos",
    street: "Av. Nelson D'Avila",
    number: "1400",
    neighborhood: "Centro",
    zipCode: "12245-030",
    city: "São José dos Campos",
    state: "SP",
    phone: "(12) 3940-3000",
    status: "ativa",
    emailResp: "",
  },
  {
    id: "4",
    brand: "BYD",
    name: "Holandeses",
    street: "Av. dos Holandeses",
    number: "100",
    neighborhood: "Calhau",
    zipCode: "65071-380",
    city: "São Luís",
    state: "MA",
    phone: "(98) 3210-4000",
    status: "ativa",
    emailResp: "contato@holandesesbyd.com.br",
  },
  {
    id: "5",
    brand: "BYD",
    name: "Jaracaty",
    street: "Av. Prof. Carlos Cunha",
    number: "800",
    neighborhood: "Jaracaty",
    zipCode: "65076-820",
    city: "São Luís",
    state: "MA",
    phone: "(98) 3210-5000",
    status: "ativa",
    emailResp: "contato@jaracatybyd.com.br",
  },
  {
    id: "6",
    brand: "BYD",
    name: "Original BYD | Pacaembu",
    street: "Av. Pacaembu",
    number: "1900",
    neighborhood: "Pacaembu",
    zipCode: "01234-000",
    city: "São Paulo",
    state: "SP",
    phone: "(11) 3820-6000",
    status: "ativa",
    emailResp: "",
  },
  {
    id: "7",
    brand: "Chevrolet (GM)",
    name: "Holandeses",
    street: "Av. dos Holandeses",
    number: "200",
    neighborhood: "Calhau",
    zipCode: "65071-380",
    city: "São Luís",
    state: "MA",
    phone: "(98) 3210-7000",
    status: "ativa",
    emailResp: "contato@gmholandeses.com.br",
  },
  {
    id: "8",
    brand: "Chevrolet (GM)",
    name: "Ilha",
    street: "Av. Jerônimo de Albuquerque",
    number: "500",
    neighborhood: "Cohafuma",
    zipCode: "65070-000",
    city: "São Luís",
    state: "MA",
    phone: "(98) 3210-8000",
    status: "ativa",
    emailResp: "contato@gmilha.com.br",
  },
  {
    id: "9",
    brand: "Chevrolet (GM)",
    name: "Jaracaty",
    street: "Av. Prof. Carlos Cunha",
    number: "900",
    neighborhood: "Jaracaty",
    zipCode: "65076-820",
    city: "São Luís",
    state: "MA",
    phone: "(98) 3210-9000",
    status: "ativa",
    emailResp: "contato@gmjaracaty.com.br",
  },
];

const UF_OPTIONS = [
  { value: "AC", label: "Acre (AC)" },
  { value: "AL", label: "Alagoas (AL)" },
  { value: "AP", label: "Amapá (AP)" },
  { value: "AM", label: "Amazonas (AM)" },
  { value: "BA", label: "Bahia (BA)" },
  { value: "CE", label: "Ceará (CE)" },
  { value: "DF", label: "Distrito Federal (DF)" },
  { value: "ES", label: "Espírito Santo (ES)" },
  { value: "GO", label: "Goiás (GO)" },
  { value: "MA", label: "Maranhão (MA)" },
  { value: "MT", label: "Mato Grosso (MT)" },
  { value: "MS", label: "Mato Grosso do Sul (MS)" },
  { value: "MG", label: "Minas Gerais (MG)" },
  { value: "PA", label: "Pará (PA)" },
  { value: "PB", label: "Paraíba (PB)" },
  { value: "PR", label: "Paraná (PR)" },
  { value: "PE", label: "Pernambuco (PE)" },
  { value: "PI", label: "Piauí (PI)" },
  { value: "RJ", label: "Rio de Janeiro (RJ)" },
  { value: "RN", label: "Rio Grande do Norte (RN)" },
  { value: "RS", label: "Rio Grande do Sul (RS)" },
  { value: "RO", label: "Rondônia (RO)" },
  { value: "RR", label: "Roraima (RR)" },
  { value: "SC", label: "Santa Catarina (SC)" },
  { value: "SP", label: "São Paulo (SP)" },
  { value: "SE", label: "Sergipe (SE)" },
  { value: "TO", label: "Tocantins (TO)" },
];

const BRANDS_LIST = [
  "BYD",
  "Chevrolet (GM)",
  "Volkswagen",
  "Toyota",
  "Fiat",
  "Hyundai",
  "Ford",
  "Honda",
  "Nissan",
  "Jeep",
  "BMW",
  "Volvo",
  "GWM",
];

const DAYS_OF_WEEK = [
  { key: "seg", label: "Segunda-feira" },
  { key: "ter", label: "Terça-feira" },
  { key: "qua", label: "Quarta-feira" },
  { key: "qui", label: "Quinta-feira" },
  { key: "sex", label: "Sexta-feira" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

export function LojasPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const isDarkMode = readDashboardDarkEnabled(user.id);

  const [stores, setStores] = useState<StoreItem[]>(INITIAL_STORES);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todas");
  const [viewMode, setViewMode] = useState<"list" | "form">("list");
  const [editingStore, setEditingStore] = useState<StoreItem | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    brand: string;
    cnpj: string;
    name: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    zipCode: string;
    city: string;
    state: string;
    phone: string;
    website: string;
    instagram: string;
  }>({
    brand: "",
    cnpj: "",
    name: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    zipCode: "",
    city: "",
    state: "SP",
    phone: "",
    website: "",
    instagram: "",
  });

  // Modal de Horários
  const [hoursModalStore, setHoursModalStore] = useState<StoreItem | null>(
    null,
  );
  const [businessHoursState, setBusinessHoursState] = useState<
    Record<string, { open: string; close: string; active: boolean }>
  >({});

  // Modal CSV
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState("");

  const handleOpenForm = (store?: StoreItem) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        brand: store.brand,
        name: store.name,
        cnpj: store.cnpj || "",
        street: store.street,
        number: store.number,
        complement: store.complement || "",
        neighborhood: store.neighborhood,
        zipCode: store.zipCode,
        city: store.city,
        state: store.state,
        phone: store.phone,
        website: store.website || "",
        instagram: store.instagram || "",
      });
    } else {
      setEditingStore(null);
      setFormData({
        cnpj: "",
        brand: "",
        name: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        zipCode: "",
        city: "",
        state: "SP",
        phone: "",
        website: "",
        instagram: "",
      });
    }
    setViewMode("form");
  };

  const [cnpjLoading, setCnpjLoading] = useState(false);

  const handleAutofillByCnpj = async () => {
    const rawCnpj = formData.cnpj?.replace(/\D/g, "");
    if (!rawCnpj || rawCnpj.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`,
      );
      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({
          ...prev,
          name: data.nome_fantasia || data.razao_social || prev.name,
          street: data.logradouro || prev.street,
          number: data.numero || prev.number,
          complement: data.complemento || prev.complement,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.municipio || prev.city,
          state: data.uf || prev.state,
          zipCode: data.cep || prev.zipCode,
          phone: data.ddd_telefone_1 || prev.phone,
        }));
      }
    } catch {
      /* ignore */
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.name.trim() ||
      !formData.brand.trim() ||
      !formData.city.trim()
    ) {
      alert("Por favor, preencha a Marca, Nome da Loja e Cidade.");
      return;
    }

    if (editingStore) {
      setStores((prev) =>
        prev.map((s) =>
          s.id === editingStore.id
            ? {
                ...s,
                ...formData,
              }
            : s,
        ),
      );
    } else {
      const newStore: StoreItem = {
        id: String(Date.now()),
        ...formData,
        status: "ativa",
        emailResp: "",
      };
      setStores((prev) => [newStore, ...prev]);
    }

    setViewMode("list");
  };

  const handleToggleStatus = (id: string) => {
    setStores((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === "ativa" ? "desativada" : "ativa",
            }
          : s,
      ),
    );
  };

  const handleOpenHoursModal = (store: StoreItem) => {
    setHoursModalStore(store);
    const defaultHours: Record<
      string,
      { open: string; close: string; active: boolean }
    > = {};
    DAYS_OF_WEEK.forEach((d) => {
      defaultHours[d.key] = store.businessHours?.[d.key] || {
        open: "08:00",
        close: "18:00",
        active: d.key !== "dom",
      };
    });
    setBusinessHoursState(defaultHours);
  };

  const handleSaveHours = () => {
    if (!hoursModalStore) return;
    setStores((prev) =>
      prev.map((s) =>
        s.id === hoursModalStore.id
          ? {
              ...s,
              businessHours: businessHoursState,
            }
          : s,
      ),
    );
    setHoursModalStore(null);
  };

  const handleImportCsv = () => {
    if (!csvContent.trim()) return;
    const lines = csvContent.trim().split("\n");
    const newStores: StoreItem[] = [];

    lines.forEach((line, index) => {
      if (index === 0 && line.toLowerCase().includes("marca")) return; // Header
      const parts = line.split(/[,;]/).map((p) => p.trim());
      if (parts.length >= 3) {
        newStores.push({
          id: String(Date.now() + index),
          brand: parts[0] || "Outros",
          name: parts[1] || `Loja ${index}`,
          city: parts[2] || "Cidade",
          state: parts[3] || "SP",
          street: parts[4] || "",
          number: parts[5] || "",
          neighborhood: "",
          zipCode: "",
          phone: parts[6] || "",
          status: "ativa",
        });
      }
    });

    if (newStores.length > 0) {
      setStores((prev) => [...newStores, ...prev]);
      setShowCsvModal(false);
      setCsvContent("");
      alert(`${newStores.length} lojas importadas com sucesso!`);
    } else {
      alert("Nenhuma loja válida encontrada no formato CSV.");
    }
  };

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.brand.toLowerCase().includes(search.toLowerCase()) ||
        s.city.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusFilter === "todas"
          ? true
          : statusFilter === "ativas"
            ? s.status === "ativa"
            : s.status === "desativada";

      return matchSearch && matchStatus;
    });
  }, [stores, search, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lojas"
        subtitle={`${stores.length} loja(s). O agente só oferece lojas ativas.`}
      />

      {/* Visão de Formulário "Nova Loja" / "Editar Loja" (Conforme Imagem 2) */}
      {viewMode === "form" ? (
        <div
          className={clsx(
            "rounded-3xl border p-6 sm:p-8 space-y-6 shadow-sm animate-fadeIn",
            isDarkMode
              ? "border-zinc-800 bg-[#121212] text-zinc-100"
              : "border-zinc-200 bg-[#fafafa] text-zinc-900",
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-zinc-900 dark:text-white">
              {editingStore ? "Editar loja" : "Nova loja"}
            </h2>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSaveStore} className="space-y-6">
            {/* 1º CNPJ PRIMEIRO NO TOPO */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "block text-xs font-bold uppercase tracking-wider",
                  isDarkMode ? "text-zinc-400" : "text-zinc-600",
                )}
              >
                CNPJ da Loja (Preenchimento Automático)
              </label>
              <div className="relative flex items-center">
                <div
                  className={clsx(
                    "absolute left-3.5 flex items-center pointer-events-none",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                >
                  <Building2 size={16} />
                </div>
                <input
                  type="text"
                  value={formData.cnpj || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, cnpj: e.target.value })
                  }
                  onBlur={handleAutofillByCnpj}
                  placeholder="Digite o CNPJ da Unidade"
                  className={clsx(
                    "w-full h-11 pl-10 pr-28 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                      : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                  )}
                />
                <button
                  type="button"
                  onClick={handleAutofillByCnpj}
                  disabled={cnpjLoading}
                  className="absolute right-1.5 h-8 px-4 rounded-xl bg-[#FF0636] hover:bg-[#e1002d] text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {cnpjLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Search size={13} />
                      <span>Buscar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* LINHA 1: MARCA & NOME DA LOJA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  className={clsx(
                    "block text-xs font-bold uppercase tracking-wider",
                    isDarkMode ? "text-zinc-400" : "text-zinc-600",
                  )}
                >
                  Marca da Concessionária
                </label>
                <div className="relative flex items-center">
                  <div
                    className={clsx(
                      "absolute left-3.5 flex items-center pointer-events-none z-10",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400",
                    )}
                  >
                    <Tag size={16} />
                  </div>
                  <input
                    list="brands-list"
                    type="text"
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    placeholder="Escolha ou digite (ex.: Volkswagen, BYD)"
                    className={clsx(
                      "w-full h-11 pl-10 pr-4 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                        : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                    )}
                  />
                  <datalist id="brands-list">
                    {BRANDS_LIST.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className={clsx(
                    "block text-xs font-bold uppercase tracking-wider",
                    isDarkMode ? "text-zinc-400" : "text-zinc-600",
                  )}
                >
                  Nome da Loja / Unidade
                </label>
                <div className="relative flex items-center">
                  <div
                    className={clsx(
                      "absolute left-3.5 flex items-center pointer-events-none",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400",
                    )}
                  >
                    <Store size={16} />
                  </div>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ex.: Original Volkswagen Guarulhos"
                    className={clsx(
                      "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                        : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                    )}
                  />
                </div>
              </div>
            </div>

            {/* ENDEREÇO DA LOJA */}
            <div className="space-y-3 pt-2">
              <p
                className={clsx(
                  "text-xs font-bold uppercase tracking-wider",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                📍 Endereço da Unidade
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    Logradouro
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <MapPin size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.street}
                      onChange={(e) =>
                        setFormData({ ...formData, street: e.target.value })
                      }
                      placeholder="Rua / Avenida"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    Número
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <Hash size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.number}
                      onChange={(e) =>
                        setFormData({ ...formData, number: e.target.value })
                      }
                      placeholder="123"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    Complemento
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <Building size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.complement}
                      onChange={(e) =>
                        setFormData({ ...formData, complement: e.target.value })
                      }
                      placeholder="Sala / Bloco"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    Bairro
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <Home size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.neighborhood}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          neighborhood: e.target.value,
                        })
                      }
                      placeholder="Bairro"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    CEP
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <FileText size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) =>
                        setFormData({ ...formData, zipCode: e.target.value })
                      }
                      placeholder="00000-000"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "block text-[11px] font-bold uppercase",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    Cidade
                  </label>
                  <div className="relative flex items-center">
                    <div
                      className={clsx(
                        "absolute left-3.5 flex items-center pointer-events-none",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <Globe size={15} />
                    </div>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      placeholder="Cidade"
                      className={clsx(
                        "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                          : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CONTATOS & REDES */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1.5">
                <label
                  className={clsx(
                    "block text-xs font-bold uppercase tracking-wider",
                    isDarkMode ? "text-zinc-400" : "text-zinc-600",
                  )}
                >
                  Estado (UF)
                </label>
                <div className="relative flex items-center">
                  <div
                    className={clsx(
                      "absolute left-3.5 flex items-center pointer-events-none z-10",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400",
                    )}
                  >
                    <Navigation size={15} />
                  </div>
                  <select
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                    className={clsx(
                      "w-full h-11 pl-10 pr-4 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#121212] text-zinc-100 focus:border-[#FF0636]"
                        : "border-zinc-200 bg-white text-zinc-900 focus:border-[#FF0636] shadow-sm",
                    )}
                  >
                    <option value="">--</option>
                    {UF_OPTIONS.map((uf) => (
                      <option key={uf.value} value={uf.value}>
                        {uf.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className={clsx(
                    "block text-xs font-bold uppercase tracking-wider",
                    isDarkMode ? "text-zinc-400" : "text-zinc-600",
                  )}
                >
                  Telefone Geral
                </label>
                <div className="relative flex items-center">
                  <div
                    className={clsx(
                      "absolute left-3.5 flex items-center pointer-events-none",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400",
                    )}
                  >
                    <Phone size={15} />
                  </div>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="(11) 99999-9999"
                    className={clsx(
                      "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                        : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                    )}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className={clsx(
                    "block text-xs font-bold uppercase tracking-wider",
                    isDarkMode ? "text-zinc-400" : "text-zinc-600",
                  )}
                >
                  Site Oficial
                </label>
                <div className="relative flex items-center">
                  <div
                    className={clsx(
                      "absolute left-3.5 flex items-center pointer-events-none",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400",
                    )}
                  >
                    <Globe size={15} />
                  </div>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) =>
                      setFormData({ ...formData, website: e.target.value })
                    }
                    placeholder="https://..."
                    className={clsx(
                      "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                        : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                    )}
                  />
                </div>
              </div>
            </div>

            {/* BOTÕES SALVAR / CANCELAR */}
            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                className="h-11 px-8 rounded-full bg-[#FF7A00] hover:bg-[#e06b00] text-white font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Salvar
              </button>

              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={clsx(
                  "h-11 px-6 rounded-full border text-sm font-semibold transition-all active:scale-95 cursor-pointer",
                  isDarkMode
                    ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                )}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Visão Principal da Tabela de Lojas (Conforme Imagem 1) */
        <div className="space-y-4">
          {/* Botões de Ação Topo */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleOpenForm()}
              className="h-11 px-6 rounded-full bg-[#FF7A00] hover:bg-[#e06b00] text-white font-bold text-sm shadow-md transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus size={18} />
              <span>+ Nova loja</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              className={clsx(
                "h-11 px-5 rounded-full border text-sm font-semibold transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              )}
            >
              <FileSpreadsheet size={16} />
              <span>Importar do CSV</span>
            </button>
          </div>

          {/* Barra de Pesquisa e Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className={clsx(
                  "absolute left-4 top-1/2 -translate-y-1/2",
                  isDarkMode ? "text-zinc-500" : "text-zinc-400",
                )}
              />
              <input
                type="text"
                placeholder="marca, cidade ou nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={clsx(
                  "w-full h-11 rounded-full border pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
                )}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={clsx(
                "h-11 min-w-[140px] rounded-full border px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
                isDarkMode
                  ? "border-zinc-800 bg-[#121212] text-white"
                  : "border-zinc-200 bg-white text-zinc-900",
              )}
            >
              <option value="todas">todas</option>
              <option value="ativas">ativas</option>
              <option value="desativadas">desativadas</option>
            </select>
          </div>

          {/* Tabela de Lojas */}
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
                  <th className="py-3.5 px-4">MARCA</th>
                  <th className="py-3.5 px-4">NOME</th>
                  <th className="py-3.5 px-4">CIDADE</th>
                  <th className="py-3.5 px-4">TELEFONE</th>
                  <th className="py-3.5 px-4">STATUS</th>
                  <th className="py-3.5 px-4">E-MAIL RESP.</th>
                  <th className="py-3.5 px-4 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      Nenhuma loja encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((store) => (
                    <tr
                      key={store.id}
                      className={clsx(
                        "transition-colors",
                        isDarkMode
                          ? "hover:bg-zinc-900/50"
                          : "hover:bg-zinc-50",
                      )}
                    >
                      <td className="py-4 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                        {store.brand}
                      </td>
                      <td className="py-4 px-4 font-semibold text-zinc-800 dark:text-zinc-200">
                        {store.name}
                      </td>
                      <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400">
                        {store.city}/{store.state}
                      </td>
                      <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                        {store.phone || "—"}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                            store.status === "ativa"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                          )}
                        >
                          {store.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-zinc-500 dark:text-zinc-400">
                        {store.emailResp ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ✓
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-4 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenForm(store)}
                          className={clsx(
                            "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-95",
                            isDarkMode
                              ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                          )}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenHoursModal(store)}
                          className={clsx(
                            "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-95",
                            isDarkMode
                              ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                          )}
                        >
                          Horários
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(store.id)}
                          className={clsx(
                            "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-95",
                            store.status === "ativa"
                              ? isDarkMode
                                ? "border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-900/50"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : isDarkMode
                                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/50"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                          )}
                        >
                          {store.status === "ativa" ? "Desativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE HORÁRIOS DA LOJA */}
      <Modal
        open={Boolean(hoursModalStore)}
        onClose={() => setHoursModalStore(null)}
        title={`Horários de Funcionamento — ${hoursModalStore?.name ?? ""}`}
        dark={isDarkMode}
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Configure os horários de abertura e fechamento para cada dia da
            semana.
          </p>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {DAYS_OF_WEEK.map((day) => {
              const item = businessHoursState[day.key] || {
                open: "08:00",
                close: "18:00",
                active: true,
              };
              return (
                <div
                  key={day.key}
                  className={clsx(
                    "flex items-center justify-between p-3 rounded-2xl border text-xs",
                    isDarkMode
                      ? "border-zinc-800 bg-zinc-900"
                      : "border-zinc-200 bg-zinc-50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) =>
                        setBusinessHoursState({
                          ...businessHoursState,
                          [day.key]: { ...item, active: e.target.checked },
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-700 text-[#FF7A00] focus:ring-[#FF7A00]"
                    />
                    <span className="font-bold">{day.label}</span>
                  </div>

                  {item.active ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={item.open}
                        onChange={(e) =>
                          setBusinessHoursState({
                            ...businessHoursState,
                            [day.key]: { ...item, open: e.target.value },
                          })
                        }
                        className={clsx(
                          "px-2 py-1 rounded-lg border text-xs font-mono",
                          isDarkMode
                            ? "bg-black border-zinc-700 text-white"
                            : "bg-white border-zinc-300 text-zinc-900",
                        )}
                      />
                      <span>às</span>
                      <input
                        type="time"
                        value={item.close}
                        onChange={(e) =>
                          setBusinessHoursState({
                            ...businessHoursState,
                            [day.key]: { ...item, close: e.target.value },
                          })
                        }
                        className={clsx(
                          "px-2 py-1 rounded-lg border text-xs font-mono",
                          isDarkMode
                            ? "bg-black border-zinc-700 text-white"
                            : "bg-white border-zinc-300 text-zinc-900",
                        )}
                      />
                    </div>
                  ) : (
                    <span className="text-zinc-400 italic">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setHoursModalStore(null)}
              className="px-4 py-2 rounded-full border text-xs font-semibold text-zinc-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveHours}
              className="px-6 py-2 rounded-full bg-[#FF7A00] text-white font-bold text-xs shadow-md"
            >
              Salvar Horários
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL IMPORTAR CSV */}
      <Modal
        open={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        title="Importar Lojas via CSV"
        dark={isDarkMode}
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Cole abaixo os dados das suas lojas no formato CSV (separado por
            vírgula ou ponto-e-vírgula):
            <br />
            <code className="text-[10px] font-mono text-[#FF7A00] block mt-1">
              Marca, Nome da Loja, Cidade, UF, Logradouro, Número, Telefone
            </code>
          </p>

          <textarea
            rows={6}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder={`Marca, Nome da Loja, Cidade, UF, Logradouro, Número, Telefone\nBYD, Original BYD Campinas, Campinas, SP, Av. Brasil, 500, (19) 3300-1000`}
            className={clsx(
              "w-full rounded-2xl border p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
              isDarkMode
                ? "border-zinc-800 bg-[#111111] text-white placeholder-zinc-600"
                : "border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400",
            )}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCsvModal(false)}
              className="px-4 py-2 rounded-full border text-xs font-semibold text-zinc-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImportCsv}
              className="px-6 py-2 rounded-full bg-[#FF7A00] text-white font-bold text-xs shadow-md inline-flex items-center gap-1.5"
            >
              <Upload size={14} />
              <span>Importar Lojas</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
