import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  CircleDashed,
  Database,
  Eye,
  EyeOff,
  Facebook,
  FileText,
  Globe,
  Layers3,
  Link2,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  UserRound,
  UserCheck,
  Users,
  Trash2,
  X,
} from "lucide-react";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { AppOutletContext } from "../../layouts/AppLayout";
import {
  isLocallyReasonablePassword,
  PASSWORD_REQUIREMENTS_HINT,
} from "../../lib/passwordPolicy";
import { Tabs } from "../../components/ui/Tabs";
import { Card } from "../../components/ui/Card";
import {
  Badge,
  SourceBadge,
  StageBadge,
  ConfirmationBadge,
  PlanBadge,
} from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyableId } from "../../components/ui/CopyableId";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Modal } from "../../components/ui/Modal";
import { Notice } from "../../components/ui/Notice";
import { pushToast } from "../../components/ui/Toast";
import { resolvePublicWebOrigin } from "../../utils/publicWebOrigin";
import type { Client, Conversation, Lead } from "../../types";
import type { MetaBusinessOption, MetaConnectionState } from "../../types/meta";
import { readStoredSession } from "../../services/auth";
import {
  deleteClient,
  getClient,
  mapApiClientToClient,
  updateClient,
} from "../../services/clients";
import {
  createPrincipalClientAccess,
  createStaffUser,
  deleteStaffUser,
  listStaffByClient,
  toggleUserActive,
  updateStaffUser,
  type StaffUser,
} from "../../services/users";
import { listClientStaff } from "../../services/staff";
import {
  deleteLead,
  fetchAllLeads,
  listLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import {
  conversationFromListRow,
  listConversations,
} from "../../services/conversations";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  disconnectMeta,
  importMetaLeads,
  getMetaGestorStatus,
  getMetaSummary,
  getMetaStatus,
  listMetaBusinesses,
  selectMetaAssets,
  syncMetaFull,
  type MetaBusinessApiOption,
} from "../../services/meta";
import {
  listClientVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listCarBrands,
  listCarModelsByBrand,
  type Vehicle,
  type VehicleOption,
} from "../../services/vehicles";
import { Car, Tag, Upload, Image as ImageIcon } from "lucide-react";
import { resizeImageToDataUrl } from "../../utils/image";

import type { ConfirmationStatus, LeadSource } from "../../types";
import type { VendorCategory } from "../../types";

const TABS = [
  { id: "perfil", label: "Perfil", icon: <Building2 size={14} /> },
  { id: "equipe", label: "Equipe", icon: <Users size={14} /> },
  { id: "acesso", label: "Acesso", icon: <Settings size={14} /> },
  { id: "ads", label: "Ads (Facebook)", icon: <Facebook size={14} /> },
  { id: "rubinho", label: "Rubinho", icon: <Settings size={14} /> },
  { id: "veiculos", label: "Veículos", icon: <Car size={14} /> },
  { id: "leads", label: "Lista de Leads", icon: <CheckCircle2 size={14} /> },
];

type EditableStaffRole = "cliente" | "vendedor" | "recepcao";
type LeadSourceFilter = "all" | LeadSource;
type ConfirmationStatusFilter = "all" | ConfirmationStatus;
type EditableVendorCategory = VendorCategory;
type DeleteAction =
  | { kind: "client" }
  | { kind: "staff"; member: StaffUser }
  | { kind: "lead"; leadId: string; leadName: string }
  | { kind: "bulk-leads"; leadIds: string[] };

const VENDOR_CATEGORY_OPTIONS: Array<{
  value: EditableVendorCategory;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "semininovo", label: "Semininovo" },
  { value: "pdc", label: "PCD" },
  { value: "consorcio", label: "Consorcio" },
  { value: "assinatura", label: "Assinatura" },
];

const LEAD_SOURCE_OPTIONS: Array<{ value: LeadSourceFilter; label: string }> = [
  { value: "all", label: "Todas as fontes" },
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
  { value: "form_page", label: "Formulário" },
  { value: "import_excel", label: "Importação" },
];

const LEAD_STATUS_OPTIONS: Array<{
  value: ConfirmationStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendente" },
  { value: "scheduled", label: "Agendado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "checked_in", label: "Check-in" },
  { value: "cancelled", label: "Cancelado" },
];

const META_IMPORT_PAGE_SIZE = 6;
const LEADS_PAGE_SIZE = 50;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function mapMetaConnectionFromApi(
  rawConnection: Record<string, unknown>,
  summaryOverride?: Partial<MetaConnectionState["sync_summary"]>,
): MetaConnectionState | null {
  const selectedAssets = Array.isArray(rawConnection.selected_assets)
    ? (rawConnection.selected_assets as Array<Record<string, unknown>>)
    : [];
  const syncJobs = Array.isArray(rawConnection.sync_jobs)
    ? (rawConnection.sync_jobs as Array<Record<string, unknown>>)
    : [];

  const adAccounts = selectedAssets
    .filter((item) => item.asset_type === "ad_account" || item.ad_account_id)
    .map((item) => ({
      id: String(item.ad_account_id ?? item.external_id ?? ""),
      name: String(
        item.asset_name ??
          item.ad_account_name ??
          item.ad_account_id ??
          item.external_id ??
          "Conta de anúncio",
      ),
    }))
    .filter((item) => item.id);

  const pages = selectedAssets
    .filter(
      (item) => item.asset_type === "page" || (item.page_id && !item.form_id),
    )
    .map((item) => ({
      id: String(item.page_id ?? item.external_id ?? ""),
      name: String(
        item.asset_name ??
          item.page_name ??
          item.page_id ??
          item.external_id ??
          "Página",
      ),
    }))
    .filter((item) => item.id);

  const forms = selectedAssets
    .filter((item) => item.asset_type === "lead_form" || item.form_id)
    .map((item) => ({
      id: String(item.form_id ?? item.external_id ?? ""),
      page_id: String(item.page_id ?? ""),
      name: String(
        item.asset_name ??
          item.form_name ??
          item.form_id ??
          item.external_id ??
          "Formulário",
      ),
    }))
    .filter((item) => item.id);

  const whatsapp = selectedAssets.find(
    (item) =>
      item.asset_type === "whatsapp" || item.waba_id || item.phone_number_id,
  );
  const latestSync = syncJobs[0];
  const syncSummary =
    latestSync &&
    typeof latestSync.context === "object" &&
    latestSync.context !== null
      ? (latestSync.context as Record<string, unknown>)
      : {};

  return {
    business_id: String(rawConnection.business_id ?? ""),
    business_name: String(rawConnection.business_name ?? "Business Manager"),
    selected_ad_accounts: adAccounts,
    selected_pages: pages,
    selected_forms: forms,
    selected_whatsapp: whatsapp
      ? {
          id: String(whatsapp.waba_id ?? whatsapp.external_id ?? ""),
          name: String(whatsapp.asset_name ?? whatsapp.waba_id ?? "WhatsApp"),
          phone_number_id: String(whatsapp.phone_number_id ?? ""),
          display_phone_number: String(whatsapp.phone_number_id ?? "—"),
        }
      : null,
    phone_number_id: whatsapp ? String(whatsapp.phone_number_id ?? "") : null,
    last_sync_at: String(
      rawConnection.last_sync_at ??
        rawConnection.updated_at ??
        new Date().toISOString(),
    ),
    sync_summary: {
      campaigns: Number(syncSummary.campaigns ?? 0),
      ad_sets: Number(syncSummary.ad_sets ?? 0),
      ads: Number(syncSummary.ads ?? 0),
      leads_imported: Number(syncSummary.imported_leads ?? 0),
      spend_today: 0,
      daily_budget: 0,
      ...summaryOverride,
    },
  };
}

function mapMetaBusinessFromApi(
  rawBusiness: MetaBusinessApiOption,
): MetaBusinessOption {
  return {
    id: String(rawBusiness.id),
    name: String(rawBusiness.name ?? `BM ${rawBusiness.id}`),
    ad_accounts: (rawBusiness.ad_accounts ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? item.id),
    })),
    pages: (rawBusiness.pages ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? item.id),
    })),
    forms: (rawBusiness.forms ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? item.id),
      page_id: String(item.page_id ?? "—"),
    })),
    whatsapp_accounts: (rawBusiness.whatsapp_accounts ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? item.id),
      phone_number_id: String(item.phone_number_id ?? ""),
      display_phone_number: String(
        item.display_phone_number ?? item.phone_number_id ?? "—",
      ),
    })),
  };
}

function MetaStatCard({
  label,
  value,
  helper,
  icon,
  dark,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-[24px] border p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]",
        dark ? "border-zinc-800 bg-[#0f0f12]" : "border-[#eadfce] bg-white/90",
      )}
    >
      <div
        className={clsx(
          "mb-3 flex h-11 w-11 items-center justify-center rounded-2xl",
          dark ? "bg-[#1a1a22] text-[#e0a33a]" : "bg-[#fff4e7] text-[#b7791f]",
        )}
      >
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <p
        className={clsx(
          "mt-2 text-2xl font-black tracking-tight",
          dark ? "text-zinc-100" : "text-zinc-950",
        )}
      >
        {value}
      </p>
      <p
        className={clsx(
          "mt-1 text-xs font-medium",
          dark ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        {helper}
      </p>
    </div>
  );
}

function AssetChip({
  children,
  dark,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold",
        dark
          ? "border-zinc-700 bg-[#1b1b1f] text-zinc-300"
          : "border-[#eadfce] bg-[#fffaf2] text-zinc-700",
      )}
    >
      {children}
    </span>
  );
}

