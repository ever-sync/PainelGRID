import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Store,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Hash,
  Building,
  Home,
  Globe,
  Navigation,
  FileText,
  Workflow,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Modal } from "../../components/ui/Modal";
import { Notice } from "../../components/ui/Notice";
import type { Client } from "../../types";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readStoredSession } from "../../services/auth";
import {
  createClient,
  deleteClient,
  listClients,
  lookupCompanyByCnpj,
  mapApiClientToClient,
} from "../../services/clients";
import { listEvents } from "../../services/events";

function formatPhoneBr(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 2) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return digits;
}

export function ClientesPage() {
  const navigate = useNavigate();
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [clientIdsWithActiveEvent, setClientIdsWithActiveEvent] = useState<
    Set<string>
  >(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [facebookFilter, setFacebookFilter] = useState<
    "all" | "connected" | "pending"
  >("all");
  const [planFilter, setPlanFilter] = useState<
    "all" | Client["plan"]
  >("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientCnpj, setNewClientCnpj] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientWhatsapp, setNewClientWhatsapp] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientAddressStreet, setNewClientAddressStreet] = useState("");
  const [newClientAddressNumber, setNewClientAddressNumber] = useState("");
  const [newClientAddressComplement, setNewClientAddressComplement] =
    useState("");
  const [newClientAddressDistrict, setNewClientAddressDistrict] = useState("");
  const [newClientAddressCity, setNewClientAddressCity] = useState("");
  const [newClientAddressState, setNewClientAddressState] = useState("");
  const [newClientAddressZipcode, setNewClientAddressZipcode] = useState("");
  const [newClientWebhook, setNewClientWebhook] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      setIsDarkMode(readDashboardDarkEnabled(user.id));
    };

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("focus", syncTheme);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    };
  }, [user.id]);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setListLoading(false);
      return;
    }

    setListLoading(true);
    listClients(session.accessToken)
      .then((rows) => {
        setClients(rows.map(mapApiClientToClient));
        setListError("");
      })
      .catch(() => setListError("Não foi possível carregar os clientes."))
      .finally(() => setListLoading(false));

    listEvents({ status: "active" }, session.accessToken)
      .then((rows) => {
        const clientIds = new Set<string>();
        rows.forEach((event) => {
          clientIds.add(event.client_id);
          (event.participant_client_ids ?? []).forEach((id) =>
            clientIds.add(id),
          );
        });
        setClientIdsWithActiveEvent(clientIds);
      })
      .catch(() => setClientIdsWithActiveEvent(new Set()));
  }, []);

  async function handleCreateClient() {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setCreateError("Faça login novamente para cadastrar cliente.");
      return;
    }

    if (!newClientName.trim()) {
      setCreateError("Informe o nome da empresa.");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      await createClient(session.accessToken, {
        company_name: newClientName.trim(),
        cnpj: newClientCnpj.trim() || undefined,
        webhook_url_n8n: newClientWebhook.trim() || undefined,
        phone_number: newClientPhone.trim() || undefined,
        whatsapp_number: newClientWhatsapp.trim() || undefined,
        contact_email: newClientEmail.trim() || undefined,
        address:
          [
            newClientAddressStreet,
            newClientAddressNumber,
            newClientAddressComplement,
            newClientAddressDistrict,
            newClientAddressCity,
            newClientAddressState,
            newClientAddressZipcode,
          ]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(", ") || undefined,
        address_street: newClientAddressStreet.trim() || undefined,
        address_number: newClientAddressNumber.trim() || undefined,
        address_complement: newClientAddressComplement.trim() || undefined,
        address_district: newClientAddressDistrict.trim() || undefined,
        address_city: newClientAddressCity.trim() || undefined,
        address_state: newClientAddressState.trim() || undefined,
        address_zipcode: newClientAddressZipcode.trim() || undefined,
      });

      const rows = await listClients(session.accessToken);
      setClients(rows.map(mapApiClientToClient));
      setCreateOpen(false);
      setNewClientName("");
      setNewClientCnpj("");
      setNewClientPhone("");
      setNewClientWhatsapp("");
      setNewClientEmail("");
      setNewClientAddressStreet("");
      setNewClientAddressNumber("");
      setNewClientAddressComplement("");
      setNewClientAddressDistrict("");
      setNewClientAddressCity("");
      setNewClientAddressState("");
      setNewClientAddressZipcode("");
      setNewClientWebhook("");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar cliente.",
      );
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleAutofillByCnpj() {
    if (cnpjLoading) return;
    if (!newClientCnpj.trim()) return;

    setCnpjLoading(true);
    setCreateError("");
    try {
      const data = await lookupCompanyByCnpj(newClientCnpj);
      if (!newClientName.trim()) {
        setNewClientName(data.tradeName || data.legalName);
      }
      if (data.phone && !newClientPhone.trim()) {
        setNewClientPhone(formatPhoneBr(data.phone));
      }
      if (data.email && !newClientEmail.trim()) {
        setNewClientEmail(data.email);
      }
      if (data.addressStreet && !newClientAddressStreet.trim())
        setNewClientAddressStreet(data.addressStreet);
      if (data.addressNumber && !newClientAddressNumber.trim())
        setNewClientAddressNumber(data.addressNumber);
      if (data.addressComplement && !newClientAddressComplement.trim())
        setNewClientAddressComplement(data.addressComplement);
      if (data.addressDistrict && !newClientAddressDistrict.trim())
        setNewClientAddressDistrict(data.addressDistrict);
      if (data.addressCity && !newClientAddressCity.trim())
        setNewClientAddressCity(data.addressCity);
      if (data.addressState && !newClientAddressState.trim())
        setNewClientAddressState(data.addressState);
      if (data.addressZipcode && !newClientAddressZipcode.trim())
        setNewClientAddressZipcode(data.addressZipcode);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Falha ao consultar CNPJ.",
      );
    } finally {
      setCnpjLoading(false);
    }
  }

  async function handleDeleteClientFromList(client: Client) {
    setClientToDelete(client);
  }

  async function confirmDeleteClientFromList() {
    if (!clientToDelete) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setListError("Faça login novamente para excluir cliente.");
      setClientToDelete(null);
      return;
    }

    setDeletingClientId(clientToDelete.id);
    setListError("");
    try {
      await deleteClient(clientToDelete.id, session.accessToken);
      setClients((current) =>
        current.filter((item) => item.id !== clientToDelete.id),
      );
      setClientToDelete(null);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o cliente.",
      );
    } finally {
      setDeletingClientId(null);
    }
  }

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients
      .filter((client) => {
        const matchesSearch =
          !query ||
          client.company_name.toLowerCase().includes(query) ||
          client.cnpj.includes(query) ||
          client.contact_email.toLowerCase().includes(query) ||
          client.address.toLowerCase().includes(query);

        const matchesStatus =
          statusFilter === "all" || client.status === statusFilter;

        const hasFacebook = Boolean(
          client.facebook_page_id || client.facebook_ad_account_id,
        );
        const matchesFacebook =
          facebookFilter === "all" ||
          (facebookFilter === "connected" ? hasFacebook : !hasFacebook);

        const matchesPlan =
          planFilter === "all" || client.plan === planFilter;

        return (
          matchesSearch && matchesStatus && matchesFacebook && matchesPlan
        );
      })
      .sort((a, b) => b.leads_count - a.leads_count);
  }, [clients, search, statusFilter, facebookFilter, planFilter]);

  const resetClientFilters = () => {
    setSearch("");
    setStatusFilter("active");
    setFacebookFilter("all");
    setPlanFilter("all");
  };

  const fieldClass = clsx(
    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
      : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
  );
  const selectFieldClass = clsx(
    "rounded-2xl border py-2.5 pl-3 pr-8 text-xs font-semibold outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-200"
      : "border-zinc-200 bg-white text-zinc-700",
  );
  const hasActiveClientFilters =
    Boolean(search) ||
    statusFilter !== "active" ||
    facebookFilter !== "all" ||
    planFilter !== "all";
  const modalInputClass = clsx(
    "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
      : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400",
  );
  const modalLabelClass = clsx(
    "mb-1 block text-xs font-semibold uppercase tracking-[0.14em]",
    isDarkMode ? "text-zinc-400" : "text-zinc-500",
  );

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <PageHeader title="Clientes" dark={isDarkMode} />

      {listError ? (
        <Card
          className="rounded-[20px] border border-red-200 bg-red-50"
          padding="md"
        >
          <p className="text-sm text-red-800">{listError}</p>
        </Card>
      ) : null}
      {listLoading ? (
        <Card
          className={clsx(
            "rounded-[20px] border",
            isDarkMode ? "border-zinc-800 bg-[#0f0f0f]" : "border-white/80",
          )}
          padding="md"
        >
          <p
            className={clsx(
              "text-sm",
              isDarkMode ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Carregando clientes...
          </p>
        </Card>
      ) : null}
      <div className="space-y-6">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search
                size={16}
                className={clsx(
                  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2",
                  isDarkMode ? "text-zinc-500" : "text-zinc-400",
                )}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, CNPJ ou e-mail..."
                className={fieldClass}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "all" | "active" | "inactive",
                  )
                }
                className={selectFieldClass}
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>

              <select
                value={facebookFilter}
                onChange={(event) =>
                  setFacebookFilter(
                    event.target.value as "all" | "connected" | "pending",
                  )
                }
                className={selectFieldClass}
              >
                <option value="all">Facebook: todos</option>
                <option value="connected">Facebook conectado</option>
                <option value="pending">Facebook pendente</option>
              </select>

              <select
                value={planFilter}
                onChange={(event) =>
                  setPlanFilter(event.target.value as "all" | Client["plan"])
                }
                className={selectFieldClass}
              >
                <option value="all">Todos os planos</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>

              {hasActiveClientFilters && (
                <button
                  type="button"
                  onClick={resetClientFilters}
                  className={clsx(
                    "rounded-full px-3 py-2 text-xs font-semibold transition-colors",
                    isDarkMode
                      ? "bg-[#1c1c1c] text-zinc-300 hover:bg-[#262626]"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                  )}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <Card
              className={clsx(
                "rounded-[30px] border shadow-[0_18px_45px_rgba(15,23,42,0.07)]",
                isDarkMode ? "border-zinc-800 bg-[#0f0f0f]" : "border-white/80",
              )}
              padding="lg"
            >
              <div className="py-10 text-center">
                <Building2 size={34} className="mx-auto text-zinc-300" />
                <p
                  className={clsx(
                    "mt-4 text-lg font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Nenhum cliente encontrado
                </p>
                <p
                  className={clsx(
                    "mt-1 text-sm",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Ajuste os filtros ou limpe a busca para ver a lista completa.
                </p>
              </div>
            </Card>
          ) : (
            <Card
              className={clsx(
                "overflow-hidden rounded-[24px] border p-0 shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
                isDarkMode ? "border-zinc-800 bg-[#111111]" : "border-white/80",
              )}
              padding="none"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr
                      className={clsx(
                        "border-b text-left text-[10px] font-semibold uppercase tracking-[0.14em]",
                        isDarkMode
                          ? "border-zinc-800 text-zinc-500"
                          : "border-zinc-100 text-zinc-400",
                      )}
                    >
                      <th className="px-5 py-3 font-semibold">Nome</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Facebook</th>
                      <th className="px-3 py-3 text-right font-semibold">
                        Leads
                      </th>
                      <th className="px-3 py-3 text-right font-semibold">
                        Veículos
                      </th>
                      <th className="px-3 py-3 text-right font-semibold">
                        Eventos
                      </th>
                      <th className="px-3 py-3 font-semibold">
                        Evento ativo
                      </th>
                      <th className="px-5 py-3 text-right font-semibold">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => {
                      const hasFacebook = Boolean(
                        client.facebook_page_id ||
                          client.facebook_ad_account_id,
                      );
                      return (
                        <tr
                          key={client.id}
                          className={clsx(
                            "border-b last:border-b-0 transition-colors",
                            isDarkMode
                              ? "border-zinc-800 hover:bg-[#161616]"
                              : "border-zinc-100 hover:bg-zinc-50",
                          )}
                        >
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/gestor/clientes/${client.id}`)
                              }
                              className="flex min-w-0 items-center gap-3 text-left"
                            >
                              <div
                                className={clsx(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                  isDarkMode
                                    ? "bg-[#1c1c1c] text-zinc-400"
                                    : "bg-zinc-100 text-zinc-500",
                                )}
                              >
                                <Building2 size={16} />
                              </div>
                              <span
                                className={clsx(
                                  "truncate text-sm font-semibold hover:underline",
                                  isDarkMode
                                    ? "text-zinc-100"
                                    : "text-zinc-950",
                                )}
                              >
                                {client.company_name}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant={
                                client.status === "active" ? "green" : "gray"
                              }
                              dot
                            >
                              {client.status === "active"
                                ? "Ativo"
                                : "Inativo"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={hasFacebook ? "blue" : "gray"} dot>
                              {hasFacebook ? "Conectado" : "Pendente"}
                            </Badge>
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 text-right font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-950",
                            )}
                          >
                            {client.leads_count}
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 text-right font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-950",
                            )}
                          >
                            {client.vehicles_count}
                          </td>
                          <td
                            className={clsx(
                              "px-3 py-3 text-right font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-950",
                            )}
                          >
                            {client.events_count}
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant={
                                clientIdsWithActiveEvent.has(client.id)
                                  ? "green"
                                  : "gray"
                              }
                              dot
                            >
                              {clientIdsWithActiveEvent.has(client.id)
                                ? "Evento ativo"
                                : "Sem evento ativo"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/gestor/clientes/${client.id}`)
                                }
                                aria-label={`Editar ${client.company_name}`}
                                title="Editar"
                                className={clsx(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                                  isDarkMode
                                    ? "border-zinc-700 bg-[#171717] text-zinc-300 hover:bg-[#212121]"
                                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                                )}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeleteClientFromList(client)
                                }
                                disabled={deletingClientId === client.id}
                                aria-label={`Excluir ${client.company_name}`}
                                title="Excluir"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmationModal
        open={Boolean(clientToDelete)}
        onClose={() => setClientToDelete(null)}
        onConfirm={() => void confirmDeleteClientFromList()}
        loading={Boolean(
          clientToDelete && deletingClientId === clientToDelete.id,
        )}
        title="Excluir cliente"
        description={
          <p className="text-sm text-zinc-600">
            Tem certeza que deseja excluir o cliente{" "}
            <span className="font-semibold text-zinc-900">
              {clientToDelete?.company_name}
            </span>
            ? Esta ação não pode ser desfeita.
          </p>
        }
        confirmLabel="Excluir cliente"
      />

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[#FF0636] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,6,54,0.35)] transition-colors hover:bg-[#e1002d]"
      >
        <Plus size={16} />
        Cadastrar novo cliente
      </button>

      <Modal
        open={createOpen}
        onClose={() => (createLoading ? null : setCreateOpen(false))}
        title="Cadastrar novo cliente"
        size="md"
        dark={isDarkMode}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={createLoading}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-60",
                isDarkMode
                  ? "border-zinc-700 text-zinc-200 hover:bg-[#1a1a1a]"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
              )}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateClient}
              disabled={createLoading}
              className="rounded-full bg-[#FF0636] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e1002d] disabled:opacity-60"
            >
              {createLoading ? "Salvando..." : "Salvar cliente"}
            </button>
          </>
        }
      >
        <div className="space-y-4 pt-1">
          {/* 1º CNPJ PRIMEIRO NO TOPO DA TELA */}
          <div className="space-y-1.5">
            <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
              CNPJ (Preenchimento Automático)
            </label>
            <div className="relative flex items-center">
              <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                <Building2 size={16} />
              </div>
              <input
                value={newClientCnpj}
                onChange={(event) => setNewClientCnpj(event.target.value)}
                onBlur={handleAutofillByCnpj}
                placeholder="Digite o CNPJ"
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
                disabled={cnpjLoading || createLoading}
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

          {/* 2º EMPRESA */}
          <div className="space-y-1.5">
            <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
              Empresa (Nome Fantasia)
            </label>
            <div className="relative flex items-center">
              <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                <Store size={16} />
              </div>
              <input
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="Ex.: Concessionária Demo"
                className={clsx(
                  "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                )}
              />
            </div>
          </div>

          {/* 3º TELEFONE & WHATSAPP */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                Telefone
              </label>
              <div className="relative flex items-center">
                <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                  <Phone size={16} />
                </div>
                <input
                  value={newClientPhone}
                  onChange={(event) => setNewClientPhone(event.target.value)}
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
              <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                WhatsApp
              </label>
              <div className="relative flex items-center">
                <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                  <MessageSquare size={16} />
                </div>
                <input
                  value={newClientWhatsapp}
                  onChange={(event) => setNewClientWhatsapp(event.target.value)}
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
          </div>

          {/* 4º E-MAIL DE CONTATO */}
          <div className="space-y-1.5">
            <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
              E-mail de Contato
            </label>
            <div className="relative flex items-center">
              <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                <Mail size={16} />
              </div>
              <input
                type="email"
                value={newClientEmail}
                onChange={(event) => setNewClientEmail(event.target.value)}
                placeholder="contato@empresa.com"
                className={clsx(
                  "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                )}
              />
            </div>
          </div>

          {/* 5º ENDEREÇO (CARTÃO CNPJ) */}
          <div className="space-y-3 pt-2">
            <p className={clsx("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
              📍 Endereço (Cartão CNPJ)
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  Logradouro
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <MapPin size={15} />
                  </div>
                  <input
                    value={newClientAddressStreet}
                    onChange={(event) => setNewClientAddressStreet(event.target.value)}
                    placeholder="Rua/Avenida"
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
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  Número
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <Hash size={15} />
                  </div>
                  <input
                    value={newClientAddressNumber}
                    onChange={(event) => setNewClientAddressNumber(event.target.value)}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  Complemento
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <Building size={15} />
                  </div>
                  <input
                    value={newClientAddressComplement}
                    onChange={(event) => setNewClientAddressComplement(event.target.value)}
                    placeholder="Sala, bloco, etc."
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
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  Bairro
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <Home size={15} />
                  </div>
                  <input
                    value={newClientAddressDistrict}
                    onChange={(event) => setNewClientAddressDistrict(event.target.value)}
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
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  Cidade
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <Globe size={15} />
                  </div>
                  <input
                    value={newClientAddressCity}
                    onChange={(event) => setNewClientAddressCity(event.target.value)}
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

              <div className="space-y-1.5">
                <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                  UF
                </label>
                <div className="relative flex items-center">
                  <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                    <Navigation size={15} />
                  </div>
                  <input
                    value={newClientAddressState}
                    onChange={(event) => setNewClientAddressState(event.target.value.toUpperCase())}
                    placeholder="UF"
                    maxLength={2}
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

            <div className="space-y-1.5">
              <label className={clsx("block text-[11px] font-bold uppercase", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
                CEP
              </label>
              <div className="relative flex items-center">
                <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                  <FileText size={15} />
                </div>
                <input
                  value={newClientAddressZipcode}
                  onChange={(event) => setNewClientAddressZipcode(event.target.value)}
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
          </div>

          {/* 6º WEBHOOK N8N */}
          <div className="space-y-1.5">
            <label className={clsx("block text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-zinc-400" : "text-zinc-600")}>
              Webhook N8N
            </label>
            <div className="relative flex items-center">
              <div className={clsx("absolute left-3.5 flex items-center pointer-events-none", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                <Workflow size={16} />
              </div>
              <input
                value={newClientWebhook}
                onChange={(event) => setNewClientWebhook(event.target.value)}
                placeholder="https://seu-n8n/webhook/..."
                className={clsx(
                  "w-full h-11 pl-10 pr-3 rounded-2xl border text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FF0636]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#121212] text-zinc-100 placeholder-zinc-600 focus:border-[#FF0636]"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:border-[#FF0636] shadow-sm",
                )}
              />
            </div>
          </div>

          {createError ? <Notice tone="error">{createError}</Notice> : null}
        </div>
      </Modal>
    </div>
  );
}
