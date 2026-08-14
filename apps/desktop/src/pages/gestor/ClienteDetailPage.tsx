import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  EyeOff,
  Facebook,
  FileText,
  Globe,
  KeyRound,
  Link2,
  Lock,
  DollarSign,
  Megaphone,
  Sparkles,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Route,
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
  ApprovalStatusBadge,
} from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyableId } from "../../components/ui/CopyableId";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { VendorSignupLinkCard } from "../../components/shared/VendorSignupLinkCard";
import { LeadProfileCategories } from "../../components/leads/LeadProfileCategories";
import { listEvents } from "../../services/events";
import { listCrmPipelines, type ApiCrmPipeline } from "../../services/crm";
import { MetaCampaignTree } from "../../components/shared/MetaCampaignTree";
import {
  MetaCampaignFilters,
  periodToRange,
  type PeriodPreset,
} from "../../components/shared/MetaCampaignFilters";
import {
  DEFAULT_COLUMNS,
  presetForObjective,
  readStoredColumns,
  storeColumns,
  type MetaColumnId,
} from "../../lib/metaCampaignColumns";
import { Modal } from "../../components/ui/Modal";
import { Notice } from "../../components/ui/Notice";
import { pushToast } from "../../components/ui/Toast";
import { resolvePublicWebOrigin } from "../../utils/publicWebOrigin";
import type { Client, Conversation, Lead } from "../../types";
import type { MetaBusinessOption, MetaConnectionState } from "../../types/meta";
import { readStoredSession } from "../../services/auth";
import {
  createIntegrationCredential,
  deleteClient,
  getClient,
  listIntegrationCredentials,
  mapApiClientToClient,
  revokeIntegrationCredential,
  rotateIntegrationCredential,
  updateClient,
  type IntegrationCredential,
  type IntegrationCredentialWithKey,
} from "../../services/clients";
import { BRAZIL_CAR_BRANDS } from "../../lib/car-brands";
import {
  createPrincipalClientAccess,
  createStaffUser,
  deleteStaffUser,
  listStaffByClient,
  toggleUserActive,
  setStaffApproval,
  updateStaffUser,
  type StaffUser,
} from "../../services/users";
import { listClientStaff } from "../../services/staff";
import {
  createLead,
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
  importMetaLeads,
  getMetaGestorStatus,
  getMetaSummary,
  getMetaCampaignsReport,
  getMetaStatus,
  configureWhatsappApiChannels,
  listWhatsappApiChannels,
  listMetaBusinesses,
  selectMetaAssets,
  syncMetaFull,
  listAssignableCampaigns,
  listLinkedCampaigns,
  assignMetaCampaign,
  unassignMetaCampaign,
  deleteMetaLeadRouting,
  listMetaLeadRouting,
  listMetaLeadRoutingWhatsappTemplates,
  upsertMetaLeadRouting,
  type AssignableCampaign,
  type LinkedCampaign,
  type MetaLeadRoutingForm,
  type MetaLeadWhatsappTemplate,
  type MetaLeadWhatsappTemplateParameterKey,
  type MetaCampaignsReportItem,
  type WhatsappApiChannel,
} from "../../services/meta";
import {
  listClientVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listCarBrands,
  listCarModelsByBrand,
  syncVehicleCatalog,
  importVehicleCatalog,
  type Vehicle,
  type VehicleOption,
} from "../../services/vehicles";
import { Car, Tag, Upload } from "lucide-react";
import { resizeImageToDataUrl } from "../../utils/image";

import type { ConfirmationStatus, LeadSource } from "../../types";

const TABS = [
  { id: "perfil", label: "Perfil", icon: <Building2 size={14} /> },
  { id: "equipe", label: "Equipe", icon: <Users size={14} /> },
  { id: "acesso", label: "Acesso", icon: <Settings size={14} /> },
  { id: "integracao", label: "Integração n8n", icon: <KeyRound size={14} /> },
  { id: "ads", label: "Ads (Facebook)", icon: <Facebook size={14} /> },
  { id: "whatsapp", label: "WhatsApp API", icon: <MessageCircle size={14} /> },
  { id: "rubinho", label: "Rubinho", icon: <Settings size={14} /> },
  { id: "veiculos", label: "Veículos", icon: <Car size={14} /> },
  { id: "leads", label: "Lista de Leads", icon: <CheckCircle2 size={14} /> },
];

