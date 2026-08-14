import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarPlus,
  CarFront,
  Camera,
  CheckCircle2,
  KanbanSquare,
  Loader2,
  Lock,
  MoonStar,
  PanelLeft,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Trophy,
  Trash2,
  Unplug,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { ApprovalStatusBadge } from "../../components/ui/Badge";
import { Notice } from "../../components/ui/Notice";
import { Button } from "../../components/ui/Button";
import { CopyableId } from "../../components/ui/CopyableId";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Tabs } from "../../components/ui/Tabs";
import {
  changePassword,
  clearStoredSession,
  readStoredSession,
  updateOwnProfile,
  uploadAvatar,
  writeStoredSession,
} from "../../services/auth";
import { notifyAuthSessionUpdated } from "../../services/auth-session";
import { API_BASE } from "../../services/http";
import {
  listClients,
  mapApiClientToClient,
  updateClient,
} from "../../services/clients";
import {
  createAccessUser,
  deleteStaffUser,
  listUsers,
  toggleUserActive,
  updateStaffUser,
  type StaffUser,
} from "../../services/users";
import { listCrmPipelines } from "../../services/crm";
import { listEvents, updateEvent, type ApiEvent } from "../../services/events";
import {
  disconnectMetaGestor,
  getMetaGestorStatus,
  startMetaGestorConnect,
  type MetaGestorStatusResponse,
} from "../../services/meta";
import {
  applyDashboardDarkEnabled,
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import {
  isLocallyReasonablePassword,
  PASSWORD_REQUIREMENTS_HINT,
} from "../../lib/passwordPolicy";
import { resolvePublicWebOrigin } from "../../utils/publicWebOrigin";
import type {
  Client,
  ConfirmationStatus,
  CrmStageStatusRule,
  VendorCategory,
} from "../../types";

const SETTINGS_STORAGE_KEY = "painelgrid:settings";
const META_CONNECT_POLL_INTERVAL_MS = 1500;
const META_CONNECT_POLL_LIMIT = 80;

type Preferences = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  compactSidebar: boolean;
  darkDashboard: boolean;
};

const ACCESS_ROLE_ORDER = [
  "gestor",
  "cliente",
  "vendedor",
  "recepcao",
] as const;
const ACCESS_ROLE_LABELS: Record<(typeof ACCESS_ROLE_ORDER)[number], string> = {
  gestor: "Gestores",
  cliente: "Acesso do cliente",
  vendedor: "Vendedores",
  recepcao: "Recepção",
};

type AccessRole = (typeof ACCESS_ROLE_ORDER)[number];
type AccessFormState = {
  name: string;
  email: string;
  password: string;
  role: AccessRole;
  client_id: string;
  phone: string;
  vendor_categories: VendorCategory[];
};

const EMPTY_ACCESS_FORM: AccessFormState = {
  name: "",
  email: "",
  password: "",
  role: "gestor",
  client_id: "",
  phone: "",
  vendor_categories: [],
};

const ACCESS_ROLE_OPTIONS = [
  { value: "gestor", label: "Gestor" },
  { value: "cliente", label: "Cliente" },
  { value: "vendedor", label: "Vendedor" },
  { value: "recepcao", label: "Recepção" },
];

const VENDOR_CATEGORY_OPTIONS: Array<{
  value: VendorCategory;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "semininovo", label: "Seminovo" },
  { value: "pdc", label: "PCD" },
  { value: "consorcio", label: "Consórcio" },
  { value: "assinatura", label: "Assinatura" },
];

type SettingsTab =
  | "perfil"
  | "ads"
  | "crm"
  | "pontuacao"
  | "evento"
  | "acessos"
  | "preferencias";

export type ClientScoreRules = {
  scheduled_points: number;
  checkin_points: number;
  sold_points: number;
};

const DEFAULT_SCORE_RULES: ClientScoreRules = {
  scheduled_points: 2,
  checkin_points: 3,
  sold_points: 7,
};

type CrmRuleDraft = Record<ConfirmationStatus, string>;

const CRM_STATUS_OPTIONS: Array<{ value: ConfirmationStatus; label: string }> =
  [
    { value: "pending", label: "Pendente" },
    { value: "scheduled", label: "Agendado" },
    { value: "confirmed", label: "Confirmado" },
    { value: "checked_in", label: "Check-in" },
    { value: "cancelled", label: "Cancelado" },
  ];

const EMPTY_CRM_RULE_DRAFT: CrmRuleDraft = {
  pending: "",
  scheduled: "",
  confirmed: "",
  checked_in: "",
  cancelled: "",
  closed: "",
};

const roleLabel: Record<string, string> = {
  gestor: "Gestor",
  cliente: "Cliente",
  vendedor: "Vendedor",
  recepcao: "Recepção",
};