function AssetSelectionBlock({
  title,
  subtitle,
  icon,
  items,
  selectedIds,
  onToggle,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: Array<{ id: string; label: string; description?: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-[26px] border border-zinc-200 bg-[#fcfbf8] p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
            {emptyLabel}
          </div>
        ) : (
          items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                  checked
                    ? "border-[#f0d2a8] bg-[#fff7ea]"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#FF0636] focus:ring-[#FF0636]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {item.label}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {item.description ?? item.id}
                  </p>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

const CAR_CATEGORIES = [
  "Hatch",
  "Sedan",
  "SUV",
  "Picape",
  "Minivan",
  "Esportivo",
  "Conversível",
  "Van / Utilitário",
];

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

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useOutletContext<AppOutletContext>();
  const isApiClient = Boolean(id && isUuid(id));
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [activeTab, setActiveTab] = useState("perfil");

  // States for vehicles showcase
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesSearch, setVehiclesSearch] = useState("");
  const [vehiclesStatusFilter, setVehiclesStatusFilter] = useState<
    "all" | "available" | "hidden"
  >("all");
  const [vehiclesTagFilter, setVehiclesTagFilter] = useState("all");

  // Form/Modal states for vehicles
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYearOrKm, setVehicleYearOrKm] = useState("");
  const [vehiclePrice, setVehiclePrice] = useState("");
  const [vehicleStores, setVehicleStores] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState(true);
  const [vehicleTags, setVehicleTags] = useState<string[]>([]);
  const [newVehicleTagInput, setNewVehicleTagInput] = useState("");
  const [isManualInput, setIsManualInput] = useState(false);
  const [vehicleImageUrl, setVehicleImageUrl] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [vehicleGallery, setVehicleGallery] = useState<string[]>([]);
  const [isResizingImages, setIsResizingImages] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [vehicleCondition, setVehicleCondition] = useState<"novo" | "seminovo">(
    "novo",
  );
  const [vehicleManufacturingYear, setVehicleManufacturingYear] = useState("");
  const [vehicleModelYear, setVehicleModelYear] = useState("");
  const [vehicleKm, setVehicleKm] = useState("");

  // Máscaras de Entrada e Helpers de Parsing
  const formatBRL = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseFloat(digits) / 100;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const parseBRLToDecimal = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "0.00";
    return (parseFloat(digits) / 100).toFixed(2);
  };

  const formatKM = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return new Intl.NumberFormat("pt-BR").format(parseInt(digits, 10));
  };

  const parseKMToInt = (val: string) => {
    const digits = val.replace(/\D/g, "");
    return digits || "0";
  };

  const handleYearChange = (val: string, setter: (v: string) => void) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    setter(digits);
  };

  // FIPE Selectors states
  const [fipeBrands, setFipeBrands] = useState<VehicleOption[]>([]);
  const [fipeModels, setFipeModels] = useState<VehicleOption[]>([]);
  const [loadingFipeBrands, setLoadingFipeBrands] = useState(false);
  const [loadingFipeModels, setLoadingFipeModels] = useState(false);
  const [selectedBrandCode, setSelectedBrandCode] = useState("");

  // Delete vehicle state
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [isImportingMetaLeads, setIsImportingMetaLeads] = useState(false);
  const [isImportMetaModalOpen, setIsImportMetaModalOpen] = useState(false);
  const [selectedMetaImportFormIds, setSelectedMetaImportFormIds] = useState<
    string[]
  >([]);
  const [metaImportPage, setMetaImportPage] = useState(1);
  const [isDisconnectingMeta, setIsDisconnectingMeta] = useState(false);
  const [metaStatusLoading, setMetaStatusLoading] = useState(false);
  const [metaBusinessesLoading, setMetaBusinessesLoading] = useState(false);
  const [metaStatusMessage, setMetaStatusMessage] = useState("");
  /** Meta OAuth uma vez no gestor; BM por cliente usa `gestor_token` na API. */
  const [gestorMetaConnected, setGestorMetaConnected] = useState(false);
  const [apiBusinesses, setApiBusinesses] = useState<MetaBusinessOption[]>([]);
  const [apiClient, setApiClient] = useState<Client | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientFetchError, setClientFetchError] = useState("");
  const [detailLeads, setDetailLeads] = useState<Lead[] | null>(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSourceFilter, setLeadSourceFilter] =
    useState<LeadSourceFilter>("all");
  const [leadStatusFilter, setLeadStatusFilter] =
    useState<ConfirmationStatusFilter>("all");
  const [leadsPage, setLeadsPage] = useState(1);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadProfileOpen, setLeadProfileOpen] = useState<Lead | null>(null);
  const [leadEditing, setLeadEditing] = useState<Lead | null>(null);
  const [leadFormName, setLeadFormName] = useState("");
  const [leadFormEmail, setLeadFormEmail] = useState("");
  const [leadFormPhone, setLeadFormPhone] = useState("");
  const [leadFormSource, setLeadFormSource] = useState<LeadSource>("manual");
  const [leadFormStatus, setLeadFormStatus] =
    useState<ConfirmationStatus>("pending");
  const [leadFormNotes, setLeadFormNotes] = useState("");
  const [leadFormBirthDate, setLeadFormBirthDate] = useState("");
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadDeleting, setLeadDeleting] = useState<string | null>(null);
  const [leadsBulkDeleting, setLeadsBulkDeleting] = useState(false);
  const [leadsActionMessage, setLeadsActionMessage] = useState("");
  const [detailConversations, setDetailConversations] = useState<
    Conversation[] | null
  >(null);
  const [accessName, setAccessName] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [accessSuccess, setAccessSuccess] = useState("");
  const [principalAccess, setPrincipalAccess] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [principalLoading, setPrincipalLoading] = useState(false);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffFormName, setStaffFormName] = useState("");
  const [staffFormEmail, setStaffFormEmail] = useState("");
  const [staffFormPhone, setStaffFormPhone] = useState("");
  const [staffFormPassword, setStaffFormPassword] = useState("");
  const [staffFormRole, setStaffFormRole] =
    useState<EditableStaffRole>("vendedor");
  const [staffFormVendorCategories, setStaffFormVendorCategories] = useState<
    EditableVendorCategory[]
  >(["novo"]);
  const [staffFormShowPassword, setStaffFormShowPassword] = useState(false);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffSaveError, setStaffSaveError] = useState("");
  const [staffToggling, setStaffToggling] = useState<string | null>(null);
  const [staffDeleting, setStaffDeleting] = useState<string | null>(null);
  const [staffEditing, setStaffEditing] = useState<StaffUser | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteActionLoading, setDeleteActionLoading] = useState(false);

  const resolvedId = id ?? "";
  const [metaConnection, setMetaConnection] =
    useState<MetaConnectionState | null>(null);

  const availableBusinesses = useMemo(() => apiBusinesses, [apiBusinesses]);
  const [draftBusinessId, setDraftBusinessId] = useState("");
  const [draftAdAccountIds, setDraftAdAccountIds] = useState<string[]>([]);
  const [draftPageIds, setDraftPageIds] = useState<string[]>([]);
  const [draftFormIds, setDraftFormIds] = useState<string[]>([]);
  const [draftWhatsappId, setDraftWhatsappId] = useState("");
  const [draftPhoneNumberId, setDraftPhoneNumberId] = useState("");

  const selectedBusiness = useMemo(
    () =>
      availableBusinesses.find((business) => business.id === draftBusinessId) ??
      null,
    [availableBusinesses, draftBusinessId],
  );

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

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
      observer.disconnect();
    };
  }, [user.id]);

  async function refreshMetaStatusFromApi(
    clientId: string,
    accessToken: string,
  ) {
    setMetaStatusLoading(true);
    try {
      const [response, summaryResponse] = await Promise.all([
        getMetaStatus(clientId, accessToken),
        getMetaSummary(clientId, accessToken),
      ]);

      const summary = summaryResponse.summary;
      if (
        response.connected &&
        response.connection &&
        typeof response.connection === "object"
      ) {
        const mapped = mapMetaConnectionFromApi(
          response.connection as Record<string, unknown>,
          {
            campaigns: Number(summary.campaigns ?? 0),
            ad_sets: Number(summary.ad_sets ?? 0),
            ads: Number(summary.ads ?? 0),
            leads_imported: Number(summary.leads_imported ?? 0),
            spend_today: Number(summary.spend_today ?? 0),
            daily_budget: Number(summary.daily_budget ?? 0),
          },
        );
        if (mapped) {
          setMetaConnection(mapped);
        }
      } else {
        setMetaConnection(null);
      }
    } finally {
      setMetaStatusLoading(false);
    }
  }

  async function loadBusinessesFromApi(clientId: string, accessToken: string) {
    setMetaBusinessesLoading(true);
    try {
      const response = await listMetaBusinesses(clientId, null, accessToken, {
        gestor_token: true,
      });
      const mappedBusinesses = (response.businesses ?? []).map(
        mapMetaBusinessFromApi,
      );
      setApiBusinesses(mappedBusinesses);

      const initialBusiness = mappedBusinesses[0];
      if (initialBusiness) {
        primeDraftState(initialBusiness);
        setIsMetaModalOpen(true);
      } else {
        setMetaStatusMessage(
          "A autorização foi concluída, mas nenhuma BM foi encontrada para esta conta.",
        );
      }
    } finally {
      setMetaBusinessesLoading(false);
    }
  }

  useEffect(() => {
    const clientId = id ?? "";
    if (!clientId) return;

    setApiBusinesses([]);
    setMetaStatusMessage("");

    if (!isUuid(clientId)) return;

    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) return;

    void refreshMetaStatusFromApi(clientId, accessToken).catch(() => {
      setMetaStatusMessage(
        "Não foi possível carregar o status da Meta neste cliente.",
      );
    });
  }, [id]);

  useEffect(() => {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) return;
    void getMetaGestorStatus(accessToken)
      .then((res) => setGestorMetaConnected(res.connected))
      .catch(() => setGestorMetaConnected(false));
  }, []);

  useEffect(() => {
    if (!resolvedId || !isUuid(resolvedId)) {
      setApiClient(null);
      setClientFetchError("");
      setClientLoading(false);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) {
      setClientLoading(false);
      return;
    }

    setClientLoading(true);
    setClientFetchError("");
    getClient(resolvedId, session.accessToken)
      .then((row) => setApiClient(mapApiClientToClient(row)))
      .catch(() => {
        setApiClient(null);
        setClientFetchError("Não foi possível carregar o cliente.");
      })
      .finally(() => setClientLoading(false));
  }, [resolvedId]);

  const refreshDetailLeads = useCallback(() => {
    if (!resolvedId || !isUuid(resolvedId)) {
      setDetailLeads(null);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) return;

    let active = true;
    fetchAllLeads({ client_id: resolvedId }, session.accessToken)
      .then((rows) => {
        if (active) setDetailLeads(rows.map(mapApiLeadToLead));
      })
      .catch(() => {
        if (active) setDetailLeads([]);
      });

    return () => {
      active = false;
    };
  }, [resolvedId]);

  useEffect(() => {
    const cleanup = refreshDetailLeads();
    return cleanup;
  }, [refreshDetailLeads]);

  useLeadRealtimeSync(resolvedId, refreshDetailLeads);

  useEffect(() => {
    if (!resolvedId || !isUuid(resolvedId)) {
      setDetailConversations(null);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) return;

    let active = true;
    const token = session.accessToken;

    listConversations(resolvedId, token)
      .then((rows) => {
        if (active) setDetailConversations(rows.map(conversationFromListRow));
      })
      .catch(() => {
        if (active) setDetailConversations([]);
      });

    return () => {
      active = false;
    };
  }, [resolvedId]);

  const client = apiClient ?? undefined;
  const defaultPipelineCode = useMemo(() => {
    if (!client?.id || !isUuid(client.id)) return "";
    return `PL_${client.id.replace(/-/g, "").toUpperCase().slice(0, 16)}`;
  }, [client?.id]);

  const filteredClientLeads = useMemo(() => {
    const leads = isUuid(resolvedId) ? (detailLeads ?? []) : [];
    const query = leadSearch.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesSearch =
        !query ||
        lead.name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        lead.email.toLowerCase().includes(query);
      const matchesSource =
        leadSourceFilter === "all" || lead.source === leadSourceFilter;
      const matchesStatus =
        leadStatusFilter === "all" ||
        lead.confirmation_status === leadStatusFilter;

      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [detailLeads, leadSearch, leadSourceFilter, leadStatusFilter, resolvedId]);

  useEffect(() => {
    setLeadsPage(1);
  }, [leadSearch, leadSourceFilter, leadStatusFilter, resolvedId]);

  useEffect(() => {
    if (!client) return;
    setAccessName((current) => (current ? current : client.company_name));
    setAccessEmail((current) =>
      current ? current : client.contact_email || "",
    );
  }, [client]);

  useEffect(() => {
    setSelectedLeadIds((current) =>
      current.filter((leadId) =>
        filteredClientLeads.some((lead) => lead.id === leadId),
      ),
    );
  }, [filteredClientLeads]);

  useEffect(() => {
    if (!isUuid(resolvedId)) {
      setPrincipalAccess(null);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) return;

    setPrincipalLoading(true);
    listClientStaff(resolvedId, session.accessToken)
      .then((rows) => {
        const principal = rows.find((row) => row.role === "cliente");
        setPrincipalAccess(
          principal
            ? { id: principal.id, name: principal.name, email: principal.email }
            : null,
        );
      })
      .catch(() => setPrincipalAccess(null))
      .finally(() => setPrincipalLoading(false));
  }, [resolvedId]);

  // Carrega equipe (vendedor + recepcao) quando aba equipe é ativada
  useEffect(() => {
    if (activeTab !== "equipe" || !isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setStaffLoading(true);
    setStaffError("");
    listStaffByClient(session.accessToken, resolvedId)
      .then((rows) => setStaffList(rows.filter((r) => r.role !== "gestor")))
      .catch(() => setStaffError("Não foi possível carregar a equipe."))
      .finally(() => setStaffLoading(false));
  }, [activeTab, resolvedId]);

  // Load vehicles when tab is active
  const loadVehicles = useCallback(() => {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setVehiclesLoading(true);
    listClientVehicles(resolvedId, {}, session.accessToken)
      .then((data) => setVehicles(data))
      .catch((err) => {
        console.error("Erro ao carregar veículos:", err);
      })
      .finally(() => setVehiclesLoading(false));
  }, [resolvedId]);

  useEffect(() => {
    if (activeTab === "veiculos") {
      loadVehicles();
    }
  }, [activeTab, loadVehicles]);

  // Load FIPE brands when modal opens
  useEffect(() => {
    if (!isVehicleModalOpen) return;
    setLoadingFipeBrands(true);
    listCarBrands()
      .then((data) => {
        setFipeBrands(data);
        if (editingVehicleId) {
          const matchedBrand = data.find(
            (b) => b.label.toLowerCase() === vehicleBrand.toLowerCase(),
          );
          if (matchedBrand) {
            setSelectedBrandCode(matchedBrand.value);
            setIsManualInput(false);
          } else {
            setSelectedBrandCode("");
            setIsManualInput(true);
          }
        } else {
          setIsManualInput(false);
        }
      })
      .catch((err) => console.error("Erro FIPE marcas:", err))
      .finally(() => setLoadingFipeBrands(false));
  }, [isVehicleModalOpen, editingVehicleId]);

  // Load FIPE models when brand changes
  useEffect(() => {
    if (!selectedBrandCode) {
      setFipeModels([]);
      return;
    }
    setLoadingFipeModels(true);
    listCarModelsByBrand(selectedBrandCode)
      .then((data) => setFipeModels(data))
      .catch((err) => console.error("Erro FIPE modelos:", err))
      .finally(() => setLoadingFipeModels(false));
  }, [selectedBrandCode]);

  const handleSaveVehicle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const session = readStoredSession();
    if (!session?.accessToken || !isUuid(resolvedId)) return;

    if (
      !vehicleBrand.trim() ||
      !vehicleModel.trim() ||
      !vehiclePrice.trim() ||
      !vehicleStores.trim()
    ) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    const parsedPrice = parseBRLToDecimal(vehiclePrice);
    const parsedKm =
      vehicleCondition === "novo" ? "0" : parseKMToInt(vehicleKm);

    // Dynamic year_or_km combined legacy field
    const kmStr =
      vehicleCondition === "novo" ? "0 km" : `${formatKM(parsedKm)} km`;
    const yearStr =
      vehicleManufacturingYear && vehicleModelYear
        ? `${vehicleManufacturingYear}/${vehicleModelYear}`
        : vehicleModelYear || vehicleManufacturingYear || "n/d";
    const yearOrKmCombined = `${yearStr} - ${kmStr}`;

    const payload = {
      client_id: resolvedId,
      brand: vehicleBrand,
      model: vehicleModel,
      year_or_km: yearOrKmCombined,
      price: parsedPrice,
      stores: vehicleStores,
      status: vehicleStatus,
      tags: vehicleTags,
      image_url: vehicleImageUrl.trim() || undefined,
      category: vehicleCategory || undefined,
      gallery: vehicleGallery,
      condition: vehicleCondition,
      manufacturing_year: vehicleManufacturingYear || undefined,
      model_year: vehicleModelYear || undefined,
      km: parsedKm,
    };

    try {
      if (editingVehicleId) {
        await updateVehicle(editingVehicleId, payload, session.accessToken);
      } else {
        await createVehicle(payload, session.accessToken);
      }
      setIsVehicleModalOpen(false);
      loadVehicles();
      // Reset form
      setEditingVehicleId(null);
      setVehicleBrand("");
      setVehicleModel("");
      setVehicleYearOrKm("");
      setVehiclePrice("");
      setVehicleStores("");
      setVehicleStatus(true);
      setVehicleTags([]);
      setSelectedBrandCode("");
      setVehicleImageUrl("");
      setVehicleCategory("");
      setVehicleGallery([]);
      setUploadError("");
      setVehicleCondition("novo");
      setVehicleManufacturingYear("");
      setVehicleModelYear("");
      setVehicleKm("");
    } catch (err) {
      console.error("Erro ao salvar veículo:", err);
      alert("Erro ao salvar veículo.");
    }
  };

  const handleToggleVehicleStatus = async (vehicle: Vehicle) => {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    try {
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicle.id ? { ...v, status: !v.status } : v,
        ),
      );
      await updateVehicle(
        vehicle.id,
        { status: !vehicle.status },
        session.accessToken,
      );
    } catch (err) {
      console.error("Erro ao alternar status do veículo:", err);
      loadVehicles();
    }
  };

  const handleDeleteVehicleConfirm = async () => {
    if (!vehicleToDelete) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    try {
      await deleteVehicle(vehicleToDelete.id, session.accessToken);
      setVehicleToDelete(null);
      loadVehicles();
    } catch (err) {
      console.error("Erro ao excluir veículo:", err);
      alert("Erro ao excluir veículo.");
    }
  };

  const handleMainImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Use uma imagem válida (PNG, JPG, WEBP, GIF, SVG).");
      return;
    }

    const MAX_INPUT_BYTES = 10_000_000;
    if (file.size > MAX_INPUT_BYTES) {
      setUploadError(
        `Imagem muito grande (${Math.round(file.size / 1024)}KB). Máximo 10MB.`,
      );
      return;
    }

    setUploadError("");
    setIsResizingImages(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, {
        maxDimension: 800,
        quality: 0.8,
      });
      setVehicleImageUrl(dataUrl);
    } catch (err) {
      console.error(err);
      setUploadError("Não foi possível processar a imagem.");
    } finally {
      setIsResizingImages(false);
    }
  };

  const handleGalleryImagesChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError("");
    setIsResizingImages(true);
    try {
      const newUrls: string[] = [];
      const MAX_INPUT_BYTES = 10_000_000;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_INPUT_BYTES) continue;

        const dataUrl = await resizeImageToDataUrl(file, {
          maxDimension: 800,
          quality: 0.8,
        });
        newUrls.push(dataUrl);
      }

      setVehicleGallery((prev) => [...prev, ...newUrls]);
    } catch (err) {
      console.error(err);
      setUploadError("Erro ao processar imagens da galeria.");
    } finally {
      setIsResizingImages(false);
    }
  };

  const removeGalleryImage = (indexToRemove: number) => {
    setVehicleGallery((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const openEditVehicleModal = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setVehicleBrand(vehicle.brand);
    setVehicleModel(vehicle.model);
    setVehicleYearOrKm(vehicle.year_or_km);

    if (vehicle.price) {
      const centsStr = (parseFloat(vehicle.price) * 100).toFixed(0);
      setVehiclePrice(formatBRL(centsStr));
    } else {
      setVehiclePrice("");
    }

    setVehicleStores(vehicle.stores);
    setVehicleStatus(vehicle.status);
    setVehicleTags(vehicle.tags || []);
    setVehicleImageUrl(vehicle.image_url || "");
    setVehicleCategory(vehicle.category || "");
    setVehicleGallery(vehicle.gallery || []);
    setUploadError("");

    const initialCondition =
      (vehicle.condition as "novo" | "seminovo") ||
      (vehicle.year_or_km?.toLowerCase().includes("novo")
        ? "novo"
        : "seminovo");
    setVehicleCondition(initialCondition);
    setVehicleManufacturingYear(vehicle.manufacturing_year || "");
    setVehicleModelYear(vehicle.model_year || "");
    setVehicleKm(
      vehicle.km
        ? formatKM(vehicle.km)
        : initialCondition === "novo"
          ? "0"
          : "",
    );

    const matchedBrand = fipeBrands.find(
      (b) => b.label.toLowerCase() === vehicle.brand.toLowerCase(),
    );
    if (matchedBrand) {
      setSelectedBrandCode(matchedBrand.value);
      setIsManualInput(false);
    } else {
      setSelectedBrandCode("");
      setIsManualInput(true);
    }
    setIsVehicleModalOpen(true);
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        v.brand.toLowerCase().includes(vehiclesSearch.toLowerCase()) ||
        v.model.toLowerCase().includes(vehiclesSearch.toLowerCase());

      const matchesStatus =
        vehiclesStatusFilter === "all"
          ? true
          : vehiclesStatusFilter === "available"
            ? v.status === true
            : v.status === false;

      const matchesTag =
        vehiclesTagFilter === "all" ? true : v.tags.includes(vehiclesTagFilter);

      return matchesSearch && matchesStatus && matchesTag;
    });
  }, [vehicles, vehiclesSearch, vehiclesStatusFilter, vehiclesTagFilter]);

  const allVehicleTags = useMemo(() => {
    const tagsSet = new Set<string>();
    vehicles.forEach((v) => {
      if (v.tags) v.tags.forEach((t) => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [vehicles]);

  const handleAddTagToVehicleForm = () => {
    if (!newVehicleTagInput.trim()) return;
    const cleanTag = newVehicleTagInput.trim().toLowerCase();
    if (!vehicleTags.includes(cleanTag)) {
      setVehicleTags((prev) => [...prev, cleanTag]);
    }
    setNewVehicleTagInput("");
  };

  const handleRemoveTagFromVehicleForm = (tagToRemove: string) => {
    setVehicleTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  function resetStaffForm() {
    setStaffFormName("");
    setStaffFormEmail("");
    setStaffFormPhone("");
    setStaffFormPassword("");
    setStaffFormRole("vendedor");
    setStaffFormVendorCategories(["novo"]);
    setStaffFormShowPassword(false);
    setStaffSaveError("");
    setStaffEditing(null);
  }

  function openCreateStaffModal() {
    resetStaffForm();
    setStaffModalOpen(true);
  }

  function openEditStaffModal(member: StaffUser) {
    setStaffEditing(member);
    setStaffFormName(member.name);
    setStaffFormEmail(member.email);
    setStaffFormPhone(member.phone ? formatPhoneBr(member.phone) : "");
    setStaffFormPassword("");
    setStaffFormRole(
      member.role === "cliente" ||
        member.role === "recepcao" ||
        member.role === "vendedor"
        ? member.role
        : "vendedor",
    );
    setStaffFormVendorCategories(
      member.vendor_categories && member.vendor_categories.length > 0
        ? member.vendor_categories
        : ["novo"],
    );
    setStaffFormShowPassword(false);
    setStaffSaveError("");
    setStaffModalOpen(true);
  }

  function closeStaffModal() {
    setStaffModalOpen(false);
    resetStaffForm();
  }

  async function handleSaveStaff() {
    if (!staffFormName.trim()) {
      setStaffSaveError("Informe o nome.");
      return;
    }
    if (!staffFormEmail.trim()) {
      setStaffSaveError("Informe o e-mail.");
      return;
    }
    if (
      staffFormRole === "vendedor" &&
      staffFormVendorCategories.length === 0
    ) {
      setStaffSaveError("Selecione ao menos uma categoria do vendedor.");
      return;
    }
    if (!staffEditing && !isLocallyReasonablePassword(staffFormPassword)) {
      setStaffSaveError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }
    if (
      staffEditing &&
      staffFormPassword &&
      !isLocallyReasonablePassword(staffFormPassword)
    ) {
      setStaffSaveError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) {
      setStaffSaveError("Sessão expirada.");
      return;
    }

    setStaffSaving(true);
    setStaffSaveError("");
    try {
      if (staffEditing) {
        const updated = await updateStaffUser(
          session.accessToken,
          staffEditing.id,
          {
            name: staffFormName.trim(),
            email: staffFormEmail.trim(),
            role: staffFormRole,
            phone: staffFormPhone.replace(/\D/g, "") || null,
            ...(staffFormRole === "vendedor" &&
            staffFormVendorCategories.length > 0
              ? { vendor_categories: staffFormVendorCategories }
              : {}),
            ...(staffFormPassword ? { password: staffFormPassword } : {}),
          },
        );
        setStaffList((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const roleForCreate = staffFormRole;
        if (roleForCreate === "cliente") {
          setStaffSaveError("Crie acesso de cliente pela aba Acesso.");
          return;
        }

        const created = await createStaffUser(session.accessToken, {
          name: staffFormName.trim(),
          email: staffFormEmail.trim(),
          password: staffFormPassword,
          role: roleForCreate,
          client_id: resolvedId,
          phone: staffFormPhone.replace(/\D/g, "") || undefined,
          vendor_categories:
            roleForCreate === "vendedor" && staffFormVendorCategories.length > 0
              ? staffFormVendorCategories
              : undefined,
        });
        setStaffList((prev) => [created, ...prev]);
      }
      closeStaffModal();
    } catch (err) {
      setStaffSaveError(
        getErrorMessage(
          err,
          staffEditing ? "Erro ao atualizar usuário." : "Erro ao criar membro.",
        ),
      );
    } finally {
      setStaffSaving(false);
    }
  }

  async function handleToggleStaff(userId: string, current: boolean) {
    const session = readStoredSession();
    if (!session?.accessToken) return;
    setStaffToggling(userId);
    try {
      const updated = await toggleUserActive(
        session.accessToken,
        userId,
        !current,
      );
      setStaffList((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setStaffError(
        getErrorMessage(err, "Não foi possível alterar o status do usuário."),
      );
    } finally {
      setStaffToggling(null);
    }
  }

  function handleCopyRatingLink(member: StaffUser) {
    if (!member.rating_token) {
      pushToast({
        message: "Link de avaliação indisponível para este usuário.",
        type: "error",
      });
      return;
    }
    const origin = resolvePublicWebOrigin();
    if (!origin) {
      pushToast({
        message: "Não foi possível montar o link de avaliação.",
        type: "error",
      });
      return;
    }
    const url = `${origin}/avaliacao/${member.rating_token}`;
    void navigator.clipboard?.writeText(url).then(() => {
      pushToast({ message: "Link de avaliação copiado!", type: "success" });
    });
  }

  async function performDeleteStaff(member: StaffUser) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setStaffDeleting(member.id);
    setStaffError("");
    try {
      await deleteStaffUser(session.accessToken, member.id);
      setStaffList((prev) => prev.filter((item) => item.id !== member.id));
      if (principalAccess?.id === member.id) {
        setPrincipalAccess(null);
      }
    } catch (err) {
      setStaffError(
        getErrorMessage(err, "Não foi possível excluir o usuário."),
      );
    } finally {
      setStaffDeleting(null);
    }
  }

  function handleDeleteStaff(member: StaffUser) {
    setDeleteAction({ kind: "staff", member });
  }

  if (clientLoading && isUuid(resolvedId)) {
    return (
      <div
        className={clsx(
          "py-20 text-center text-gray-400",
          isDarkMode && "bg-black text-zinc-500",
        )}
      >
        Carregando cliente...
      </div>
    );
  }

  if (!client) {
    return (
      <div
        className={clsx(
          "py-20 text-center text-gray-400",
          isDarkMode && "bg-black text-zinc-500",
        )}
      >
        {clientFetchError || "Cliente não encontrado."}
      </div>
    );
  }

  const clientLeads = filteredClientLeads;
  const leadsTotalPages = Math.max(
    1,
    Math.ceil(clientLeads.length / LEADS_PAGE_SIZE),
  );
  const leadsSafePage = Math.min(leadsPage, leadsTotalPages);
  const leadsPageStart = (leadsSafePage - 1) * LEADS_PAGE_SIZE;
  const pagedClientLeads = clientLeads.slice(
    leadsPageStart,
    leadsPageStart + LEADS_PAGE_SIZE,
  );
  const leadsTabLoading = isUuid(resolvedId) && detailLeads === null;
  const convosTabLoading = isUuid(resolvedId) && detailConversations === null;
  const clientConvos = isUuid(resolvedId) ? (detailConversations ?? []) : [];
  const allVisibleLeadsSelected =
    clientLeads.length > 0 &&
    clientLeads.every((lead) => selectedLeadIds.includes(lead.id));

  const remainingDailyBudget = metaConnection
    ? Math.max(
        metaConnection.sync_summary.daily_budget -
          metaConnection.sync_summary.spend_today,
        0,
      )
    : 0;

  function primeDraftState(business: MetaBusinessOption) {
    setDraftBusinessId(business.id);
    setDraftAdAccountIds(business.ad_accounts.map((item) => item.id));
    setDraftPageIds(business.pages.map((item) => item.id));
    setDraftFormIds(business.forms.map((item) => item.id));
    setDraftWhatsappId(business.whatsapp_accounts[0]?.id ?? "");
    setDraftPhoneNumberId(business.whatsapp_accounts[0]?.phone_number_id ?? "");
  }

  async function openMetaManager() {
    const clientId = id ?? "";
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (clientId && isUuid(clientId) && accessToken) {
      if (!gestorMetaConnected) {
        setMetaStatusMessage(
          "Conecte a BM em Configurações antes de selecionar os ativos deste cliente.",
        );
        return;
      }

      if (apiBusinesses.length > 0) {
        const preferredBusinessId =
          metaConnection?.business_id ?? apiBusinesses[0]?.id ?? "";
        const preferredBusiness = apiBusinesses.find(
          (business) => business.id === preferredBusinessId,
        );
        if (preferredBusiness) {
          if (
            metaConnection &&
            metaConnection.business_id === preferredBusiness.id
          ) {
            setDraftBusinessId(preferredBusiness.id);
            setDraftAdAccountIds(
              metaConnection.selected_ad_accounts.map((item) => item.id),
            );
            setDraftPageIds(
              metaConnection.selected_pages.map((item) => item.id),
            );
            setDraftFormIds(
              metaConnection.selected_forms.map((item) => item.id),
            );
            setDraftWhatsappId(metaConnection.selected_whatsapp?.id ?? "");
            setDraftPhoneNumberId(metaConnection.phone_number_id ?? "");
          } else {
            primeDraftState(preferredBusiness);
          }
          setIsMetaModalOpen(true);
          return;
        }
      }

      setMetaStatusMessage(
        "Carregando Business Managers vinculadas em Configurações...",
      );
      void loadBusinessesFromApi(clientId, accessToken);
      return;
    }

    const preferredBusinessId =
      metaConnection?.business_id ?? availableBusinesses[0]?.id ?? "";
    const preferredBusiness = availableBusinesses.find(
      (business) => business.id === preferredBusinessId,
    );

    if (!preferredBusiness) {
      return;
    }

    if (metaConnection && metaConnection.business_id === preferredBusiness.id) {
      setDraftBusinessId(preferredBusiness.id);
      setDraftAdAccountIds(
        metaConnection.selected_ad_accounts.map((item) => item.id),
      );
      setDraftPageIds(metaConnection.selected_pages.map((item) => item.id));
      setDraftFormIds(metaConnection.selected_forms.map((item) => item.id));
      setDraftWhatsappId(metaConnection.selected_whatsapp?.id ?? "");
      setDraftPhoneNumberId(metaConnection.phone_number_id ?? "");
    } else {
      primeDraftState(preferredBusiness);
    }

    setIsMetaModalOpen(true);
  }

  function handleBusinessChange(nextBusinessId: string) {
    const business = availableBusinesses.find(
      (item) => item.id === nextBusinessId,
    );
    if (!business) return;
    primeDraftState(business);
  }

  function toggleSelection(
    currentIds: string[],
    value: string,
    setter: (ids: string[]) => void,
  ) {
    setter(
      currentIds.includes(value)
        ? currentIds.filter((item) => item !== value)
        : [...currentIds, value],
    );
  }

  function handleSelectWhatsapp(whatsappId: string) {
    if (!selectedBusiness) return;

    if (whatsappId === "") {
      setDraftWhatsappId("");
      setDraftPhoneNumberId("");
      return;
    }

    const selectedWhatsapp = selectedBusiness.whatsapp_accounts.find(
      (item) => item.id === whatsappId,
    );
    setDraftWhatsappId(whatsappId);
    setDraftPhoneNumberId(selectedWhatsapp?.phone_number_id ?? "");
  }

  async function handleSaveMetaConnection() {
    if (!selectedBusiness) return;

    const clientId = id ?? "";
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";

    if (clientId && isUuid(clientId) && accessToken) {
      if (!gestorMetaConnected) {
        setMetaStatusMessage(
          "Conecte a BM em Configurações antes de salvar os ativos.",
        );
        return;
      }

      setIsSavingMeta(true);
      try {
        await selectMetaAssets(
          {
            client_id: clientId,
            gestor_token: true,
            business_id: selectedBusiness.id,
            ad_account_ids: draftAdAccountIds,
            page_ids: draftPageIds,
            form_ids: draftFormIds,
            waba_id: draftWhatsappId || undefined,
            phone_number_id: draftPhoneNumberId || undefined,
          },
          accessToken,
        );
        await refreshMetaStatusFromApi(clientId, accessToken);
        setMetaStatusMessage("Business Manager e ativos salvos com sucesso.");
        setIsMetaModalOpen(false);
      } catch {
        setMetaStatusMessage(
          "Falha ao salvar os ativos da Meta para este cliente.",
        );
      } finally {
        setIsSavingMeta(false);
      }
      return;
    }

    setIsSavingMeta(true);
    await sleep(650);

    const selectedAdAccounts = selectedBusiness.ad_accounts.filter((item) =>
      draftAdAccountIds.includes(item.id),
    );
    const selectedPages = selectedBusiness.pages.filter((item) =>
      draftPageIds.includes(item.id),
    );
    const selectedForms = selectedBusiness.forms.filter((item) =>
      draftFormIds.includes(item.id),
    );
    const selectedWhatsapp =
      selectedBusiness.whatsapp_accounts.find(
        (item) => item.id === draftWhatsappId,
      ) ?? null;

    setMetaConnection({
      business_id: selectedBusiness.id,
      business_name: selectedBusiness.name,
      selected_ad_accounts: selectedAdAccounts,
      selected_pages: selectedPages,
      selected_forms: selectedForms,
      selected_whatsapp: selectedWhatsapp,
      phone_number_id:
        selectedWhatsapp?.phone_number_id ?? draftPhoneNumberId ?? null,
      last_sync_at: new Date().toISOString(),
      sync_summary:
        metaConnection?.business_id === selectedBusiness.id
          ? {
              ...metaConnection.sync_summary,
              daily_budget: metaConnection.sync_summary.daily_budget,
            }
          : {
              campaigns: Math.max(selectedAdAccounts.length * 2, 1),
              ad_sets: Math.max(selectedAdAccounts.length * 5, 2),
              ads: Math.max(selectedAdAccounts.length * 9, 4),
              leads_imported: Math.max(selectedForms.length * 36, 12),
              spend_today: Math.max(selectedAdAccounts.length * 420, 180),
              daily_budget: Math.max(selectedAdAccounts.length * 900, 800),
            },
    });

    setIsSavingMeta(false);
    setIsMetaModalOpen(false);
  }

  async function handleSyncMeta() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (clientId && isUuid(clientId) && session?.accessToken) {
      setIsSyncingMeta(true);
      try {
        await syncMetaFull(clientId, session.accessToken);
        await refreshMetaStatusFromApi(clientId, session.accessToken);
        setMetaStatusMessage("Sincronização Meta solicitada com sucesso.");
      } catch {
        setMetaStatusMessage("Falha ao sincronizar Meta neste cliente.");
      } finally {
        setIsSyncingMeta(false);
      }
      return;
    }

    if (!metaConnection) return;

    setIsSyncingMeta(true);
    await sleep(900);

    setMetaConnection((current) => {
      if (!current) return current;

      return {
        ...current,
        last_sync_at: new Date().toISOString(),
        sync_summary: {
          ...current.sync_summary,
          leads_imported: current.sync_summary.leads_imported + 4,
          spend_today: Number(
            (current.sync_summary.spend_today + 90).toFixed(0),
          ),
        },
      };
    });

    setIsSyncingMeta(false);
  }

  async function handleImportMetaLeads() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (clientId && isUuid(clientId) && session?.accessToken) {
      setIsImportingMetaLeads(true);
      setLeadsActionMessage("");
      try {
        await importMetaLeads(
          clientId,
          session.accessToken,
          selectedMetaImportFormIds,
        );
        const rows = await listLeads(
          { client_id: clientId },
          session.accessToken,
        );
        setDetailLeads(rows.map(mapApiLeadToLead));
        await refreshMetaStatusFromApi(clientId, session.accessToken);
        setLeadsActionMessage(
          "Importação histórica da Meta concluída com sucesso.",
        );
      } catch (err) {
        setLeadsActionMessage(
          getErrorMessage(
            err,
            "Falha ao importar leads antigos da Meta neste cliente.",
          ),
        );
      } finally {
        setIsImportingMetaLeads(false);
      }
      return;
    }

    setLeadsActionMessage(
      "A importação histórica da Meta só funciona com a API conectada.",
    );
  }

  function openImportMetaLeadsModal() {
    if (!metaConnection || metaConnection.selected_forms.length === 0) {
      setLeadsActionMessage(
        "Selecione ao menos um formulário vinculado antes de importar.",
      );
      return;
    }

    setSelectedMetaImportFormIds([]);
    setMetaImportPage(1);
    setLeadsActionMessage("");
    setIsImportMetaModalOpen(true);
  }

  function toggleMetaImportForm(formId: string) {
    setSelectedMetaImportFormIds((current) =>
      current.includes(formId)
        ? current.filter((id) => id !== formId)
        : [...current, formId],
    );
  }

  const metaImportForms = metaConnection?.selected_forms ?? [];
  const metaImportTotalPages = Math.max(
    1,
    Math.ceil(metaImportForms.length / META_IMPORT_PAGE_SIZE),
  );
  const safeMetaImportPage = Math.min(metaImportPage, metaImportTotalPages);
  const metaImportPageItems = metaImportForms.slice(
    (safeMetaImportPage - 1) * META_IMPORT_PAGE_SIZE,
    safeMetaImportPage * META_IMPORT_PAGE_SIZE,
  );

  function openLeadEditor(lead: Lead) {
    setLeadEditing(lead);
    setLeadFormName(lead.name);
    setLeadFormEmail(lead.email);
    setLeadFormPhone(lead.phone);
    setLeadFormSource(lead.source);
    setLeadFormStatus(lead.confirmation_status);
    setLeadFormNotes(lead.notes);
    setLeadFormBirthDate(lead.birth_date?.slice(0, 10) ?? "");
    setLeadsActionMessage("");
  }

  function openLeadProfile(lead: Lead) {
    setLeadProfileOpen(lead);
  }

  function closeLeadProfile() {
    setLeadProfileOpen(null);
  }

  function closeLeadEditor() {
    setLeadEditing(null);
    setLeadFormName("");
    setLeadFormEmail("");
    setLeadFormPhone("");
    setLeadFormSource("manual");
    setLeadFormStatus("pending");
    setLeadFormNotes("");
    setLeadFormBirthDate("");
  }

  async function handleSaveLead() {
    if (!leadEditing) return;
    if (!leadFormName.trim()) {
      setLeadsActionMessage("Informe o nome do lead.");
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) {
      setLeadsActionMessage("Sessão expirada.");
      return;
    }

    setLeadSaving(true);
    setLeadsActionMessage("");
    try {
      const updated = await updateLead(
        leadEditing.id,
        {
          name: leadFormName.trim(),
          email: leadFormEmail.trim() || null,
          phone: leadFormPhone.trim() || null,
          source: leadFormSource,
          confirmation_status: leadFormStatus,
          notes: leadFormNotes.trim() || null,
          birth_date: leadFormBirthDate || null,
        },
        session.accessToken,
      );
      const mapped = mapApiLeadToLead(updated);
      setDetailLeads((current) =>
        current
          ? current.map((lead) => (lead.id === mapped.id ? mapped : lead))
          : current,
      );
      closeLeadEditor();
      setLeadsActionMessage("Lead atualizado com sucesso.");
    } catch (err) {
      setLeadsActionMessage(
        getErrorMessage(err, "Não foi possível atualizar o lead."),
      );
    } finally {
      setLeadSaving(false);
    }
  }

  async function performDeleteLead(leadId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setLeadsActionMessage("Sessão expirada.");
      return;
    }

    setLeadDeleting(leadId);
    setLeadsActionMessage("");
    try {
      await deleteLead(leadId, session.accessToken);
      setDetailLeads((current) =>
        current ? current.filter((lead) => lead.id !== leadId) : current,
      );
      setSelectedLeadIds((current) => current.filter((id) => id !== leadId));
      setLeadsActionMessage("Lead excluído.");
    } catch (err) {
      setLeadsActionMessage(
        getErrorMessage(err, "Não foi possível excluir o lead."),
      );
    } finally {
      setLeadDeleting(null);
    }
  }

  function handleDeleteLead(leadId: string) {
    const lead =
      clientLeads.find((item) => item.id === leadId) ??
      detailLeads?.find((item) => item.id === leadId);
    setDeleteAction({
      kind: "lead",
      leadId,
      leadName: lead?.name ?? "este lead",
    });
  }

  async function performDeleteSelectedLeads(leadIds: string[]) {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setLeadsActionMessage("Sessão expirada.");
      return;
    }

    setLeadsBulkDeleting(true);
    setLeadsActionMessage("");
    try {
      await Promise.all(
        leadIds.map((leadId) => deleteLead(leadId, session.accessToken)),
      );
      setDetailLeads((current) =>
        current
          ? current.filter((lead) => !leadIds.includes(lead.id))
          : current,
      );
      setSelectedLeadIds([]);
      setLeadsActionMessage("Leads selecionados excluídos.");
    } catch (err) {
      setLeadsActionMessage(
        getErrorMessage(err, "Não foi possível excluir todos os leads."),
      );
    } finally {
      setLeadsBulkDeleting(false);
    }
  }

  function handleDeleteSelectedLeads() {
    if (selectedLeadIds.length === 0) return;
    setDeleteAction({ kind: "bulk-leads", leadIds: [...selectedLeadIds] });
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  }

  function toggleAllVisibleLeads() {
    const visibleIds = filteredClientLeads.map((lead) => lead.id);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((leadId) => selectedLeadIds.includes(leadId));

    if (allVisibleSelected) {
      setSelectedLeadIds((current) =>
        current.filter((leadId) => !visibleIds.includes(leadId)),
      );
      return;
    }

    setSelectedLeadIds((current) =>
      Array.from(new Set([...current, ...visibleIds])),
    );
  }

  function openLeadChat(lead: Lead) {
    navigate(`/gestor/chat?client_id=${lead.client_id}&lead_id=${lead.id}`);
  }

  async function handleDisconnectMeta() {
    const clientId = id ?? "";
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (clientId && isUuid(clientId) && accessToken) {
      setIsDisconnectingMeta(true);
      try {
        const response = await disconnectMeta(clientId, accessToken);
        if (response.disconnected) {
          setMetaConnection(null);
          setApiBusinesses([]);
          setMetaStatusMessage("Conexão Meta removida deste cliente.");
        } else {
          setMetaStatusMessage(
            response.message ?? "Nenhuma conexão ativa para desconectar.",
          );
        }
      } catch {
        setMetaStatusMessage(
          "Falha ao desconectar a integração Meta deste cliente.",
        );
      } finally {
        setIsDisconnectingMeta(false);
      }
      return;
    }

    setMetaConnection(null);
  }

  async function handleCreatePrincipalAccess() {
    if (!isUuid(resolvedId)) {
      setAccessError("Cliente inválido para vincular o acesso.");
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) {
      setAccessError("Faça login novamente para criar o acesso.");
      return;
    }

    if (!accessName.trim() || !accessEmail.trim() || !accessPassword.trim()) {
      setAccessError(
        "Preencha nome, e-mail e senha para criar o acesso principal.",
      );
      return;
    }

    if (!isLocallyReasonablePassword(accessPassword.trim())) {
      setAccessError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }

    if (principalAccess) {
      setAccessError("Já existe um acesso principal vinculado a este cliente.");
      return;
    }

    setAccessLoading(true);
    setAccessError("");
    setAccessSuccess("");
    try {
      await createPrincipalClientAccess(session.accessToken, {
        name: accessName.trim(),
        email: accessEmail.trim(),
        password: accessPassword.trim(),
        client_id: resolvedId,
      });
      setAccessSuccess(
        "Acesso principal criado e vinculado ao cliente com sucesso.",
      );
      setPrincipalAccess({
        id: "novo",
        name: accessName.trim(),
        email: accessEmail.trim(),
      });
      setAccessPassword("");
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o acesso principal.",
      );
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleToggleClientStatus(nextActive: boolean) {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setStatusLoading(true);
    try {
      const row = await updateClient(resolvedId, session.accessToken, {
        is_active: nextActive,
      });
      setApiClient(mapApiClientToClient(row));
    } finally {
      setStatusLoading(false);
    }
  }

  async function performDeleteClient() {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setDeleteLoading(true);
    try {
      await deleteClient(resolvedId, session.accessToken);
      navigate("/gestor/clientes");
    } finally {
      setDeleteLoading(false);
    }
  }

  function handleDeleteClient() {
    setDeleteAction({ kind: "client" });
  }

  async function confirmDeleteAction() {
    if (!deleteAction) return;
    setDeleteActionLoading(true);
    try {
      if (deleteAction.kind === "client") {
        await performDeleteClient();
      } else if (deleteAction.kind === "staff") {
        await performDeleteStaff(deleteAction.member);
      } else if (deleteAction.kind === "lead") {
        await performDeleteLead(deleteAction.leadId);
      } else if (deleteAction.kind === "bulk-leads") {
        await performDeleteSelectedLeads(deleteAction.leadIds);
      }
    } finally {
      setDeleteActionLoading(false);
      setDeleteAction(null);
    }
  }

  return (
    <div
      className={clsx(
        "cliente-detail-page",
        isDarkMode && "dashboard-dark cliente-detail-dark bg-black",
      )}
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {client.company_name}
          </h1>
          <p className="text-sm text-gray-500">{client.cnpj}</p>
          <div className="mt-1.5">
            <CopyableId value={client.id} label="client_id" />
          </div>
          {defaultPipelineCode && (
            <div className="mt-1.5">
              <CopyableId value={defaultPipelineCode} label="pipeline_code" />
            </div>
          )}
        </div>
        <div className="ml-2">
          <PlanBadge plan={client.plan} />
        </div>
        <Badge variant={client.status === "active" ? "green" : "gray"} dot>
          {client.status === "active" ? "Ativo" : "Inativo"}
        </Badge>
        <div
          className={clsx(
            "ml-auto inline-flex flex-none items-center gap-2 rounded-full border px-3 py-2",
            isDarkMode
              ? "border-zinc-700 bg-[#101114]"
              : "border-zinc-200 bg-white/90",
          )}
        >
          <span
            className={clsx(
              "text-[11px] font-semibold uppercase tracking-[0.12em]",
              isDarkMode ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Status
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={client.status === "active"}
            disabled={statusLoading}
            onClick={() =>
              void handleToggleClientStatus(client.status !== "active")
            }
            className={clsx(
              "relative h-7 w-[54px] flex-none rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/50",
              client.status === "active"
                ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]"
                : isDarkMode
                  ? "bg-zinc-700"
                  : "bg-zinc-300",
              statusLoading && "opacity-60",
            )}
            title={
              client.status === "active"
                ? "Desativar cliente"
                : "Ativar cliente"
            }
            aria-label={
              client.status === "active"
                ? "Desativar cliente"
                : "Ativar cliente"
            }
          >
            <span
              className={clsx(
                "absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-[#f8fafc] shadow-[0_2px_7px_rgba(15,23,42,0.35)] ring-1 ring-black/5 transition-transform",
                client.status === "active"
                  ? "translate-x-[26px]"
                  : "translate-x-0",
              )}
            />
          </button>
          <span
            className={clsx(
              "min-w-[38px] text-xs font-semibold",
              client.status === "active"
                ? "text-emerald-500"
                : isDarkMode
                  ? "text-zinc-400"
                  : "text-zinc-500",
            )}
          >
            {statusLoading
              ? "Atualizando..."
              : client.status === "active"
                ? "Ativo"
                : "Inativo"}
          </span>
        </div>
        <Button
          variant="destructive"
          icon={<Trash2 size={14} />}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold shadow-[0_10px_22px_rgba(229,24,56,0.28)]",
            isDarkMode ? "bg-[#E51838] text-white hover:bg-[#c01530]" : "",
          )}
          onClick={() => void handleDeleteClient()}
          loading={deleteLoading}
        >
          Excluir cliente
        </Button>
      </div>

      <ConfirmationModal
        open={Boolean(deleteAction)}
        onClose={() => setDeleteAction(null)}
        onConfirm={() => void confirmDeleteAction()}
        loading={
          deleteActionLoading ||
          deleteLoading ||
          staffDeleting !== null ||
          leadDeleting !== null ||
          leadsBulkDeleting
        }
        title={
          deleteAction?.kind === "client"
            ? "Excluir cliente"
            : deleteAction?.kind === "staff"
              ? "Excluir usuário"
              : deleteAction?.kind === "lead"
                ? "Excluir lead"
                : "Excluir leads selecionados"
        }
        description={
          deleteAction?.kind === "client" ? (
            <p className="text-sm text-zinc-600">
              Tem certeza que deseja excluir este cliente? Todos os dados
              vinculados serão removidos permanentemente.
            </p>
          ) : deleteAction?.kind === "staff" ? (
            <p className="text-sm text-zinc-600">
              Excluir o usuário{" "}
              <span className="font-semibold text-zinc-900">
                {deleteAction.member.name}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
          ) : deleteAction?.kind === "lead" ? (
            <p className="text-sm text-zinc-600">
              Excluir o lead{" "}
              <span className="font-semibold text-zinc-900">
                {deleteAction.leadName}
              </span>
              ? Essa ação remove o lead da lista.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">
              Excluir {deleteAction?.leadIds.length ?? 0} lead(s)
              selecionado(s)?
            </p>
          )
        }
        confirmLabel={
          deleteAction?.kind === "client"
            ? "Excluir cliente"
            : deleteAction?.kind === "staff"
              ? "Excluir usuário"
              : deleteAction?.kind === "lead"
                ? "Excluir lead"
                : "Excluir selecionados"
        }
      />

      <Tabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        className={clsx("mb-6", isDarkMode && "border-zinc-800")}
      />

      {activeTab === "perfil" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Informações da Empresa
          </h3>
          <div className="flex gap-6">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
              {client.logo_url ? (
                <img
                  src={client.logo_url}
                  alt={`Logo ${client.company_name}`}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <Building2 size={36} className="text-blue-400" />
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-gray-400">Razão Social</p>
                <p className="font-medium text-gray-900">
                  {client.company_name}
                </p>
              </div>
              <div>
                <p className="text-gray-400">CNPJ</p>
                <p className="font-mono font-medium text-gray-900">
                  {client.cnpj}
                </p>
              </div>
              <div>
                <p className="text-gray-400">E-mail de Contato</p>
                <p className="font-medium text-gray-900">
                  {client.contact_email || "—"}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Telefone</p>
                <p className="font-medium text-gray-900">
                  {client.phone_number || "—"}
                </p>
              </div>
              <div>
                <p className="text-gray-400">WhatsApp</p>
                <p className="font-medium text-gray-900">
                  {client.whatsapp_number || "—"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400">Endereço</p>
                <p className="font-medium text-gray-900">
                  {client.address || "—"}
                </p>
              </div>
              {client.webhook_url_n8n ? (
                <div className="col-span-2">
                  <p className="text-gray-400">Webhook n8n</p>
                  <p className="break-all font-mono text-xs font-medium text-gray-900">
                    {client.webhook_url_n8n}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {/* ── Aba Equipe ──────────────────────────────────────────────────── */}
      {activeTab === "equipe" && (
        <Card>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Equipe</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Vendedores e recepcionistas vinculados a {client.company_name}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateStaffModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#E51838] px-3 py-2 text-xs font-semibold text-white hover:bg-[#c01530] transition-colors"
            >
              <Plus size={14} /> Adicionar membro
            </button>
          </div>

          {staffError && (
            <Notice tone="error" className="mb-4 text-xs">
              {staffError}
            </Notice>
          )}

          {staffLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Carregando equipe...
            </p>
          ) : staffList.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">
                Nenhum membro cadastrado ainda.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Adicione vendedores e recepcionistas para esta empresa.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">WhatsApp</th>
                    <th className="px-4 py-3">Função</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {staffList.map((member) => (
                    <tr
                      key={member.id}
                      className="hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                            {member.name
                              .split(" ")
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">
                            {member.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {member.email}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {member.phone ? formatPhoneBr(member.phone) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {member.role === "vendedor" ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              <UserCheck size={11} /> Vendedor
                            </span>
                            {(member.vendor_categories ?? []).map((cat) => (
                              <span
                                key={cat}
                                className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                              >
                                {VENDOR_CATEGORY_OPTIONS.find(
                                  (o) => o.value === cat,
                                )?.label ?? cat}
                              </span>
                            ))}
                          </div>
                        ) : member.role === "recepcao" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                            <UserCheck size={11} /> Recepção
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            <UserCheck size={11} /> Cliente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {member.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{" "}
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />{" "}
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={staffToggling === member.id}
                            onClick={() =>
                              void handleToggleStaff(
                                member.id,
                                member.is_active,
                              )
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              member.is_active
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-green-50 text-green-700 hover:bg-green-100"
                            } disabled:opacity-50`}
                          >
                            {staffToggling === member.id
                              ? "..."
                              : member.is_active
                                ? "Desativar"
                                : "Ativar"}
                          </button>
                          {member.role === "vendedor" && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/gestor/vendedores/${member.id}`)
                                }
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                title="Ver perfil do vendedor"
                              >
                                <BarChart3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyRatingLink(member)}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                title="Copiar link de avaliação"
                              >
                                <Link2 size={14} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditStaffModal(member)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            title="Editar usuário"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={staffDeleting === member.id}
                            onClick={() => void handleDeleteStaff(member)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                            title="Excluir usuário"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal — adicionar membro */}
      <Modal
        open={staffModalOpen}
        title={staffEditing ? "Editar usuário" : "Adicionar membro à equipe"}
        onClose={closeStaffModal}
        dark={isDarkMode}
      >
        <div className="space-y-4 p-1">
          {/* Função */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Função</p>
            <div
              className={`grid gap-2 ${staffEditing ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {(staffEditing
                ? (["cliente", "vendedor", "recepcao"] as const)
                : (["vendedor", "recepcao"] as const)
              ).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setStaffFormRole(r);
                    if (
                      r === "vendedor" &&
                      staffFormVendorCategories.length === 0
                    ) {
                      setStaffFormVendorCategories(["novo"]);
                    }
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all ${
                    staffFormRole === r
                      ? "border-[#E51838] bg-[#E51838]/5 text-[#E51838]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <UserCheck size={14} />
                  {r === "cliente"
                    ? "Cliente"
                    : r === "vendedor"
                      ? "Vendedor"
                      : "Recepção"}
                </button>
              ))}
            </div>
          </div>

          {staffFormRole === "vendedor" && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Categoria do vendedor
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {VENDOR_CATEGORY_OPTIONS.map((option) => {
                  const checked = staffFormVendorCategories.includes(
                    option.value,
                  );
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-3 text-sm transition-all ${
                        checked
                          ? "border-[#E51838] bg-[#E51838]/5 text-[#E51838]"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setStaffFormVendorCategories((prev) =>
                            checked
                              ? prev.filter((c) => c !== option.value)
                              : [...prev, option.value],
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-[#E51838] focus:ring-[#E51838]"
                      />
                      <span className="font-medium">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Selecione uma ou mais categorias. Essa informação é usada
                somente para vendedores.
              </p>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              type="text"
              value={staffFormName}
              onChange={(e) => setStaffFormName(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]"
            />
          </div>

          {/* E-mail */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              type="email"
              value={staffFormEmail}
              onChange={(e) => setStaffFormEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]"
            />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              WhatsApp
            </label>
            <input
              type="text"
              value={staffFormPhone}
              onChange={(e) => setStaffFormPhone(formatPhoneBr(e.target.value))}
              placeholder="(11) 99999-9999"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Senha provisória
            </label>
            {staffEditing && (
              <p className="mb-1 text-xs text-gray-400">
                Deixe em branco para manter a senha atual.
              </p>
            )}
            <div className="relative">
              <input
                type={staffFormShowPassword ? "text" : "password"}
                value={staffFormPassword}
                onChange={(e) => setStaffFormPassword(e.target.value)}
                placeholder="Minimo 10 caracteres: Maiuscula + minuscula + numero"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]"
              />
              <button
                type="button"
                onClick={() => setStaffFormShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {staffFormShowPassword ? (
                  <EyeOff size={14} />
                ) : (
                  <Eye size={14} />
                )}
              </button>
            </div>
          </div>

          {/* Empresa (readonly) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Empresa
            </label>
            <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
              {client.company_name}
            </p>
          </div>

          {staffSaveError && (
            <Notice tone="error" className="text-xs">
              {staffSaveError}
            </Notice>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeStaffModal}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={staffSaving}
              onClick={() => void handleSaveStaff()}
              className="rounded-lg bg-[#E51838] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c01530] disabled:opacity-60"
            >
              {staffSaving
                ? staffEditing
                  ? "Salvando..."
                  : "Criando..."
                : staffEditing
                  ? "Salvar alterações"
                  : "Criar membro"}
            </button>
          </div>
        </div>
      </Modal>

      {activeTab === "acesso" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Acesso principal do cliente
          </h3>
          <div className="max-w-sm space-y-4">
            <div>
              <p className="mb-1 text-sm text-gray-500">Nome</p>
              <input
                value={accessName}
                onChange={(event) => setAccessName(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">E-mail</p>
              <input
                type="email"
                value={accessEmail}
                onChange={(event) => setAccessEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">Senha</p>
              <input
                type="password"
                value={accessPassword}
                onChange={(event) => setAccessPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">Cliente vinculado</p>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
                {client.company_name}
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">
                Acesso principal atual
              </p>
              {principalLoading ? (
                <p className="text-sm text-gray-400">Verificando...</p>
              ) : principalAccess ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {principalAccess.name} ({principalAccess.email})
                </p>
              ) : (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Nenhum acesso principal cadastrado.
                </p>
              )}
            </div>
            {accessError ? <Notice tone="error">{accessError}</Notice> : null}
            {accessSuccess ? (
              <Notice tone="success">{accessSuccess}</Notice>
            ) : null}
            <Button
              size="sm"
              onClick={() => void handleCreatePrincipalAccess()}
              loading={accessLoading}
              isDisabled={Boolean(principalAccess)}
            >
              Criar acesso principal
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "ads" && (
        <div className="space-y-6">
          <Card
            className={clsx(
              "overflow-hidden border",
              isDarkMode
                ? "border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(61,86,162,0.12),transparent_42%),linear-gradient(145deg,#0a0a0d,#111217)] shadow-[0_25px_60px_rgba(0,0,0,0.5)]"
                : "border-[#f0e4d4] bg-[linear-gradient(135deg,rgba(255,249,240,0.98),rgba(255,255,255,0.96))]",
            )}
          >
            <div className="space-y-6">
              <div
                className={clsx(
                  "rounded-[28px] border p-5",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11]"
                    : "border-[#f1e6d8] bg-white/70",
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <Badge variant="orange">Fluxo gerenciado pelo gestor</Badge>
                    <div>
                      <h3
                        className={clsx(
                          "text-xl font-black tracking-tight",
                          isDarkMode ? "text-zinc-100" : "text-zinc-950",
                        )}
                      >
                        Integração Meta Ads e Business Manager
                      </h3>
                      <p
                        className={clsx(
                          "mt-2 max-w-2xl text-sm leading-6",
                          isDarkMode ? "text-zinc-400" : "text-zinc-600",
                        )}
                      >
                        A conexão desta empresa acontece aqui no painel do
                        gestor. É daqui que você escolhe a BM, define contas de
                        anúncio, páginas, formulários e o WhatsApp que esse
                        cliente pode usar.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      icon={<Building2 size={16} />}
                      onClick={() => void openMetaManager()}
                      isDisabled={
                        !isApiClient && availableBusinesses.length === 0
                      }
                    >
                      {metaConnection ? "Trocar BM" : "Selecionar BM"}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<RefreshCcw size={16} />}
                      onClick={() => void handleSyncMeta()}
                      loading={isSyncingMeta}
                      isDisabled={!metaConnection}
                    >
                      Sincronizar agora
                    </Button>
                  </div>
                </div>

                {(metaStatusLoading || metaStatusMessage) && (
                  <div
                    className={clsx(
                      "mt-4 rounded-2xl border px-4 py-3 text-sm",
                      isDarkMode
                        ? "border-zinc-700 bg-[#121318] text-zinc-300"
                        : "border-[#eadfcb] bg-white/80 text-zinc-600",
                    )}
                  >
                    {metaStatusLoading
                      ? "Carregando status da integração Meta..."
                      : metaStatusMessage}
                  </div>
                )}

                <div
                  className={clsx(
                    "mt-4 rounded-[24px] border p-4",
                    metaConnection
                      ? isDarkMode
                        ? "border-emerald-500/35 bg-emerald-500/10"
                        : "border-green-200 bg-green-50/90"
                      : isDarkMode
                        ? "border-dashed border-zinc-700 bg-[#101114]"
                        : "border-dashed border-zinc-300 bg-white/70",
                  )}
                >
                  {metaConnection ? (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={clsx(
                            "mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm",
                            isDarkMode
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-white text-green-600",
                          )}
                        >
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p
                            className={clsx(
                              "text-sm font-semibold",
                              isDarkMode
                                ? "text-emerald-300"
                                : "text-green-800",
                            )}
                          >
                            BM conectada e sincronização pronta para este
                            cliente
                          </p>
                          <p
                            className={clsx(
                              "mt-1 text-sm",
                              isDarkMode
                                ? "text-emerald-200/85"
                                : "text-green-700",
                            )}
                          >
                            {metaConnection.business_name} conectada em{" "}
                            {formatDateTime(metaConnection.last_sync_at)}.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="green">Conectado</Badge>
                        <Badge variant="blue">
                          {metaConnection.selected_ad_accounts.length} contas
                        </Badge>
                        <Badge variant="purple">
                          {metaConnection.selected_forms.length} formulários
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={clsx(
                            "mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm",
                            isDarkMode
                              ? "bg-[#1a1b1f] text-zinc-400"
                              : "bg-white text-zinc-400",
                          )}
                        >
                          <CircleDashed size={20} />
                        </div>
                        <div>
                          <p
                            className={clsx(
                              "text-sm font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-900",
                            )}
                          >
                            Nenhuma Business Manager vinculada ainda
                          </p>
                          <p
                            className={clsx(
                              "mt-1 text-sm",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500",
                            )}
                          >
                            Selecione a BM deste cliente para começar a puxar
                            campanhas, anúncios, custos, formulários, leads e
                            ativos de WhatsApp.
                          </p>
                        </div>
                      </div>
                      <Button
                        icon={<Link2 size={16} />}
                        onClick={() => void openMetaManager()}
                        isDisabled={
                          !isApiClient && availableBusinesses.length === 0
                        }
                      >
                        Selecionar BM
                      </Button>
                    </div>
                  )}
                </div>

                {metaConnection && (
                  <>
                    <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                      <MetaStatCard
                        label="Campanhas"
                        value={String(metaConnection.sync_summary.campaigns)}
                        helper={`${metaConnection.sync_summary.ad_sets} conjuntos sincronizados`}
                        icon={<Layers3 size={18} />}
                        dark={isDarkMode}
                      />
                      <MetaStatCard
                        label="Leads puxados"
                        value={String(
                          metaConnection.sync_summary.leads_imported,
                        )}
                        helper={`${metaConnection.selected_forms.length} formulários ativos`}
                        icon={<Database size={18} />}
                        dark={isDarkMode}
                      />
                      <MetaStatCard
                        label="Investimento hoje"
                        value={formatCurrency(
                          metaConnection.sync_summary.spend_today,
                        )}
                        helper={`Orçamento diário ${formatCurrency(metaConnection.sync_summary.daily_budget)}`}
                        icon={<Facebook size={18} />}
                        dark={isDarkMode}
                      />
                      <MetaStatCard
                        label="Saldo do dia"
                        value={formatCurrency(remainingDailyBudget)}
                        helper={`${metaConnection.sync_summary.ads} anúncios monitorados`}
                        icon={<RefreshCcw size={18} />}
                        dark={isDarkMode}
                      />
                    </div>

                    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                      <div
                        className={clsx(
                          "rounded-[28px] border p-5",
                          isDarkMode
                            ? "border-zinc-800 bg-[#101116]"
                            : "border-[#eadfce] bg-white/90",
                        )}
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                              Ativos vinculados
                            </p>
                            <h4 className="mt-1 text-lg font-bold text-zinc-950">
                              {metaConnection.business_name}
                            </h4>
                          </div>
                          <Badge variant="green">BM selecionada</Badge>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                              Contas de anúncio
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {metaConnection.selected_ad_accounts.map(
                                (account) => (
                                  <AssetChip key={account.id} dark={isDarkMode}>
                                    {account.name}
                                  </AssetChip>
                                ),
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                              Páginas conectadas
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {metaConnection.selected_pages.map((page) => (
                                <AssetChip key={page.id} dark={isDarkMode}>
                                  {page.name}
                                </AssetChip>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                              Formulários importados
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {metaConnection.selected_forms.map((form) => (
                                <AssetChip key={form.id} dark={isDarkMode}>
                                  {form.name}
                                </AssetChip>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className={clsx(
                          "rounded-[28px] border p-5",
                          isDarkMode
                            ? "border-zinc-800 bg-[#111217]"
                            : "border-[#eadfce] bg-[#fffaf2]",
                        )}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Identificadores e conexão
                        </p>

                        <div className="mt-4 space-y-4">
                          <div
                            className={clsx(
                              "rounded-2xl border p-4",
                              isDarkMode
                                ? "border-zinc-700 bg-[#0d0f14]"
                                : "border-white/80 bg-white/90",
                            )}
                          >
                            <div
                              className={clsx(
                                "mb-2 flex items-center gap-2",
                                isDarkMode ? "text-zinc-300" : "text-zinc-800",
                              )}
                            >
                              <Building2 size={16} />
                              <span className="text-sm font-semibold">
                                Business Manager
                              </span>
                            </div>
                            <p
                              className={clsx(
                                "text-sm font-medium",
                                isDarkMode ? "text-zinc-100" : "text-zinc-900",
                              )}
                            >
                              {metaConnection.business_name}
                            </p>
                            <p className="mt-1 font-mono text-xs text-zinc-500">
                              {metaConnection.business_id}
                            </p>
                          </div>

                          <div
                            className={clsx(
                              "rounded-2xl border p-4",
                              isDarkMode
                                ? "border-zinc-700 bg-[#0d0f14]"
                                : "border-white/80 bg-white/90",
                            )}
                          >
                            <div
                              className={clsx(
                                "mb-2 flex items-center gap-2",
                                isDarkMode ? "text-zinc-300" : "text-zinc-800",
                              )}
                            >
                              <Globe size={16} />
                              <span className="text-sm font-semibold">
                                Página principal
                              </span>
                            </div>
                            <p
                              className={clsx(
                                "text-sm font-medium",
                                isDarkMode ? "text-zinc-100" : "text-zinc-900",
                              )}
                            >
                              {metaConnection.selected_pages[0]?.name ?? "—"}
                            </p>
                            <p className="mt-1 font-mono text-xs text-zinc-500">
                              {metaConnection.selected_pages[0]?.id ?? "—"}
                            </p>
                          </div>

                          <div
                            className={clsx(
                              "rounded-2xl border p-4",
                              isDarkMode
                                ? "border-zinc-700 bg-[#0d0f14]"
                                : "border-white/80 bg-white/90",
                            )}
                          >
                            <div
                              className={clsx(
                                "mb-2 flex items-center gap-2",
                                isDarkMode ? "text-zinc-300" : "text-zinc-800",
                              )}
                            >
                              <Phone size={16} />
                              <span className="text-sm font-semibold">
                                WhatsApp vinculado
                              </span>
                            </div>
                            <p
                              className={clsx(
                                "text-sm font-medium",
                                isDarkMode ? "text-zinc-100" : "text-zinc-900",
                              )}
                            >
                              {metaConnection.selected_whatsapp?.name ??
                                "Não selecionado"}
                            </p>
                            <p className="mt-1 font-mono text-xs text-zinc-500">
                              {metaConnection.selected_whatsapp
                                ?.display_phone_number ?? "—"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            icon={<Building2 size={16} />}
                            onClick={() => void openMetaManager()}
                          >
                            Ajustar ativos
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void handleDisconnectMeta()}
                            loading={isDisconnectingMeta}
                          >
                            Desconectar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "rubinho" && (
        <Card>
          <h3 className="mb-2 text-base font-semibold text-gray-900">
            Módulo Rubinho
          </h3>
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <Settings size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">Módulo em configuração</p>
            <p className="mt-1 text-xs text-gray-300">Em breve disponível</p>
          </div>
        </Card>
      )}

      {activeTab === "whatsapp" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Conexões WhatsApp
          </h3>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
              <div>
                <p className="text-xs text-gray-400">WhatsApp Business</p>
                <p className="font-medium text-gray-900">
                  {client.whatsapp_number || "—"}
                </p>
              </div>
              <Badge variant={client.whatsapp_number ? "green" : "gray"} dot>
                {client.whatsapp_number ? "Conectado" : "Não configurado"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
              <div>
                <p className="text-xs text-gray-400">Número para Ligação</p>
                <p className="font-medium text-gray-900">
                  {client.phone_number || "—"}
                </p>
              </div>
              <Badge variant={client.phone_number ? "blue" : "gray"} dot>
                {client.phone_number ? "Configurado" : "Não configurado"}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "veiculos" && (
        <Card padding="none">
          <div
            className={clsx(
              "space-y-4 border-b p-4",
              isDarkMode ? "border-zinc-800" : "border-gray-100",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3
                  className={clsx(
                    "text-base font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-gray-900",
                  )}
                >
                  Vitrine de Veículos
                </h3>
                <p
                  className={clsx(
                    "mt-1 text-xs",
                    isDarkMode ? "text-zinc-400" : "text-gray-400",
                  )}
                >
                  {vehiclesLoading
                    ? "Carregando veículos..."
                    : filteredVehicles.length === 1
                      ? "1 veículo encontrado"
                      : `${filteredVehicles.length} veículos encontrados`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    setEditingVehicleId(null);
                    setVehicleBrand("");
                    setVehicleModel("");
                    setVehicleYearOrKm("");
                    setVehiclePrice("");
                    setVehicleStores("");
                    setVehicleStatus(true);
                    setVehicleTags([]);
                    setSelectedBrandCode("");
                    setIsManualInput(false);
                    setVehicleImageUrl("");
                    setVehicleCategory("");
                    setVehicleGallery([]);
                    setUploadError("");
                    setIsVehicleModalOpen(true);
                  }}
                  className="bg-[#E51838] text-white hover:bg-[#c01530] transition-colors"
                  size="sm"
                  icon={<Plus size={14} />}
                >
                  Novo Veículo
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_180px]">
              <label className="relative">
                <Search
                  size={15}
                  className={clsx(
                    "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                />
                <input
                  value={vehiclesSearch}
                  onChange={(e) => setVehiclesSearch(e.target.value)}
                  placeholder="Buscar por marca ou modelo..."
                  className={clsx(
                    "h-10 w-full rounded-xl border pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100 placeholder-zinc-500"
                      : "border-gray-200 bg-white text-gray-700 placeholder-gray-405",
                  )}
                />
              </label>

              <select
                value={vehiclesStatusFilter}
                onChange={(e) => setVehiclesStatusFilter(e.target.value as any)}
                className={clsx(
                  "h-10 rounded-xl border px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-350"
                    : "border-gray-200 bg-white text-gray-600",
                )}
              >
                <option value="all">Todos os Status</option>
                <option value="available">Disponíveis</option>
                <option value="hidden">Ocultos</option>
              </select>

              <select
                value={vehiclesTagFilter}
                onChange={(e) => setVehiclesTagFilter(e.target.value)}
                className={clsx(
                  "h-10 rounded-xl border px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-350"
                    : "border-gray-200 bg-white text-gray-600",
                )}
              >
                <option value="all">Todas as Tags</option>
                {allVehicleTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {vehiclesLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Carregando veículos...
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="py-16 text-center">
              <Car
                size={40}
                className={clsx(
                  "mx-auto mb-3",
                  isDarkMode ? "text-zinc-700" : "text-gray-300",
                )}
              />
              <p
                className={clsx(
                  "text-sm font-medium",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Nenhum veículo encontrado
              </p>
              <p
                className={clsx(
                  "mt-1 text-xs",
                  isDarkMode ? "text-zinc-500" : "text-gray-400",
                )}
              >
                {vehiclesSearch ||
                vehiclesStatusFilter !== "all" ||
                vehiclesTagFilter !== "all"
                  ? "Tente ajustar os seus filtros de busca."
                  : "Cadastre o primeiro veículo para a vitrine deste cliente."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className={clsx(
                      "border-b text-left text-xs font-medium",
                      isDarkMode
                        ? "border-zinc-800 bg-zinc-900/30 text-zinc-400"
                        : "border-gray-100 bg-gray-50 text-gray-500",
                    )}
                  >
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Ano</th>
                    <th className="px-4 py-3">KM</th>
                    <th className="px-4 py-3">Condição</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Lojas</th>
                    <th className="px-4 py-3">Tags</th>
                    <th className="px-4 py-3">Disponível</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody
                  className={clsx(
                    "divide-y",
                    isDarkMode ? "divide-zinc-800" : "divide-gray-50",
                  )}
                >
                  {filteredVehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      className={clsx(
                        "transition-colors",
                        isDarkMode
                          ? "hover:bg-zinc-900/20"
                          : "hover:bg-gray-50/60",
                      )}
                    >
                      <td
                        className={clsx(
                          "px-4 py-3 font-semibold",
                          isDarkMode ? "text-zinc-200" : "text-gray-900",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {vehicle.image_url ? (
                            <img
                              src={vehicle.image_url}
                              alt={`${vehicle.brand} ${vehicle.model}`}
                              className="h-10 w-14 rounded-lg object-cover bg-gray-100 dark:bg-zinc-800 border dark:border-zinc-700 shadow-sm shrink-0"
                            />
                          ) : (
                            <div
                              className={clsx(
                                "flex h-10 w-14 items-center justify-center rounded-lg border shadow-sm shrink-0",
                                isDarkMode
                                  ? "bg-zinc-800 border-zinc-700 text-zinc-400"
                                  : "bg-gray-50 border-gray-100 text-gray-400",
                              )}
                            >
                              <Car size={16} />
                            </div>
                          )}
                          <span>{vehicle.brand}</span>
                        </div>
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 font-medium",
                          isDarkMode ? "text-zinc-300" : "text-gray-700",
                        )}
                      >
                        {vehicle.model}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 font-medium",
                          isDarkMode ? "text-zinc-350" : "text-gray-600",
                        )}
                      >
                        {vehicle.category || (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3",
                          isDarkMode ? "text-zinc-400" : "text-gray-600",
                        )}
                      >
                        {vehicle.manufacturing_year && vehicle.model_year
                          ? `${vehicle.manufacturing_year}/${vehicle.model_year}`
                          : vehicle.model_year ||
                            vehicle.manufacturing_year ||
                            vehicle.year_or_km?.split("-")[0]?.trim() ||
                            "-"}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3",
                          isDarkMode ? "text-zinc-400" : "text-gray-600",
                        )}
                      >
                        {vehicle.condition === "novo"
                          ? "0 km"
                          : vehicle.km
                            ? `${formatKM(vehicle.km)} km`
                            : vehicle.year_or_km?.includes("km")
                              ? vehicle.year_or_km.split("-")[1]?.trim() ||
                                vehicle.year_or_km
                              : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {vehicle.condition === "novo" ? (
                          <Badge variant="green">Novo</Badge>
                        ) : vehicle.condition === "seminovo" ? (
                          <Badge variant="gray">Seminovo</Badge>
                        ) : vehicle.year_or_km
                            ?.toLowerCase()
                            .includes("novo") ? (
                          <Badge variant="green">Novo</Badge>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                            -
                          </span>
                        )}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 font-medium text-emerald-600",
                          isDarkMode && "text-emerald-400",
                        )}
                      >
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(parseFloat(vehicle.price) || 0)}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3",
                          isDarkMode ? "text-zinc-400" : "text-gray-600",
                        )}
                      >
                        {vehicle.stores}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {vehicle.tags &&
                            vehicle.tags.map((tag) => (
                              <span
                                key={tag}
                                className={clsx(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition",
                                  isDarkMode
                                    ? "bg-zinc-850 text-zinc-300"
                                    : "bg-gray-100 text-gray-600",
                                )}
                              >
                                <Tag size={8} />
                                {tag}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleVehicleStatus(vehicle)
                          }
                          className={clsx(
                            "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                            vehicle.status
                              ? "bg-[#E51838]"
                              : isDarkMode
                                ? "bg-zinc-700"
                                : "bg-gray-200",
                          )}
                        >
                          <span
                            className={clsx(
                              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              vehicle.status
                                ? "translate-x-4"
                                : "translate-x-0",
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            title="Editar veículo"
                            onClick={() => openEditVehicleModal(vehicle)}
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              isDarkMode
                                ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-205"
                                : "text-gray-550 hover:bg-gray-100 hover:text-gray-700",
                            )}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="Excluir veículo"
                            onClick={() => setVehicleToDelete(vehicle)}
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              isDarkMode
                                ? "text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                                : "text-gray-555 hover:bg-red-50 hover:text-[#E51838]",
                            )}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === "leads" && (
        <Card padding="none">
          <div className="space-y-4 border-b border-gray-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Leads do Cliente
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  {clientLeads.length === 0
                    ? `0 de ${(detailLeads ?? []).length} leads`
                    : `Mostrando ${leadsPageStart + 1}–${leadsPageStart + pagedClientLeads.length} de ${clientLeads.length} leads`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCcw size={14} />}
                  loading={isSyncingMeta}
                  onClick={() => void handleSyncMeta()}
                >
                  Sincronizar Meta
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Database size={14} />}
                  loading={isImportingMetaLeads}
                  isDisabled={
                    !metaConnection ||
                    (metaConnection.selected_forms?.length ?? 0) === 0
                  }
                  onClick={openImportMetaLeadsModal}
                >
                  Importar leads antigos
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  loading={leadsBulkDeleting}
                  isDisabled={selectedLeadIds.length === 0}
                  onClick={() => void handleDeleteSelectedLeads()}
                >
                  Excluir selecionados
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
              <label className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={leadSearch}
                  onChange={(event) => setLeadSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone ou e-mail"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <select
                value={leadSourceFilter}
                onChange={(event) =>
                  setLeadSourceFilter(event.target.value as LeadSourceFilter)
                }
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {LEAD_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={leadStatusFilter}
                onChange={(event) =>
                  setLeadStatusFilter(
                    event.target.value as ConfirmationStatusFilter,
                  )
                }
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLeadSearch("");
                  setLeadSourceFilter("all");
                  setLeadStatusFilter("all");
                }}
              >
                Limpar
              </Button>
            </div>

            {leadsActionMessage && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
                {leadsActionMessage}
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            {leadsTabLoading ? (
              <p className="p-6 text-sm text-gray-400">Carregando leads...</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="w-12 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={allVisibleLeadsSelected}
                        onChange={toggleAllVisibleLeads}
                        aria-label={
                          allVisibleLeadsSelected
                            ? "Desmarcar todos os leads"
                            : "Selecionar todos os leads"
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      Telefone
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      Fonte
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      Etapa
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-center text-gray-400"
                      >
                        Nenhum lead neste cliente.
                      </td>
                    </tr>
                  ) : (
                    pagedClientLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={() => toggleLeadSelection(lead.id)}
                            aria-label={`Selecionar lead ${lead.name}`}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {lead.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {lead.phone}
                        </td>
                        <td className="px-4 py-3">
                          <SourceBadge source={lead.source} />
                        </td>
                        <td className="px-4 py-3">
                          <StageBadge stage={lead.crm_stage} />
                        </td>
                        <td className="px-4 py-3">
                          <ConfirmationBadge
                            status={lead.confirmation_status}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openLeadProfile(lead)}
                              title="Ver perfil do lead"
                              aria-label={`Ver perfil do lead ${lead.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-500 transition hover:bg-blue-50 hover:text-blue-700"
                            >
                              <UserRound size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLeadChat(lead)}
                              title="Abrir conversa no WhatsApp"
                              aria-label={`Abrir conversa do lead ${lead.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-green-600 transition hover:bg-green-50"
                            >
                              <MessageCircle size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLeadEditor(lead)}
                              title="Editar lead"
                              aria-label={`Editar lead ${lead.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLead(lead.id)}
                              title="Excluir lead"
                              aria-label={`Excluir lead ${lead.name}`}
                              disabled={leadDeleting === lead.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {leadDeleting === lead.id ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          {!leadsTabLoading && leadsTotalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <span className="text-xs text-gray-400">
                Página {leadsSafePage} de {leadsTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={leadsSafePage <= 1}
                  onClick={() => setLeadsPage((page) => Math.max(1, page - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={leadsSafePage >= leadsTotalPages}
                  onClick={() =>
                    setLeadsPage((page) => Math.min(leadsTotalPages, page + 1))
                  }
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "conversas" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Conversas Recentes
          </h3>
          {convosTabLoading ? (
            <p className="text-sm text-gray-400">Carregando conversas...</p>
          ) : clientConvos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma conversa.</p>
          ) : (
            <div className="space-y-3">
              {clientConvos.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                    {conv.lead_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {conv.lead_name}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {conv.last_message}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-400">
                      {new Date(conv.last_message_time).toLocaleTimeString(
                        "pt-BR",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={isMetaModalOpen}
        onClose={() => setIsMetaModalOpen(false)}
        title="Selecionar Business Manager"
        size="xl"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsMetaModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveMetaConnection()}
              loading={isSavingMeta}
              isDisabled={
                !selectedBusiness ||
                (isApiClient && !gestorMetaConnected) ||
                (!isApiClient &&
                  (draftAdAccountIds.length === 0 || draftPageIds.length === 0))
              }
            >
              Salvar conexão
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[24px] border border-[#f1dfc6] bg-[#fff7ea] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#b7791f] shadow-sm">
                <Building2 size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Fluxo da conexão no painel do gestor
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Escolha a BM deste cliente e confirme quais ativos o sistema
                  deve puxar automaticamente: contas, páginas, formulários e
                  WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-[24px] border border-zinc-200 bg-[#fcfbf8] p-4">
              <p className="mb-2 text-sm font-semibold text-zinc-900">
                Business Manager
              </p>
              {metaBusinessesLoading && (
                <p className="mb-2 text-xs text-zinc-500">
                  Carregando BMs da conta Meta...
                </p>
              )}
              <select
                value={draftBusinessId}
                onChange={(event) => handleBusinessChange(event.target.value)}
                disabled={availableBusinesses.length === 0}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-[#FF0636]"
              >
                {availableBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
              {availableBusinesses.length === 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  Nenhuma BM carregada. Conecte a BM em Configurações e volte
                  para selecionar os ativos deste cliente.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Resumo da seleção
              </p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <div className="flex items-center justify-between">
                  <span>Contas</span>
                  <strong className="text-zinc-950">
                    {draftAdAccountIds.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Páginas</span>
                  <strong className="text-zinc-950">
                    {draftPageIds.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Formulários</span>
                  <strong className="text-zinc-950">
                    {draftFormIds.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>WhatsApp</span>
                  <strong className="text-zinc-950">
                    {draftWhatsappId ? "1" : "0"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {selectedBusiness && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <AssetSelectionBlock
                  title="Contas de anúncio"
                  subtitle="Escolha quais contas a sincronização deve monitorar"
                  icon={<Facebook size={18} />}
                  items={selectedBusiness.ad_accounts.map((item) => ({
                    id: item.id,
                    label: item.name,
                    description: item.id,
                  }))}
                  selectedIds={draftAdAccountIds}
                  onToggle={(value) =>
                    toggleSelection(
                      draftAdAccountIds,
                      value,
                      setDraftAdAccountIds,
                    )
                  }
                  emptyLabel="Nenhuma conta disponível nesta BM."
                />

                <AssetSelectionBlock
                  title="Páginas"
                  subtitle="Defina quais páginas ficam disponíveis para o cliente"
                  icon={<Globe size={18} />}
                  items={selectedBusiness.pages.map((item) => ({
                    id: item.id,
                    label: item.name,
                    description: item.id,
                  }))}
                  selectedIds={draftPageIds}
                  onToggle={(value) =>
                    toggleSelection(draftPageIds, value, setDraftPageIds)
                  }
                  emptyLabel="Nenhuma página disponível nesta BM."
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <AssetSelectionBlock
                  title="Formulários de lead"
                  subtitle="Esses formulários serão usados para importar leads e UTMs"
                  icon={<FileText size={18} />}
                  items={selectedBusiness.forms.map((item) => ({
                    id: item.id,
                    label: item.name,
                    description: `Página ${item.page_id}`,
                  }))}
                  selectedIds={draftFormIds}
                  onToggle={(value) =>
                    toggleSelection(draftFormIds, value, setDraftFormIds)
                  }
                  emptyLabel="Nenhum formulário disponível nesta BM."
                />

                <div className="rounded-[26px] border border-zinc-200 bg-[#fcfbf8] p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
                      <MessageCircle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        WhatsApp Business
                      </p>
                      <p className="text-xs text-zinc-500">
                        Opcional, mas útil para rastrear agendamento e origem
                        das conversas.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleSelectWhatsapp("")}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors ${
                        draftWhatsappId === ""
                          ? "border-[#f0d2a8] bg-[#fff7ea]"
                          : "border-zinc-200 bg-white hover:border-zinc-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          Sem WhatsApp nesta etapa
                        </p>
                        <p className="text-xs text-zinc-500">
                          Conecta só BM, contas, páginas e formulários
                        </p>
                      </div>
                      {draftWhatsappId === "" && (
                        <Check size={16} className="text-[#b7791f]" />
                      )}
                    </button>

                    {selectedBusiness.whatsapp_accounts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectWhatsapp(item.id)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors ${
                          draftWhatsappId === item.id
                            ? "border-[#f0d2a8] bg-[#fff7ea]"
                            : "border-zinc-200 bg-white hover:border-zinc-300"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {item.display_phone_number} · {item.phone_number_id}
                          </p>
                        </div>
                        {draftWhatsappId === item.id && (
                          <Check size={16} className="text-[#b7791f]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(leadProfileOpen)}
        onClose={closeLeadProfile}
        title="Perfil do lead"
        size="lg"
        dark={isDarkMode}
        footer={
          <Button variant="secondary" onClick={closeLeadProfile}>
            Fechar
          </Button>
        }
      >
        {leadProfileOpen ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {leadProfileOpen.name}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Criado em{" "}
                    {new Date(leadProfileOpen.created_at).toLocaleDateString(
                      "pt-BR",
                      {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
                <ConfirmationBadge
                  status={leadProfileOpen.confirmation_status}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Telefone
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.phone || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  E-mail
                </p>
                <p className="break-all text-sm font-medium text-gray-900">
                  {leadProfileOpen.email || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Data de nascimento
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateOnly(leadProfileOpen.birth_date)}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Evento de interesse
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.event_interest || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Agendamento
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateTime(leadProfileOpen.store_visit_datetime)}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Consulta ativa
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.active_appointment
                    ? `${formatDateTime(leadProfileOpen.active_appointment.scheduled_at)} · ${leadProfileOpen.active_appointment.status}`
                    : "—"}
                </p>
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Fonte
                </p>
                <SourceBadge source={leadProfileOpen.source} />
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Confirmação
                </p>
                <ConfirmationBadge
                  status={leadProfileOpen.confirmation_status}
                />
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Etapa atual
                </p>
                <StageBadge stage={leadProfileOpen.crm_stage} />
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Vendedor
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {staffList.find(
                    (member) =>
                      member.id === leadProfileOpen.assigned_vendor_id,
                  )?.name || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Entrada
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateOnly(leadProfileOpen.created_at)}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Última atualização
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateTime(leadProfileOpen.updated_at)}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Nome
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.first_name || leadProfileOpen.name || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Sobrenome
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.last_name || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Placa do veículo
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.vehicle_plate || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4 sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Acompanhantes
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.companions || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4 sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Descrição
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {leadProfileOpen.description || "—"}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                Tags
              </p>
              {leadProfileOpen.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {leadProfileOpen.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Nenhuma tag vinculada.</p>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                Observações
              </p>
              <p className="text-sm leading-6 text-gray-700">
                {leadProfileOpen.notes?.trim()
                  ? leadProfileOpen.notes
                  : "Sem observações."}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(leadEditing)}
        onClose={() => (leadSaving ? null : closeLeadEditor())}
        title="Editar lead"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeLeadEditor}
              isDisabled={leadSaving}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveLead()} loading={leadSaving}>
              Salvar lead
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">Nome</span>
            <input
              value={leadFormName}
              onChange={(event) => setLeadFormName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">
              Telefone
            </span>
            <input
              value={leadFormPhone}
              onChange={(event) => setLeadFormPhone(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">E-mail</span>
            <input
              type="email"
              value={leadFormEmail}
              onChange={(event) => setLeadFormEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">
              Data de nascimento
            </span>
            <input
              type="date"
              value={leadFormBirthDate}
              onChange={(event) => setLeadFormBirthDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">Fonte</span>
            <select
              value={leadFormSource}
              onChange={(event) =>
                setLeadFormSource(event.target.value as LeadSource)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {LEAD_SOURCE_OPTIONS.filter(
                (option) => option.value !== "all",
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">Status</span>
            <select
              value={leadFormStatus}
              onChange={(event) =>
                setLeadFormStatus(event.target.value as ConfirmationStatus)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {LEAD_STATUS_OPTIONS.filter(
                (option) => option.value !== "all",
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-500">
              Observações
            </span>
            <textarea
              value={leadFormNotes}
              onChange={(event) => setLeadFormNotes(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={isImportMetaModalOpen}
        onClose={() =>
          isImportingMetaLeads ? null : setIsImportMetaModalOpen(false)
        }
        title="Importar leads da Meta"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsImportMetaModalOpen(false)}
              isDisabled={isImportingMetaLeads}
            >
              Cancelar
            </Button>
            <Button
              icon={<Database size={16} />}
              loading={isImportingMetaLeads}
              isDisabled={selectedMetaImportFormIds.length === 0}
              onClick={() => {
                setIsImportMetaModalOpen(false);
                void handleImportMetaLeads();
              }}
            >
              Importar selecionados
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Escolha um ou mais formulários já vinculados nesta BM para importar
            apenas os leads deles.
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
              Página {metaImportPage} de {metaImportTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft size={14} />}
                isDisabled={metaImportPage <= 1}
                onClick={() =>
                  setMetaImportPage((current) => Math.max(current - 1, 1))
                }
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowRight size={14} />}
                isDisabled={metaImportPage >= metaImportTotalPages}
                onClick={() =>
                  setMetaImportPage((current) =>
                    Math.min(current + 1, metaImportTotalPages),
                  )
                }
              >
                Próxima
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {metaImportPageItems.map((form) => {
              const checked = selectedMetaImportFormIds.includes(form.id);
              return (
                <label
                  key={form.id}
                  className={clsx(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                    checked
                      ? isDarkMode
                        ? "border-blue-500/40 bg-blue-500/10"
                        : "border-blue-200 bg-blue-50"
                      : isDarkMode
                        ? "border-zinc-700 bg-[#0f1116]"
                        : "border-zinc-200 bg-white",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMetaImportForm(form.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p
                      className={clsx(
                        "text-sm font-semibold",
                        isDarkMode ? "text-zinc-100" : "text-zinc-900",
                      )}
                    >
                      {form.name}
                    </p>
                    <p
                      className={clsx(
                        "mt-1 text-xs",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {form.page_id}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          {metaImportForms.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-500">
              Nenhum formulário vinculado encontrado.
            </div>
          )}
        </div>
      </Modal>

      {/* Modal - Cadastro/Edição de Veículo */}
      <Modal
        open={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        title={editingVehicleId ? "Editar Veículo" : "Cadastrar Veículo"}
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsVehicleModalOpen(false)}
              isDisabled={isResizingImages}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveVehicle()}
              isDisabled={isResizingImages}
            >
              {editingVehicleId ? "Salvar Alterações" : "Salvar Veículo"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Informações de processamento ou erro */}
          {isResizingImages && (
            <div className="text-xs text-blue-500 animate-pulse font-semibold">
              🔄 Processando e compactando imagens...
            </div>
          )}
          {uploadError && (
            <div className="text-xs text-[#E51838] font-bold">
              ⚠️ {uploadError}
            </div>
          )}
          <div className="flex justify-between items-center">
            <span
              className={clsx(
                "text-xs font-semibold uppercase tracking-wider",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              FIPE API & Inserção Manual
            </span>
            <button
              type="button"
              onClick={() => {
                setIsManualInput(!isManualInput);
                setSelectedBrandCode("");
                setVehicleBrand("");
                setVehicleModel("");
              }}
              className="text-xs font-semibold text-[#E51838] hover:underline"
            >
              {isManualInput ? "✨ Usar Busca FIPE" : "✏️ Digitar Manualmente"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Marca */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Marca *
              </label>
              {isManualInput ? (
                <input
                  type="text"
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  placeholder="Ex: Toyota"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-750",
                  )}
                />
              ) : (
                <select
                  value={selectedBrandCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedBrandCode(code);
                    const brand = fipeBrands.find((b) => b.value === code);
                    if (brand) {
                      setVehicleBrand(brand.label);
                    } else {
                      setVehicleBrand("");
                    }
                    setVehicleModel("");
                  }}
                  disabled={loadingFipeBrands}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-750",
                  )}
                >
                  <option value="">
                    {loadingFipeBrands
                      ? "Carregando marcas..."
                      : "Selecione uma marca..."}
                  </option>
                  {fipeBrands.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Modelo */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Modelo *
              </label>
              {isManualInput ? (
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="Ex: Corolla XEI 2.0"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-750",
                  )}
                />
              ) : (
                <select
                  value={
                    fipeModels.some((m) => m.label === vehicleModel)
                      ? vehicleModel
                      : ""
                  }
                  onChange={(e) => setVehicleModel(e.target.value)}
                  disabled={!selectedBrandCode || loadingFipeModels}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-750",
                  )}
                >
                  <option value="">
                    {!selectedBrandCode
                      ? "Selecione uma marca primeiro"
                      : loadingFipeModels
                        ? "Carregando modelos..."
                        : "Selecione um modelo..."}
                  </option>
                  {fipeModels.map((m) => (
                    <option key={m.value} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Condição */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Condição *
              </label>
              <select
                value={vehicleCondition}
                onChange={(e) => {
                  const cond = e.target.value as "novo" | "seminovo";
                  setVehicleCondition(cond);
                  if (cond === "novo") {
                    setVehicleKm("0");
                  } else {
                    setVehicleKm("");
                  }
                }}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-750",
                )}
              >
                <option value="novo">Novo</option>
                <option value="seminovo">Seminovo</option>
              </select>
            </div>

            {/* KM */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                KM *
              </label>
              <input
                type="text"
                disabled={vehicleCondition === "novo"}
                value={vehicleCondition === "novo" ? "0" : vehicleKm}
                onChange={(e) => setVehicleKm(formatKM(e.target.value))}
                placeholder={vehicleCondition === "novo" ? "0" : "Ex: 45.000"}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100 disabled:bg-zinc-900/60 disabled:text-zinc-500"
                    : "border-gray-200 bg-white text-gray-750 disabled:bg-gray-100 disabled:text-gray-400",
                )}
              />
            </div>

            {/* Ano de Fabricação */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Ano de Fabricação *
              </label>
              <input
                type="text"
                value={vehicleManufacturingYear}
                onChange={(e) =>
                  handleYearChange(e.target.value, setVehicleManufacturingYear)
                }
                placeholder="Ex: 2022"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-750",
                )}
              />
            </div>

            {/* Ano do Modelo */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Ano do Modelo *
              </label>
              <input
                type="text"
                value={vehicleModelYear}
                onChange={(e) =>
                  handleYearChange(e.target.value, setVehicleModelYear)
                }
                placeholder="Ex: 2023"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-750",
                )}
              />
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Preço (R$) *
              </label>
              <input
                type="text"
                value={vehiclePrice}
                onChange={(e) => setVehiclePrice(formatBRL(e.target.value))}
                placeholder="Ex: R$ 89.900,00"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-750",
                )}
              />
            </div>

            {/* Lojas */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Lojas (separadas por vírgula) *
              </label>
              <input
                type="text"
                value={vehicleStores}
                onChange={(e) => setVehicleStores(e.target.value)}
                placeholder="Ex: Matriz, Filial Centro"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-750",
                )}
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Categoria
              </label>
              <select
                value={vehicleCategory}
                onChange={(e) => setVehicleCategory(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                <option value="">Selecione uma categoria...</option>
                {CAR_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Foto Principal (Anexo) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Foto Principal do Veículo *
              </label>

              {vehicleImageUrl ? (
                <div className="relative group rounded-xl border overflow-hidden max-w-xs dark:border-zinc-850 bg-zinc-900/50">
                  <img
                    src={vehicleImageUrl}
                    alt="Foto Principal"
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVehicleImageUrl("")}
                      className="bg-red-650 text-white rounded-lg p-2 hover:bg-red-700 transition"
                      title="Excluir imagem"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <label
                    className={clsx(
                      "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition hover:bg-zinc-50/50",
                      isDarkMode
                        ? "border-zinc-800 hover:bg-zinc-900/50 text-zinc-400"
                        : "border-gray-200 text-gray-400",
                    )}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2" />
                      <p className="text-xs font-medium">
                        Clique para fazer upload da foto principal
                      </p>
                      <p className="text-[10px] text-gray-550 mt-1">
                        PNG, JPG ou WEBP (Max 10MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMainImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Galeria de Fotos (Múltiplos Anexos) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Galeria de Fotos (Múltiplos Anexos)
              </label>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-2">
                {vehicleGallery.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg border overflow-hidden h-20 dark:border-zinc-850 bg-zinc-900/50"
                  >
                    <img
                      src={img}
                      alt={`Galeria ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(idx)}
                      className="absolute top-1 right-1 bg-red-650/80 text-white rounded-md p-1 hover:bg-red-700 transition"
                      title="Excluir imagem"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}

                <label
                  className={clsx(
                    "flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer transition hover:bg-zinc-50/50 text-center px-1",
                    isDarkMode
                      ? "border-zinc-800 hover:bg-zinc-900/50 text-zinc-400"
                      : "border-gray-200 text-gray-400",
                  )}
                >
                  <div className="flex flex-col items-center justify-center">
                    <Plus className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Add Fotos</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryImagesChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Tags / Categorias
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVehicleTagInput}
                  onChange={(e) => setNewVehicleTagInput(e.target.value)}
                  placeholder="Ex: SUV, Automático"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTagToVehicleForm();
                    }
                  }}
                  className={clsx(
                    "flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-755",
                  )}
                />
                <Button
                  variant="secondary"
                  onClick={handleAddTagToVehicleForm}
                  className={clsx(
                    "border border-gray-200 hover:bg-gray-50 transition",
                    isDarkMode
                      ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      : "text-gray-600",
                  )}
                >
                  Adicionar
                </Button>
              </div>
              {vehicleTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vehicleTags.map((tag) => (
                    <span
                      key={tag}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
                        isDarkMode
                          ? "bg-zinc-800 text-zinc-200"
                          : "bg-gray-100 text-gray-700",
                      )}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTagFromVehicleForm(tag)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Disponível switch */}
            <div className="flex items-center gap-2.5 py-1 sm:col-span-2">
              <input
                type="checkbox"
                id="vehicle-status-checkbox"
                checked={vehicleStatus}
                onChange={(e) => setVehicleStatus(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#E51838] focus:ring-[#E51838]/30"
              />
              <label
                htmlFor="vehicle-status-checkbox"
                className={clsx(
                  "text-xs font-semibold cursor-pointer select-none",
                  isDarkMode ? "text-zinc-300" : "text-gray-550",
                )}
              >
                Disponível para venda (Ativo na Vitrine)
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal - Confirmação de Exclusão de Veículo */}
      <ConfirmationModal
        open={Boolean(vehicleToDelete)}
        onClose={() => setVehicleToDelete(null)}
        onConfirm={() => void handleDeleteVehicleConfirm()}
        title="Excluir Veículo"
        description={
          vehicleToDelete && (
            <p
              className={clsx(
                "text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-650",
              )}
            >
              Tem certeza que deseja excluir o veículo{" "}
              <span
                className={clsx(
                  "font-semibold",
                  isDarkMode ? "text-zinc-100" : "text-zinc-900",
                )}
              >
                {vehicleToDelete.brand} {vehicleToDelete.model}
              </span>
              ? Esta ação removerá o veículo permanentemente e não poderá ser
              desfeita.
            </p>
          )
        }
        confirmLabel="Excluir Veículo"
      />
    </div>
  );
}
