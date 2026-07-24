import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useOutletContext } from "react-router-dom";
import { Search, Plus, Upload, Download } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Drawer, Modal } from "../../components/ui/Modal";
import { Notice } from "../../components/ui/Notice";
import {
  SourceBadge,
  StageBadge,
  ConfirmationBadge,
} from "../../components/ui/Badge";
import type { Lead, LeadSource, User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { readStoredSession } from "../../services/auth";
import { pushToast } from "../../components/ui/Toast";
import {
  checkLeadPhone,
  createLead,
  exportLeadsCsv,
  importLeadsCsv,
  listLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  normalizeBrPhoneToE164,
  phoneDigitsForCompare,
} from "../../utils/phone";
import { saveOrShareBlob } from "../../utils/nativeDownload";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

type OutletContext = {
  user: User;
};

type LeadMotionKind = "new" | "stage-change" | "update";

export function LeadsPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [busyExport, setBusyExport] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>("manual");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [liveLeadKinds, setLiveLeadKinds] = useState<
    Record<string, LeadMotionKind>
  >({});
  const [duplicateLeadIdToAssign, setDuplicateLeadIdToAssign] = useState<
    string | null
  >(null);
  const [assignVendorId, setAssignVendorId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousLeadVersionRef = useRef<Map<string, Lead>>(new Map());
  const liveLeadTimeoutRef = useRef<number | null>(null);
  const normalizedLeadPhone = normalizeBrPhoneToE164(leadPhone);
  const duplicatePhoneLead = normalizedLeadPhone
    ? (leads.find(
        (lead) =>
          phoneDigitsForCompare(lead.phone) ===
          phoneDigitsForCompare(normalizedLeadPhone),
      ) ?? null)
    : null;
  const duplicateLeadOwnerName = duplicatePhoneLead?.assigned_vendor_id
    ? (vendors.find((v) => v.id === duplicatePhoneLead.assigned_vendor_id)
        ?.name ?? "outro vendedor")
    : null;

  const loadLeads = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    void Promise.all([
      listLeads({ client_id: clientId }, t),
      listClientStaff(clientId, t),
    ]).then(([lr, sr]) => {
      setLeads(lr.map(mapApiLeadToLead));
      const staffRows = sr.map(mapStaffToUser);
      setStaff(staffRows);
      setVendors(staffRows.filter((u) => u.role === "vendedor"));
    });
  }, [clientId]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  useLeadRealtimeSync(clientId, loadLeads);

  useEffect(() => {
    const previous = previousLeadVersionRef.current;
    if (previous.size === 0) {
      previousLeadVersionRef.current = new Map(
        leads.map((lead) => [lead.id, lead]),
      );
      return;
    }

    const changedEntries: Array<readonly [string, LeadMotionKind]> = [];
    leads.forEach((lead) => {
      const previousLead = previous.get(lead.id);
      if (!previousLead) {
        changedEntries.push([lead.id, "new"]);
        return;
      }
      if (previousLead.crm_stage !== lead.crm_stage) {
        changedEntries.push([lead.id, "stage-change"]);
        return;
      }
      if (
        previousLead.updated_at !== lead.updated_at ||
        previousLead.confirmation_status !== lead.confirmation_status
      ) {
        changedEntries.push([lead.id, "update"]);
      }
    });

    previousLeadVersionRef.current = new Map(
      leads.map((lead) => [lead.id, lead]),
    );

    if (changedEntries.length === 0) return;

    setLiveLeadKinds((current) => ({
      ...current,
      ...Object.fromEntries(changedEntries),
    }));
    if (typeof window !== "undefined" && liveLeadTimeoutRef.current) {
      window.clearTimeout(liveLeadTimeoutRef.current);
    }
    if (typeof window !== "undefined") {
      liveLeadTimeoutRef.current = window.setTimeout(() => {
        setLiveLeadKinds({});
        liveLeadTimeoutRef.current = null;
      }, 2200);
    }
  }, [leads]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && liveLeadTimeoutRef.current) {
        window.clearTimeout(liveLeadTimeoutRef.current);
      }
    };
  }, []);

  const secondaryBtnDark =
    "!border-zinc-600 !bg-zinc-900 !text-zinc-200 hover:!bg-zinc-800 hover:!border-zinc-500";

  const handleExport = async () => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) return;
    setBusyExport(true);
    try {
      const csv = await exportLeadsCsv({ client_id: clientId }, token);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      await saveOrShareBlob(
        blob,
        `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao exportar leads";
      pushToast({ message, type: "error" });
    } finally {
      setBusyExport(false);
    }
  };

  const handleImportClick = () => {
    fileRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const token = readStoredSession()?.accessToken;
    if (!file || !clientId || !token) return;
    setBusyImport(true);
    try {
      const result = await importLeadsCsv({ client_id: clientId, file }, token);
      loadLeads();
      const tail = result.errors.length
        ? `\nErros: ${result.errors.join(" | ")}`
        : "";
      pushToast({
        message: `Importação concluída.\nImportados: ${result.imported}\nIgnorados: ${result.skipped}${tail}`,
        type: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao importar leads";
      pushToast({ message, type: "error" });
    } finally {
      setBusyImport(false);
      event.target.value = "";
    }
  };

  const vendorsById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const staffById = Object.fromEntries(
    staff.map((member) => [member.id, member.name]),
  );

  const handleCreateLead = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId) return;
    if (!leadName.trim()) {
      setCreateError("Informe o nome do lead.");
      return;
    }
    if (!normalizedLeadPhone) {
      setCreateError("Informe um telefone válido (ex: +5512981092776).");
      setDuplicateLeadIdToAssign(null);
      return;
    }
    if (duplicatePhoneLead) {
      if (duplicatePhoneLead.assigned_vendor_id) {
        setDuplicateLeadIdToAssign(null);
        setCreateError(
          `Este telefone já está cadastrado para o vendedor ${duplicateLeadOwnerName}.`,
        );
      } else {
        setDuplicateLeadIdToAssign(duplicatePhoneLead.id);
        if (!assignVendorId && vendors[0]?.id) {
          setAssignVendorId(vendors[0].id);
        }
        setCreateError(
          'Lead já cadastrado, mas sem vendedor. Selecione um vendedor e clique em "Adicionar e atribuir".',
        );
      }
      return;
    }

    try {
      const check = await checkLeadPhone(normalizedLeadPhone, token, clientId);
      if (check.exists && check.lead) {
        if (check.lead.assigned_vendor_id) {
          setDuplicateLeadIdToAssign(null);
          setCreateError(
            `Este telefone já está cadastrado para o vendedor ${check.lead.assigned_vendor_name ?? duplicateLeadOwnerName}.`,
          );
        } else {
          setDuplicateLeadIdToAssign(check.lead.id);
          if (!assignVendorId && vendors[0]?.id) {
            setAssignVendorId(vendors[0].id);
          }
          setCreateError(
            'Lead já cadastrado, mas sem vendedor. Selecione um vendedor e clique em "Adicionar e atribuir".',
          );
        }
        return;
      }
    } catch {
      // Se a checagem falhar, tentamos criar e o backend mantém o bloqueio final.
    }

    setDuplicateLeadIdToAssign(null);
    setCreateError("");
    setCreating(true);
    try {
      const row = await createLead(
        {
          client_id: clientId,
          name: leadName.trim(),
          email: leadEmail.trim() || null,
          phone: normalizedLeadPhone,
          source: leadSource,
        },
        token,
      );
      setLeads((prev) => [mapApiLeadToLead(row), ...prev]);
      setCreateModalOpen(false);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setLeadSource("manual");
      setAssignVendorId("");
      setDuplicateLeadIdToAssign(null);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o lead.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleAssignDuplicateLead = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !duplicateLeadIdToAssign) return;
    if (!assignVendorId) {
      setCreateError("Selecione um vendedor para atribuir este lead.");
      return;
    }
    setAssigning(true);
    try {
      const updated = await updateLead(
        duplicateLeadIdToAssign,
        { assigned_vendor_id: assignVendorId },
        token,
      );
      const mapped = mapApiLeadToLead(updated);
      setLeads((prev) =>
        prev.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setCreateModalOpen(false);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setAssignVendorId("");
      setDuplicateLeadIdToAssign(null);
      setCreateError("");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Não foi possível atribuir este lead.",
      );
    } finally {
      setAssigning(false);
    }
  };

  const filtered = leads.filter((l) => {
    if (
      search &&
      !l.name.toLowerCase().includes(search.toLowerCase()) &&
      !l.phone.includes(search) &&
      !l.email.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterSource && l.source !== filterSource) return false;
    if (filterStage && l.crm_stage !== filterStage) return false;
    if (filterVendor && l.assigned_vendor_id !== filterVendor) return false;
    if (filterStatus && l.confirmation_status !== filterStatus) return false;
    return true;
  });

  if (!clientId) return <MissingClientScope />;

  return (
    <div
      className={clsx(
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8",
        isDarkMode && "bg-black",
      )}
    >
      <PageHeader
        title="Leads"
        breadcrumbs={[{ label: "TechStore" }, { label: "Leads" }]}
        dark={isDarkMode}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleImportFile}
              aria-label="Selecionar arquivo CSV para importar leads"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload size={14} />}
              onClick={handleImportClick}
              loading={busyImport}
              title="Importar leads via planilha CSV ou XLSX (colunas: name, email, phone, source, tags, notes)"
              className={isDarkMode ? secondaryBtnDark : undefined}
            >
              Importar CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={() => void handleExport()}
              loading={busyExport}
              title="Baixar leads filtrados em CSV (UTF-8)"
              className={isDarkMode ? secondaryBtnDark : undefined}
            >
              Exportar CSV
            </Button>
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                setCreateModalOpen(true);
                setCreateError("");
                setDuplicateLeadIdToAssign(null);
              }}
            >
              Novo Lead
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Input
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search size={16} />}
          className="w-64"
          dark={isDarkMode}
        />
        <Select
          options={[
            { value: "facebook_ads", label: "Facebook Ads" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "form_page", label: "Formulário" },
            { value: "manual", label: "Manual" },
          ]}
          placeholder="Fonte"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="w-36"
          dark={isDarkMode}
        />
        <Select
          options={[
            { value: "novo", label: "Novo" },
            { value: "contactado", label: "Contactado" },
            { value: "agendado", label: "Agendado" },
            { value: "convertido", label: "Convertido" },
            { value: "perdido", label: "Perdido" },
          ]}
          placeholder="Etapa"
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="w-36"
          dark={isDarkMode}
        />
        <Select
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
          placeholder="Vendedor"
          value={filterVendor}
          onChange={(e) => setFilterVendor(e.target.value)}
          className="w-40"
          dark={isDarkMode}
        />
        <Select
          options={[
            { value: "pending", label: "Pendente" },
            { value: "confirmed", label: "Confirmado" },
            { value: "cancelled", label: "Cancelado" },
            { value: "checked_in", label: "Check-in" },
          ]}
          placeholder="Status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-36"
          dark={isDarkMode}
        />
        {(search ||
          filterSource ||
          filterStage ||
          filterVendor ||
          filterStatus) && (
          <button
            onClick={() => {
              setSearch("");
              setFilterSource("");
              setFilterStage("");
              setFilterVendor("");
              setFilterStatus("");
            }}
            className={clsx(
              "text-sm",
              isDarkMode
                ? "text-blue-400 hover:text-blue-300"
                : "text-blue-500 hover:text-blue-700",
            )}
          >
            Limpar filtros
          </button>
        )}
        <span
          className={clsx(
            "text-xs ml-auto",
            isDarkMode ? "text-zinc-500" : "text-gray-400",
          )}
        >
          {filtered.length} leads
        </span>
      </div>

      {/* Table */}
      <div className="bg-white card-surface rounded-lg border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Telefone
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  E-mail
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Fonte
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Etapa
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Atendente
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Vendas
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Tags
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Data
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, index) => {
                const attendantName =
                  lead.attendant_type === "external_agent"
                    ? "Rubinho"
                    : lead.attendant_user_id
                      ? (staffById[lead.attendant_user_id] ?? "Sem atendente")
                      : lead.assigned_vendor_id
                        ? (vendorsById[lead.assigned_vendor_id] ??
                          "Sem atendente")
                        : "Sem atendente";
                const saleVendorName = lead.sold_by_vendor_id
                  ? (staffById[lead.sold_by_vendor_id] ?? "—")
                  : "—";
                const liveLeadKind = liveLeadKinds[lead.id];
                const hasPhone = Boolean(lead.phone.trim());
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={clsx(
                      "lead-row-motion border-b border-gray-50 last:border-0 cursor-pointer transition-all duration-300",
                      "hover:-translate-y-0.5 hover:bg-blue-50/40 hover:shadow-[0_16px_30px_-24px_rgba(37,99,235,0.5)]",
                      !hasPhone && "lead-row-no-phone",
                      liveLeadKind === "new" && "lead-row-live-new",
                      liveLeadKind === "stage-change" && "lead-row-live-stage",
                      liveLeadKind === "update" && "lead-row-live-update",
                    )}
                    style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {lead.name}
                    </td>
                    <td className="px-4 py-3">
                      {hasPhone ? (
                        <span className="text-gray-600">{lead.phone}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-amber-700">
                          Sem telefone
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {lead.email}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={lead.crm_stage} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {attendantName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {saleVendorName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ConfirmationBadge status={lead.confirmation_status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setDuplicateLeadIdToAssign(null);
          setLeadSource("manual");
        }}
        title="Cadastrar lead"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                setDuplicateLeadIdToAssign(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreateLead()}
              loading={creating}
              isDisabled={!!duplicatePhoneLead || !normalizedLeadPhone}
            >
              Cadastrar
            </Button>
            {duplicateLeadIdToAssign ? (
              <Button
                variant="secondary"
                onClick={() => void handleAssignDuplicateLead()}
                loading={assigning}
              >
                Adicionar e atribuir
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={leadName}
            onChange={(e) => setLeadName(e.target.value)}
            placeholder="Nome"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            value={leadPhone}
            onChange={(e) => {
              setLeadPhone(e.target.value);
              setDuplicateLeadIdToAssign(null);
              setCreateError("");
            }}
            placeholder="+5512981092776"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {normalizedLeadPhone ? (
            <p
              className={clsx(
                "text-xs",
                isDarkMode ? "text-zinc-400" : "text-gray-500",
              )}
            >
              Será salvo como: {normalizedLeadPhone}
            </p>
          ) : null}
          {duplicatePhoneLead ? (
            <Notice tone="error" className="text-xs">
              Telefone já cadastrado para {duplicatePhoneLead.name}
              {duplicateLeadOwnerName
                ? ` (${duplicateLeadOwnerName})`
                : " (sem vendedor)"}
              .
            </Notice>
          ) : null}
          {duplicateLeadIdToAssign ? (
            <Select
              label="Vendedor para assumir o lead"
              value={assignVendorId}
              onChange={(e) => setAssignVendorId(e.target.value)}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          ) : null}
          <input
            type="email"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            placeholder="E-mail (opcional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Select
            label="Origem do lead"
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value as LeadSource)}
            dark={isDarkMode}
            options={[
              { value: "manual", label: "Manual" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "form_page", label: "Formulário" },
              { value: "facebook_ads", label: "Facebook Ads" },
              { value: "import_excel", label: "Planilha" },
            ]}
          />
          {createError ? (
            <Notice tone="error" className="text-xs">
              {createError}
            </Notice>
          ) : null}
        </div>
      </Modal>

      {/* Lead Detail Drawer */}
      <Drawer
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.name || ""}
        width="w-96"
        dark={isDarkMode}
      >
        {selectedLead && (
          <div className="space-y-6">
            {/* Contact info */}
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Contato
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Telefone</span>
                  <span className="font-medium text-gray-900">
                    {selectedLead.phone}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">E-mail</span>
                  <span className="font-medium text-gray-900 text-xs">
                    {selectedLead.email}
                  </span>
                </div>
              </div>
            </section>

            {/* Status */}
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Status
              </h4>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Fonte</span>
                  <SourceBadge source={selectedLead.source} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Etapa CRM</span>
                  <StageBadge stage={selectedLead.crm_stage} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Confirmação</span>
                  <ConfirmationBadge
                    status={selectedLead.confirmation_status}
                  />
                </div>
              </div>
            </section>

            {/* Tags */}
            {selectedLead.tags.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedLead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Timeline */}
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Timeline
              </h4>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      Lead criado
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(selectedLead.created_at).toLocaleDateString(
                        "pt-BR",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      Última atualização
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(selectedLead.updated_at).toLocaleDateString(
                        "pt-BR",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Notes */}
            {selectedLead.notes && (
              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Notas
                </h4>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  {selectedLead.notes}
                </p>
              </section>
            )}

            {/* Visit */}
            {selectedLead.store_visit_datetime && (
              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Visita Agendada
                </h4>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(
                    selectedLead.store_visit_datetime,
                  ).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