import {
  LEADS_PAGE_SIZE,
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  META_IMPORT_PAGE_SIZE,
  META_LEAD_TEMPLATE_PARAMETER_OPTIONS,
  VENDOR_CATEGORY_OPTIONS,
  defaultMetaTemplateParameters,
  draftsFromMetaLeadRoutingForms,
  emptyMetaLeadRoutingDraft,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getErrorMessage,
  isIntegrationCredentialActive,
  isUuid,
  sleep,
} from "./cliente/cliente-detail.model";
import type {
  ConfirmationStatusFilter,
  DeleteAction,
  EditableStaffRole,
  EditableVendorCategory,
  IntegrationAction,
  LeadSourceFilter,
  MetaLeadRoutingDraft,
} from "./cliente/cliente-detail.model";
import {
  ADS_SUB_TABS,
  CAR_CATEGORIES,
  CompactAssetList,
  META_SETUP_STEPS,
  MetaAssetPicker,
  MetaSelectionSummary,
  MetaStatCard,
  formatPhoneBr,
  mapMetaBusinessFromApi,
  mapMetaConnectionFromApi,
} from "./cliente/MetaPanels";
import type { AdsSubTab, MetaSetupStep } from "./cliente/MetaPanels";

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
  const [automaticVehicleImporting, setAutomaticVehicleImporting] =
    useState(false);
  const [automaticVehicleImportMessage, setAutomaticVehicleImportMessage] =
    useState("");

  // Form/Modal states for vehicles
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [, setVehicleYearOrKm] = useState("");
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
  const [metaStatusLoading, setMetaStatusLoading] = useState(false);
  const [metaBusinessesLoading, setMetaBusinessesLoading] = useState(false);
  const [metaStatusMessage, setMetaStatusMessage] = useState("");
  /** Meta OAuth uma vez no gestor; BM por cliente usa `gestor_token` na API. */
  const [gestorMetaConnected, setGestorMetaConnected] = useState(false);
  const [apiBusinesses, setApiBusinesses] = useState<MetaBusinessOption[]>([]);
  const [apiClient, setApiClient] = useState<Client | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientFetchError, setClientFetchError] = useState("");
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [companyEditLoading, setCompanyEditLoading] = useState(false);
  const [companyEditError, setCompanyEditError] = useState("");
  const [companyEditName, setCompanyEditName] = useState("");
  const [companyEditVehicleBrand, setCompanyEditVehicleBrand] = useState("");
  const [companyEditCnpj, setCompanyEditCnpj] = useState("");
  const [companyEditEmail, setCompanyEditEmail] = useState("");
  const [companyEditPhone, setCompanyEditPhone] = useState("");
  const [companyEditWhatsapp, setCompanyEditWhatsapp] = useState("");
  const [companyEditAddress, setCompanyEditAddress] = useState("");
  const [companyEditWebhook, setCompanyEditWebhook] = useState("");
  const [integrationCredentials, setIntegrationCredentials] = useState<
    IntegrationCredential[]
  >([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationAction, setIntegrationAction] =
    useState<IntegrationAction | null>(null);
  const [revealedIntegrationCredential, setRevealedIntegrationCredential] =
    useState<IntegrationCredentialWithKey | null>(null);
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
  const [leadCreating, setLeadCreating] = useState(false);
  const [leadCreateOptionsLoading, setLeadCreateOptionsLoading] =
    useState(false);
  const [leadCreateEventId, setLeadCreateEventId] = useState("");
  const [leadCreatePipelineId, setLeadCreatePipelineId] = useState("");
  const [leadCreateStageId, setLeadCreateStageId] = useState("");
  const [leadCreatePipelines, setLeadCreatePipelines] = useState<
    ApiCrmPipeline[]
  >([]);
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
  const [staffApproving, setStaffApproving] = useState<string | null>(null);
  const [staffDeleting, setStaffDeleting] = useState<string | null>(null);
  const [staffEditing, setStaffEditing] = useState<StaffUser | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteActionLoading, setDeleteActionLoading] = useState(false);

  const resolvedId = id ?? "";
  const [metaConnection, setMetaConnection] =
    useState<MetaConnectionState | null>(null);

  // Vinculo de campanhas da Meta a este cliente.
  const [isCampaignLinkOpen, setIsCampaignLinkOpen] = useState(false);
  const [campaignLinkLoading, setCampaignLinkLoading] = useState(false);
  const [campaignLinkSaving, setCampaignLinkSaving] = useState(false);
  const [campaignLinkError, setCampaignLinkError] = useState<string | null>(
    null,
  );
  const [assignableCampaigns, setAssignableCampaigns] = useState<
    AssignableCampaign[]
  >([]);
  /** Ids marcados na tela. O que estava marcado ao abrir vira a base do diff. */
  const [checkedCampaignIds, setCheckedCampaignIds] = useState<string[]>([]);
  const [initialCampaignIds, setInitialCampaignIds] = useState<string[]>([]);
  const [linkedCampaigns, setLinkedCampaigns] = useState<LinkedCampaign[]>([]);

  // Roteamento formulario -> evento/pipeline/etapas de atendimento.
  const [isLeadRoutingOpen, setIsLeadRoutingOpen] = useState(false);
  const [leadRoutingLoading, setLeadRoutingLoading] = useState(false);
  const [leadRoutingSaving, setLeadRoutingSaving] = useState(false);
  const [leadRoutingError, setLeadRoutingError] = useState<string | null>(null);
  const [leadRoutingForms, setLeadRoutingForms] = useState<
    MetaLeadRoutingForm[]
  >([]);
  const [leadRoutingEvents, setLeadRoutingEvents] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [leadRoutingPipelines, setLeadRoutingPipelines] = useState<
    ApiCrmPipeline[]
  >([]);
  const [leadRoutingWhatsappTemplates, setLeadRoutingWhatsappTemplates] =
    useState<MetaLeadWhatsappTemplate[]>([]);
  const [
    leadRoutingWhatsappTemplatesWarning,
    setLeadRoutingWhatsappTemplatesWarning,
  ] = useState<string | null>(null);
  const [leadRoutingDrafts, setLeadRoutingDrafts] = useState<
    Record<string, MetaLeadRoutingDraft>
  >({});

  // Filtros da aba Campanhas: periodo, tipo e colunas visiveis.
  const [campaignPeriod, setCampaignPeriod] = useState<PeriodPreset>(30);
  const [campaignCustomRange, setCampaignCustomRange] = useState({
    from: "",
    to: "",
  });
  const [campaignObjective, setCampaignObjective] = useState<string | null>(
    null,
  );
  const [campaignStatus, setCampaignStatus] = useState<string | null>("ACTIVE");
  const [campaignColumns, setCampaignColumns] = useState<MetaColumnId[]>(
    () => readStoredColumns(resolvedId) ?? DEFAULT_COLUMNS,
  );
  const [availableRange, setAvailableRange] = useState<{
    from: string | null;
    to: string | null;
  }>({ from: null, to: null });
  const campaignsRequestRef = useRef(0);

  // Eventos do cliente, para vincular campanha -> evento no modal.
  const [clientEvents, setClientEvents] = useState<
    Array<{ id: string; name: string }>
  >([]);
  /** meta_campaign_id -> event_id escolhido na tela ("" = sem evento). */
  const [campaignEventChoice, setCampaignEventChoice] = useState<
    Record<string, string>
  >({});

  // Sub-abas internas da aba Ads (Facebook).
  const [adsSubTab, setAdsSubTab] = useState<AdsSubTab>("conexoes");
  const [campaignsReport, setCampaignsReport] = useState<
    MetaCampaignsReportItem[]
  >([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const refreshLinkedCampaigns = useCallback(async () => {
    const session = readStoredSession();
    if (!resolvedId || !isUuid(resolvedId) || !session?.accessToken) return;

    try {
      setLinkedCampaigns(
        await listLinkedCampaigns(resolvedId, session.accessToken),
      );
    } catch {
      setLinkedCampaigns([]);
    }
  }, [resolvedId]);

  useEffect(() => {
    void refreshLinkedCampaigns();
  }, [refreshLinkedCampaigns]);

  const refreshCampaignsReport = useCallback(async () => {
    const session = readStoredSession();
    if (!resolvedId || !isUuid(resolvedId) || !session?.accessToken) return;

    // Sequencia a requisicao: trocar de filtro rapido fazia a resposta antiga
    // chegar depois da nova e sobrescrever a tela com o resultado errado.
    const requestId = ++campaignsRequestRef.current;
    const isStale = () => requestId !== campaignsRequestRef.current;

    setReportLoading(true);
    setReportError(null);
    try {
      const data = await getMetaCampaignsReport(
        resolvedId,
        session.accessToken,
        {
          ...periodToRange(campaignPeriod, campaignCustomRange),
          objective: campaignObjective ?? undefined,
          status: campaignStatus ?? undefined,
          // Filtra no banco: a conta inteira nao precisa trafegar.
          only_linked: adsSubTab === "campanhas",
        },
      );
      if (isStale()) return;
      setCampaignsReport(data.campaigns ?? []);
      setAvailableRange(data.available_range ?? { from: null, to: null });
    } catch (error) {
      if (isStale()) return;
      setCampaignsReport([]);
      setReportError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar o relatório.",
      );
    } finally {
      if (!isStale()) setReportLoading(false);
    }
  }, [
    resolvedId,
    campaignPeriod,
    campaignCustomRange,
    campaignObjective,
    campaignStatus,
    adsSubTab,
  ]);

  useEffect(() => {
    // So busca quando a sub-aba que usa o relatorio esta aberta.
    if (
      adsSubTab === "campanhas" ||
      adsSubTab === "relatorios" ||
      adsSubTab === "financeiro"
    ) {
      void refreshCampaignsReport();
    }
  }, [adsSubTab, refreshCampaignsReport]);

  /**
   * A aba Campanhas mostra so o que foi vinculado a este cliente. O relatorio
   * traz a conta de anuncio inteira, entao o recorte e feito aqui.
   */
  /**
   * Recorte pedido que nao encosta no que foi sincronizado. Sem isso a tela
   * mostra zeros e parece defeito, quando na verdade nao ha dado no periodo.
   */
  const rangeOutOfSync = useMemo(() => {
    if (!availableRange.from || !availableRange.to) return false;
    const { from, to } = periodToRange(campaignPeriod, campaignCustomRange);
    if (!from && !to) return false;
    if (to && to < availableRange.from) return true;
    return Boolean(from && from > availableRange.to);
  }, [campaignPeriod, campaignCustomRange, availableRange]);

  const availableObjectives = useMemo(() => {
    const objetivos = new Set<string>();
    for (const campaign of campaignsReport) {
      if (campaign.objective) objetivos.add(campaign.objective);
    }
    return Array.from(objetivos).sort();
  }, [campaignsReport]);

  useEffect(() => {
    if (resolvedId) storeColumns(resolvedId, campaignColumns);
  }, [resolvedId, campaignColumns]);

  /**
   * Trocar o tipo troca as colunas para as que importam naquele objetivo:
   * custo por lead nao diz nada numa campanha de alcance. O configurador
   * manual continua valendo depois.
   */
  function handleObjectiveChange(objective: string | null) {
    setCampaignObjective(objective);
    const preset = presetForObjective(objective);
    setCampaignColumns(preset ? [...preset.columns] : DEFAULT_COLUMNS);
  }

  const linkedCampaignsReport = useMemo(() => {
    const vinculadas = new Set(
      linkedCampaigns.map((campaign) => campaign.meta_campaign_id),
    );
    return campaignsReport.filter((campaign) => vinculadas.has(campaign.id));
  }, [campaignsReport, linkedCampaigns]);

  const reportTotals = useMemo(() => {
    const totals = campaignsReport.reduce(
      (acc, campaign) => ({
        spend: acc.spend + (campaign.spend ?? 0),
        leads: acc.leads + (campaign.leads ?? 0),
        conversations: acc.conversations + (campaign.conversations ?? 0),
        impressions: acc.impressions + (campaign.impressions ?? 0),
      }),
      { spend: 0, leads: 0, conversations: 0, impressions: 0 },
    );

    return {
      ...totals,
      // Divisao guardada: sem lead, custo por lead nao existe (nao e zero).
      costPerLead: totals.leads > 0 ? totals.spend / totals.leads : null,
      costPerConversation:
        totals.conversations > 0 ? totals.spend / totals.conversations : null,
    };
  }, [campaignsReport]);

  const availableBusinesses = useMemo(() => apiBusinesses, [apiBusinesses]);
  const [draftBusinessId, setDraftBusinessId] = useState("");
  const [draftAdAccountIds, setDraftAdAccountIds] = useState<string[]>([]);
  const [draftPageIds, setDraftPageIds] = useState<string[]>([]);
  const [draftFormIds, setDraftFormIds] = useState<string[]>([]);
  const [whatsappApiChannels, setWhatsappApiChannels] = useState<
    WhatsappApiChannel[]
  >([]);
  const [whatsappApiLoading, setWhatsappApiLoading] = useState(false);
  const [whatsappApiSaving, setWhatsappApiSaving] = useState(false);
  const [whatsappApiBusinessId, setWhatsappApiBusinessId] = useState("");
  const [whatsappApiPhoneIds, setWhatsappApiPhoneIds] = useState<string[]>([]);
  const [whatsappApiPrimaryId, setWhatsappApiPrimaryId] = useState("");
  const [metaSetupStep, setMetaSetupStep] = useState<MetaSetupStep>(0);
  const [metaSetupSearch, setMetaSetupSearch] = useState("");

  const selectedBusiness = useMemo(
    () =>
      availableBusinesses.find((business) => business.id === draftBusinessId) ??
      null,
    [availableBusinesses, draftBusinessId],
  );

  const orderedMetaForms = useMemo(() => {
    if (!selectedBusiness) return [];
    const selectedPages = new Set(draftPageIds);
    return [...selectedBusiness.forms].sort((left, right) => {
      const leftSelected = selectedPages.has(left.page_id) ? 1 : 0;
      const rightSelected = selectedPages.has(right.page_id) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return left.name.localeCompare(right.name, "pt-BR");
    });
  }, [draftPageIds, selectedBusiness]);

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

      const initialBusiness =
        mappedBusinesses.find(
          (business) => business.id === metaConnection?.business_id,
        ) ?? mappedBusinesses[0];
      if (initialBusiness) {
        hydrateMetaDraft(initialBusiness);
        showMetaWizard();
      } else {
        setMetaStatusMessage(
          "A autorização foi concluída, mas nenhuma BM foi encontrada para esta conta.",
        );
      }
    } finally {
      setMetaBusinessesLoading(false);
    }
  }

  const refreshWhatsappApi = useCallback(async () => {
    if (!resolvedId || !isUuid(resolvedId)) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    setWhatsappApiLoading(true);
    try {
      const [channelsResponse, businessesResponse] = await Promise.all([
        listWhatsappApiChannels(resolvedId, token),
        listMetaBusinesses(resolvedId, null, token, { gestor_token: true }),
      ]);
      const businesses = (businessesResponse.businesses ?? []).map(
        mapMetaBusinessFromApi,
      );
      setWhatsappApiChannels(channelsResponse.channels ?? []);
      setApiBusinesses(businesses);

      setWhatsappApiBusinessId((current) => {
        const nextBusinessId =
          (current && businesses.some((business) => business.id === current)
            ? current
            : channelsResponse.channels[0]?.business_id) ??
          businesses[0]?.id ??
          "";
        const linked = channelsResponse.channels.filter(
          (channel) => channel.business_id === nextBusinessId,
        );
        setWhatsappApiPhoneIds(
          linked.map((channel) => channel.phone_number_id),
        );
        setWhatsappApiPrimaryId(
          linked.find((channel) => channel.is_primary)?.phone_number_id ??
            linked[0]?.phone_number_id ??
            "",
        );
        return nextBusinessId;
      });
    } catch (error) {
      pushToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os canais do WhatsApp.",
      });
    } finally {
      setWhatsappApiLoading(false);
    }
  }, [resolvedId]);

  useEffect(() => {
    if (activeTab === "whatsapp") void refreshWhatsappApi();
  }, [activeTab, refreshWhatsappApi]);

  function selectWhatsappApiBusiness(businessId: string) {
    setWhatsappApiBusinessId(businessId);
    const linked = whatsappApiChannels.filter(
      (channel) => channel.business_id === businessId,
    );
    setWhatsappApiPhoneIds(linked.map((channel) => channel.phone_number_id));
    setWhatsappApiPrimaryId(
      linked.find((channel) => channel.is_primary)?.phone_number_id ??
        linked[0]?.phone_number_id ??
        "",
    );
  }

  async function saveWhatsappApiChannels() {
    if (!resolvedId || !whatsappApiBusinessId) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    const business = apiBusinesses.find(
      (item) => item.id === whatsappApiBusinessId,
    );
    if (!business) return;

    setWhatsappApiSaving(true);
    try {
      const response = await configureWhatsappApiChannels(
        {
          client_id: resolvedId,
          business_id: business.id,
          channels: business.whatsapp_accounts
            .filter((item) =>
              whatsappApiPhoneIds.includes(item.phone_number_id),
            )
            .map((item) => ({
              waba_id: item.waba_id,
              phone_number_id: item.phone_number_id,
            })),
          primary_phone_number_id:
            whatsappApiPrimaryId || whatsappApiPhoneIds[0] || undefined,
        },
        token,
      );
      setWhatsappApiChannels(response.channels ?? []);
      pushToast({
        type: "success",
        message: "Canais do WhatsApp atualizados com sucesso.",
      });
    } catch (error) {
      pushToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar os canais do WhatsApp.",
      });
    } finally {
      setWhatsappApiSaving(false);
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

  const loadIntegrationCredentials = useCallback(async () => {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setIntegrationError("Faça login novamente para gerenciar a integração.");
      return;
    }

    setIntegrationLoading(true);
    setIntegrationError("");
    try {
      const rows = await listIntegrationCredentials(
        resolvedId,
        session.accessToken,
      );
      setIntegrationCredentials(rows);
    } catch (error) {
      setIntegrationError(
        getErrorMessage(
          error,
          "Não foi possível carregar as credenciais de integração.",
        ),
      );
    } finally {
      setIntegrationLoading(false);
    }
  }, [resolvedId]);

  useEffect(() => {
    if (activeTab === "integracao") {
      void loadIntegrationCredentials();
    }
  }, [activeTab, loadIntegrationCredentials]);

  useEffect(() => {
    setIntegrationCredentials([]);
    setIntegrationError("");
    setIntegrationAction(null);
    setRevealedIntegrationCredential(null);
  }, [resolvedId]);

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

  const handleAutomaticVehicleImport = useCallback(async () => {
    const session = readStoredSession();
    if (!session?.accessToken || !isUuid(resolvedId)) return;

    setAutomaticVehicleImporting(true);
    setAutomaticVehicleImportMessage("");

    try {
      const catalog = await syncVehicleCatalog(
        resolvedId,
        session.accessToken,
      );
      const pendingCatalogIds = catalog.items
        .filter((item) => !item.imported)
        .map((item) => item.id);

      if (pendingCatalogIds.length === 0) {
        setAutomaticVehicleImportMessage(
          `Todos os modelos ${catalog.brand} já estão na vitrine.`,
        );
        return;
      }

      const result = await importVehicleCatalog(
        resolvedId,
        pendingCatalogIds,
        session.accessToken,
      );
      setAutomaticVehicleImportMessage(
        `${result.imported} modelos ${catalog.brand} importados com sucesso.`,
      );
      loadVehicles();
    } catch (error) {
      setAutomaticVehicleImportMessage(
        getErrorMessage(
          error,
          "Não foi possível importar os veículos automaticamente.",
        ),
      );
    } finally {
      setAutomaticVehicleImporting(false);
    }
  }, [loadVehicles, resolvedId]);

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

  async function handleSetStaffApproval(
    member: StaffUser,
    status: "approved" | "rejected",
  ) {
    const session = readStoredSession();
    if (!session?.accessToken) return;
    setStaffApproving(member.id);
    setStaffError("");
    try {
      const result = await setStaffApproval(
        session.accessToken,
        member.id,
        status,
      );
      setStaffList((prev) =>
        prev.map((u) =>
          u.id === member.id
            ? {
                ...u,
                approval_status: status,
                is_active: status === "approved",
              }
            : u,
        ),
      );
      pushToast({
        message:
          status === "rejected"
            ? `Cadastro de ${member.name} recusado.`
            : result.email_sent
              ? `${member.name} aprovado. E-mail para criar a senha enviado.`
              : `${member.name} aprovado. O e-mail de criação de senha ainda não foi enviado.`,
        type: status === "approved" && !result.email_sent ? "info" : "success",
      });
    } catch (err) {
      setStaffError(
        getErrorMessage(err, "Não foi possível alterar a aprovação."),
      );
    } finally {
      setStaffApproving(null);
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

  function primeDraftState(business: MetaBusinessOption) {
    setDraftBusinessId(business.id);
    setDraftAdAccountIds(
      business.ad_accounts.length === 1 ? [business.ad_accounts[0].id] : [],
    );
    setDraftPageIds(business.pages.length === 1 ? [business.pages[0].id] : []);
    setDraftFormIds([]);
  }

  function hydrateMetaDraft(business: MetaBusinessOption) {
    if (metaConnection?.business_id !== business.id) {
      primeDraftState(business);
      return;
    }

    setDraftBusinessId(business.id);
    setDraftAdAccountIds(
      metaConnection.selected_ad_accounts.map((item) => item.id),
    );
    setDraftPageIds(metaConnection.selected_pages.map((item) => item.id));
    setDraftFormIds(metaConnection.selected_forms.map((item) => item.id));
  }

  function showMetaWizard() {
    setMetaSetupStep(0);
    setMetaSetupSearch("");
    setIsMetaModalOpen(true);
  }

  function goToMetaStep(step: MetaSetupStep) {
    setMetaSetupStep(step);
    setMetaSetupSearch("");
  }

  function toggleVisibleMetaSelection(
    currentIds: string[],
    visibleIds: string[],
    setter: (ids: string[]) => void,
  ) {
    const visibleSet = new Set(visibleIds);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => currentIds.includes(id));
    setter(
      allVisibleSelected
        ? currentIds.filter((id) => !visibleSet.has(id))
        : [...new Set([...currentIds, ...visibleIds])],
    );
  }

  async function openMetaManager() {
    const clientId = id ?? "";
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (clientId && isUuid(clientId) && accessToken) {
      if (!gestorMetaConnected) {
        setMetaStatusMessage(
          metaConnection
            ? "Este cliente já está conectado à Meta. Para trocar a BM ou o número, reconecte a conta do gestor em Configurações."
            : "Conecte a conta Meta do gestor em Configurações antes de selecionar os ativos deste cliente.",
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
          hydrateMetaDraft(preferredBusiness);
          showMetaWizard();
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

    hydrateMetaDraft(preferredBusiness);
    showMetaWizard();
  }

  function handleBusinessChange(nextBusinessId: string) {
    const business = availableBusinesses.find(
      (item) => item.id === nextBusinessId,
    );
    if (!business) return;
    primeDraftState(business);
    setMetaSetupSearch("");
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
    setMetaConnection({
      business_id: selectedBusiness.id,
      business_name: selectedBusiness.name,
      selected_ad_accounts: selectedAdAccounts,
      selected_pages: selectedPages,
      selected_forms: selectedForms,
      selected_whatsapp: metaConnection?.selected_whatsapp ?? null,
      selected_whatsapps: metaConnection?.selected_whatsapps ?? [],
      phone_number_id: metaConnection?.phone_number_id ?? null,
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

  async function handleOpenLeadRouting() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (!clientId || !isUuid(clientId) || !session?.accessToken) {
      pushToast({
        type: "error",
        message: "Sessão expirada. Faça login novamente.",
      });
      return;
    }

    setIsLeadRoutingOpen(true);
    setLeadRoutingLoading(true);
    setLeadRoutingError(null);
    setLeadRoutingWhatsappTemplatesWarning(null);
    try {
      const [routing, events, pipelines, whatsappTemplatesResult] =
        await Promise.all([
          listMetaLeadRouting(clientId, session.accessToken),
          listEvents({ client_id: clientId }, session.accessToken),
          listCrmPipelines(clientId, session.accessToken),
          listMetaLeadRoutingWhatsappTemplates(clientId, session.accessToken)
            .then((data) => ({ data, error: null }))
            .catch((error: unknown) => ({ data: null, error })),
        ]);
      setLeadRoutingForms(routing.forms);
      setLeadRoutingEvents(
        events.map((event) => ({ id: event.id, name: event.name })),
      );
      setLeadRoutingPipelines(pipelines);
      setLeadRoutingWhatsappTemplates(
        whatsappTemplatesResult.data?.templates ?? [],
      );
      if (whatsappTemplatesResult.error) {
        setLeadRoutingWhatsappTemplatesWarning(
          getErrorMessage(
            whatsappTemplatesResult.error,
            "Não foi possível consultar os templates aprovados do WhatsApp.",
          ),
        );
      }
      setLeadRoutingDrafts(draftsFromMetaLeadRoutingForms(routing.forms));
    } catch (error) {
      setLeadRoutingForms([]);
      setLeadRoutingWhatsappTemplates([]);
      setLeadRoutingError(
        getErrorMessage(
          error,
          "Não foi possível carregar o mapeamento dos formulários.",
        ),
      );
    } finally {
      setLeadRoutingLoading(false);
    }
  }

  function patchLeadRoutingDraft(
    formId: string,
    patch: Partial<MetaLeadRoutingDraft>,
  ) {
    setLeadRoutingDrafts((current) => ({
      ...current,
      [formId]: {
        ...(current[formId] ?? emptyMetaLeadRoutingDraft()),
        ...patch,
      },
    }));
  }

  async function handleSaveLeadRouting() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (!clientId || !session?.accessToken) return;

    const started = leadRoutingForms.filter((form) => {
      const draft = leadRoutingDrafts[form.id];
      return (
        draft &&
        (Boolean(draft.event_id) ||
          Boolean(draft.crm_pipeline_id) ||
          Boolean(draft.call_stage_id) ||
          Boolean(draft.whatsapp_stage_id) ||
          Boolean(draft.whatsapp_template_name))
      );
    });
    const incomplete = started.filter((form) => {
      const draft = leadRoutingDrafts[form.id];
      if (
        !draft?.event_id ||
        !draft.crm_pipeline_id ||
        !draft.call_stage_id ||
        !draft.whatsapp_stage_id
      ) {
        return true;
      }
      if (!draft.whatsapp_template_name) return false;
      const selectedTemplate = leadRoutingWhatsappTemplates.find(
        (template) =>
          template.name === draft.whatsapp_template_name &&
          template.language === draft.whatsapp_template_language,
      );
      return (
        !selectedTemplate ||
        selectedTemplate.body_parameter_count !==
          draft.whatsapp_template_parameter_keys.length ||
        draft.whatsapp_template_parameter_keys.some((key) => !key)
      );
    });
    if (incomplete.length > 0) {
      setLeadRoutingError(
        `Complete evento, pipeline, etapas e os parâmetros do template em: ${incomplete
          .map((form) => form.name)
          .join(", ")}.`,
      );
      return;
    }
    if (started.length === 0) {
      setLeadRoutingError("Configure ao menos um formulário antes de salvar.");
      return;
    }

    setLeadRoutingSaving(true);
    setLeadRoutingError(null);
    try {
      for (const form of started) {
        const draft = leadRoutingDrafts[form.id]!;
        const parameterKeys = draft.whatsapp_template_parameter_keys.filter(
          (key): key is MetaLeadWhatsappTemplateParameterKey => Boolean(key),
        );
        await upsertMetaLeadRouting(
          clientId,
          {
            form_id: form.id,
            event_id: draft.event_id,
            crm_pipeline_id: draft.crm_pipeline_id,
            call_stage_id: draft.call_stage_id,
            whatsapp_stage_id: draft.whatsapp_stage_id,
            ...(draft.whatsapp_template_name
              ? {
                  whatsapp_template_name: draft.whatsapp_template_name,
                  whatsapp_template_language: draft.whatsapp_template_language,
                  whatsapp_template_parameter_keys: parameterKeys,
                }
              : {}),
          },
          session.accessToken,
        );
      }

      const refreshed = await listMetaLeadRouting(
        clientId,
        session.accessToken,
      );
      setLeadRoutingForms(refreshed.forms);
      setLeadRoutingDrafts(draftsFromMetaLeadRoutingForms(refreshed.forms));
      pushToast({
        type: "success",
        message: `${started.length} formulário(s) configurado(s) para entrada automática.`,
      });
      setIsLeadRoutingOpen(false);
    } catch (error) {
      setLeadRoutingError(
        getErrorMessage(error, "Não foi possível salvar os mapeamentos."),
      );
    } finally {
      setLeadRoutingSaving(false);
    }
  }

  async function handleDeleteLeadRouting(form: MetaLeadRoutingForm) {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (!clientId || !session?.accessToken || !form.mapping) return;

    setLeadRoutingSaving(true);
    setLeadRoutingError(null);
    try {
      await deleteMetaLeadRouting(clientId, form.id, session.accessToken);
      setLeadRoutingForms((current) =>
        current.map((item) =>
          item.id === form.id ? { ...item, mapping: null } : item,
        ),
      );
      setLeadRoutingDrafts((current) => ({
        ...current,
        [form.id]: emptyMetaLeadRoutingDraft(),
      }));
      pushToast({
        type: "success",
        message: `Mapeamento removido de ${form.name}.`,
      });
    } catch (error) {
      setLeadRoutingError(
        getErrorMessage(error, "Não foi possível remover o mapeamento."),
      );
    } finally {
      setLeadRoutingSaving(false);
    }
  }

  async function handleOpenCampaignLink() {
    const clientId = id ?? "";
    const session = readStoredSession();

    if (!clientId || !isUuid(clientId) || !session?.accessToken) {
      pushToast({
        type: "error",
        message: "Sessão expirada. Faça login novamente.",
      });
      return;
    }

    setIsCampaignLinkOpen(true);
    setCampaignLinkLoading(true);
    setCampaignLinkError(null);

    listEvents({ client_id: clientId }, session.accessToken)
      .then((rows) =>
        setClientEvents(
          rows.map((row) => ({ id: row.id, name: row.name as string })),
        ),
      )
      .catch(() => setClientEvents([]));

    try {
      const rows = await listAssignableCampaigns(clientId, session.accessToken);
      // So as ativas: campanha pausada ou arquivada nao interessa para vincular.
      const active = rows.filter(
        (row) => (row.status ?? "").toUpperCase() === "ACTIVE",
      );
      const alreadyMine = active
        .filter((row) => row.assigned_client_id === clientId)
        .map((row) => row.meta_campaign_id);

      setAssignableCampaigns(active);
      setCheckedCampaignIds(alreadyMine);
      setInitialCampaignIds(alreadyMine);
      setCampaignEventChoice(
        Object.fromEntries(
          active.map((row) => [
            row.meta_campaign_id,
            row.assigned_event_id ?? "",
          ]),
        ),
      );
    } catch (error) {
      setAssignableCampaigns([]);
      setCampaignLinkError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as campanhas.",
      );
    } finally {
      setCampaignLinkLoading(false);
    }
  }

  async function handleSaveCampaignLinks() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (!clientId || !session?.accessToken) return;

    const token = session.accessToken;
    const toLink = checkedCampaignIds.filter(
      (campaignId) => !initialCampaignIds.includes(campaignId),
    );
    const toUnlink = initialCampaignIds.filter(
      (campaignId) => !checkedCampaignIds.includes(campaignId),
    );
    // Ja vinculada, mas o evento mudou: regrava sem passar por toLink.
    const toRelink = checkedCampaignIds.filter((campaignId) => {
      if (!initialCampaignIds.includes(campaignId)) return false;
      const atual = assignableCampaigns.find(
        (row) => row.meta_campaign_id === campaignId,
      );
      return (
        (campaignEventChoice[campaignId] ?? "") !==
        (atual?.assigned_event_id ?? "")
      );
    });

    if (toLink.length === 0 && toUnlink.length === 0 && toRelink.length === 0) {
      setIsCampaignLinkOpen(false);
      return;
    }

    setCampaignLinkSaving(true);
    try {
      // Sequencial de proposito: sao poucas campanhas, e em paralelo um erro
      // no meio deixaria o resto num estado indefinido.
      for (const campaignId of [...toLink, ...toRelink]) {
        await assignMetaCampaign(
          {
            meta_campaign_id: campaignId,
            // Guarda o nome junto: a tela mostra o vinculo sem ir na Meta.
            campaign_name: assignableCampaigns.find(
              (row) => row.meta_campaign_id === campaignId,
            )?.name,
            client_id: clientId,
            event_id: campaignEventChoice[campaignId] || null,
          },
          token,
        );
      }
      for (const campaignId of toUnlink) {
        await unassignMetaCampaign(campaignId, token);
      }

      pushToast({
        type: "success",
        message: `Vínculos atualizados: ${toLink.length} adicionada(s), ${toRelink.length} alterada(s), ${toUnlink.length} removida(s).`,
      });
      await refreshLinkedCampaigns();
      setIsCampaignLinkOpen(false);
    } catch (error) {
      setCampaignLinkError(
        error instanceof Error
          ? error.message
          : "Falha ao salvar os vínculos. Nenhuma alteração pendente foi perdida.",
      );
    } finally {
      setCampaignLinkSaving(false);
    }
  }

  /**
   * Aguarda o worker terminar, observando `last_sync_at` avancar.
   * Devolve false no estouro do prazo — a sincronizacao segue rodando, so
   * nao deu tempo de esperar.
   */
  async function waitForSyncToFinish(
    clientId: string,
    token: string,
    previousSyncedAt: string | null,
  ) {
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      await sleep(3_000);
      try {
        const status = await getMetaStatus(clientId, token);
        const syncedAt = (status.connection as { last_sync_at?: string } | null)
          ?.last_sync_at;
        if (syncedAt && syncedAt !== previousSyncedAt) {
          return true;
        }
      } catch {
        // Falha pontual de rede nao encerra a espera.
      }
    }

    return false;
  }

  async function handleSyncMeta() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (clientId && isUuid(clientId) && session?.accessToken) {
      const token = session.accessToken;
      const syncedAtBefore = metaConnection?.last_sync_at ?? null;

      setIsSyncingMeta(true);
      setMetaStatusMessage("Sincronizando com a Meta...");
      try {
        await syncMetaFull(clientId, token);
        setMetaStatusMessage(
          "Sincronização iniciada em segundo plano. Você pode continuar usando o painel.",
        );
        // A ação HTTP apenas enfileira o worker. Acompanhamos sem bloquear o
        // botão nem manter o usuário preso por até 60 segundos.
        void waitForSyncToFinish(clientId, token, syncedAtBefore).then(
          async (concluiu) => {
            if (!concluiu) return;
            await Promise.all([
              refreshMetaStatusFromApi(clientId, token),
              refreshLinkedCampaigns(),
              refreshCampaignsReport(),
            ]);
            setMetaStatusMessage("Sincronização concluída.");
          },
        );
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

  async function openLeadCreator() {
    const clientId = id ?? "";
    const session = readStoredSession();
    if (!clientId || !isUuid(clientId) || !session?.accessToken) {
      setLeadsActionMessage("Sessão expirada.");
      return;
    }

    setLeadFormName("");
    setLeadFormEmail("");
    setLeadFormPhone("");
    setLeadFormSource("manual");
    setLeadFormStatus("pending");
    setLeadFormNotes("");
    setLeadFormBirthDate("");
    setLeadCreateEventId("");
    setLeadCreatePipelineId("");
    setLeadCreateStageId("");
    setLeadsActionMessage("");
    setLeadCreating(true);
    setLeadCreateOptionsLoading(true);

    try {
      const [events, pipelines] = await Promise.all([
        listEvents({ client_id: clientId }, session.accessToken),
        listCrmPipelines(clientId, session.accessToken),
      ]);
      const activePipelines = pipelines.filter(
        (pipeline) => pipeline.is_active,
      );
      const defaultPipeline = activePipelines[0] ?? pipelines[0];
      const defaultStage = [...(defaultPipeline?.stages ?? [])].sort(
        (a, b) => a.display_order - b.display_order,
      )[0];

      setLeadRoutingEvents(
        events.map((event) => ({ id: event.id, name: event.name })),
      );
      setLeadCreatePipelines(
        activePipelines.length ? activePipelines : pipelines,
      );
      setLeadCreatePipelineId(defaultPipeline?.id ?? "");
      setLeadCreateStageId(defaultStage?.id ?? "");
    } catch (error) {
      setLeadsActionMessage(
        getErrorMessage(error, "Não foi possível carregar eventos e funis."),
      );
    } finally {
      setLeadCreateOptionsLoading(false);
    }
  }

  function closeLeadCreator() {
    if (leadSaving) return;
    setLeadCreating(false);
  }

  async function handleCreateLead() {
    const clientId = id ?? "";
    if (!leadFormName.trim()) {
      setLeadsActionMessage("Informe o nome do lead.");
      return;
    }
    if (!leadFormPhone.trim() && !leadFormEmail.trim()) {
      setLeadsActionMessage("Informe ao menos o telefone ou o e-mail do lead.");
      return;
    }

    const session = readStoredSession();
    if (!clientId || !isUuid(clientId) || !session?.accessToken) {
      setLeadsActionMessage("Sessão expirada.");
      return;
    }

    setLeadSaving(true);
    setLeadsActionMessage("");
    try {
      const created = await createLead(
        {
          client_id: clientId,
          name: leadFormName.trim(),
          email: leadFormEmail.trim() || null,
          phone: leadFormPhone.trim() || null,
          source: leadFormSource,
          event_interest_id: leadCreateEventId || null,
          crm_pipeline_id: leadCreatePipelineId || null,
          crm_stage_id: leadCreateStageId || null,
          confirmation_status: leadFormStatus,
          notes: leadFormNotes.trim() || null,
          birth_date: leadFormBirthDate || null,
        },
        session.accessToken,
      );
      const mapped = mapApiLeadToLead(created);
      setDetailLeads((current) => [mapped, ...(current ?? [])]);
      setLeadCreating(false);
      setLeadsPage(1);
      setLeadsActionMessage("Lead criado e vinculado ao cliente com sucesso.");
    } catch (error) {
      setLeadsActionMessage(
        getErrorMessage(error, "Não foi possível criar o lead."),
      );
    } finally {
      setLeadSaving(false);
    }
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

  async function handleGenerateIntegrationCredential() {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setIntegrationError("Faça login novamente para gerenciar a integração.");
      return;
    }

    setIntegrationSaving(true);
    setIntegrationError("");
    try {
      const credential = await createIntegrationCredential(
        resolvedId,
        session.accessToken,
        "n8n produção",
      );
      setRevealedIntegrationCredential(credential);
      await loadIntegrationCredentials();
      pushToast({
        message: "Chave de integração criada com sucesso.",
        type: "success",
      });
    } catch (error) {
      setIntegrationError(
        getErrorMessage(error, "Não foi possível criar a chave de integração."),
      );
    } finally {
      setIntegrationSaving(false);
    }
  }

  async function handleCopyIntegrationKey() {
    const key = revealedIntegrationCredential?.key;
    if (!key) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(key);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = key;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Falha ao copiar");
      }
      pushToast({
        message: "Chave copiada. Cole agora no n8n.",
        type: "success",
      });
    } catch {
      pushToast({
        message: "Não foi possível copiar automaticamente. Selecione a chave.",
        type: "error",
      });
    }
  }

  async function handleConfirmIntegrationAction() {
    if (!integrationAction || !isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setIntegrationError("Faça login novamente para gerenciar a integração.");
      return;
    }

    setIntegrationSaving(true);
    setIntegrationError("");
    try {
      if (integrationAction.kind === "rotate") {
        const credential = await rotateIntegrationCredential(
          resolvedId,
          integrationAction.credential.id,
          session.accessToken,
        );
        setRevealedIntegrationCredential(credential);
        pushToast({
          message: "Chave trocada. Atualize o cabeçalho no n8n.",
          type: "success",
        });
      } else {
        await revokeIntegrationCredential(
          resolvedId,
          integrationAction.credential.id,
          session.accessToken,
        );
        pushToast({
          message: "Chave de integração revogada.",
          type: "success",
        });
      }
      setIntegrationAction(null);
      await loadIntegrationCredentials();
    } catch (error) {
      setIntegrationError(
        getErrorMessage(
          error,
          integrationAction.kind === "rotate"
            ? "Não foi possível trocar a chave."
            : "Não foi possível revogar a chave.",
        ),
      );
    } finally {
      setIntegrationSaving(false);
    }
  }

  function handleOpenCompanyEdit() {
    if (!client) return;
    setCompanyEditName(client.company_name);
    setCompanyEditVehicleBrand(client.vehicle_brand);
    setCompanyEditCnpj(client.cnpj);
    setCompanyEditEmail(client.contact_email);
    setCompanyEditPhone(client.phone_number ?? "");
    setCompanyEditWhatsapp(client.whatsapp_number ?? "");
    setCompanyEditAddress(client.address);
    setCompanyEditWebhook(client.webhook_url_n8n ?? "");
    setCompanyEditError("");
    setCompanyEditOpen(true);
  }

  async function handleSaveCompanyEdit() {
    if (!isUuid(resolvedId)) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setCompanyEditError("Faça login novamente para editar a empresa.");
      return;
    }

    if (!companyEditName.trim()) {
      setCompanyEditError("Informe o nome da empresa.");
      return;
    }

    setCompanyEditLoading(true);
    setCompanyEditError("");
    try {
      const row = await updateClient(resolvedId, session.accessToken, {
        company_name: companyEditName.trim(),
        vehicle_brand: companyEditVehicleBrand || null,
        cnpj: companyEditCnpj.trim() || undefined,
        contact_email: companyEditEmail.trim() || undefined,
        phone_number: companyEditPhone.trim() || undefined,
        whatsapp_number: companyEditWhatsapp.trim() || undefined,
        address: companyEditAddress.trim() || undefined,
        webhook_url_n8n: companyEditWebhook.trim() || undefined,
      });
      setApiClient(mapApiClientToClient(row));
      setCompanyEditOpen(false);
    } catch (error) {
      setCompanyEditError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as alterações.",
      );
    } finally {
      setCompanyEditLoading(false);
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
    } catch (error) {
      // Sem isto a falha sumia: a promessa rejeitava, o loading voltava ao
      // normal e a tela nao dizia nada.
      pushToast({
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir o cliente.",
        type: "error",
      });
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

  const metaSetupRequirements = [
    Boolean(selectedBusiness),
    draftAdAccountIds.length > 0,
    draftPageIds.length > 0,
    draftFormIds.length > 0,
    true,
  ];
  const canAdvanceMetaSetup = metaSetupRequirements[metaSetupStep];
  const canSaveMetaSetup = metaSetupRequirements.slice(0, 4).every(Boolean);
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
        <button
          type="button"
          onClick={() => void handleDeleteClient()}
          disabled={deleteLoading || client.status === "active"}
          aria-label="Excluir cliente"
          title={
            client.status === "active"
              ? "Cliente ativo não pode ser excluído — desative antes"
              : "Excluir cliente"
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E51838] text-white shadow-[0_10px_22px_rgba(229,24,56,0.28)] transition-colors hover:bg-[#c01530] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
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

      <ConfirmationModal
        open={Boolean(integrationAction)}
        onClose={() =>
          integrationSaving ? undefined : setIntegrationAction(null)
        }
        onConfirm={() => void handleConfirmIntegrationAction()}
        loading={integrationSaving}
        title={
          integrationAction?.kind === "rotate"
            ? "Trocar chave de integração"
            : "Revogar chave de integração"
        }
        description={
          integrationAction?.kind === "rotate" ? (
            <p className="text-sm text-zinc-600">
              A chave atual de{" "}
              <span className="font-semibold text-zinc-900">
                {integrationAction.credential.name}
              </span>{" "}
              será invalidada imediatamente. Depois, será necessário copiar a
              nova chave para o n8n.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">
              A chave de{" "}
              <span className="font-semibold text-zinc-900">
                {integrationAction?.credential.name}
              </span>{" "}
              deixará de funcionar imediatamente. Essa ação não pode ser
              desfeita.
            </p>
          )
        }
        confirmLabel={
          integrationAction?.kind === "rotate"
            ? "Trocar chave"
            : "Revogar chave"
        }
      />

      <Modal
        open={Boolean(revealedIntegrationCredential)}
        onClose={() => setRevealedIntegrationCredential(null)}
        title="Chave de integração n8n"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRevealedIntegrationCredential(null)}
            >
              Já copiei
            </Button>
            <Button
              onClick={() => void handleCopyIntegrationKey()}
              icon={<Copy size={15} />}
            >
              Copiar chave
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Esta chave completa será exibida somente agora. Copie e salve no n8n
            antes de fechar esta janela.
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              x-leadflow-integration-key
            </p>
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-950 p-3 text-white">
              <code className="min-w-0 flex-1 select-all break-all text-xs sm:text-sm">
                {revealedIntegrationCredential?.key}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyIntegrationKey()}
                aria-label="Copiar chave"
                title="Copiar chave"
                className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={companyEditOpen}
        onClose={() => (companyEditLoading ? null : setCompanyEditOpen(false))}
        title="Editar informações da empresa"
        size="md"
        dark={isDarkMode}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCompanyEditOpen(false)}
              disabled={companyEditLoading}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCompanyEdit()}
              disabled={companyEditLoading}
              className="rounded-full bg-[#FF0636] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e1002d] disabled:opacity-60"
            >
              {companyEditLoading ? "Salvando..." : "Salvar alterações"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm text-gray-500">Razão Social</p>
            <input
              value={companyEditName}
              onChange={(event) => setCompanyEditName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm text-gray-500">CNPJ</p>
              <input
                value={companyEditCnpj}
                onChange={(event) => setCompanyEditCnpj(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">Telefone</p>
              <input
                value={companyEditPhone}
                onChange={(event) => setCompanyEditPhone(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">Marca principal</p>
            <select
              value={companyEditVehicleBrand}
              onChange={(event) =>
                setCompanyEditVehicleBrand(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Selecione uma marca</option>
              {BRAZIL_CAR_BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm text-gray-500">WhatsApp</p>
              <input
                value={companyEditWhatsapp}
                onChange={(event) => setCompanyEditWhatsapp(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">E-mail de Contato</p>
              <input
                type="email"
                value={companyEditEmail}
                onChange={(event) => setCompanyEditEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">Endereço</p>
            <input
              value={companyEditAddress}
              onChange={(event) => setCompanyEditAddress(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">Webhook n8n</p>
            <input
              value={companyEditWebhook}
              onChange={(event) => setCompanyEditWebhook(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {companyEditError ? (
            <Notice tone="error">{companyEditError}</Notice>
          ) : null}
        </div>
      </Modal>

      <Tabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        className={clsx("mb-6", isDarkMode && "border-zinc-800")}
      />

      {activeTab === "perfil" && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-900">
              Informações da Empresa
            </h3>
            <button
              type="button"
              onClick={handleOpenCompanyEdit}
              aria-label="Editar informações da empresa"
              title="Editar informações da empresa"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Pencil size={14} />
            </button>
          </div>
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
                <p className="text-gray-400">Marca principal</p>
                <p className="font-medium text-gray-900">
                  {client.vehicle_brand || "—"}
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
              <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
                <CopyableId value={client.id} label="client_id" />
                {defaultPipelineCode && (
                  <CopyableId
                    value={defaultPipelineCode}
                    label="pipeline_code"
                  />
                )}
              </div>
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

          <div className="mb-5">
            <VendorSignupLinkCard
              clientId={client.id}
              companyName={client.company_name}
              signupToken={client.vendor_signup_token}
              accessToken={readStoredSession()?.accessToken ?? ""}
              canRotate
              onRotated={(nextToken) =>
                setApiClient((prev) =>
                  prev ? { ...prev, vendor_signup_token: nextToken } : prev,
                )
              }
              onNotify={(message, type) => pushToast({ message, type })}
            />
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
                    <th className="px-4 py-3">Aprovação</th>
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
                        <ApprovalStatusBadge
                          status={member.approval_status}
                          isActive={member.is_active}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {member.approval_status === "approved" ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={staffApproving === member.id}
                              onClick={() =>
                                void handleSetStaffApproval(member, "approved")
                              }
                              className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                            >
                              {staffApproving === member.id ? "..." : "Aprovar"}
                            </button>
                            {member.approval_status === "pending" && (
                              <button
                                type="button"
                                disabled={staffApproving === member.id}
                                onClick={() =>
                                  void handleSetStaffApproval(
                                    member,
                                    "rejected",
                                  )
                                }
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                              >
                                Recusar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={
                              staffToggling === member.id ||
                              member.approval_status !== "approved"
                            }
                            title={
                              member.approval_status !== "approved"
                                ? "Aprove o cadastro primeiro"
                                : undefined
                            }
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
                            } disabled:cursor-not-allowed disabled:opacity-50`}
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
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Nome completo
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-400">
                <UserCheck size={16} />
              </div>
              <input
                type="text"
                value={staffFormName}
                onChange={(e) => setStaffFormName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full h-11 pl-10 pr-3 rounded-2xl border border-zinc-200 bg-white text-zinc-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-[#FF0636] shadow-sm"
              />
            </div>
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              E-mail de Acesso
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-400">
                <Mail size={16} />
              </div>
              <input
                type="email"
                value={staffFormEmail}
                onChange={(e) => setStaffFormEmail(e.target.value)}
                placeholder="email@empresa.com"
                className="w-full h-11 pl-10 pr-3 rounded-2xl border border-zinc-200 bg-white text-zinc-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-[#FF0636] shadow-sm"
              />
            </div>
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              WhatsApp de Contato
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-400">
                <Phone size={16} />
              </div>
              <input
                type="text"
                value={staffFormPhone}
                onChange={(e) =>
                  setStaffFormPhone(formatPhoneBr(e.target.value))
                }
                placeholder="(11) 99999-9999"
                className="w-full h-11 pl-10 pr-3 rounded-2xl border border-zinc-200 bg-white text-zinc-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-[#FF0636] shadow-sm"
              />
            </div>
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Senha Provisória
            </label>
            {staffEditing && (
              <p className="text-xs text-zinc-400">
                Deixe em branco para manter a senha atual.
              </p>
            )}
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-400">
                <Lock size={16} />
              </div>
              <input
                type={staffFormShowPassword ? "text" : "password"}
                value={staffFormPassword}
                onChange={(e) => setStaffFormPassword(e.target.value)}
                placeholder="Mínimo 10 caracteres: Maiúscula + minúscula + número"
                className="w-full h-11 pl-10 pr-10 rounded-2xl border border-zinc-200 bg-white text-zinc-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-[#FF0636] shadow-sm"
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

      {activeTab === "integracao" && (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Credenciais da integração n8n
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    Gere e administre a chave usada pelo fluxo do n8n para
                    consultar e cadastrar leads deste cliente.
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => void handleGenerateIntegrationCredential()}
                loading={integrationSaving}
                icon={<Plus size={16} />}
              >
                Gerar chave
              </Button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Cabeçalho no n8n
                </p>
                <code className="mt-1 block break-all font-semibold">
                  x-leadflow-integration-key
                </code>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Endpoint de leads
                </p>
                <code className="mt-1 block break-all font-semibold">
                  /api/integrations/v1/leads
                </code>
              </div>
            </div>

            {integrationError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {integrationError}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Chaves criadas
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  A chave completa só aparece no momento da criação ou troca.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadIntegrationCredentials()}
                loading={integrationLoading}
                icon={<RefreshCcw size={14} />}
              >
                Atualizar
              </Button>
            </div>

            {integrationLoading && integrationCredentials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
                Carregando credenciais...
              </div>
            ) : integrationCredentials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center">
                <KeyRound className="mx-auto text-gray-300" size={28} />
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  Nenhuma chave criada
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Clique em “Gerar chave” para conectar este cliente ao n8n.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {integrationCredentials.map((credential) => {
                  const active = isIntegrationCredentialActive(credential);
                  return (
                    <div
                      key={credential.id}
                      className="rounded-2xl border border-gray-200 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {credential.name}
                            </p>
                            <Badge
                              variant={
                                active
                                  ? "green"
                                  : credential.revoked_at
                                    ? "red"
                                    : "gray"
                              }
                              dot
                            >
                              {active
                                ? "Ativa"
                                : credential.revoked_at
                                  ? "Revogada"
                                  : "Expirada"}
                            </Badge>
                          </div>
                          <code className="mt-2 block break-all text-sm text-gray-600">
                            {credential.key_prefix}••••••••
                          </code>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                            <span>
                              Criada em {formatDateTime(credential.created_at)}
                            </span>
                            <span>
                              Último uso:{" "}
                              {formatDateTime(credential.last_used_at)}
                            </span>
                          </div>
                        </div>
                        {active ? (
                          <div className="flex flex-none flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setIntegrationAction({
                                  kind: "rotate",
                                  credential,
                                })
                              }
                              icon={<RefreshCcw size={14} />}
                            >
                              Trocar chave
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setIntegrationAction({
                                  kind: "revoke",
                                  credential,
                                })
                              }
                              icon={<Trash2 size={14} />}
                            >
                              Revogar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "ads" && (
        <div className="space-y-6">
          <Card
            className={clsx(
              "overflow-hidden border shadow-sm",
              isDarkMode
                ? "border-zinc-800 bg-[#0c0d11]"
                : "border-zinc-200 bg-white",
            )}
          >
            <div className="space-y-6">
              {/* SUB-ABAS INTERNAS DA ABA ADS */}
              <div
                className={clsx(
                  "flex flex-wrap items-center gap-1 border-b pb-0",
                  isDarkMode ? "border-zinc-800" : "border-zinc-200",
                )}
                role="tablist"
              >
                {ADS_SUB_TABS.map((tab) => {
                  const active = adsSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setAdsSubTab(tab.id)}
                      className={clsx(
                        "relative px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer",
                        active
                          ? "text-[#FF0636]"
                          : isDarkMode
                            ? "text-zinc-400 hover:text-zinc-200"
                            : "text-zinc-500 hover:text-zinc-800",
                      )}
                    >
                      {tab.label}
                      {active ? (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#FF0636]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {adsSubTab === "conexoes" && (
                <div
                  className={clsx(
                    "rounded-[28px] border p-6 space-y-6 shadow-sm animate-fadeIn",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-zinc-200 bg-white text-zinc-900",
                  )}
                >
                  {/* Acoes da conexao e do roteamento de leads. */}
                  <div className="flex items-center justify-end gap-2 border-b pb-5 border-zinc-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => void handleOpenLeadRouting()}
                      disabled={
                        !metaConnection ||
                        metaConnection.selected_forms.length === 0
                      }
                      className={clsx(
                        "h-11 px-5 rounded-2xl border text-xs font-bold transition-all active:scale-95 cursor-pointer inline-flex items-center gap-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
                        isDarkMode
                          ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                      )}
                      title="Definir evento e etapas de entrada para cada formulário"
                    >
                      <Route size={15} className="text-[#FF0636]" />
                      <span>Mapear leads</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSyncMeta()}
                      disabled={isSyncingMeta || !metaConnection}
                      className={clsx(
                        "h-11 px-5 rounded-2xl border text-xs font-bold transition-all active:scale-95 cursor-pointer inline-flex items-center gap-2 shadow-sm disabled:opacity-60",
                        isDarkMode
                          ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
                      )}
                      title="Sincronizar Ativos da Meta"
                    >
                      <RefreshCcw
                        size={15}
                        className={
                          isSyncingMeta ? "animate-spin text-[#FF0636]" : ""
                        }
                      />
                      <span>
                        {isSyncingMeta ? "Sincronizando..." : "Sincronizar"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void openMetaManager()}
                      className="h-11 px-6 rounded-2xl bg-[#FF0636] hover:bg-[#e1002d] text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer inline-flex items-center gap-2"
                      title="Conectar / Selecionar Business Manager"
                    >
                      <Link2 size={15} />
                      <span>
                        {metaConnection
                          ? "Conectar / Trocar BM"
                          : "Conectar BM"}
                      </span>
                    </button>
                  </div>

                  {(metaStatusLoading || metaStatusMessage) && (
                    <div
                      className={clsx(
                        "rounded-2xl border px-4 py-3 text-xs font-semibold flex items-center gap-2",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121318] text-zinc-300"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700",
                      )}
                    >
                      <RefreshCcw
                        size={14}
                        className="animate-spin text-[#FF0636]"
                      />
                      <span>
                        {metaStatusLoading
                          ? "Carregando status da integração Meta..."
                          : metaStatusMessage}
                      </span>
                    </div>
                  )}

                  {/* TABELA COM AS 5 COLUNAS SOLICITADAS: BM, PAGINA, CA, FORM, WHATSAPP */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Matriz de Ativos Vinculados
                      </h4>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {metaConnection
                          ? `Última sincronização: ${formatDateTime(metaConnection.last_sync_at)}`
                          : "Sem conexão ativa"}
                      </span>
                    </div>

                    <div
                      className={clsx(
                        "rounded-2xl border overflow-x-auto shadow-sm",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212]"
                          : "border-zinc-200 bg-white",
                      )}
                    >
                      <table className="w-full min-w-[1340px] table-fixed text-left text-xs sm:text-sm">
                        <colgroup>
                          <col className="w-[220px]" />
                          <col className="w-[165px]" />
                          <col className="w-[175px]" />
                          <col className="w-[205px]" />
                          <col className="w-[175px]" />
                          <col className="w-[220px]" />
                          <col className="w-[180px]" />
                        </colgroup>
                        <thead>
                          <tr
                            className={clsx(
                              "border-b font-extrabold uppercase tracking-wider text-[11px]",
                              isDarkMode
                                ? "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                                : "border-zinc-100 bg-zinc-50 text-zinc-600",
                            )}
                          >
                            <th className="py-3.5 px-4">
                              BM (Business Manager)
                            </th>
                            <th className="py-3.5 px-4">PÁGINA</th>
                            <th className="py-3.5 px-4">CA (Conta Anúncio)</th>
                            <th className="py-3.5 px-4">FORM (Formulários)</th>
                            <th className="py-3.5 px-4">WHATSAPP</th>
                            <th className="py-3.5 px-4">CAMPANHAS</th>
                            <th className="py-3.5 px-4 text-right">STATUS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {metaConnection ? (
                            <tr
                              className={clsx(
                                "transition-colors",
                                isDarkMode
                                  ? "hover:bg-zinc-900/50"
                                  : "hover:bg-zinc-50",
                              )}
                            >
                              {/* BM */}
                              <td className="py-4 px-4 font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <Building2
                                    size={16}
                                    className="text-[#FF0636] shrink-0"
                                  />
                                  <div>
                                    <p className="font-bold text-xs">
                                      {metaConnection.business_name}
                                    </p>
                                    <p className="text-[10px] font-mono text-zinc-400">
                                      ID: {metaConnection.business_id}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* PÁGINA */}
                              <td className="py-4 px-4 text-zinc-700 dark:text-zinc-300">
                                <CompactAssetList
                                  items={metaConnection.selected_pages.map(
                                    (page) => ({
                                      id: page.id,
                                      label: page.name,
                                      description: `ID ${page.id}`,
                                    }),
                                  )}
                                  icon={<Globe size={11} />}
                                  tone="blue"
                                  emptyLabel="Padrão da BM"
                                />
                              </td>

                              {/* CA */}
                              <td className="py-4 px-4 text-zinc-700 dark:text-zinc-300">
                                <CompactAssetList
                                  items={metaConnection.selected_ad_accounts.map(
                                    (account) => ({
                                      id: account.id,
                                      label: account.name,
                                      description: `ID ${account.id}`,
                                    }),
                                  )}
                                  icon={<Facebook size={11} />}
                                  tone="purple"
                                  emptyLabel="Sem CA vinculada"
                                />
                              </td>

                              {/* FORM */}
                              <td className="py-4 px-4 text-zinc-700 dark:text-zinc-300">
                                <CompactAssetList
                                  items={metaConnection.selected_forms.map(
                                    (form) => ({
                                      id: form.id,
                                      label: form.name,
                                      description: `Página ${form.page_id} · ID ${form.id}`,
                                    }),
                                  )}
                                  icon={<FileText size={11} />}
                                  tone="amber"
                                  emptyLabel="Sem formulários"
                                />
                              </td>

                              {/* WHATSAPP */}
                              <td className="py-4 px-4 text-zinc-700 dark:text-zinc-300">
                                <CompactAssetList
                                  items={(metaConnection.selected_whatsapps
                                    ?.length
                                    ? metaConnection.selected_whatsapps
                                    : metaConnection.selected_whatsapp
                                      ? [metaConnection.selected_whatsapp]
                                      : []
                                  ).map((whatsapp) => ({
                                    id: whatsapp.id,
                                    label: whatsapp.display_phone_number,
                                    description: `${whatsapp.name} · ID ${whatsapp.phone_number_id}`,
                                  }))}
                                  icon={<Phone size={11} />}
                                  tone="emerald"
                                  emptyLabel="Não configurado"
                                />
                              </td>

                              {/* CAMPANHAS */}
                              <td className="py-4 px-4 text-zinc-700 dark:text-zinc-300">
                                <CompactAssetList
                                  items={linkedCampaigns.map((campaign) => ({
                                    id: campaign.meta_campaign_id,
                                    label: campaign.name,
                                    description: campaign.event_name
                                      ? `Evento: ${campaign.event_name}`
                                      : `ID ${campaign.meta_campaign_id}`,
                                  }))}
                                  icon={<Megaphone size={11} />}
                                  tone="rose"
                                  emptyLabel="Nenhuma vinculada"
                                />
                              </td>

                              {/* STATUS */}
                              <td className="py-4 px-4 text-right whitespace-nowrap">
                                <div className="flex flex-col items-end gap-2">
                                  <Badge variant="green">🟢 Conectado</Badge>
                                  <button
                                    type="button"
                                    onClick={handleOpenCampaignLink}
                                    className={clsx(
                                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                                      "text-[11px] font-bold uppercase tracking-wide transition-colors",
                                      isDarkMode
                                        ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                                    )}
                                    title="Vincular campanhas da Meta a este cliente"
                                  >
                                    <Link2 size={13} />
                                    Vincular
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr
                              className={clsx(
                                "transition-colors",
                                isDarkMode
                                  ? "hover:bg-zinc-900/50"
                                  : "hover:bg-zinc-50",
                              )}
                            >
                              <td className="py-4 px-4 font-medium text-zinc-400 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <Building2
                                    size={16}
                                    className="text-zinc-400 shrink-0"
                                  />
                                  <span>Pendente de Seleção</span>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-zinc-400 italic text-xs">
                                —
                              </td>
                              <td className="py-4 px-4 text-zinc-400 font-mono text-xs">
                                —
                              </td>
                              <td className="py-4 px-4 text-zinc-400 italic text-xs">
                                —
                              </td>
                              <td className="py-4 px-4 font-mono text-xs text-zinc-400">
                                —
                              </td>
                              <td className="py-4 px-4 text-xs italic text-zinc-400">
                                —
                              </td>
                              <td className="py-4 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => void openMetaManager()}
                                  className="px-3 py-1.5 rounded-xl bg-[#FF0636] hover:bg-[#e1002d] text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Link2 size={13} />
                                  <span>Conectar BM</span>
                                </button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {adsSubTab === "campanhas" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Campanhas vinculadas
                      </h4>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Quais campanhas da Meta estão rodando para este cliente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenCampaignLink}
                      disabled={!metaConnection}
                      className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-[#FF0636] px-5 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Link2 size={15} />
                      Vincular campanhas
                    </button>
                  </div>

                  {linkedCampaigns.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {linkedCampaigns.map((campaign) => (
                        <span
                          key={campaign.meta_campaign_id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          <Megaphone size={11} />
                          {campaign.name}
                          {campaign.event_name ? (
                            <span className="text-rose-400">
                              · {campaign.event_name}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <MetaCampaignFilters
                    period={campaignPeriod}
                    onPeriodChange={setCampaignPeriod}
                    customRange={campaignCustomRange}
                    onCustomRangeChange={setCampaignCustomRange}
                    objective={campaignObjective}
                    onObjectiveChange={handleObjectiveChange}
                    statusFilter={campaignStatus}
                    onStatusChange={setCampaignStatus}
                    availableObjectives={availableObjectives}
                    columnIds={campaignColumns}
                    onColumnsChange={setCampaignColumns}
                    availableRange={availableRange}
                    isDarkMode={isDarkMode}
                  />

                  {reportError ? (
                    <Notice tone="error">{reportError}</Notice>
                  ) : null}

                  {rangeOutOfSync ? (
                    <p
                      className={clsx(
                        "rounded-2xl border px-4 py-3 text-xs",
                        isDarkMode
                          ? "border-amber-900/50 bg-amber-950/30 text-amber-300"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                      )}
                    >
                      O período escolhido está fora do que foi sincronizado
                      (&nbsp;{availableRange.from} a {availableRange.to}&nbsp;),
                      por isso os valores aparecem zerados. Rode Sincronizar na
                      aba Conexões para trazer um histórico maior.
                    </p>
                  ) : null}

                  {reportLoading ? (
                    <p className="py-12 text-center text-sm text-zinc-400">
                      Carregando campanhas...
                    </p>
                  ) : linkedCampaignsReport.length > 0 ? (
                    <div
                      className={clsx(
                        "rounded-2xl border p-4 shadow-sm",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212]"
                          : "border-zinc-200 bg-white",
                      )}
                    >
                      <p className="mb-3 text-[11px] text-zinc-400">
                        Clique na linha da campanha ou do conjunto para
                        expandir/recolher a estrutura de anúncios.
                      </p>
                      <MetaCampaignTree
                        campaigns={linkedCampaignsReport}
                        columnIds={campaignColumns}
                      />
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        "rounded-2xl border border-dashed px-6 py-12 text-center",
                        isDarkMode ? "border-zinc-800" : "border-zinc-200",
                      )}
                    >
                      <Megaphone size={28} className="mx-auto text-zinc-300" />
                      <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                        {linkedCampaigns.length === 0
                          ? "Nenhuma campanha vinculada"
                          : "Sem métricas sincronizadas"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {linkedCampaigns.length === 0
                          ? metaConnection
                            ? "Clique em Vincular campanhas para escolher quais são deste cliente."
                            : "Conecte uma BM na aba Conexões primeiro."
                          : "As campanhas estão vinculadas, mas ainda não houve sincronização. Rode Sincronizar na aba Conexões."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {adsSubTab === "relatorios" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Desempenho por campanha
                    </h4>
                    <button
                      type="button"
                      onClick={() => void refreshCampaignsReport()}
                      disabled={reportLoading}
                      className={clsx(
                        "inline-flex h-10 cursor-pointer items-center gap-2 rounded-2xl border px-4 text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60",
                        isDarkMode
                          ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
                      )}
                    >
                      <RefreshCcw
                        size={14}
                        className={
                          reportLoading ? "animate-spin text-[#FF0636]" : ""
                        }
                      />
                      Atualizar
                    </button>
                  </div>

                  {reportError ? (
                    <Notice tone="error">{reportError}</Notice>
                  ) : null}

                  {reportLoading ? (
                    <p className="py-12 text-center text-sm text-zinc-400">
                      Carregando relatório...
                    </p>
                  ) : campaignsReport.length === 0 ? (
                    <div
                      className={clsx(
                        "rounded-2xl border border-dashed px-6 py-12 text-center",
                        isDarkMode ? "border-zinc-800" : "border-zinc-200",
                      )}
                    >
                      <BarChart3 size={28} className="mx-auto text-zinc-300" />
                      <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                        Sem dados de campanha
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Rode uma sincronização na aba Conexões para trazer as
                        métricas da Meta.
                      </p>
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        "overflow-x-auto rounded-2xl border shadow-sm",
                        isDarkMode
                          ? "border-zinc-800 bg-[#121212]"
                          : "border-zinc-200 bg-white",
                      )}
                    >
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr
                            className={clsx(
                              "border-b text-[11px] font-extrabold uppercase tracking-wider",
                              isDarkMode
                                ? "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                                : "border-zinc-100 bg-zinc-50 text-zinc-600",
                            )}
                          >
                            <th className="px-4 py-3">Campanha</th>
                            <th className="px-4 py-3 text-right">Investido</th>
                            <th className="px-4 py-3 text-right">Leads</th>
                            <th className="px-4 py-3 text-right">Custo/Lead</th>
                            <th className="px-4 py-3 text-right">Conversas</th>
                            <th className="px-4 py-3 text-right">Impressões</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {campaignsReport.map((campaign) => (
                            <tr key={campaign.id}>
                              <td className="px-4 py-3">
                                <p className="font-bold text-zinc-800 dark:text-zinc-100">
                                  {campaign.name}
                                </p>
                                <p className="text-[10px] text-zinc-400">
                                  {campaign.status ?? "—"}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {formatCurrency(campaign.spend)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {campaign.leads}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {campaign.leads > 0
                                  ? formatCurrency(campaign.cost_per_lead)
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {campaign.conversations}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {campaign.impressions.toLocaleString("pt-BR")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {adsSubTab === "financeiro" && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Investimento e retorno
                  </h4>

                  {reportLoading ? (
                    <p className="py-12 text-center text-sm text-zinc-400">
                      Calculando...
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <MetaStatCard
                          label="Investido"
                          value={formatCurrency(reportTotals.spend)}
                          helper="Soma das campanhas da conta"
                          icon={<DollarSign size={16} />}
                          dark={isDarkMode}
                        />
                        <MetaStatCard
                          label="Leads"
                          value={String(reportTotals.leads)}
                          helper="Gerados pelos anúncios"
                          icon={<UserRound size={16} />}
                          dark={isDarkMode}
                        />
                        <MetaStatCard
                          label="Custo por lead"
                          value={
                            reportTotals.costPerLead === null
                              ? "—"
                              : formatCurrency(reportTotals.costPerLead)
                          }
                          helper="Investido dividido por leads"
                          icon={<BarChart3 size={16} />}
                          dark={isDarkMode}
                        />
                        <MetaStatCard
                          label="Custo por conversa"
                          value={
                            reportTotals.costPerConversation === null
                              ? "—"
                              : formatCurrency(reportTotals.costPerConversation)
                          }
                          helper="Investido por conversa iniciada"
                          icon={<MessageCircle size={16} />}
                          dark={isDarkMode}
                        />
                      </div>

                      <p
                        className={clsx(
                          "rounded-2xl border px-4 py-3 text-[11px] leading-relaxed",
                          isDarkMode
                            ? "border-zinc-800 bg-zinc-900/40 text-zinc-400"
                            : "border-zinc-200 bg-zinc-50 text-zinc-500",
                        )}
                      >
                        Os valores somam todas as campanhas da conta de anúncio
                        deste cliente. Para ver o investimento de um evento
                        específico, vincule a campanha ao evento.
                      </p>
                    </>
                  )}
                </div>
              )}

              {adsSubTab === "ia" && (
                <div
                  className={clsx(
                    "rounded-2xl border border-dashed px-6 py-16 text-center",
                    isDarkMode ? "border-zinc-800" : "border-zinc-200",
                  )}
                >
                  <Sparkles size={28} className="mx-auto text-zinc-300" />
                  <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                    Análise por IA ainda não disponível
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-xs text-zinc-400">
                    Esta aba vai cruzar investimento, leads e vendas para
                    apontar o que está performando e o que sugerir ajustar.
                    Ainda não há nada implementado no backend.
                  </p>
                </div>
              )}
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
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <MessageCircle size={18} className="text-emerald-500" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                    WhatsApp API
                  </h3>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                  Vincule números de uma ou mais BMs para disparos e conversas
                  deste cliente.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => void refreshWhatsappApi()}
                loading={whatsappApiLoading}
              >
                <RefreshCcw size={15} />
                Atualizar Meta
              </Button>
            </div>

            {!gestorMetaConnected ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                Conecte a conta Meta do gestor em Configurações antes de
                adicionar números.
              </div>
            ) : (
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                <div className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                    Business Manager
                  </label>
                  <select
                    value={whatsappApiBusinessId}
                    onChange={(event) =>
                      selectWhatsappApiBusiness(event.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-[#FF0636] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">Selecione uma BM</option>
                    {apiBusinesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>

                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                    Você pode salvar uma BM, trocar para outra e adicionar mais
                    números. Os vínculos anteriores serão preservados.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                      Números disponíveis
                    </label>
                    <span className="text-xs text-gray-400">
                      {whatsappApiPhoneIds.length} selecionado(s)
                    </span>
                  </div>

                  {whatsappApiLoading ? (
                    <div className="flex min-h-32 items-center justify-center rounded-xl border border-gray-100 dark:border-zinc-800">
                      <RefreshCcw
                        size={18}
                        className="animate-spin text-gray-400"
                      />
                    </div>
                  ) : !whatsappApiBusinessId ? (
                    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-zinc-700">
                      Selecione uma Business Manager.
                    </div>
                  ) : (apiBusinesses.find(
                      (business) => business.id === whatsappApiBusinessId,
                    )?.whatsapp_accounts.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-zinc-700">
                      Nenhum número disponível nesta BM. Verifique o acesso ao
                      ativo no Meta Business Manager.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {apiBusinesses
                        .find(
                          (business) => business.id === whatsappApiBusinessId,
                        )
                        ?.whatsapp_accounts.map((number) => {
                          const selected = whatsappApiPhoneIds.includes(
                            number.phone_number_id,
                          );
                          const primary =
                            whatsappApiPrimaryId === number.phone_number_id;
                          return (
                            <div
                              key={number.phone_number_id}
                              className={clsx(
                                "flex flex-wrap items-center gap-3 rounded-xl border p-3 transition",
                                selected
                                  ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20"
                                  : "border-gray-100 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setWhatsappApiPhoneIds((current) => {
                                    const removing = current.includes(
                                      number.phone_number_id,
                                    );
                                    const next = removing
                                      ? current.filter(
                                          (id) => id !== number.phone_number_id,
                                        )
                                      : [...current, number.phone_number_id];
                                    if (removing && primary) {
                                      setWhatsappApiPrimaryId(next[0] ?? "");
                                    } else if (!removing && next.length === 1) {
                                      setWhatsappApiPrimaryId(
                                        number.phone_number_id,
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <span
                                  className={clsx(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                                    selected
                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                      : "border-gray-300 dark:border-zinc-600",
                                  )}
                                >
                                  {selected ? <Check size={13} /> : null}
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-semibold text-gray-900 dark:text-zinc-100">
                                    {number.display_phone_number}
                                  </span>
                                  <span className="block truncate text-xs text-gray-400">
                                    {number.name} · ID {number.phone_number_id}
                                  </span>
                                </span>
                              </button>
                              {selected ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWhatsappApiPrimaryId(
                                      number.phone_number_id,
                                    )
                                  }
                                  className={clsx(
                                    "rounded-full border px-3 py-1 text-xs font-semibold",
                                    primary
                                      ? "border-[#FF0636] bg-[#FF0636]/10 text-[#FF0636]"
                                      : "border-gray-200 text-gray-500 dark:border-zinc-700 dark:text-zinc-400",
                                  )}
                                >
                                  {primary ? "Principal" : "Tornar principal"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={() => void saveWhatsappApiChannels()}
                      loading={whatsappApiSaving}
                      isDisabled={
                        !whatsappApiBusinessId || !gestorMetaConnected
                      }
                    >
                      <CheckCircle2 size={15} />
                      Salvar números desta BM
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                  Canais vinculados
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                  Números autorizados para disparos e atendimento deste cliente.
                </p>
              </div>
              <Badge
                variant={whatsappApiChannels.length ? "green" : "gray"}
                dot
              >
                {whatsappApiChannels.length} canal(is)
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {whatsappApiChannels.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-zinc-700">
                  Nenhum número vinculado.
                </div>
              ) : (
                whatsappApiChannels.map((channel) => {
                  const option = apiBusinesses
                    .find((business) => business.id === channel.business_id)
                    ?.whatsapp_accounts.find(
                      (item) =>
                        item.phone_number_id === channel.phone_number_id,
                    );
                  return (
                    <div
                      key={channel.id}
                      className="rounded-xl border border-gray-100 p-4 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-zinc-100">
                            {option?.display_phone_number ??
                              channel.phone_number_id}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-400">
                            {channel.business_name}
                          </p>
                        </div>
                        {channel.is_primary ? (
                          <Badge variant="red">Principal</Badge>
                        ) : (
                          <Badge variant="green" dot>
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <p className="mt-3 break-all font-mono text-[10px] text-gray-400">
                        phone_number_id: {channel.phone_number_id}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
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
                  onClick={() => void handleAutomaticVehicleImport()}
                  loading={automaticVehicleImporting}
                  className="bg-[#E51838] text-white transition-colors hover:bg-[#c01530]"
                  size="sm"
                  icon={<Sparkles size={14} />}
                >
                  Importar automático
                </Button>
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
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} />}
                >
                  Novo Veículo
                </Button>
              </div>
            </div>

            {automaticVehicleImportMessage && (
              <div
                className={clsx(
                  "rounded-xl border px-4 py-3 text-sm",
                  automaticVehicleImportMessage.includes("Não foi possível") ||
                    automaticVehicleImportMessage.includes("Defina uma marca")
                    ? isDarkMode
                      ? "border-red-900/60 bg-red-950/40 text-red-300"
                      : "border-red-200 bg-red-50 text-red-700"
                    : isDarkMode
                      ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                )}
              >
                {automaticVehicleImportMessage}
              </div>
            )}

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
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "all" ||
                    value === "available" ||
                    value === "hidden"
                  ) {
                    setVehiclesStatusFilter(value);
                  }
                }}
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
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => void openLeadCreator()}
                >
                  Criar lead
                </Button>
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
        title="Configurar conexão Meta"
        size="3xl"
        dark={isDarkMode}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsMetaModalOpen(false)}
            >
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {metaSetupStep > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    goToMetaStep((metaSetupStep - 1) as MetaSetupStep)
                  }
                >
                  <ArrowLeft size={15} />
                  Voltar
                </Button>
              ) : null}
              {metaSetupStep < 3 ? (
                <Button
                  onClick={() =>
                    goToMetaStep((metaSetupStep + 1) as MetaSetupStep)
                  }
                  isDisabled={!canAdvanceMetaSetup}
                >
                  Continuar
                  <ArrowRight size={15} />
                </Button>
              ) : (
                <Button
                  onClick={() => void handleSaveMetaConnection()}
                  loading={isSavingMeta}
                  isDisabled={
                    !canSaveMetaSetup || (isApiClient && !gestorMetaConnected)
                  }
                >
                  <CheckCircle2 size={16} />
                  Salvar conexão
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <nav
            aria-label="Etapas da conexão Meta"
            className="grid grid-cols-4 gap-1 rounded-[22px] border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-950/70"
          >
            {META_SETUP_STEPS.map((step, index) => {
              const canVisit =
                index === 0 ||
                metaSetupRequirements.slice(0, index).every(Boolean);
              const active = metaSetupStep === index;
              const completed =
                index < metaSetupStep && metaSetupRequirements[index];

              return (
                <button
                  key={step.shortTitle}
                  type="button"
                  disabled={!canVisit}
                  onClick={() => goToMetaStep(index as MetaSetupStep)}
                  className={clsx(
                    "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-2 text-center transition",
                    active
                      ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-700"
                      : canVisit
                        ? "text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        : "cursor-not-allowed text-zinc-300 dark:text-zinc-700",
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-xl text-[11px] font-semibold transition",
                      active
                        ? "bg-[#FF0636] text-white"
                        : completed
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                    )}
                  >
                    {completed ? (
                      <Check size={14} strokeWidth={3} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="w-full truncate text-[10px] font-medium sm:text-[11px]">
                    {step.shortTitle}
                  </span>
                </button>
              );
            })}
          </nav>

          <MetaSelectionSummary
            accountCount={draftAdAccountIds.length}
            pageCount={draftPageIds.length}
            formCount={draftFormIds.length}
          />

          <section className="rounded-[26px] border border-zinc-200 bg-[#fcfbf8] p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex items-start gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm dark:bg-zinc-950 dark:text-zinc-200">
                {META_SETUP_STEPS[metaSetupStep].icon}
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#d90030]">
                  Etapa {metaSetupStep + 1} de {META_SETUP_STEPS.length}
                </p>
                <h3 className="mt-0.5 text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {META_SETUP_STEPS[metaSetupStep].title}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {META_SETUP_STEPS[metaSetupStep].description}
                </p>
              </div>
            </div>

            {metaSetupStep === 0 ? (
              <>
                {metaBusinessesLoading ? (
                  <p className="mb-3 text-xs font-medium text-zinc-500">
                    Carregando Business Managers da conta Meta...
                  </p>
                ) : null}
                <MetaAssetPicker
                  items={availableBusinesses.map((business) => ({
                    id: business.id,
                    label: business.name,
                    description: `${business.ad_accounts.length} contas · ${business.pages.length} páginas · ${business.forms.length} formulários · ID ${business.id}`,
                  }))}
                  selectedIds={draftBusinessId ? [draftBusinessId] : []}
                  onToggle={handleBusinessChange}
                  emptyLabel="Nenhuma BM carregada. Conecte a Meta em Configurações."
                  search={metaSetupSearch}
                  onSearchChange={setMetaSetupSearch}
                  searchPlaceholder="Buscar Business Manager por nome ou ID"
                  mode="single"
                />
              </>
            ) : null}

            {metaSetupStep === 1 && selectedBusiness ? (
              <MetaAssetPicker
                items={selectedBusiness.ad_accounts.map((item) => ({
                  id: item.id,
                  label: item.name,
                  description: `ID ${item.id}`,
                }))}
                selectedIds={draftAdAccountIds}
                onToggle={(value) =>
                  toggleSelection(
                    draftAdAccountIds,
                    value,
                    setDraftAdAccountIds,
                  )
                }
                emptyLabel="Nenhuma conta de anúncio disponível nesta BM."
                search={metaSetupSearch}
                onSearchChange={setMetaSetupSearch}
                searchPlaceholder="Buscar conta por nome ou ID"
                onSelectVisible={(ids) =>
                  toggleVisibleMetaSelection(
                    draftAdAccountIds,
                    ids,
                    setDraftAdAccountIds,
                  )
                }
                onClear={() => setDraftAdAccountIds([])}
              />
            ) : null}

            {metaSetupStep === 2 && selectedBusiness ? (
              <MetaAssetPicker
                items={selectedBusiness.pages.map((item) => ({
                  id: item.id,
                  label: item.name,
                  description: `ID ${item.id}`,
                }))}
                selectedIds={draftPageIds}
                onToggle={(value) =>
                  toggleSelection(draftPageIds, value, setDraftPageIds)
                }
                emptyLabel="Nenhuma página disponível nesta BM."
                search={metaSetupSearch}
                onSearchChange={setMetaSetupSearch}
                searchPlaceholder="Buscar página por nome ou ID"
                onSelectVisible={(ids) =>
                  toggleVisibleMetaSelection(draftPageIds, ids, setDraftPageIds)
                }
                onClear={() => setDraftPageIds([])}
              />
            ) : null}

            {metaSetupStep === 3 && selectedBusiness ? (
              <>
                <div className="mb-3 rounded-2xl border border-[#FF0636]/15 bg-[#FF0636]/[0.035] px-3 py-2.5 text-xs leading-5 text-zinc-600 dark:border-[#FF0636]/30 dark:bg-[#FF0636]/10 dark:text-zinc-300">
                  Formulários das páginas selecionadas aparecem primeiro. A
                  busca também encontra pelo ID da página ou do formulário.
                </div>
                <MetaAssetPicker
                  items={orderedMetaForms.map((item) => ({
                    id: item.id,
                    label: item.name,
                    description: `Página ${item.page_id} · ID ${item.id}`,
                  }))}
                  selectedIds={draftFormIds}
                  onToggle={(value) =>
                    toggleSelection(draftFormIds, value, setDraftFormIds)
                  }
                  emptyLabel="Nenhum formulário disponível nesta BM."
                  search={metaSetupSearch}
                  onSearchChange={setMetaSetupSearch}
                  searchPlaceholder="Buscar formulário por nome, ID ou página"
                  onSelectVisible={(ids) =>
                    toggleVisibleMetaSelection(
                      draftFormIds,
                      ids,
                      setDraftFormIds,
                    )
                  }
                  onClear={() => setDraftFormIds([])}
                />
              </>
            ) : null}
          </section>
        </div>
      </Modal>

      <Modal
        open={isLeadRoutingOpen}
        onClose={() => (leadRoutingSaving ? null : setIsLeadRoutingOpen(false))}
        title="Mapear entrada dos leads"
        size="3xl"
        dark={isDarkMode}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsLeadRoutingOpen(false)}
              isDisabled={leadRoutingSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveLeadRouting()}
              loading={leadRoutingSaving}
              isDisabled={leadRoutingLoading || leadRoutingForms.length === 0}
            >
              <CheckCircle2 size={16} />
              Salvar mapeamentos
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div
            className={clsx(
              "rounded-2xl border px-4 py-3",
              isDarkMode
                ? "border-zinc-800 bg-zinc-900/60"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Defina o destino de cada formulário selecionado
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  O cliente é identificado pelo formulário. O canal informado
                  pelo lead decide entre a etapa de ligação e a etapa de
                  WhatsApp; o template automático só é enviado no segundo caso.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {
                    leadRoutingForms.filter((form) => form.mapping !== null)
                      .length
                  }{" "}
                  configurados
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {
                    leadRoutingForms.filter((form) => form.mapping === null)
                      .length
                  }{" "}
                  pendentes
                </span>
              </div>
            </div>
          </div>

          {leadRoutingError ? (
            <Notice tone="error">{leadRoutingError}</Notice>
          ) : null}

          {leadRoutingWhatsappTemplatesWarning ? (
            <Notice tone="warning">
              {leadRoutingWhatsappTemplatesWarning} O roteamento ainda pode ser
              salvo sem mensagem automática.
            </Notice>
          ) : null}

          {leadRoutingLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
              <RefreshCcw size={16} className="animate-spin text-[#FF0636]" />
              Carregando formulários, eventos, etapas e templates...
            </div>
          ) : leadRoutingForms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-5 py-12 text-center dark:border-zinc-700">
              <FileText size={24} className="mx-auto mb-3 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Nenhum formulário selecionado
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Selecione os formulários na conexão Meta antes de criar o
                mapeamento.
              </p>
            </div>
          ) : (
            <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
              {leadRoutingForms.map((form) => {
                const draft =
                  leadRoutingDrafts[form.id] ?? emptyMetaLeadRoutingDraft();
                const pipeline = leadRoutingPipelines.find(
                  (item) => item.id === draft.crm_pipeline_id,
                );
                const stages = pipeline?.stages ?? [];
                const selectedWhatsappTemplate =
                  leadRoutingWhatsappTemplates.find(
                    (template) =>
                      template.name === draft.whatsapp_template_name &&
                      template.language === draft.whatsapp_template_language,
                  ) ?? null;
                const selectedWhatsappTemplateValue = selectedWhatsappTemplate
                  ? selectedWhatsappTemplate.id
                  : draft.whatsapp_template_name
                    ? "current-unavailable"
                    : "";
                const selectClass = clsx(
                  "h-10 w-full rounded-xl border px-3 text-sm font-normal outline-none transition focus:border-[#FF0636]/60 focus:ring-2 focus:ring-[#FF0636]/10 disabled:cursor-not-allowed disabled:opacity-50",
                  isDarkMode
                    ? "border-zinc-700 bg-zinc-950 text-zinc-100"
                    : "border-zinc-200 bg-white text-zinc-800",
                );

                return (
                  <article
                    key={form.id}
                    className={clsx(
                      "rounded-[22px] border p-4",
                      form.mapping
                        ? isDarkMode
                          ? "border-emerald-900/70 bg-emerald-950/10"
                          : "border-emerald-200 bg-emerald-50/20"
                        : isDarkMode
                          ? "border-zinc-800 bg-zinc-900/35"
                          : "border-zinc-200 bg-white",
                    )}
                  >
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {form.name}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                            ID {form.id}
                            {form.page_id ? ` · Página ${form.page_id}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-1 text-[10px] font-medium",
                            form.mapping
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                          )}
                        >
                          {form.mapping ? "Configurado" : "Pendente"}
                        </span>
                        {form.mapping ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteLeadRouting(form)}
                            disabled={leadRoutingSaving}
                            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                            title="Remover mapeamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <label className="space-y-1.5">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Evento
                        </span>
                        <select
                          value={draft.event_id}
                          onChange={(event) =>
                            patchLeadRoutingDraft(form.id, {
                              event_id: event.target.value,
                            })
                          }
                          className={selectClass}
                        >
                          <option value="">Selecione o evento</option>
                          {leadRoutingEvents.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Pipeline
                        </span>
                        <select
                          value={draft.crm_pipeline_id}
                          onChange={(event) =>
                            patchLeadRoutingDraft(form.id, {
                              crm_pipeline_id: event.target.value,
                              call_stage_id: "",
                              whatsapp_stage_id: "",
                            })
                          }
                          className={selectClass}
                        >
                          <option value="">Selecione o pipeline</option>
                          {leadRoutingPipelines.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          <Phone size={12} />
                          Se escolheu ligação
                        </span>
                        <select
                          value={draft.call_stage_id}
                          onChange={(event) =>
                            patchLeadRoutingDraft(form.id, {
                              call_stage_id: event.target.value,
                            })
                          }
                          disabled={!pipeline}
                          className={selectClass}
                        >
                          <option value="">Etapa de ligação</option>
                          {stages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          <MessageCircle size={12} />
                          Se escolheu WhatsApp
                        </span>
                        <select
                          value={draft.whatsapp_stage_id}
                          onChange={(event) =>
                            patchLeadRoutingDraft(form.id, {
                              whatsapp_stage_id: event.target.value,
                            })
                          }
                          disabled={!pipeline}
                          className={selectClass}
                        >
                          <option value="">Etapa de WhatsApp</option>
                          {stages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div
                      className={clsx(
                        "mt-4 rounded-2xl border p-3.5",
                        isDarkMode
                          ? "border-zinc-800 bg-zinc-950/70"
                          : "border-zinc-200 bg-zinc-50/80",
                      )}
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.6fr)]">
                        <label className="space-y-1.5">
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            <MessageCircle size={12} />
                            Template automático do WhatsApp
                          </span>
                          <select
                            value={selectedWhatsappTemplateValue}
                            onChange={(event) => {
                              const template =
                                leadRoutingWhatsappTemplates.find(
                                  (item) => item.id === event.target.value,
                                ) ?? null;
                              patchLeadRoutingDraft(form.id, {
                                whatsapp_template_name: template?.name ?? "",
                                whatsapp_template_language:
                                  template?.language ?? "",
                                whatsapp_template_parameter_keys: template
                                  ? defaultMetaTemplateParameters(
                                      template.body_parameter_count,
                                    )
                                  : [],
                              });
                            }}
                            className={selectClass}
                          >
                            <option value="">
                              Não enviar mensagem automática
                            </option>
                            {draft.whatsapp_template_name &&
                            !selectedWhatsappTemplate ? (
                              <option value="current-unavailable" disabled>
                                {draft.whatsapp_template_name} · indisponível
                              </option>
                            ) : null}
                            {leadRoutingWhatsappTemplates.map((template) => (
                              <option
                                key={template.id}
                                value={template.id}
                                disabled={!template.supported}
                              >
                                {template.name} · {template.language}
                                {!template.supported
                                  ? " · cabeçalho não suportado"
                                  : ""}
                              </option>
                            ))}
                          </select>
                          <span className="block text-[10px] leading-4 text-zinc-400">
                            Só é enviado quando o lead escolher WhatsApp. Em
                            ligação, nenhum template é disparado.
                          </span>
                        </label>

                        <div className="min-w-0">
                          {selectedWhatsappTemplate ? (
                            <>
                              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                                  Prévia do corpo ·{" "}
                                  {selectedWhatsappTemplate.category ?? "Meta"}
                                </p>
                                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                                  {selectedWhatsappTemplate.body_text ??
                                    "Template sem texto de corpo."}
                                </p>
                              </div>

                              {selectedWhatsappTemplate.body_parameter_count >
                              0 ? (
                                <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  {Array.from(
                                    {
                                      length:
                                        selectedWhatsappTemplate.body_parameter_count,
                                    },
                                    (_, parameterIndex) => (
                                      <label
                                        key={parameterIndex}
                                        className="space-y-1"
                                      >
                                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                                          Parâmetro{" "}
                                          {`{{${parameterIndex + 1}}}`}
                                        </span>
                                        <select
                                          value={
                                            draft
                                              .whatsapp_template_parameter_keys[
                                              parameterIndex
                                            ] ?? ""
                                          }
                                          onChange={(event) => {
                                            const parameterKeys = [
                                              ...draft.whatsapp_template_parameter_keys,
                                            ];
                                            parameterKeys[parameterIndex] =
                                              event.target.value as
                                                | MetaLeadWhatsappTemplateParameterKey
                                                | "";
                                            patchLeadRoutingDraft(form.id, {
                                              whatsapp_template_parameter_keys:
                                                parameterKeys,
                                            });
                                          }}
                                          className={selectClass}
                                        >
                                          <option value="">
                                            Escolha o conteúdo
                                          </option>
                                          {META_LEAD_TEMPLATE_PARAMETER_OPTIONS.map(
                                            (option) => (
                                              <option
                                                key={option.value}
                                                value={option.value}
                                              >
                                                {option.label}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </label>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p className="mt-2 text-[10px] text-zinc-400">
                                  Este template não possui parâmetros dinâmicos.
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="flex min-h-20 items-center rounded-xl border border-dashed border-zinc-300 px-4 text-xs leading-5 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                              Selecione um template aprovado para visualizar o
                              texto e definir cada campo dinâmico.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!leadRoutingLoading &&
          leadRoutingForms.length > 0 &&
          (leadRoutingEvents.length === 0 ||
            leadRoutingPipelines.length === 0) ? (
            <Notice tone="warning">
              Cadastre ao menos um evento e um pipeline ativo para concluir o
              mapeamento.
            </Notice>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={isCampaignLinkOpen}
        onClose={() => setIsCampaignLinkOpen(false)}
        title="Vincular campanhas"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsCampaignLinkOpen(false)}
              disabled={campaignLinkSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCampaignLinks}
              disabled={campaignLinkLoading || campaignLinkSaving}
            >
              {campaignLinkSaving ? "Salvando..." : "Salvar vínculos"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Marque as campanhas que estão rodando para{" "}
            <span className="font-bold text-zinc-700 dark:text-zinc-200">
              {client?.company_name ?? "este cliente"}
            </span>
            . Só aparecem campanhas ativas da conta de anúncio conectada.
          </p>

          {campaignLinkError ? (
            <Notice tone="error">{campaignLinkError}</Notice>
          ) : null}

          {campaignLinkLoading ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              Carregando campanhas da Meta...
            </p>
          ) : assignableCampaigns.length === 0 && !campaignLinkError ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              Nenhuma campanha ativa encontrada nesta conta de anúncio.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {assignableCampaigns.map((campaign) => {
                const checked = checkedCampaignIds.includes(
                  campaign.meta_campaign_id,
                );
                // Vinculada a outro cliente: avisa antes de roubar a campanha.
                const takenByOther =
                  campaign.assigned_client_id !== null &&
                  campaign.assigned_client_id !== resolvedId;

                return (
                  <li key={campaign.meta_campaign_id}>
                    <label
                      className={clsx(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                        checked
                          ? "border-[#FF0636] bg-[#FF0636]/5"
                          : isDarkMode
                            ? "border-zinc-800 hover:bg-zinc-900/60"
                            : "border-zinc-200 hover:bg-zinc-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setCheckedCampaignIds((current) =>
                            event.target.checked
                              ? [...current, campaign.meta_campaign_id]
                              : current.filter(
                                  (value) =>
                                    value !== campaign.meta_campaign_id,
                                ),
                          );
                        }}
                        className="h-4 w-4 shrink-0 accent-[#FF0636]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {campaign.name}
                        </span>
                        {takenByOther ? (
                          <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            Hoje vinculada a outro cliente
                          </span>
                        ) : null}
                      </span>

                      {/* O evento e o que permite somar investimento por evento. */}
                      {checked ? (
                        <select
                          value={
                            campaignEventChoice[campaign.meta_campaign_id] ?? ""
                          }
                          onChange={(event) => {
                            event.stopPropagation();
                            setCampaignEventChoice((current) => ({
                              ...current,
                              [campaign.meta_campaign_id]: event.target.value,
                            }));
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className={clsx(
                            "h-8 max-w-[190px] shrink-0 cursor-pointer rounded-lg border px-2 text-[11px] font-medium",
                            isDarkMode
                              ? "border-zinc-700 bg-zinc-900 text-zinc-200"
                              : "border-zinc-200 bg-white text-zinc-700",
                          )}
                          title="Evento ao qual esta campanha pertence"
                        >
                          <option value="">Sem evento</option>
                          {clientEvents.map((eventOption) => (
                            <option key={eventOption.id} value={eventOption.id}>
                              {eventOption.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(leadProfileOpen)}
        onClose={closeLeadProfile}
        title="Perfil do lead"
        size="2xl"
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

            <LeadProfileCategories
              lead={leadProfileOpen}
              vendorName={
                staffList.find(
                  (member) => member.id === leadProfileOpen.assigned_vendor_id,
                )?.name ?? null
              }
              dark={isDarkMode}
            />

            <div className="hidden grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Marca do veículo
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.vehicle_brand || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Modelo do veículo
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.vehicle_model || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Ano do veículo
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.vehicle_year || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Valor FIPE
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.vehicle_fipe_value || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Formulário Meta
                </p>
                <p className="break-all text-sm font-medium text-gray-900">
                  {leadProfileOpen.facebook_form_id || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Campanha
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.facebook_campaign_name || "—"}
                </p>
                <p className="break-all text-xs text-gray-500">
                  {leadProfileOpen.facebook_campaign_id || ""}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Conjunto de anúncios
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.facebook_ad_set_name || "—"}
                </p>
                <p className="break-all text-xs text-gray-500">
                  {leadProfileOpen.facebook_ad_set_id || ""}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Anúncio
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.facebook_ad_name || "—"}
                </p>
                <p className="break-all text-xs text-gray-500">
                  {leadProfileOpen.facebook_ad_id || ""}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Canal preferido
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {leadProfileOpen.preferred_contact_channel || "—"}
                </p>
              </div>
              <div className="space-y-1.5 rounded-xl border border-gray-200 p-4 sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Respostas do formulário
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-gray-700">
                  {leadProfileOpen.source_payload?.todos_os_campos
                    ? JSON.stringify(
                        leadProfileOpen.source_payload.todos_os_campos,
                        null,
                        2,
                      )
                    : "—"}
                </pre>
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
        open={leadCreating}
        onClose={closeLeadCreator}
        title="Criar lead"
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeLeadCreator}
              isDisabled={leadSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreateLead()}
              loading={leadSaving}
              isDisabled={leadCreateOptionsLoading}
            >
              Criar lead
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-500">Cliente</span>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
              {apiClient?.company_name ?? "Cliente selecionado"}
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">
              Nome completo
            </span>
            <input
              autoFocus
              value={leadFormName}
              onChange={(event) => setLeadFormName(event.target.value)}
              placeholder="Nome do lead"
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
              placeholder="+55 (00) 00000-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">E-mail</span>
            <input
              type="email"
              value={leadFormEmail}
              onChange={(event) => setLeadFormEmail(event.target.value)}
              placeholder="lead@email.com"
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
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-gray-500">
              Evento de interesse
            </span>
            <select
              value={leadCreateEventId}
              onChange={(event) => setLeadCreateEventId(event.target.value)}
              disabled={leadCreateOptionsLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            >
              <option value="">Sem evento vinculado</option>
              {leadRoutingEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">
              Pipeline
            </span>
            <select
              value={leadCreatePipelineId}
              onChange={(event) => {
                const pipelineId = event.target.value;
                const pipeline = leadCreatePipelines.find(
                  (item) => item.id === pipelineId,
                );
                const firstStage = [...(pipeline?.stages ?? [])].sort(
                  (a, b) => a.display_order - b.display_order,
                )[0];
                setLeadCreatePipelineId(pipelineId);
                setLeadCreateStageId(firstStage?.id ?? "");
              }}
              disabled={leadCreateOptionsLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            >
              <option value="">Sem pipeline</option>
              {leadCreatePipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500">
              Etapa inicial
            </span>
            <select
              value={leadCreateStageId}
              onChange={(event) => setLeadCreateStageId(event.target.value)}
              disabled={leadCreateOptionsLoading || !leadCreatePipelineId}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            >
              <option value="">Selecione uma etapa</option>
              {(
                leadCreatePipelines.find(
                  (pipeline) => pipeline.id === leadCreatePipelineId,
                )?.stages ?? []
              )
                .slice()
                .sort((a, b) => a.display_order - b.display_order)
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
            </select>
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
              rows={3}
              placeholder="Informações adicionais sobre o lead"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
        </div>
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