function parseStoredPreferences(): Partial<Preferences> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Ignora dados inválidos e utiliza valores padrão.
  }

  return {};
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
  dark,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 rounded-2xl border p-4",
        dark ? "border-zinc-700 bg-[#141414]" : "border-zinc-100 bg-zinc-50",
      )}
    >
      <div className="min-w-0">
        <div
          className={clsx(
            "flex items-center gap-2 text-sm font-semibold",
            dark ? "text-zinc-100" : "text-zinc-900",
          )}
        >
          <span
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded-xl",
              dark ? "bg-[#1f1f1f] text-zinc-400" : "bg-white text-zinc-600",
            )}
          >
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </div>
        <p
          className={clsx(
            "mt-1 text-xs",
            dark ? "text-zinc-400" : "text-zinc-500",
          )}
        >
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 rounded-full transition-colors ${
          checked ? "bg-[#E51838]" : dark ? "bg-zinc-700" : "bg-zinc-300"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export function ConfiguracaoPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>("perfil");
  const [savedMessage, setSavedMessage] = useState("");
  const [metaStatus, setMetaStatus] = useState<MetaGestorStatusResponse | null>(
    null,
  );
  const [metaLoading, setMetaLoading] = useState(user.role === "gestor");
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMessage, setMetaMessage] = useState("");
  const metaConnectPollRef = useRef<number | null>(null);

  // Aba "Acessos": quem tem conta no painel, carregado sob demanda.
  const [accessUsers, setAccessUsers] = useState<StaffUser[]>([]);
  const [accessCompanies, setAccessCompanies] = useState<
    Record<string, string>
  >({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessEditing, setAccessEditing] = useState<StaffUser | null>(null);
  const [accessForm, setAccessForm] =
    useState<AccessFormState>(EMPTY_ACCESS_FORM);
  const [accessFormError, setAccessFormError] = useState("");
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessActionUserId, setAccessActionUserId] = useState("");
  const [accessDeleteTarget, setAccessDeleteTarget] =
    useState<StaffUser | null>(null);
  const [accessDeleteSaving, setAccessDeleteSaving] = useState(false);

  const [preferences, setPreferences] = useState<Preferences>(() => {
    const stored = parseStoredPreferences();
    return {
      emailNotifications: stored.emailNotifications ?? true,
      pushNotifications: stored.pushNotifications ?? true,
      compactSidebar:
        stored.compactSidebar ??
        (typeof window !== "undefined" &&
          window.localStorage.getItem("layout:sidebar-collapsed") === "1"),
      darkDashboard: readDashboardDarkEnabled(user.id),
    };
  });

  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    company: user.company_name ?? "",
  });
  const [userCompanyCnpj, setUserCompanyCnpj] = useState("");

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    void listClients(token)
      .then((rows) => {
        const mapped = rows.map(mapApiClientToClient);
        setCrmClients(mapped);

        const matched =
          mapped.find(
            (c) =>
              (user.client_id && c.id === user.client_id) ||
              (user.company_name &&
                c.company_name.toLowerCase() ===
                  user.company_name.toLowerCase()),
          ) ?? mapped[0];

        if (matched) {
          setProfile((prev) => ({
            ...prev,
            company: matched.company_name,
          }));
          setUserCompanyCnpj(matched.cnpj || "");
        }
      })
      .catch(() => {
        // silent
      });
  }, [user.client_id, user.company_name]);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmMessage, setCrmMessage] = useState("");
  const [selectedCrmClientId, setSelectedCrmClientId] = useState("");
  const [selectedScoreClientId, setSelectedScoreClientId] = useState("");
  const [scoreRules, setScoreRules] =
    useState<ClientScoreRules>(DEFAULT_SCORE_RULES);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreMessage, setScoreMessage] = useState("");
  const [crmRuleDraft, setCrmRuleDraft] =
    useState<CrmRuleDraft>(EMPTY_CRM_RULE_DRAFT);
  const [crmStageOptions, setCrmStageOptions] = useState<
    Array<{ value: string; label: string; code: string; name: string }>
  >([]);
  const [eventSettingsEvents, setEventSettingsEvents] = useState<ApiEvent[]>(
    [],
  );
  const [selectedEventSettingsId, setSelectedEventSettingsId] = useState("");
  const [eventPermissions, setEventPermissions] = useState({
    allow_vendor_checkin: true,
    allow_vendor_fipe: true,
    allow_vendor_create_sale: true,
    allow_vendor_edit_sale: false,
    allow_vendor_delete_sale: false,
    allow_vendor_edit_own_lead: true,
    allow_vendor_delete_own_lead: false,
    allow_reception_create_sale: false,
    allow_reception_edit_sale: false,
    allow_reception_delete_sale: false,
    allow_reception_edit_lead: false,
    allow_reception_delete_lead: false,
    allow_reception_quick_create: true,
  });
  const [eventSettingsLoading, setEventSettingsLoading] = useState(false);
  const [eventSettingsSaving, setEventSettingsSaving] = useState(false);
  const [eventSettingsMessage, setEventSettingsMessage] = useState("");

  useEffect(() => {
    if (!selectedScoreClientId && crmClients.length > 0) {
      setSelectedScoreClientId(crmClients[0].id);
    }
  }, [crmClients, selectedScoreClientId]);

  useEffect(() => {
    if (!selectedScoreClientId) return;
    const clientRules = crmClients.find(
      (client) => client.id === selectedScoreClientId,
    )?.score_rules;
    if (clientRules) {
      setScoreRules(clientRules);
      return;
    }
    try {
      const raw = window.localStorage.getItem(
        `painelgrid:score_rules:${selectedScoreClientId}`,
      );
      if (raw) {
        const parsed = JSON.parse(raw);
        setScoreRules({
          scheduled_points: Math.max(0, Number(parsed.scheduled_points ?? 2)),
          checkin_points: Math.max(0, Number(parsed.checkin_points ?? 3)),
          sold_points: Math.max(0, Number(parsed.sold_points ?? 7)),
        });
        return;
      }
    } catch {
      // ignore
    }
    setScoreRules(DEFAULT_SCORE_RULES);
  }, [crmClients, selectedScoreClientId]);

  async function handleSaveScoreRules() {
    if (!selectedScoreClientId) return;
    const accessToken = readStoredSession()?.accessToken ?? "";
    if (!accessToken) {
      setScoreMessage("Sessão expirada. Entre novamente para salvar.");
      return;
    }
    setScoreSaving(true);
    setScoreMessage("");
    try {
      const updated = mapApiClientToClient(
        await updateClient(selectedScoreClientId, accessToken, {
          score_rules: scoreRules,
        }),
      );
      setCrmClients((current) =>
        current.map((client) => (client.id === updated.id ? updated : client)),
      );
      window.localStorage.removeItem(
        `painelgrid:score_rules:${selectedScoreClientId}`,
      );
      setScoreMessage(
        "Regras de pontuação salvas com sucesso para esta empresa!",
      );
      setTimeout(() => setScoreMessage(""), 3500);
    } catch (error) {
      setScoreMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as regras de pontuação.",
      );
    } finally {
      setScoreSaving(false);
    }
  }

  async function loadEventSettings() {
    const accessToken = readStoredSession()?.accessToken ?? "";
    if (!accessToken || (user.role !== "gestor" && user.role !== "cliente"))
      return;

    setEventSettingsLoading(true);
    setEventSettingsMessage("");
    try {
      const rows = await listEvents({}, accessToken);
      setEventSettingsEvents(rows);
      setSelectedEventSettingsId((current) => {
        if (current && rows.some((event) => event.id === current)) {
          return current;
        }
        return (
          rows.find((event) => event.status === "active")?.id ??
          rows[0]?.id ??
          ""
        );
      });
    } catch (error) {
      setEventSettingsMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os eventos.",
      );
    } finally {
      setEventSettingsLoading(false);
    }
  }

  async function handleSaveEventPermissions() {
    const accessToken = readStoredSession()?.accessToken ?? "";
    if (!accessToken || !selectedEventSettingsId) {
      setEventSettingsMessage("Selecione um evento para salvar.");
      return;
    }

    setEventSettingsSaving(true);
    setEventSettingsMessage("");
    try {
      const updated = await updateEvent(
        selectedEventSettingsId,
        {
          allow_vendor_checkin: eventPermissions.allow_vendor_checkin,
          allow_vendor_fipe: eventPermissions.allow_vendor_fipe,
          allow_vendor_create_sale: eventPermissions.allow_vendor_create_sale,
          allow_vendor_edit_own_lead:
            eventPermissions.allow_vendor_edit_own_lead,
          allow_vendor_delete_own_lead:
            eventPermissions.allow_vendor_delete_own_lead,
          allow_reception_quick_create:
            eventPermissions.allow_reception_quick_create,
          allow_reception_edit_lead: eventPermissions.allow_reception_edit_lead,
          allow_reception_delete_lead:
            eventPermissions.allow_reception_delete_lead,
        },
        accessToken,
      );
      setEventSettingsEvents((current) =>
        current.map((event) => (event.id === updated.id ? updated : event)),
      );
      window.localStorage.setItem(
        "painelgrid:event-permissions-updated",
        JSON.stringify({
          eventId: updated.id,
          updatedAt: Date.now(),
        }),
      );
      setEventSettingsMessage("Permissões do evento atualizadas com sucesso.");
    } catch (error) {
      setEventSettingsMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as permissões do evento.",
      );
    } finally {
      setEventSettingsSaving(false);
    }
  }

  async function handleAvatarFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Envie somente um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("A imagem deve ter no máximo 5MB.");
      return;
    }

    const session = readStoredSession();
    if (!session) return;

    setAvatarError("");
    setAvatarUploading(true);
    try {
      const updatedUser = await uploadAvatar(file, session.accessToken);
      const nextSession = { ...session, user: updatedUser };
      writeStoredSession(nextSession);
      notifyAuthSessionUpdated(nextSession);
    } catch (error) {
      setAvatarError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a foto.",
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  function openPasswordModal() {
    setPasswordModalOpen(true);
    setPasswordError("");
    setPasswordCurrent("");
    setPasswordNew("");
    setPasswordConfirm("");
  }

  function closePasswordModal() {
    if (passwordSaving) {
      return;
    }

    setPasswordModalOpen(false);
    setPasswordError("");
    setPasswordCurrent("");
    setPasswordNew("");
    setPasswordConfirm("");
  }

  async function handlePasswordChange() {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";

    if (!accessToken) {
      setPasswordError("Faça login novamente para alterar a senha.");
      return;
    }

    if (!passwordCurrent.trim()) {
      setPasswordError("Informe a senha atual.");
      return;
    }

    if (!passwordNew.trim()) {
      setPasswordError("Informe a nova senha.");
      return;
    }

    if (!isLocallyReasonablePassword(passwordNew.trim())) {
      setPasswordError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }

    if (passwordNew !== passwordConfirm) {
      setPasswordError("A confirmação da nova senha não confere.");
      return;
    }

    if (passwordCurrent === passwordNew) {
      setPasswordError("A nova senha precisa ser diferente da atual.");
      return;
    }

    setPasswordSaving(true);
    setPasswordError("");

    try {
      await changePassword(accessToken, passwordCurrent, passwordNew);
      clearStoredSession();
      setPasswordModalOpen(false);
      window.location.assign("/login");
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a senha.",
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSaveSettings() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          emailNotifications: preferences.emailNotifications,
          pushNotifications: preferences.pushNotifications,
          compactSidebar: preferences.compactSidebar,
          updatedAt: new Date().toISOString(),
        }),
      );
      window.localStorage.setItem(
        "layout:sidebar-collapsed",
        preferences.compactSidebar ? "1" : "0",
      );
      applyDashboardDarkEnabled(user.id, preferences.darkDashboard);
    }
    setIsDarkMode(preferences.darkDashboard);

    const nextName = profile.name.trim();
    const nextEmail = profile.email.trim();
    const nameChanged = nextName.length > 0 && nextName !== user.name;
    const emailChanged =
      nextEmail.length > 0 &&
      nextEmail.toLowerCase() !== user.email.toLowerCase();

    if (nameChanged || emailChanged) {
      const session = readStoredSession();
      if (!session) return;

      setProfileError("");
      setProfileSaving(true);
      try {
        const updatedUser = await updateOwnProfile(session.accessToken, {
          name: nameChanged ? nextName : undefined,
          email: emailChanged ? nextEmail : undefined,
        });
        const nextSession = { ...session, user: updatedUser };
        writeStoredSession(nextSession);
        notifyAuthSessionUpdated(nextSession);
      } catch (error) {
        setProfileSaving(false);
        setProfileError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o perfil.",
        );
        return;
      }
      setProfileSaving(false);
    }

    setSavedMessage("Configurações salvas com sucesso.");
    window.setTimeout(() => setSavedMessage(""), 2500);
  }

  function stageRulesToDraft(client: Client | null | undefined): CrmRuleDraft {
    const next = { ...EMPTY_CRM_RULE_DRAFT };
    client?.crm_stage_status_rules?.forEach((rule) => {
      next[rule.status] = rule.stage_id;
    });
    return next;
  }

  async function loadCrmSettings() {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken || (user.role !== "gestor" && user.role !== "cliente")) {
      return;
    }

    setCrmLoading(true);
    setCrmMessage("");
    try {
      const rows = await listClients(accessToken);
      const mapped = rows.map(mapApiClientToClient);
      setCrmClients(mapped);
      setSelectedCrmClientId((current) => {
        if (user.role === "cliente" && user.client_id) {
          return user.client_id;
        }
        if (current && mapped.some((client) => client.id === current)) {
          return current;
        }
        return mapped[0]?.id ?? "";
      });
    } catch {
      setCrmMessage("Não foi possível carregar os clientes do CRM.");
    } finally {
      setCrmLoading(false);
    }
  }

  async function loadCrmStages(clientId: string) {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken || !clientId) {
      setCrmStageOptions([]);
      return;
    }

    try {
      const pipelines = await listCrmPipelines(clientId, accessToken);
      const options = pipelines.flatMap((pipeline) =>
        (pipeline.stages ?? []).map((stage) => ({
          value: stage.id,
          label: `${pipeline.name} · ${stage.name}`,
          code: stage.code,
          name: stage.name,
        })),
      );
      setCrmStageOptions(options);
    } catch {
      setCrmStageOptions([]);
      setCrmMessage("Não foi possível carregar as etapas do CRM.");
    }
  }

  async function handleSaveCrmRules() {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken || !selectedCrmClientId) {
      setCrmMessage("Selecione um cliente para salvar as regras.");
      return;
    }

    const rules = CRM_STATUS_OPTIONS.reduce<CrmStageStatusRule[]>(
      (acc, statusOption) => {
        const stageId = crmRuleDraft[statusOption.value];
        const stage = crmStageOptions.find((item) => item.value === stageId);
        if (!stageId || !stage) {
          return acc;
        }
        acc.push({
          status: statusOption.value,
          stage_id: stageId,
          stage_code: stage.code,
          stage_name: stage.name,
        });
        return acc;
      },
      [],
    );

    setCrmSaving(true);
    setCrmMessage("");
    try {
      const updated = mapApiClientToClient(
        await updateClient(selectedCrmClientId, accessToken, {
          crm_stage_status_rules: rules,
        }),
      );
      setCrmClients((current) =>
        current.map((client) => (client.id === updated.id ? updated : client)),
      );
      setCrmRuleDraft(stageRulesToDraft(updated));
      setCrmMessage("Regras de status do CRM salvas com sucesso.");
    } catch (error) {
      setCrmMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as regras do CRM.",
      );
    } finally {
      setCrmSaving(false);
    }
  }

  async function refreshGestorMetaStatus(options?: { silent?: boolean }) {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) {
      setMetaLoading(false);
      return;
    }

    try {
      const status = await getMetaGestorStatus(accessToken);
      setMetaStatus(status);
      if (status.connected && !options?.silent) {
        setMetaMessage(
          "Conta Meta conectada. Agora você pode selecionar a BM em cada cliente.",
        );
      }
    } catch {
      setMetaStatus(null);
      if (!options?.silent) {
        setMetaMessage("Não foi possível carregar o status da BM.");
      }
    } finally {
      setMetaLoading(false);
    }
  }

  function stopMetaConnectPolling() {
    if (metaConnectPollRef.current) {
      window.clearInterval(metaConnectPollRef.current);
      metaConnectPollRef.current = null;
    }
  }

  function startMetaConnectPolling(popup: Window | null) {
    stopMetaConnectPolling();

    let attempts = 0;
    metaConnectPollRef.current = window.setInterval(() => {
      attempts += 1;
      void refreshGestorMetaStatus({ silent: true }).then(() => {
        if (popup?.closed || attempts >= META_CONNECT_POLL_LIMIT) {
          stopMetaConnectPolling();
          void refreshGestorMetaStatus();
        }
      });
    }, META_CONNECT_POLL_INTERVAL_MS);
  }

  async function handleConnectBm() {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) {
      setMetaMessage("Faça login novamente para conectar a BM.");
      return;
    }

    setMetaBusy(true);
    setMetaMessage("");

    try {
      const connect = await startMetaGestorConnect(accessToken);
      const popup = window.open(
        connect.auth_url,
        "meta_oauth_gestor",
        "popup=yes,width=720,height=760,resizable=yes,scrollbars=yes",
      );

      if (!popup) {
        setMetaMessage(
          "Permita pop-up no navegador para concluir a autorização da Meta.",
        );
        return;
      }

      setMetaMessage(
        "Conclua a autorização da Meta. Depois escolha a BM dentro do cliente.",
      );
      startMetaConnectPolling(popup);
    } catch {
      setMetaMessage(
        "Não foi possível iniciar a conexão com a BM. Tente novamente.",
      );
    } finally {
      setMetaBusy(false);
    }
  }

  async function handleDisconnectBm() {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) {
      setMetaMessage("Faça login novamente para desconectar a BM.");
      return;
    }

    setMetaBusy(true);
    setMetaMessage("");

    try {
      await disconnectMetaGestor(accessToken);
      setMetaStatus((current) =>
        current
          ? {
              ...current,
              connected: false,
              token_expires_at: null,
              connected_at: null,
              scopes: [],
            }
          : null,
      );
      setMetaMessage("BM desconectada com sucesso.");
    } catch {
      setMetaMessage("Não foi possível desconectar a BM. Tente novamente.");
    } finally {
      setMetaBusy(false);
    }
  }

  useEffect(() => {
    if (user.role !== "gestor") return;
    void refreshGestorMetaStatus({ silent: true });
  }, [user.role]);

  useEffect(() => {
    if (user.role !== "gestor" && user.role !== "cliente") return;
    void loadCrmSettings();
  }, [user.role, user.client_id]);

  useEffect(() => {
    if (user.role !== "gestor" && user.role !== "cliente") return;
    void loadEventSettings();
  }, [user.role, user.client_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      const darkEnabled = readDashboardDarkEnabled(user.id);
      setIsDarkMode(darkEnabled);
      setPreferences((prev) =>
        prev.darkDashboard === darkEnabled
          ? prev
          : { ...prev, darkDashboard: darkEnabled },
      );
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
    if (user.role !== "gestor") return;

    function onMetaOauthMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== "object") return;

      const payload = event.data as Record<string, unknown>;
      if (payload.type !== "meta_oauth_result") return;

      const status = String(payload.status ?? "");
      if (status !== "success") {
        setMetaMessage(
          String(payload.message ?? "Falha ao concluir autorização da Meta."),
        );
        return;
      }

      if (payload.kind === "gestor_connected") {
        stopMetaConnectPolling();
        setMetaMessage(
          "Conta Meta conectada. Agora você pode selecionar a BM em cada cliente.",
        );
        void refreshGestorMetaStatus();
      }
    }

    window.addEventListener("message", onMetaOauthMessage);
    return () => {
      window.removeEventListener("message", onMetaOauthMessage);
      stopMetaConnectPolling();
    };
  }, [user.role]);

  useEffect(() => {
    if (user.role !== "gestor") return;

    function refreshOnReturn() {
      void refreshGestorMetaStatus({ silent: true });
    }

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [user.role]);

  const heading = roleLabel[user.role] ?? user.role;
  const isMetaConnected = Boolean(metaStatus?.connected);
  const sectionCardClass = clsx(
    "rounded-[28px] border shadow-[0_16px_45px_rgba(15,23,42,0.06)]",
    isDarkMode ? "border-zinc-700 bg-[#0f0f0f]" : "border-white/80",
  );
  const profileFieldClass = clsx(
    "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100"
      : "border-zinc-200 bg-white text-zinc-950",
  );
  const secondaryActionClass = clsx(
    "w-full justify-center rounded-2xl py-3",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100 hover:bg-[#1b1b1b]"
      : "border-zinc-200",
  );
  /** Carrega a lista de acessos so quando a aba e aberta. */
  useEffect(() => {
    if (activeTab !== "acessos" || user.role !== "gestor") return;
    if (accessUsers.length > 0 || accessLoading) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    setAccessLoading(true);
    setAccessError("");
    void Promise.all([listUsers(token), listClients(token).catch(() => [])])
      .then(([users, clients]) => {
        setAccessUsers(users);
        setAccessCompanies(
          Object.fromEntries(
            clients.map((client) => [client.id, client.company_name]),
          ),
        );
      })
      .catch(() =>
        setAccessError("Não foi possível carregar a lista de acessos."),
      )
      .finally(() => setAccessLoading(false));
  }, [activeTab, user.role, accessUsers.length, accessLoading]);

  function openCreateAccessModal() {
    setAccessEditing(null);
    setAccessForm(EMPTY_ACCESS_FORM);
    setAccessFormError("");
    setAccessMessage("");
    setAccessModalOpen(true);
  }

  function openEditAccessModal(accessUser: StaffUser) {
    setAccessEditing(accessUser);
    setAccessForm({
      name: accessUser.name,
      email: accessUser.email,
      password: "",
      role: accessUser.role as AccessRole,
      client_id: accessUser.client_id ?? "",
      phone: accessUser.phone ?? "",
      vendor_categories: accessUser.vendor_categories,
    });
    setAccessFormError("");
    setAccessMessage("");
    setAccessModalOpen(true);
  }

  function closeAccessModal() {
    if (accessSaving) return;
    setAccessModalOpen(false);
    setAccessEditing(null);
    setAccessForm(EMPTY_ACCESS_FORM);
    setAccessFormError("");
  }

  async function handleSaveAccess() {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setAccessFormError("Faça login novamente para salvar este acesso.");
      return;
    }

    const name = accessForm.name.trim();
    const email = accessForm.email.trim().toLowerCase();
    const password = accessForm.password;
    if (!name) {
      setAccessFormError("Informe o nome.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAccessFormError("Informe um e-mail válido.");
      return;
    }
    if (!accessEditing && !password) {
      setAccessFormError("Informe a senha inicial.");
      return;
    }
    if (password && !isLocallyReasonablePassword(password)) {
      setAccessFormError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }
    if (accessForm.role !== "gestor" && !accessForm.client_id) {
      setAccessFormError("Selecione a empresa vinculada a este acesso.");
      return;
    }
    if (
      accessForm.role === "vendedor" &&
      accessForm.vendor_categories.length === 0
    ) {
      setAccessFormError("Selecione ao menos uma categoria para o vendedor.");
      return;
    }

    setAccessSaving(true);
    setAccessFormError("");
    try {
      let saved: StaffUser;
      if (accessEditing) {
        saved = await updateStaffUser(token, accessEditing.id, {
          name,
          email,
          ...(password ? { password } : {}),
          ...(accessForm.role !== "gestor"
            ? {
                role: accessForm.role,
                client_id: accessForm.client_id,
              }
            : {}),
          phone: accessForm.phone.trim() || null,
          ...(accessForm.role === "vendedor"
            ? { vendor_categories: accessForm.vendor_categories }
            : {}),
        });
        setAccessUsers((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
        setAccessMessage(`Acesso de ${saved.name} atualizado.`);
      } else {
        saved = await createAccessUser(token, {
          name,
          email,
          password,
          role: accessForm.role,
          ...(accessForm.role !== "gestor"
            ? { client_id: accessForm.client_id }
            : {}),
          ...(accessForm.phone.trim()
            ? { phone: accessForm.phone.trim() }
            : {}),
          ...(accessForm.role === "vendedor"
            ? { vendor_categories: accessForm.vendor_categories }
            : {}),
        });
        setAccessUsers((current) => [saved, ...current]);
        setAccessMessage(`Acesso de ${saved.name} criado com sucesso.`);
      }
      setAccessModalOpen(false);
      setAccessEditing(null);
      setAccessForm(EMPTY_ACCESS_FORM);
    } catch (error) {
      setAccessFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o acesso.",
      );
    } finally {
      setAccessSaving(false);
    }
  }

  async function handleToggleAccess(accessUser: StaffUser) {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setAccessError("Faça login novamente para alterar este acesso.");
      return;
    }

    setAccessActionUserId(accessUser.id);
    setAccessError("");
    setAccessMessage("");
    try {
      const saved = await toggleUserActive(
        token,
        accessUser.id,
        !accessUser.is_active,
      );
      setAccessUsers((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setAccessMessage(
        `${saved.name} foi ${saved.is_active ? "ativado" : "desativado"}.`,
      );
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar este acesso.",
      );
    } finally {
      setAccessActionUserId("");
    }
  }

  async function handleDeleteAccess() {
    if (!accessDeleteTarget) return;
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setAccessError("Faça login novamente para excluir este acesso.");
      return;
    }

    setAccessDeleteSaving(true);
    setAccessError("");
    setAccessMessage("");
    try {
      await deleteStaffUser(token, accessDeleteTarget.id);
      setAccessUsers((current) =>
        current.filter((item) => item.id !== accessDeleteTarget.id),
      );
      setAccessMessage(`Acesso de ${accessDeleteTarget.name} excluído.`);
      setAccessDeleteTarget(null);
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir este acesso.",
      );
    } finally {
      setAccessDeleteSaving(false);
    }
  }

  const settingsTabs = useMemo(() => {
    const tabs: Array<{
      id: SettingsTab;
      label: string;
      icon: React.ReactNode;
    }> = [{ id: "perfil", label: "Perfil", icon: <UserCog size={15} /> }];

    if (user.role === "gestor" || user.role === "cliente") {
      tabs.push({ id: "ads", label: "Ads", icon: <Building2 size={15} /> });
      tabs.push({
        id: "pontuacao",
        label: "Pontuação",
        icon: <Trophy size={15} />,
      });
      tabs.push({ id: "crm", label: "CRM", icon: <KanbanSquare size={15} /> });
    }

    if (user.role === "gestor" || user.role === "cliente") {
      tabs.push({
        id: "evento",
        label: "Config. evento",
        icon: <CalendarPlus size={15} />,
      });
      if (user.role === "gestor") {
        tabs.push({
          id: "acessos",
          label: "Acessos",
          icon: <Users size={15} />,
        });
      }
    }

    tabs.push({
      id: "preferencias",
      label: "Preferências",
      icon: <Sliders size={15} />,
    });

    return tabs;
  }, [user.role]);
  const selectedCrmClient = useMemo(
    () =>
      crmClients.find((client) => client.id === selectedCrmClientId) ?? null,
    [crmClients, selectedCrmClientId],
  );
  const crmClientOptions = useMemo(
    () =>
      crmClients.map((client) => ({
        value: client.id,
        label: client.company_name,
      })),
    [crmClients],
  );
  const selectedEventSettings = useMemo(
    () =>
      eventSettingsEvents.find(
        (event) => event.id === selectedEventSettingsId,
      ) ?? null,
    [eventSettingsEvents, selectedEventSettingsId],
  );
  const eventSettingsOptions = useMemo(
    () =>
      eventSettingsEvents.map((event) => ({
        value: event.id,
        label: `${event.name} · ${new Date(event.event_date).toLocaleDateString(
          "pt-BR",
        )}`,
      })),
    [eventSettingsEvents],
  );

  useEffect(() => {
    setCrmRuleDraft(stageRulesToDraft(selectedCrmClient));
  }, [selectedCrmClient]);

  useEffect(() => {
    if (!selectedCrmClientId) {
      setCrmStageOptions([]);
      return;
    }
    void loadCrmStages(selectedCrmClientId);
  }, [selectedCrmClientId]);

  useEffect(() => {
    if (!selectedEventSettings) return;
    setEventPermissions({
      allow_vendor_checkin: selectedEventSettings.allow_vendor_checkin ?? true,
      allow_vendor_fipe: selectedEventSettings.allow_vendor_fipe ?? true,
      allow_vendor_create_sale:
        selectedEventSettings.allow_vendor_create_sale ?? true,
      allow_vendor_edit_sale:
        selectedEventSettings.allow_vendor_edit_sale ?? false,
      allow_vendor_delete_sale:
        selectedEventSettings.allow_vendor_delete_sale ?? false,
      allow_vendor_edit_own_lead:
        selectedEventSettings.allow_vendor_edit_own_lead ?? true,
      allow_vendor_delete_own_lead:
        selectedEventSettings.allow_vendor_delete_own_lead ?? false,
      allow_reception_create_sale:
        selectedEventSettings.allow_reception_create_sale ?? false,
      allow_reception_edit_sale:
        selectedEventSettings.allow_reception_edit_sale ?? false,
      allow_reception_delete_sale:
        selectedEventSettings.allow_reception_delete_sale ?? false,
      allow_reception_edit_lead:
        selectedEventSettings.allow_reception_edit_lead ?? false,
      allow_reception_delete_lead:
        selectedEventSettings.allow_reception_delete_lead ?? false,
      allow_reception_quick_create:
        selectedEventSettings.allow_reception_quick_create ?? true,
    });
    setEventSettingsMessage("");
  }, [selectedEventSettings]);

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <PageHeader
        title="Configuração"
        subtitle="Preferências da conta, navegação e notificações."
        breadcrumbs={[{ label: heading }, { label: "Configuração" }]}
        dark={isDarkMode}
        actions={
          <Button
            onClick={() => void handleSaveSettings()}
            icon={<Save size={16} />}
            loading={profileSaving}
            className={clsx(
              "rounded-full px-5 text-white",
              isDarkMode
                ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                : "bg-[#0b0b0b] hover:bg-zinc-800",
            )}
          >
            Salvar
          </Button>
        }
      />

      {profileError ? (
        <Card
          className="rounded-[20px] border border-red-200 bg-red-50"
          padding="md"
        >
          <p className="text-sm font-semibold text-red-700">{profileError}</p>
        </Card>
      ) : null}

      {savedMessage ? (
        <Card
          className="rounded-[20px] border border-emerald-200 bg-emerald-50"
          padding="md"
        >
          <p className="text-sm font-semibold text-emerald-800">
            {savedMessage}
          </p>
        </Card>
      ) : null}

      <div className="space-y-6">
        <Tabs
          tabs={settingsTabs}
          active={activeTab}
          onChange={(id) => setActiveTab(id as SettingsTab)}
          className={clsx(
            "-mx-2 mb-6 px-2",
            isDarkMode
              ? "border-zinc-800 [&_button]:text-zinc-400 [&_button]:hover:border-zinc-700 [&_button]:hover:text-zinc-200 [&_button[data-active=true]]:border-[#FF0636] [&_button[data-active=true]]:text-white"
              : "",
          )}
        />

        {activeTab === "perfil" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <Card className={sectionCardClass} padding="lg">
              <div className="flex items-center gap-2">
                <UserCog size={18} className="text-zinc-500" />
                <h2
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Dados da conta
                </h2>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <div className="relative">
                  <div
                    className={clsx(
                      "flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 text-xl font-bold uppercase",
                      isDarkMode
                        ? "border-zinc-700 bg-[#151515] text-zinc-300"
                        : "border-zinc-200 bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {user.avatar ? (
                      <img
                        src={`${API_BASE}${user.avatar}`}
                        alt={user.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      user.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className={clsx(
                      "absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors disabled:opacity-60",
                      isDarkMode
                        ? "border-[#0a0a0a] bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                        : "border-white bg-zinc-900 text-white hover:bg-zinc-800",
                    )}
                    title="Alterar foto de perfil"
                  >
                    {avatarUploading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleAvatarFileChange(event)}
                  />
                </div>
                <div>
                  <p
                    className={clsx(
                      "text-sm font-semibold",
                      isDarkMode ? "text-zinc-100" : "text-zinc-900",
                    )}
                  >
                    Foto de perfil
                  </p>
                  <p className="text-xs text-zinc-400">JPG ou PNG, até 5MB.</p>
                  {avatarError ? (
                    <p className="mt-1 text-xs font-medium text-red-500">
                      {avatarError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Nome
                  </p>
                  <input
                    value={profile.name}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={profileFieldClass}
                  />
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    E-mail
                  </p>
                  <input
                    value={profile.email}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className={profileFieldClass}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Empresa
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
                      <Lock size={10} /> Fixo
                    </span>
                  </div>
                  <input
                    value={
                      profile.company ||
                      user.company_name ||
                      "Empresa Vinculada"
                    }
                    readOnly
                    disabled
                    title="O nome da empresa é vinculado automaticamente à sua conta e não pode ser editado."
                    className={clsx(
                      profileFieldClass,
                      "cursor-not-allowed opacity-90 font-bold bg-zinc-100/80 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300",
                    )}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      CNPJ da Empresa
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
                      <Lock size={10} /> Fixo
                    </span>
                  </div>
                  <input
                    value={userCompanyCnpj || "—"}
                    readOnly
                    disabled
                    title="O CNPJ da empresa é vinculado automaticamente e não pode ser editado pelo vendedor."
                    className={clsx(
                      profileFieldClass,
                      "cursor-not-allowed opacity-90 font-bold font-mono bg-zinc-100/80 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300",
                    )}
                  />
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Perfil
                  </p>
                  <div
                    className={clsx(
                      "inline-flex h-[46px] items-center rounded-2xl border px-4 text-sm font-semibold",
                      isDarkMode
                        ? "border-zinc-700 bg-[#151515] text-zinc-300"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600",
                    )}
                  >
                    {heading}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    ID do usuário
                  </p>
                  <CopyableId
                    value={user.id}
                    label="user_id"
                    dark={isDarkMode}
                  />
                </div>

                {user.role === "vendedor" && user.rating_token && (
                  <div className="md:col-span-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Meu link de avaliação
                    </p>
                    <CopyableId
                      value={`${resolvePublicWebOrigin()}/avaliacao/${user.rating_token}`}
                      label="link"
                      dark={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card className={sectionCardClass} padding="lg">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-zinc-500" />
                <h2
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Segurança
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <Button
                  variant="secondary"
                  onClick={openPasswordModal}
                  icon={<ShieldCheck size={16} />}
                  className={secondaryActionClass}
                >
                  Alterar senha
                </Button>
                <Button variant="secondary" className={secondaryActionClass}>
                  Encerrar sessões ativas
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "ads" ? (
          user.role === "gestor" ? (
            <Card className={sectionCardClass} padding="lg">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-zinc-500" />
                    <h2
                      className={clsx(
                        "text-lg font-black tracking-tight",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      Integração BM
                    </h2>
                  </div>
                  <p
                    className={clsx(
                      "mt-2 max-w-2xl text-sm",
                      isDarkMode ? "text-zinc-400" : "text-zinc-500",
                    )}
                  >
                    Conecte a conta Meta do gestor para liberar Business
                    Managers, contas de anúncio, páginas, formulários e WhatsApp
                    nos clientes.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    onClick={handleConnectBm}
                    loading={metaBusy || metaLoading}
                    icon={<Building2 size={16} />}
                    className={clsx(
                      "justify-center rounded-2xl px-5 py-3 text-white",
                      isDarkMode
                        ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                        : "bg-[#0b0b0b] hover:bg-zinc-800",
                    )}
                  >
                    {isMetaConnected ? "Reconectar a BM" : "Conectar a BM"}
                  </Button>
                  {isMetaConnected ? (
                    <Button
                      variant="secondary"
                      onClick={handleDisconnectBm}
                      loading={metaBusy}
                      icon={<Unplug size={16} />}
                      className={clsx(
                        "justify-center rounded-2xl py-3",
                        isDarkMode
                          ? "border-zinc-700 bg-[#111111] text-zinc-100 hover:bg-[#1b1b1b]"
                          : "border-zinc-200",
                      )}
                    >
                      Desconectar
                    </Button>
                  ) : null}
                </div>
              </div>

              <div
                className={clsx(
                  "mt-5 rounded-2xl border p-4",
                  isDarkMode
                    ? "border-zinc-700 bg-[#141414]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {isMetaConnected ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span
                        className={
                          isDarkMode ? "text-emerald-400" : "text-emerald-700"
                        }
                      >
                        Conta Meta conectada
                      </span>
                    </>
                  ) : (
                    <>
                      <Building2 size={16} className="text-zinc-500" />
                      <span
                        className={
                          isDarkMode ? "text-zinc-300" : "text-zinc-700"
                        }
                      >
                        {metaLoading
                          ? "Verificando conexão..."
                          : "Nenhuma BM conectada"}
                      </span>
                    </>
                  )}
                </div>
                {metaStatus?.token_expires_at ? (
                  <p
                    className={clsx(
                      "mt-1 text-xs",
                      isDarkMode ? "text-zinc-400" : "text-zinc-500",
                    )}
                  >
                    Token válido até{" "}
                    {new Date(metaStatus.token_expires_at).toLocaleDateString(
                      "pt-BR",
                    )}
                    .
                  </p>
                ) : null}
                {metaMessage ? (
                  <p
                    className={clsx(
                      "mt-2 text-xs font-medium",
                      isDarkMode ? "text-zinc-400" : "text-zinc-600",
                    )}
                  >
                    {metaMessage}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : (
            <Card className={sectionCardClass} padding="lg">
              <p
                className={clsx(
                  "text-sm",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                As integrações de anúncios ficam disponíveis para o perfil
                gestor.
              </p>
            </Card>
          )
        ) : null}

        {activeTab === "crm" ? (
          <div className="space-y-6">
            <Card className={sectionCardClass} padding="lg">
              <div className="flex items-center gap-2">
                <KanbanSquare size={18} className="text-zinc-500" />
                <h2
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Automação de status por etapa
                </h2>
              </div>
              <p
                className={clsx(
                  "mt-2 max-w-3xl text-sm",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                Vincule um status do lead a uma etapa do CRM. Sempre que o lead
                entrar nessa etapa, o status será atualizado automaticamente e a
                movimentação continuará registrada no histórico do lead.
              </p>

              {user.role === "gestor" || user.role === "cliente" ? (
                <>
                  <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
                    <Select
                      label="Cliente"
                      value={selectedCrmClientId}
                      onChange={(event) =>
                        setSelectedCrmClientId(event.target.value)
                      }
                      options={crmClientOptions}
                      placeholder={
                        crmLoading
                          ? "Carregando clientes..."
                          : "Selecione um cliente"
                      }
                      disabled={crmLoading || user.role === "cliente"}
                      dark={isDarkMode}
                    />

                    <div
                      className={clsx(
                        "rounded-2xl border p-4 text-sm",
                        isDarkMode
                          ? "border-zinc-700 bg-[#141414] text-zinc-300"
                          : "border-zinc-100 bg-zinc-50 text-zinc-600",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={clsx(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                            isDarkMode
                              ? "bg-[#1f1f1f] text-zinc-400"
                              : "bg-white text-zinc-500",
                          )}
                        >
                          <AlertCircle size={16} />
                        </span>
                        <div>
                          <p
                            className={clsx(
                              "font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-900",
                            )}
                          >
                            Exemplo de uso
                          </p>
                          <p className="mt-1">
                            Se você vincular a etapa{" "}
                            <strong>Tentativa contato</strong> ao status
                            <strong> Agendado</strong>, todo lead que entrar
                            nela passará a ser marcado como{" "}
                            <strong>Agendado</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {CRM_STATUS_OPTIONS.map((statusOption) => (
                      <div
                        key={statusOption.value}
                        className={clsx(
                          "grid gap-3 rounded-2xl border p-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center",
                          isDarkMode
                            ? "border-zinc-700 bg-[#141414]"
                            : "border-zinc-100 bg-zinc-50",
                        )}
                      >
                        <div>
                          <p
                            className={clsx(
                              "text-sm font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-900",
                            )}
                          >
                            {statusOption.label}
                          </p>
                          <p
                            className={clsx(
                              "mt-1 text-xs",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500",
                            )}
                          >
                            Etapa que passa a definir este status.
                          </p>
                        </div>
                        <Select
                          value={crmRuleDraft[statusOption.value]}
                          onChange={(event) => {
                            const nextStageId = event.target.value;
                            setCrmRuleDraft((current) => {
                              const next = { ...current };
                              for (const status of Object.keys(
                                next,
                              ) as ConfirmationStatus[]) {
                                if (
                                  status !== statusOption.value &&
                                  next[status] === nextStageId
                                ) {
                                  next[status] = "";
                                }
                              }
                              next[statusOption.value] = nextStageId;
                              return next;
                            });
                          }}
                          options={crmStageOptions.map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                          placeholder={
                            selectedCrmClientId
                              ? "Não vincular status a nenhuma etapa"
                              : "Selecione um cliente primeiro"
                          }
                          disabled={
                            !selectedCrmClientId || crmStageOptions.length === 0
                          }
                          dark={isDarkMode}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <div
                      className={clsx(
                        "text-sm",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {selectedCrmClient
                        ? `Cliente atual: ${selectedCrmClient.company_name}`
                        : "Nenhum cliente selecionado"}
                    </div>
                    <Button
                      onClick={handleSaveCrmRules}
                      loading={crmSaving}
                      isDisabled={!selectedCrmClientId}
                      icon={<Save size={16} />}
                      className={clsx(
                        "rounded-2xl px-5 py-3 text-white",
                        isDarkMode
                          ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                          : "bg-[#0b0b0b] hover:bg-zinc-800",
                      )}
                    >
                      Salvar regras do CRM
                    </Button>
                  </div>

                  {crmMessage ? (
                    <div
                      className={clsx(
                        "mt-4 rounded-2xl border px-4 py-3 text-sm",
                        isDarkMode
                          ? "border-zinc-700 bg-[#141414] text-zinc-300"
                          : "border-zinc-100 bg-zinc-50 text-zinc-600",
                      )}
                    >
                      {crmMessage}
                    </div>
                  ) : null}
                </>
              ) : (
                <div
                  className={clsx(
                    "mt-5 rounded-2xl border p-4 text-sm",
                    isDarkMode
                      ? "border-zinc-700 bg-[#141414] text-zinc-400"
                      : "border-zinc-100 bg-zinc-50 text-zinc-500",
                  )}
                >
                  As regras de automação do CRM ficam disponíveis para gestor e
                  cliente.
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "evento" &&
        (user.role === "gestor" || user.role === "cliente") ? (
          <div className="space-y-6">
            <Card className={sectionCardClass} padding="lg">
              <div className="flex items-center gap-2">
                <CalendarPlus size={18} className="text-zinc-500" />
                <h2
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Permissões do evento
                </h2>
              </div>
              <p
                className={clsx(
                  "mt-2 max-w-3xl text-sm",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                Escolha um evento e defina quais ações estarão disponíveis no
                menu rápido dos vendedores participantes.
              </p>

              <div className="mt-5 max-w-xl">
                <Select
                  label="Evento"
                  value={selectedEventSettingsId}
                  onChange={(event) =>
                    setSelectedEventSettingsId(event.target.value)
                  }
                  options={eventSettingsOptions}
                  placeholder={
                    eventSettingsLoading
                      ? "Carregando eventos..."
                      : "Selecione um evento"
                  }
                  disabled={eventSettingsLoading}
                  dark={isDarkMode}
                />
              </div>

              {selectedEventSettings ? (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <ToggleRow
                      icon={<UserCheck size={15} />}
                      title="Vendedor pode fazer check-in"
                      description="Exibe a ação Fazer check-in no menu rápido dos vendedores."
                      checked={eventPermissions.allow_vendor_checkin}
                      onChange={(value) =>
                        setEventPermissions((state) => ({
                          ...state,
                          allow_vendor_checkin: value,
                        }))
                      }
                      dark={isDarkMode}
                    />
                    <ToggleRow
                      icon={<CarFront size={15} />}
                      title="Vendedor pode consultar FIPE"
                      description="Exibe a ação Consultar Placa (FIPE) no menu rápido dos vendedores."
                      checked={eventPermissions.allow_vendor_fipe}
                      onChange={(value) =>
                        setEventPermissions((state) => ({
                          ...state,
                          allow_vendor_fipe: value,
                        }))
                      }
                      dark={isDarkMode}
                    />
                    {[
                      [
                        "allow_vendor_create_sale",
                        "Vendedor pode registrar venda",
                        "Permite criar vendas neste evento.",
                      ],
                      [
                        "allow_vendor_edit_own_lead",
                        "Vendedor pode alterar os próprios leads",
                        "Permite editar leads cadastrados e vinculados a ele.",
                      ],
                      [
                        "allow_vendor_delete_own_lead",
                        "Vendedor pode apagar os próprios leads",
                        "Permite apagar somente leads cadastrados por ele.",
                      ],
                      [
                        "allow_reception_quick_create",
                        "Recepção pode fazer cadastro rápido",
                        "Permite criar leads pelo painel da recepção.",
                      ],
                      [
                        "allow_reception_edit_lead",
                        "Recepção pode alterar dados do lead",
                        "Permite editar os dados cadastrais do lead.",
                      ],
                      [
                        "allow_reception_delete_lead",
                        "Recepção pode apagar leads",
                        "Permite apagar leads deste evento.",
                      ],
                    ].map(([key, title, description]) => (
                      <ToggleRow
                        key={key}
                        icon={<UserCog size={15} />}
                        title={title}
                        description={description}
                        checked={
                          eventPermissions[key as keyof typeof eventPermissions]
                        }
                        onChange={(value) =>
                          setEventPermissions((state) => ({
                            ...state,
                            [key]: value,
                          }))
                        }
                        dark={isDarkMode}
                      />
                    ))}
                    <Notice tone="info" className="md:col-span-2">
                      A recepção registra presença, realiza cadastro rápido e
                      encaminha o lead para a fila. O registro de venda pertence
                      exclusivamente ao vendedor responsável pelo atendimento.
                    </Notice>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p
                      className={clsx(
                        "text-sm",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      Evento atual: {selectedEventSettings.name}
                    </p>
                    <Button
                      onClick={() => void handleSaveEventPermissions()}
                      loading={eventSettingsSaving}
                      icon={<Save size={16} />}
                      className={clsx(
                        "rounded-2xl px-5 py-3 text-white",
                        isDarkMode
                          ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                          : "bg-[#0b0b0b] hover:bg-zinc-800",
                      )}
                    >
                      Salvar permissões
                    </Button>
                  </div>
                </>
              ) : !eventSettingsLoading ? (
                <div
                  className={clsx(
                    "mt-6 rounded-2xl border p-4 text-sm",
                    isDarkMode
                      ? "border-zinc-700 bg-[#141414] text-zinc-400"
                      : "border-zinc-100 bg-zinc-50 text-zinc-500",
                  )}
                >
                  Nenhum evento disponível para configuração.
                </div>
              ) : null}

              {eventSettingsMessage ? (
                <div
                  className={clsx(
                    "mt-4 rounded-2xl border px-4 py-3 text-sm",
                    isDarkMode
                      ? "border-zinc-700 bg-[#141414] text-zinc-300"
                      : "border-zinc-100 bg-zinc-50 text-zinc-600",
                  )}
                >
                  {eventSettingsMessage}
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}

        {activeTab === "acessos" && user.role === "gestor" ? (
          <div className="space-y-6">
            <Card className={sectionCardClass} padding="lg">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    className={clsx(
                      "flex items-center gap-2 text-base font-semibold",
                      isDarkMode ? "text-zinc-100" : "text-gray-900",
                    )}
                  >
                    <Users size={17} /> Acessos ao painel
                  </h2>
                  <p
                    className={clsx(
                      "mt-1 text-xs",
                      isDarkMode ? "text-zinc-400" : "text-gray-500",
                    )}
                  >
                    Todos os e-mails com conta no PainelGRID, por perfil.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!accessLoading && accessUsers.length > 0 ? (
                    <span
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        isDarkMode
                          ? "bg-zinc-800 text-zinc-300"
                          : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {accessUsers.length}{" "}
                      {accessUsers.length === 1 ? "conta" : "contas"}
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={openCreateAccessModal}
                  >
                    Novo acesso
                  </Button>
                </div>
              </div>

              {accessError ? (
                <Notice tone="error" className="mb-4 text-xs">
                  {accessError}
                </Notice>
              ) : null}

              {accessMessage ? (
                <Notice tone="success" className="mb-4 text-xs">
                  {accessMessage}
                </Notice>
              ) : null}

              {accessLoading ? (
                <p
                  className={clsx(
                    "py-10 text-center text-sm",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                >
                  Carregando acessos...
                </p>
              ) : accessUsers.length === 0 ? (
                <p
                  className={clsx(
                    "py-10 text-center text-sm",
                    isDarkMode ? "text-zinc-500" : "text-gray-400",
                  )}
                >
                  Nenhuma conta encontrada.
                </p>
              ) : (
                <div className="space-y-6">
                  {ACCESS_ROLE_ORDER.map((roleKey) => {
                    const rows = accessUsers.filter(
                      (item) => item.role === roleKey,
                    );
                    if (rows.length === 0) return null;
                    return (
                      <div key={roleKey}>
                        <h3
                          className={clsx(
                            "mb-2 text-xs font-bold tracking-wider uppercase",
                            isDarkMode ? "text-zinc-400" : "text-gray-500",
                          )}
                        >
                          {ACCESS_ROLE_LABELS[roleKey]} · {rows.length}
                        </h3>
                        <div className="space-y-2">
                          {rows.map((item) => (
                            <div
                              key={item.id}
                              className={clsx(
                                "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                                isDarkMode
                                  ? "border-zinc-700 bg-[#141414]"
                                  : "border-gray-200 bg-white",
                              )}
                            >
                              <div className="min-w-0">
                                <p
                                  className={clsx(
                                    "truncate text-sm font-semibold",
                                    isDarkMode
                                      ? "text-zinc-100"
                                      : "text-gray-900",
                                  )}
                                >
                                  {item.email}
                                </p>
                                <p
                                  className={clsx(
                                    "truncate text-xs",
                                    isDarkMode
                                      ? "text-zinc-400"
                                      : "text-gray-500",
                                  )}
                                >
                                  {item.name}
                                  {item.client_id
                                    ? ` · ${accessCompanies[item.client_id] ?? "empresa removida"}`
                                    : " · acesso global"}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {item.id === user.id ? (
                                  <span
                                    className={clsx(
                                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                      isDarkMode
                                        ? "bg-zinc-800 text-zinc-300"
                                        : "bg-zinc-100 text-zinc-600",
                                    )}
                                  >
                                    Você
                                  </span>
                                ) : null}
                                <ApprovalStatusBadge
                                  status={item.approval_status}
                                  isActive={item.is_active}
                                />
                                <button
                                  type="button"
                                  onClick={() => openEditAccessModal(item)}
                                  aria-label={`Editar acesso de ${item.name}`}
                                  title="Editar"
                                  className={clsx(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors",
                                    isDarkMode
                                      ? "border-zinc-700 bg-[#171717] text-zinc-300 hover:bg-[#212121]"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                                  )}
                                >
                                  <Pencil size={14} />
                                </button>
                                {item.id !== user.id &&
                                item.approval_status === "approved" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleToggleAccess(item)
                                    }
                                    disabled={accessActionUserId === item.id}
                                    aria-label={`${item.is_active ? "Desativar" : "Ativar"} acesso de ${item.name}`}
                                    title={
                                      item.is_active ? "Desativar" : "Ativar"
                                    }
                                    className={clsx(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors disabled:opacity-50",
                                      item.is_active
                                        ? isDarkMode
                                          ? "border-amber-900/70 bg-amber-950/30 text-amber-400 hover:bg-amber-950/50"
                                          : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                        : isDarkMode
                                          ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50"
                                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                                    )}
                                  >
                                    {accessActionUserId === item.id ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : item.is_active ? (
                                      <PowerOff size={14} />
                                    ) : (
                                      <Power size={14} />
                                    )}
                                  </button>
                                ) : null}
                                {item.id !== user.id ? (
                                  <button
                                    type="button"
                                    onClick={() => setAccessDeleteTarget(item)}
                                    aria-label={`Excluir acesso de ${item.name}`}
                                    title="Excluir"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "preferencias" ? (
          <div className="space-y-6">
            <Card className={sectionCardClass} padding="lg">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-zinc-500" />
                <h2
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Preferências do painel
                </h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <ToggleRow
                  icon={<Bell size={15} />}
                  title="Notificações por e-mail"
                  description="Receber alertas de novos leads e eventos por e-mail."
                  checked={preferences.emailNotifications}
                  dark={isDarkMode}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      emailNotifications: value,
                    }))
                  }
                />
                <ToggleRow
                  icon={<Bell size={15} />}
                  title="Notificações no painel"
                  description="Mostrar avisos e lembretes no sino do dashboard."
                  checked={preferences.pushNotifications}
                  dark={isDarkMode}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      pushNotifications: value,
                    }))
                  }
                />
                <ToggleRow
                  icon={<PanelLeft size={15} />}
                  title="Sidebar recolhida por padrão"
                  description="Abrir o sistema com menu lateral recolhido."
                  checked={preferences.compactSidebar}
                  dark={isDarkMode}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      compactSidebar: value,
                    }))
                  }
                />
                <ToggleRow
                  icon={<MoonStar size={15} />}
                  title="Modo escuro do dashboard"
                  description="Usar tema escuro no dashboard principal."
                  checked={preferences.darkDashboard}
                  dark={isDarkMode}
                  onChange={(value) => {
                    setPreferences((current) => ({
                      ...current,
                      darkDashboard: value,
                    }));
                    applyDashboardDarkEnabled(user.id, value);
                    setIsDarkMode(value);
                  }}
                />
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "pontuacao" ? (
          <div className="space-y-6">
            <Card className={sectionCardClass} padding="lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 font-bold">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <h2
                      className={clsx(
                        "text-lg font-black tracking-tight",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      Configuração da Regra de Pontuação
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Defina a pontuação concedida por agendamento, check-in e
                      venda para cada empresa.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleSaveScoreRules}
                  isDisabled={scoreSaving}
                  icon={<Save size={16} />}
                  className="bg-[#FF0636] hover:bg-[#d9052e] text-white rounded-full px-5"
                >
                  Salvar Regras
                </Button>
              </div>

              {scoreMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {scoreMessage}
                </div>
              ) : null}

              <div className="mt-6 space-y-6">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Selecione a Empresa / Cliente
                  </label>
                  <Select
                    value={selectedScoreClientId}
                    onChange={(e) =>
                      setSelectedScoreClientId(
                        typeof e === "string"
                          ? e
                          : (e as React.ChangeEvent<HTMLSelectElement>).target
                              .value,
                      )
                    }
                    options={crmClientOptions}
                    className="w-full sm:max-w-md"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-100/40 dark:border-blue-900/40 dark:from-blue-950/30 dark:to-zinc-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white">
                        <CalendarPlus size={16} />
                      </div>
                      <span className="text-[10px] font-black uppercase text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">
                        Padrão: 2 pts
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Pontos por Agendamento
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Concedido ao confirmar agendamento de visita.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreRules.scheduled_points}
                      onChange={(e) =>
                        setScoreRules((prev) => ({
                          ...prev,
                          scheduled_points: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        }))
                      }
                      className={profileFieldClass}
                    />
                  </div>

                  <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-green-100/40 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-zinc-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white">
                        <CheckCircle2 size={16} />
                      </div>
                      <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">
                        Padrão: 3 pts
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Pontos por Check-in
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Concedido quando o cliente realiza check-in.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreRules.checkin_points}
                      onChange={(e) =>
                        setScoreRules((prev) => ({
                          ...prev,
                          checkin_points: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        }))
                      }
                      className={profileFieldClass}
                    />
                  </div>

                  <div className="rounded-2xl border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 to-pink-100/40 dark:border-fuchsia-900/40 dark:from-fuchsia-950/30 dark:to-zinc-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500 text-white">
                        <ShoppingCart size={16} />
                      </div>
                      <span className="text-[10px] font-black uppercase text-fuchsia-700 dark:text-fuchsia-400 bg-fuchsia-100 dark:bg-fuchsia-900/50 px-2 py-0.5 rounded-full">
                        Padrão: 7 pts
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Pontos por Venda
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Concedido ao registrar a venda final.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreRules.sold_points}
                      onChange={(e) =>
                        setScoreRules((prev) => ({
                          ...prev,
                          sold_points: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        }))
                      }
                      className={profileFieldClass}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        <Modal
          open={accessModalOpen}
          onClose={closeAccessModal}
          title={accessEditing ? "Editar acesso" : "Novo acesso"}
          size="lg"
          dark={isDarkMode}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={closeAccessModal}
                isDisabled={accessSaving}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void handleSaveAccess()}
                loading={accessSaving}
                icon={<Save size={15} />}
              >
                {accessEditing ? "Salvar alterações" : "Criar acesso"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {accessEditing
                ? "Atualize os dados da conta. Deixe a senha vazia para mantê-la."
                : "Cadastre a conta e defina a senha inicial de acesso ao painel."}
            </p>

            {accessFormError ? (
              <Notice tone="error" className="text-xs">
                {accessFormError}
              </Notice>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome"
                value={accessForm.name}
                onChange={(event) =>
                  setAccessForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                autoComplete="name"
                maxLength={255}
              />
              <Input
                label="E-mail"
                type="email"
                value={accessForm.email}
                onChange={(event) =>
                  setAccessForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                autoComplete="email"
                maxLength={255}
              />
              <Input
                label={
                  accessEditing ? "Nova senha (opcional)" : "Senha inicial"
                }
                type="password"
                value={accessForm.password}
                onChange={(event) =>
                  setAccessForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                autoComplete="new-password"
                maxLength={255}
              />
              <Input
                label="Telefone (opcional)"
                value={accessForm.phone}
                onChange={(event) =>
                  setAccessForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                autoComplete="tel"
                maxLength={20}
              />
              <Select
                label="Perfil"
                value={accessForm.role}
                options={
                  accessEditing && accessEditing.role !== "gestor"
                    ? ACCESS_ROLE_OPTIONS.filter(
                        (option) => option.value !== "gestor",
                      )
                    : ACCESS_ROLE_OPTIONS
                }
                disabled={accessEditing?.role === "gestor"}
                onValueChange={(value) =>
                  setAccessForm((current) => ({
                    ...current,
                    role: value as AccessRole,
                    client_id: value === "gestor" ? "" : current.client_id,
                    vendor_categories:
                      value === "vendedor" ? current.vendor_categories : [],
                  }))
                }
              />
              {accessForm.role !== "gestor" ? (
                <Select
                  label="Empresa"
                  value={accessForm.client_id}
                  placeholder="Selecione a empresa"
                  options={Object.entries(accessCompanies)
                    .sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"))
                    .map(([value, label]) => ({ value, label }))}
                  onValueChange={(client_id) =>
                    setAccessForm((current) => ({
                      ...current,
                      client_id,
                    }))
                  }
                />
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              {PASSWORD_REQUIREMENTS_HINT}
            </p>

            {accessForm.role === "vendedor" ? (
              <fieldset className="rounded-2xl border border-border p-4">
                <legend className="px-1 text-sm font-semibold">
                  Categorias do vendedor
                </legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {VENDOR_CATEGORY_OPTIONS.map((option) => {
                    const checked = accessForm.vendor_categories.includes(
                      option.value,
                    );
                    return (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setAccessForm((current) => ({
                              ...current,
                              vendor_categories: checked
                                ? current.vendor_categories.filter(
                                    (category) => category !== option.value,
                                  )
                                : [...current.vendor_categories, option.value],
                            }))
                          }
                          className="accent-[#FF0636]"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {accessEditing?.role === "gestor" ? (
              <p className="text-xs text-muted-foreground">
                O perfil de gestor é global e não pode ser trocado.
              </p>
            ) : null}
          </div>
        </Modal>

        <ConfirmationModal
          open={Boolean(accessDeleteTarget)}
          onClose={() => {
            if (!accessDeleteSaving) setAccessDeleteTarget(null);
          }}
          onConfirm={() => void handleDeleteAccess()}
          loading={accessDeleteSaving}
          title="Excluir acesso"
          description={
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir permanentemente o acesso de{" "}
              <span className="font-semibold text-foreground">
                {accessDeleteTarget?.name}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
          }
          confirmLabel="Excluir acesso"
          dark={isDarkMode}
        />

        <Modal
          open={passwordModalOpen}
          onClose={closePasswordModal}
          title="Alterar senha"
          size="md"
          dark={isDarkMode}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={closePasswordModal}
                isDisabled={passwordSaving}
                className="rounded-2xl px-5 py-3"
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePasswordChange}
                loading={passwordSaving}
                icon={<ShieldCheck size={16} />}
                className={clsx(
                  "rounded-2xl px-5 py-3 text-white",
                  isDarkMode
                    ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                    : "bg-[#0b0b0b] hover:bg-zinc-800",
                )}
              >
                Salvar nova senha
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p
              className={clsx(
                "text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              Use sua senha atual para cadastrar uma nova. Ao salvar, esta
              sessão será encerrada.
            </p>

            {passwordError ? (
              <div
                className={clsx(
                  "rounded-2xl border px-4 py-3 text-sm font-medium",
                  isDarkMode
                    ? "border-rose-900/60 bg-rose-950/40 text-rose-300"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                {passwordError}
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Senha atual
              </p>
              <input
                type="password"
                autoComplete="current-password"
                value={passwordCurrent}
                onChange={(event) => setPasswordCurrent(event.target.value)}
                className={profileFieldClass}
              />
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Nova senha
              </p>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordNew}
                onChange={(event) => setPasswordNew(event.target.value)}
                className={profileFieldClass}
              />
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Confirmar nova senha
              </p>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className={profileFieldClass}
              />
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
