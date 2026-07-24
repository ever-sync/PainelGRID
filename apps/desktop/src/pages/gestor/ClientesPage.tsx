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
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge, PlanBadge } from "../../components/ui/Badge";
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
  updateClient,
} from "../../services/clients";

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
  const [search, setSearch] = useState("");
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

  function handleOpenEditClient(client: Client) {
    setEditingClientId(client.id);
    setEditClientName(client.company_name);
    setEditClientCnpj(client.cnpj);
    setEditClientPhone(client.phone_number ?? "");
    setEditClientWhatsapp(client.whatsapp_number ?? "");
    setEditClientEmail(client.contact_email);
    setEditClientAddress(client.address);
    setEditClientWebhook(client.webhook_url_n8n ?? "");
    setEditError("");
    setEditOpen(true);
  }

  async function handleSaveClientEdit() {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setEditError("Faça login novamente para editar cliente.");
      return;
    }

    if (!editingClientId) {
      setEditError("Cliente inválido para edição.");
      return;
    }

    if (!editClientName.trim()) {
      setEditError("Informe o nome da empresa.");
      return;
    }

    setEditLoading(true);
    setEditError("");
    try {
      const row = await updateClient(editingClientId, session.accessToken, {
        company_name: editClientName.trim(),
        cnpj: editClientCnpj.trim() || undefined,
        phone_number: editClientPhone.trim() || undefined,
        whatsapp_number: editClientWhatsapp.trim() || undefined,
        contact_email: editClientEmail.trim() || undefined,
        address: editClientAddress.trim() || undefined,
        webhook_url_n8n: editClientWebhook.trim() || undefined,
      });

      setClients((current) =>
        current.map((client) =>
          client.id === editingClientId ? mapApiClientToClient(row) : client,
        ),
      );
      setEditOpen(false);
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Não foi possível editar cliente.",
      );
    } finally {
      setEditLoading(false);
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

        const matchesStatus = client.status === "active";
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b.leads_count - a.leads_count);
  }, [clients, search]);

  const fieldClass = clsx(
    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
      : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
  );
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
      <PageHeader
        title="Clientes"
        subtitle="Visao Geral"
        breadcrumbs={[{ label: "Gestor" }, { label: "Clientes" }]}
        dark={isDarkMode}
      />

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
          <Card
            className={clsx(
              "rounded-[30px] border shadow-[0_18px_45px_rgba(15,23,42,0.07)]",
              isDarkMode ? "border-zinc-800 bg-[#0f0f0f]" : "border-white/80",
            )}
            padding="lg"
          >
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

              <span
                className={clsx(
                  "inline-flex w-fit items-center rounded-full px-4 py-2 text-xs font-semibold",
                  isDarkMode
                    ? "bg-[#1c1c1c] text-zinc-300"
                    : "bg-zinc-100 text-zinc-700",
                )}
              >
                Mostrando somente clientes ativos
              </span>
            </div>
          </Card>

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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredClients.map((client) => {
                const eventCount = client.events_count;
                const hasFacebook = Boolean(
                  client.facebook_page_id || client.facebook_ad_account_id,
                );
                return (
                  <Card
                    key={client.id}
                    className={clsx(
                      "rounded-[24px] border shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
                      isDarkMode
                        ? "border-zinc-800 bg-[#111111]"
                        : "border-white/80",
                    )}
                    padding="md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={clsx(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                            isDarkMode
                              ? "bg-[#1c1c1c] text-zinc-400"
                              : "bg-zinc-100 text-zinc-500",
                          )}
                        >
                          <Building2 size={20} />
                        </div>
                        <div className="min-w-0">
                          <p
                            className={clsx(
                              "truncate text-base font-black tracking-tight",
                              isDarkMode ? "text-zinc-100" : "text-zinc-950",
                            )}
                          >
                            {client.company_name}
                          </p>
                          <p
                            className={clsx(
                              "truncate text-sm",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500",
                            )}
                          >
                            {client.contact_email ||
                              client.phone_number ||
                              "Sem contato"}
                          </p>
                        </div>
                      </div>
                      <PlanBadge plan={client.plan} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        variant={client.status === "active" ? "green" : "gray"}
                        dot
                      >
                        {client.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant={hasFacebook ? "blue" : "gray"} dot>
                        {hasFacebook
                          ? "Facebook conectado"
                          : "Facebook pendente"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div
                        className={clsx(
                          "rounded-[16px] p-2.5",
                          isDarkMode ? "bg-[#1a1a1a]" : "bg-zinc-50",
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Leads
                        </p>
                        <p
                          className={clsx(
                            "mt-1.5 text-xl font-black tracking-tight",
                            isDarkMode ? "text-zinc-100" : "text-zinc-950",
                          )}
                        >
                          {client.leads_count}
                        </p>
                      </div>
                      <div
                        className={clsx(
                          "rounded-[16px] p-2.5",
                          isDarkMode ? "bg-[#1a1a1a]" : "bg-zinc-50",
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Veículos
                        </p>
                        <p
                          className={clsx(
                            "mt-1.5 text-xl font-black tracking-tight",
                            isDarkMode ? "text-zinc-100" : "text-zinc-950",
                          )}
                        >
                          {client.vehicles_count}
                        </p>
                      </div>
                      <div
                        className={clsx(
                          "rounded-[16px] p-2.5",
                          isDarkMode ? "bg-[#1a1a1a]" : "bg-zinc-50",
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Eventos
                        </p>
                        <p
                          className={clsx(
                            "mt-1.5 text-xl font-black tracking-tight",
                            isDarkMode ? "text-zinc-100" : "text-zinc-950",
                          )}
                        >
                          {eventCount}
                        </p>
                      </div>
                    </div>

                    <div
                      className={clsx(
                        "mt-3 space-y-1.5 text-sm",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Building2
                          size={14}
                          className="shrink-0 text-zinc-400"
                        />
                        <span className="font-mono">
                          {client.cnpj || "Sem CNPJ"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="shrink-0 text-[#FF0636]" />
                        <span className="truncate">
                          {client.contact_email || client.phone_number || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="shrink-0 text-[#3D56A2]" />
                        <span>{client.phone_number || "Sem telefone"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="shrink-0 text-[#FBBB49]" />
                        <span className="line-clamp-1">{client.address}</span>
                      </div>
                    </div>

                    <div
                      className={clsx(
                        "mt-4 flex items-center justify-end gap-2 border-t pt-3",
                        isDarkMode ? "border-zinc-800" : "border-zinc-100",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenEditClient(client)}
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          isDarkMode
                            ? "border-zinc-700 bg-[#171717] text-zinc-200 hover:bg-[#212121]"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        <Pencil size={13} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClientFromList(client)}
                        disabled={deletingClientId === client.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 size={13} />
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/gestor/clientes/${client.id}`)
                        }
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-colors",
                          isDarkMode
                            ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                            : "bg-[#0b0b0b] hover:bg-zinc-900",
                        )}
                      >
                        Detalhe
                        <Eye size={13} />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
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
        <div className="space-y-4">
          <div>
            <label className={modalLabelClass}>Empresa</label>
            <input
              value={newClientName}
              onChange={(event) => setNewClientName(event.target.value)}
              placeholder="Ex.: Empresa Demo"
              className={modalInputClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={modalLabelClass}>CNPJ</label>
              <div className="flex gap-2">
                <input
                  value={newClientCnpj}
                  onChange={(event) => setNewClientCnpj(event.target.value)}
                  onBlur={handleAutofillByCnpj}
                  placeholder="Digite o CNPJ"
                  className={modalInputClass}
                />
                <button
                  type="button"
                  onClick={handleAutofillByCnpj}
                  disabled={cnpjLoading || createLoading}
                  className={clsx(
                    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60",
                    isDarkMode
                      ? "border-zinc-700 text-zinc-200 hover:bg-[#1a1a1a]"
                      : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  {cnpjLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Buscar"
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className={modalLabelClass}>Telefone</label>
              <input
                value={newClientPhone}
                onChange={(event) => setNewClientPhone(event.target.value)}
                placeholder="Opcional"
                className={modalInputClass}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={modalLabelClass}>WhatsApp</label>
              <input
                value={newClientWhatsapp}
                onChange={(event) => setNewClientWhatsapp(event.target.value)}
                placeholder="Opcional"
                className={modalInputClass}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={modalLabelClass}>E-mail de contato</label>
              <input
                type="email"
                value={newClientEmail}
                onChange={(event) => setNewClientEmail(event.target.value)}
                placeholder="contato@empresa.com"
                className={modalInputClass}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p
              className={clsx(
                "text-xs font-semibold uppercase tracking-[0.14em]",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              Endereço (cartão CNPJ)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Logradouro
                </label>
                <input
                  value={newClientAddressStreet}
                  onChange={(event) =>
                    setNewClientAddressStreet(event.target.value)
                  }
                  placeholder="Rua/Avenida"
                  className={modalInputClass}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Número
                </label>
                <input
                  value={newClientAddressNumber}
                  onChange={(event) =>
                    setNewClientAddressNumber(event.target.value)
                  }
                  placeholder="123"
                  className={modalInputClass}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Complemento
                </label>
                <input
                  value={newClientAddressComplement}
                  onChange={(event) =>
                    setNewClientAddressComplement(event.target.value)
                  }
                  placeholder="Sala, bloco, etc."
                  className={modalInputClass}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Bairro
                </label>
                <input
                  value={newClientAddressDistrict}
                  onChange={(event) =>
                    setNewClientAddressDistrict(event.target.value)
                  }
                  placeholder="Bairro"
                  className={modalInputClass}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Cidade
                </label>
                <input
                  value={newClientAddressCity}
                  onChange={(event) =>
                    setNewClientAddressCity(event.target.value)
                  }
                  placeholder="Cidade"
                  className={modalInputClass}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-xs font-semibold",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  UF
                </label>
                <input
                  value={newClientAddressState}
                  onChange={(event) =>
                    setNewClientAddressState(event.target.value.toUpperCase())
                  }
                  placeholder="UF"
                  maxLength={2}
                  className={modalInputClass}
                />
              </div>
            </div>
            <div>
              <label
                className={clsx(
                  "mb-1 block text-xs font-semibold",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                CEP
              </label>
              <input
                value={newClientAddressZipcode}
                onChange={(event) =>
                  setNewClientAddressZipcode(event.target.value)
                }
                placeholder="00000000"
                className={modalInputClass}
              />
            </div>
          </div>
          <div>
            <label className={modalLabelClass}>Webhook n8n</label>
            <input
              value={newClientWebhook}
              onChange={(event) => setNewClientWebhook(event.target.value)}
              placeholder="https://seu-n8n/webhook/..."
              className={modalInputClass}
            />
          </div>
          {createError ? <Notice tone="error">{createError}</Notice> : null}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => (editLoading ? null : setEditOpen(false))}
        title="Editar cliente"
        size="md"
        dark={isDarkMode}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={editLoading}
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
              onClick={() => void handleSaveClientEdit()}
              disabled={editLoading}
              className="rounded-full bg-[#FF0636] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e1002d] disabled:opacity-60"
            >
              {editLoading ? "Salvando..." : "Salvar alterações"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={modalLabelClass}>Empresa</label>
            <input
              value={editClientName}
              onChange={(event) => setEditClientName(event.target.value)}
              placeholder="Ex.: Empresa Demo"
              className={modalInputClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={modalLabelClass}>CNPJ</label>
              <input
                value={editClientCnpj}
                onChange={(event) => setEditClientCnpj(event.target.value)}
                placeholder="Opcional"
                className={modalInputClass}
              />
            </div>
            <div>
              <label className={modalLabelClass}>Telefone</label>
              <input
                value={editClientPhone}
                onChange={(event) => setEditClientPhone(event.target.value)}
                placeholder="Opcional"
                className={modalInputClass}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={modalLabelClass}>WhatsApp</label>
              <input
                value={editClientWhatsapp}
                onChange={(event) => setEditClientWhatsapp(event.target.value)}
                placeholder="Opcional"
                className={modalInputClass}
              />
            </div>
            <div>
              <label className={modalLabelClass}>E-mail de contato</label>
              <input
                type="email"
                value={editClientEmail}
                onChange={(event) => setEditClientEmail(event.target.value)}
                placeholder="contato@empresa.com"
                className={modalInputClass}
              />
            </div>
          </div>
          <div>
            <label className={modalLabelClass}>Endereço</label>
            <input
              value={editClientAddress}
              onChange={(event) => setEditClientAddress(event.target.value)}
              placeholder="Rua, número, bairro, cidade..."
              className={modalInputClass}
            />
          </div>
          <div>
            <label className={modalLabelClass}>Webhook n8n</label>
            <input
              value={editClientWebhook}
              onChange={(event) => setEditClientWebhook(event.target.value)}
              placeholder="https://seu-n8n/webhook/..."
              className={modalInputClass}
            />
          </div>
          {editError ? <Notice tone="error">{editError}</Notice> : null}
        </div>
      </Modal>
    </div>
  );
}
