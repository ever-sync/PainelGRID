import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Search,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  User,
  CalendarDays,
  QrCode,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Notice } from "../../components/ui/Notice";
import { pushToast } from "../../components/ui/Toast";
import type { ConfirmationStatus, Lead, User as AuthUser } from "../../types";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { resolveClientId } from "../../utils/userContext";
import { createAudioContext } from "../../utils/audioContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { readStoredSession } from "../../services/auth";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import {
  checkLeadPhone,
  checkInLeadByToken,
  createLead,
  fetchAllLeads,
  listVendorAvailability,
  mapApiLeadToLead,
  notifyVendorCall,
  type VendorAvailability,
  updateLead,
} from "../../services/leads";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import { checkInAppointment } from "../../services/appointments";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import { connectRealtime } from "../../services/realtime";
import { LazyQrScanner } from "../../components/shared/LazyQrScanner";
import type { Event } from "../../types";
import {
  formatBrPhoneInput,
  normalizeBrPhoneToE164,
  phoneDigitsForCompare,
} from "../../utils/phone";
import { triggerHapticFeedback } from "../../utils/haptics";

type OutletContext = {
  user: AuthUser;
};

type DiscoverySource =
  "instagram" | "facebook" | "indicacao" | "passagem" | "outro";

const CHECKIN_PAGE_SIZE = 25;

const DISCOVERY_SOURCE_OPTIONS: Array<{
  value: DiscoverySource;
  label: string;
}> = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "indicacao", label: "Indicação" },
  { value: "passagem", label: "Passagem" },
  { value: "outro", label: "Outro" },
];

/** Aceita token/JWT ou URL com `?v=` (ex.: página /convite). */
function normalizeCheckInPaste(raw: string): string {
  const t = raw.trim();
  if (!t) return t;

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const v = u.searchParams.get("v");
      if (v?.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  const q = t.match(/[?&]v=([^&]+)/);
  if (q?.[1]) {
    try {
      return decodeURIComponent(q[1].replace(/\+/g, " ")).trim();
    } catch {
      return q[1].trim();
    }
  }

  return t;
}

function borderForStatus(status: ConfirmationStatus, dark: boolean) {
  if (dark) {
    switch (status) {
      case "checked_in":
        return "border-l-emerald-500";
      case "scheduled":
        return "border-l-amber-500";
      case "confirmed":
        return "border-l-sky-500";
      case "pending":
        return "border-l-zinc-500";
      case "cancelled":
        return "border-l-red-500";
      default:
        return "border-l-zinc-600";
    }
  }
  switch (status) {
    case "checked_in":
      return "border-l-green-400";
    case "scheduled":
      return "border-l-amber-400";
    case "confirmed":
      return "border-l-blue-400";
    case "pending":
      return "border-l-blue-300";
    case "cancelled":
      return "border-l-red-400";
    default:
      return "border-l-gray-200";
  }
}

export function CheckinPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [leadsState, setLeadsState] = useState<Lead[]>([]);
  const [vendorsById, setVendorsById] = useState<Record<string, string>>({});
  const [staffList, setStaffList] = useState<AuthUser[]>([]);
  const [vendorAvailability, setVendorAvailability] = useState<
    VendorAvailability[]
  >([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [discoverySource, setDiscoverySource] =
    useState<DiscoverySource | null>(null);
  const [discoverySourceOther, setDiscoverySourceOther] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [, setInviteToken] = useState("");
  const [tokenHint, setTokenHint] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [scannedToken, setScannedToken] = useState("");
  const [activeTab, setActiveTab] = useState<
    "all" | "expected" | "arrived" | "absent"
  >("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [, setScannerTab] = useState<"qr" | "manual">("qr");
  const [scannerKey, setScannerKey] = useState(0);
  const [quickCheckinLead, setQuickCheckinLead] = useState<Lead | null>(null);
  const [quickCheckinVendorId, setQuickCheckinVendorId] =
    useState("__automatic__");
  const [quickCheckinBusy, setQuickCheckinBusy] = useState(false);
  const [quickCheckinError, setQuickCheckinError] = useState("");

  const refreshCheckinData = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    void Promise.all([
      listEvents({ client_id: clientId }, t),
      // A recepção precisa enxergar a operação inteira. `listLeads` retorna
      // apenas a primeira página (50 itens), fazendo os cards e a busca
      // omitirem agendamentos antigos do Rubinho e dos vendedores.
      fetchAllLeads({ client_id: clientId }, t, {
        maxItems: 20_000,
        // Exibe a primeira pagina imediatamente. Antes, qualquer demora ou
        // falha em uma pagina posterior mantinha a recepcao inteira vazia.
        onPage: (_page, accumulated) => {
          setLeadsState(accumulated.map(mapApiLeadToLead));
        },
      }),
    ])
      .then(([eventRows, leadRows]) => {
        const mapped = eventRows.map(mapApiEventToEvent);
        setEvents(mapped);
        setSelectedEventId((prev) => {
          if (prev && mapped.some((e) => e.id === prev)) return prev;
          const active = mapped.find((e) => e.status === "active");
          return active?.id ?? mapped[0]?.id ?? "";
        });
        setLeadsState(leadRows.map(mapApiLeadToLead));
      })
      .catch(() => {
        // Uma falha transitoria nao deve apagar a operacao que ja estava na
        // tela (nem as paginas que acabaram de chegar pelo onPage).
      });
    void listClientStaff(clientId, t)
      .then((rows) => {
        const mapped = rows.map(mapStaffToUser);
        setStaffList(mapped);
        const map: Record<string, string> = {};
        mapped.forEach((u) => {
          map[u.id] = u.name;
        });
        setVendorsById(map);
      })
      .catch(() => {
        setVendorsById({});
        setStaffList([]);
      });
    void listVendorAvailability(t, clientId)
      .then(setVendorAvailability)
      .catch(() => setVendorAvailability([]));
  }, [clientId]);

  useEffect(() => {
    refreshCheckinData();
  }, [refreshCheckinData]);

  useLeadRealtimeSync(clientId, refreshCheckinData);

  useEffect(() => {
    if (!clientId) return;
    const socket = connectRealtime(clientId);
    const handleAvailabilityChange = () => {
      const token = readStoredSession()?.accessToken;
      if (!token) return;
      void listVendorAvailability(token, clientId)
        .then(setVendorAvailability)
        .catch(() => setVendorAvailability([]));
    };
    socket.on("vendor_availability_changed", handleAvailabilityChange);
    socket.on("vendor_attendance_updated", handleAvailabilityChange);
    return () => {
      socket.off("vendor_availability_changed", handleAvailabilityChange);
      socket.off("vendor_attendance_updated", handleAvailabilityChange);
      socket.disconnect();
    };
  }, [clientId]);

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

  const event = events.find((e) => e.id === selectedEventId);
  const leadsForEvent = useMemo(
    () => leadsState.filter((l) => l.event_id === selectedEventId),
    [leadsState, selectedEventId],
  );

  const today = new Date();

  const filtered = useMemo(() => {
    const matchedSearch = leadsForEvent.filter(
      (l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.phone.includes(search),
    );
    if (activeTab === "expected") {
      return matchedSearch.filter(
        (l) =>
          l.confirmation_status === "scheduled" ||
          l.confirmation_status === "confirmed",
      );
    }
    if (activeTab === "arrived") {
      return matchedSearch.filter(
        (l) => l.confirmation_status === "checked_in",
      );
    }
    if (activeTab === "absent") {
      return matchedSearch.filter((l) => l.confirmation_status === "cancelled");
    }
    return matchedSearch;
  }, [leadsForEvent, search, activeTab]);
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / CHECKIN_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLeads = filtered.slice(
    (safeCurrentPage - 1) * CHECKIN_PAGE_SIZE,
    safeCurrentPage * CHECKIN_PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search, selectedEventId]);
  const normalizedLeadPhone = normalizeBrPhoneToE164(leadPhone);
  const normalizedLeadEmail = leadEmail.trim();
  const isLeadEmailValid =
    !normalizedLeadEmail ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLeadEmail);
  const duplicatePhoneLead = normalizedLeadPhone
    ? (leadsState.find(
        (lead) =>
          lead.event_id === selectedEventId &&
          phoneDigitsForCompare(lead.phone) ===
            phoneDigitsForCompare(normalizedLeadPhone),
      ) ?? null)
    : null;

  const expected = leadsForEvent.filter(
    (l) =>
      l.confirmation_status === "scheduled" ||
      l.confirmation_status === "confirmed",
  ).length;
  const arrived = leadsForEvent.filter(
    (l) => l.confirmation_status === "checked_in",
  ).length;
  const notCame = leadsForEvent.filter(
    (l) => l.confirmation_status === "cancelled",
  ).length;

  const [pendingCount, setPendingCount] = useState(0);

  const tryDecodeCheckinToken = (rawToken: string): string => {
    const t = rawToken.trim();
    if (t.split(".").length === 3) {
      try {
        const base64Url = t.split(".")[1];
        let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) {
          base64 += "=";
        }
        const payload = JSON.parse(window.atob(base64));
        if (payload && payload.t) {
          return payload.t;
        }
      } catch {
        // ignore
      }
    }
    return t;
  };

  const syncPendingCheckins = useCallback(async () => {
    const pending = JSON.parse(
      localStorage.getItem("pending_checkins") || "[]",
    );
    if (pending.length === 0) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;

    const successful: string[] = [];
    for (const token of pending) {
      try {
        const payload = normalizeCheckInPaste(token);
        const updated = await checkInLeadByToken(payload, t);
        const mapped = mapApiLeadToLead(updated);
        setLeadsState((prev) => {
          const idx = prev.findIndex((l) => l.id === mapped.id);
          if (idx === -1) return [...prev, mapped];
          return prev.map((l) => (l.id === mapped.id ? mapped : l));
        });
        successful.push(token);
      } catch (err) {
        const isNetwork =
          !navigator.onLine ||
          err instanceof TypeError ||
          (err instanceof Error && err.message.includes("fetch"));
        if (isNetwork) {
          break;
        }
        successful.push(token);
      }
    }

    if (successful.length > 0) {
      const current = JSON.parse(
        localStorage.getItem("pending_checkins") || "[]",
      );
      const remaining = current.filter((x: string) => !successful.includes(x));
      localStorage.setItem("pending_checkins", JSON.stringify(remaining));
      setPendingCount(remaining.length);
    }
  }, []);

  useEffect(() => {
    const updateCount = () => {
      const pending = JSON.parse(
        localStorage.getItem("pending_checkins") || "[]",
      );
      setPendingCount(pending.length);
    };
    updateCount();
    window.addEventListener("storage", updateCount);
    return () => window.removeEventListener("storage", updateCount);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      void syncPendingCheckins();
    };
    window.addEventListener("online", handleOnline);

    const interval = setInterval(() => {
      if (navigator.onLine) {
        void syncPendingCheckins();
      }
    }, 10000);

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, [syncPendingCheckins]);

  const playBeep = (freq = 880) => {
    try {
      const ctx = createAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      /* ignore */
    }
  };

  const handleCheckInByTokenValue = async (tokenValue: string) => {
    const t = readStoredSession()?.accessToken;
    const payload = normalizeCheckInPaste(tokenValue);
    if (!t || !payload) return;
    setTokenHint("");
    setTokenBusy(true);
    try {
      const updated = await checkInLeadByToken(payload, t);
      const mapped = mapApiLeadToLead(updated);
      setLeadsState((prev) => {
        const idx = prev.findIndex((l) => l.id === mapped.id);
        if (idx === -1) return [...prev, mapped];
        return prev.map((l) => (l.id === mapped.id ? mapped : l));
      });
      setInviteToken("");
      setTokenHint(`Check-in realizado! ${mapped.name} confirmado.`);
      playBeep(880);
      triggerHapticFeedback([100, 50, 100]);
      setShowScannerModal(false);
      setQuickCheckinVendorId("__automatic__");
      setQuickCheckinLead(mapped);
    } catch (err) {
      const isNetwork =
        !navigator.onLine ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"));
      if (isNetwork) {
        const checkinToken = tryDecodeCheckinToken(payload);
        const localLead = leadsState.find(
          (l) => l.checkin_token === checkinToken,
        );

        const pending = JSON.parse(
          localStorage.getItem("pending_checkins") || "[]",
        );
        if (!pending.includes(tokenValue)) {
          localStorage.setItem(
            "pending_checkins",
            JSON.stringify([...pending, tokenValue]),
          );
          setPendingCount(pending.length + 1);
        }

        if (localLead) {
          setLeadsState((prev) =>
            prev.map((l) =>
              l.id === localLead.id
                ? { ...l, confirmation_status: "checked_in" }
                : l,
            ),
          );
          setInviteToken("");
          setTokenHint(
            `[OFFLINE] Check-in realizado localmente para ${localLead.name}. Sincronizará quando a rede voltar.`,
          );
          playBeep(880);
        } else {
          setInviteToken("");
          setTokenHint(
            `[OFFLINE] Check-in registrado na fila! Lead não localizado localmente, sincronizará quando a rede voltar.`,
          );
          playBeep(440);
        }

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        setShowScannerModal(false);
      } else {
        setTokenHint("Código inválido ou convite de outra empresa.");
        setScannerKey((key) => key + 1);
      }
    } finally {
      setTokenBusy(false);
    }
  };

  const openScanner = () => {
    setTokenHint("");
    setInviteToken("");
    setScannerTab("qr");
    setScannerKey((k) => k + 1); // force remount QrScanner
    setShowScannerModal(true);
  };

  const handleQuickCheckin = async (sendToQueue: boolean) => {
    if (!quickCheckinLead) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;

    setQuickCheckinBusy(true);
    setQuickCheckinError("");
    try {
      if (quickCheckinLead.confirmation_status !== "checked_in") {
        const appointmentId = quickCheckinLead.active_appointment?.id;
        if (appointmentId) {
          await checkInAppointment(t, appointmentId);
        } else {
          await updateLead(
            quickCheckinLead.id,
            { confirmation_status: "checked_in" },
            t,
          );
        }
      }

      if (sendToQueue) {
        await notifyVendorCall(
          quickCheckinLead.id,
          t,
          quickCheckinVendorId === "__automatic__"
            ? { mode: "automatic" }
            : { mode: "manual", vendor_id: quickCheckinVendorId },
        );
      }

      setQuickCheckinLead(null);
      refreshCheckinData();
    } catch (error) {
      setQuickCheckinError(
        error instanceof Error
          ? error.message
          : "Não foi possível realizar o check-in rápido.",
      );
    } finally {
      setQuickCheckinBusy(false);
    }
  };

  const handleCreateLead = async () => {
    if (createBusy) return;
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId) return;
    if (!selectedEventId) {
      setCreateError("Selecione um evento antes de cadastrar o lead.");
      return;
    }
    if (event?.allow_reception_quick_create !== true) {
      setCreateError("Cadastro rápido desabilitado para este evento.");
      return;
    }
    if (!leadName.trim()) {
      setCreateError("Informe o nome do lead.");
      return;
    }
    if (!normalizedLeadPhone) {
      setCreateError("Informe um telefone válido (ex: +5512981092776).");
      return;
    }
    if (duplicatePhoneLead) {
      setCreateError("Este telefone já está cadastrado neste evento.");
      return;
    }
    if (!isLeadEmailValid) {
      setCreateError("Informe um e-mail válido ou deixe o campo vazio.");
      return;
    }
    if (!discoverySource) {
      setCreateError("Informe como o cliente ficou sabendo.");
      return;
    }
    if (discoverySource === "outro" && !discoverySourceOther.trim()) {
      setCreateError("Descreva como o cliente ficou sabendo.");
      return;
    }

    setCreateError("");
    setCreateBusy(true);
    try {
      const check = await checkLeadPhone(
        normalizedLeadPhone,
        token,
        clientId,
        selectedEventId,
      );
      if (check.exists) {
        setCreateError("Este telefone já está cadastrado neste evento.");
        return;
      }
      const discoveryLabel =
        discoverySource === "outro"
          ? discoverySourceOther.trim()
          : DISCOVERY_SOURCE_OPTIONS.find(
              (option) => option.value === discoverySource,
            )?.label;
      const row = await createLead(
        {
          client_id: clientId,
          name: leadName.trim(),
          email: normalizedLeadEmail || null,
          phone: normalizedLeadPhone,
          source:
            discoverySource === "instagram" || discoverySource === "facebook"
              ? "facebook_ads"
              : "manual",
          event_interest_id: selectedEventId,
          tags: [`discovery_source:${discoverySource}`],
          notes: `Como ficou sabendo: ${discoveryLabel}`,
        },
        token,
      );
      const mapped = mapApiLeadToLead(row);
      setLeadsState((prev) => [mapped, ...prev]);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setDiscoverySource(null);
      setDiscoverySourceOther("");
      setShowModal(false);
      setSearch("");
      setActiveTab("all");
      setCurrentPage(1);
      setQuickCheckinError("");
      setQuickCheckinVendorId("__automatic__");
      setQuickCheckinLead(mapped);
      pushToast({
        type: "success",
        message: `${mapped.name} foi cadastrado. Confirme agora o check-in e o vendedor.`,
      });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o lead.",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const StatusIcon = ({
    status,
    dark,
  }: {
    status: ConfirmationStatus;
    dark: boolean;
  }) => {
    switch (status) {
      case "checked_in":
        return (
          <CheckCircle2
            size={16}
            className={dark ? "text-emerald-400" : "text-green-500"}
          />
        );
      case "scheduled":
        return (
          <CalendarDays
            size={16}
            className={dark ? "text-amber-400" : "text-amber-500"}
          />
        );
      case "confirmed":
        return (
          <Clock size={16} className={dark ? "text-sky-400" : "text-sky-600"} />
        );
      case "pending":
        return (
          <Clock
            size={16}
            className={dark ? "text-zinc-500" : "text-gray-400"}
          />
        );
      case "cancelled":
        return <XCircle size={16} className="text-red-400" />;
    }
  };

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
        title="Check-in"
        breadcrumbs={[{ label: "Recepção" }, { label: "Check-in" }]}
        dark={isDarkMode}
        subtitle={`Evento: ${event?.name ?? "Selecione um evento"} — ${today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`}
      />

      {pendingCount > 0 && (
        <div className="mb-4 mt-2 flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-amber-200">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-sm font-medium">
              Você possui {pendingCount}{" "}
              {pendingCount === 1 ? "check-in pendente" : "check-ins pendentes"}{" "}
              de sincronização (modo offline).
            </span>
          </div>
          <button
            onClick={() => void syncPendingCheckins()}
            className="text-xs font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300"
          >
            Sincronizar agora
          </button>
        </div>
      )}

      <div className="mb-4 max-w-md">
        <Select
          placeholder="Evento"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          options={events.map((ev) => ({
            value: ev.id,
            label: `${ev.name} (${ev.status})`,
          }))}
          className="w-full"
          dark={isDarkMode}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
        <div
          className={clsx(
            "rounded-xl border p-3 md:p-4 text-center shadow-sm",
            isDarkMode
              ? "card-surface border-zinc-700/90 bg-[#141414]"
              : "border-gray-100 bg-white",
          )}
        >
          <div
            className={clsx(
              "mx-auto mb-2 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full",
              isDarkMode ? "bg-sky-500/15" : "bg-blue-100",
            )}
          >
            <Clock
              className={clsx(
                "h-4 w-4 md:h-5 md:w-5",
                isDarkMode ? "text-sky-400" : "text-blue-500",
              )}
            />
          </div>
          <p
            className={clsx(
              "text-lg md:text-2xl font-bold",
              isDarkMode ? "text-zinc-100" : "text-gray-900",
            )}
          >
            {expected}
          </p>
          <p
            className={clsx(
              "mt-0.5 text-[10px] md:text-xs",
              isDarkMode ? "text-zinc-500" : "text-gray-400",
            )}
          >
            Esperados
          </p>
        </div>
        <div
          className={clsx(
            "rounded-xl border p-3 md:p-4 text-center shadow-sm",
            isDarkMode
              ? "card-surface border-zinc-700/90 bg-[#141414]"
              : "border-gray-100 bg-white",
          )}
        >
          <div
            className={clsx(
              "mx-auto mb-2 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full",
              isDarkMode ? "bg-emerald-500/15" : "bg-green-100",
            )}
          >
            <CheckCircle2
              className={clsx(
                "h-4 w-4 md:h-5 md:w-5",
                isDarkMode ? "text-emerald-400" : "text-green-500",
              )}
            />
          </div>
          <p
            className={clsx(
              "text-lg md:text-2xl font-bold",
              isDarkMode ? "text-zinc-100" : "text-gray-900",
            )}
          >
            {arrived}
          </p>
          <p
            className={clsx(
              "mt-0.5 text-[10px] md:text-xs",
              isDarkMode ? "text-zinc-500" : "text-gray-400",
            )}
          >
            Chegaram
          </p>
        </div>
        <div
          className={clsx(
            "rounded-xl border p-3 md:p-4 text-center shadow-sm",
            isDarkMode
              ? "card-surface border-zinc-700/90 bg-[#141414]"
              : "border-gray-100 bg-white",
          )}
        >
          <div
            className={clsx(
              "mx-auto mb-2 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full",
              isDarkMode ? "bg-red-500/15" : "bg-red-100",
            )}
          >
            <XCircle
              className={clsx(
                "h-4 w-4 md:h-5 md:w-5",
                isDarkMode ? "text-red-400" : "text-red-400",
              )}
            />
          </div>
          <p
            className={clsx(
              "text-lg md:text-2xl font-bold",
              isDarkMode ? "text-zinc-100" : "text-gray-900",
            )}
          >
            {notCame}
          </p>
          <p
            className={clsx(
              "mt-0.5 text-[10px] md:text-xs",
              isDarkMode ? "text-zinc-500" : "text-gray-400",
            )}
          >
            Não Vieram
          </p>
        </div>
      </div>

      {(() => {
        const availableIds = new Set(
          vendorAvailability
            .filter((vendor) => vendor.eligible)
            .map((vendor) => vendor.id),
        );
        const onlineStaff = staffList.filter((staff) =>
          availableIds.has(staff.id),
        );
        return (
          <div
            className={clsx(
              "mb-6 rounded-xl border p-4 shadow-sm space-y-3",
              isDarkMode
                ? "card-surface border-zinc-700/90 bg-[#141414]"
                : "border-gray-100 bg-white",
            )}
          >
            <h3
              className={clsx(
                "text-xs font-bold uppercase tracking-wider",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              Vendedores Ativos ({onlineStaff.length})
            </h3>
            {onlineStaff.length === 0 ? (
              <p
                className={clsx(
                  "text-xs",
                  isDarkMode ? "text-zinc-600" : "text-gray-400",
                )}
              >
                Nenhum vendedor online no momento.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {onlineStaff.map((vendor) => (
                  <span
                    key={vendor.id}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border",
                      isDarkMode
                        ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    {vendor.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search size={16} />}
          className="w-full sm:max-w-sm"
          dark={isDarkMode}
        />
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <Button
            variant="secondary"
            icon={<QrCode size={16} />}
            onClick={openScanner}
            className="flex-1 sm:flex-none justify-center"
          >
            Escanear QR
          </Button>
          {event?.allow_reception_quick_create === true ? (
            <Button
              icon={<Plus size={16} />}
              onClick={() => setShowModal(true)}
              className="flex-1 sm:flex-none justify-center"
            >
              Cadastro Rápido
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 flex border-b border-zinc-200 dark:border-zinc-850 overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            activeTab === "all"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Todos ({leadsForEvent.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("expected")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            activeTab === "expected"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Esperados ({expected})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("arrived")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            activeTab === "arrived"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Chegaram ({arrived})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("absent")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            activeTab === "absent"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Não Vieram ({notCame})
        </button>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p
            className={clsx(
              "py-10 text-center text-sm",
              isDarkMode ? "text-zinc-500" : "text-gray-400",
            )}
          >
            Nenhum lead neste evento.
          </p>
        )}
        {paginatedLeads.map((lead) => {
          const vendorName = lead.assigned_vendor_id
            ? vendorsById[lead.assigned_vendor_id]
            : undefined;
          const isCheckedIn = lead.confirmation_status === "checked_in";

          return (
            <div
              key={lead.id}
              className={clsx(
                "flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-l-4 p-4 shadow-sm gap-3 sm:gap-0",
                isDarkMode
                  ? "border-zinc-700/90 bg-[#141414]"
                  : "border-gray-100 bg-white",
                borderForStatus(lead.confirmation_status, isDarkMode),
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isDarkMode
                      ? "bg-zinc-800 text-red-400"
                      : "bg-blue-100 text-blue-600",
                  )}
                >
                  {lead.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p
                      className={clsx(
                        "text-sm font-semibold",
                        isDarkMode ? "text-zinc-100" : "text-gray-900",
                      )}
                    >
                      {lead.name}
                    </p>
                    <StatusIcon
                      status={lead.confirmation_status}
                      dark={isDarkMode}
                    />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div
                      className={clsx(
                        "flex items-center gap-1 text-xs",
                        isDarkMode ? "text-zinc-500" : "text-gray-400",
                      )}
                    >
                      <Phone size={11} />
                      <span>{lead.phone}</span>
                    </div>
                    {lead.event_interest && (
                      <span
                        className={clsx(
                          "text-xs",
                          isDarkMode ? "text-zinc-500" : "text-gray-400",
                        )}
                      >
                        {lead.event_interest}
                      </span>
                    )}
                    {vendorName && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <User size={11} className="text-zinc-400" />
                        <span
                          className={clsx(
                            "font-semibold",
                            isDarkMode ? "text-zinc-300" : "text-zinc-700",
                          )}
                        >
                          {vendorName.split(" ")[0]}
                        </span>

                        {(() => {
                          const vId = lead.assigned_vendor_id!;
                          const availability = vendorAvailability.find(
                            (vendor) => vendor.id === vId,
                          );
                          const finalStatus = !availability
                            ? "offline"
                            : availability.operational_status === "away"
                              ? "away"
                              : "online";

                          if (finalStatus === "offline") {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 ring-1 ring-red-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                O vendedor deste lead está offline
                              </span>
                            );
                          }

                          if (finalStatus === "away") {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 ring-1 ring-amber-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                O vendedor está ausente, aguarde um pouco
                              </span>
                            );
                          }

                          return (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 ring-1 ring-emerald-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Online
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:w-auto">
                <button
                  type="button"
                  onClick={openScanner}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#e51838] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-[#c91432] active:scale-95 shadow-sm"
                >
                  <QrCode size={16} />
                  <span>Ler QR Code</span>
                </button>
                <button
                  type="button"
                  disabled={isCheckedIn}
                  onClick={() => {
                    setQuickCheckinError("");
                    setQuickCheckinVendorId("__automatic__");
                    setQuickCheckinLead(lead);
                  }}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {isCheckedIn ? "Check-in feito" : "Check-in Rápido"}
                  </span>
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length > CHECKIN_PAGE_SIZE && (
          <div
            className={clsx(
              "flex flex-col items-center justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row",
              isDarkMode
                ? "border-zinc-700/90 bg-[#141414] text-zinc-300"
                : "border-gray-100 bg-white text-gray-600",
            )}
          >
            <span className="text-xs font-medium">
              Mostrando {(safeCurrentPage - 1) * CHECKIN_PAGE_SIZE + 1}–
              {Math.min(safeCurrentPage * CHECKIN_PAGE_SIZE, filtered.length)}{" "}
              de {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="min-w-24 text-center text-xs font-semibold">
                Página {safeCurrentPage} de {totalPages}
              </span>
              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => {
          if (!createBusy) setShowModal(false);
        }}
        title="Cadastrar lead"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowModal(false)}
              isDisabled={createBusy}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreateLead()}
              loading={createBusy}
              isDisabled={
                !!duplicatePhoneLead ||
                !selectedEventId ||
                event?.allow_reception_quick_create !== true ||
                !leadName.trim() ||
                !normalizedLeadPhone ||
                !isLeadEmailValid ||
                !discoverySource ||
                (discoverySource === "outro" && !discoverySourceOther.trim())
              }
            >
              Cadastrar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Nome *"
            value={leadName}
            onChange={(inputEvent) => {
              setLeadName(inputEvent.target.value.slice(0, 255));
              setCreateError("");
            }}
            placeholder="Nome do cliente"
            autoComplete="name"
            isDisabled={createBusy}
          />
          <Input
            label="Telefone *"
            type="tel"
            inputMode="tel"
            value={leadPhone}
            onChange={(inputEvent) => {
              setLeadPhone(formatBrPhoneInput(inputEvent.target.value));
              setCreateError("");
            }}
            placeholder="(12) 98109-2776"
            autoComplete="tel"
            isDisabled={createBusy}
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
              Telefone já cadastrado para {duplicatePhoneLead.name}.
            </Notice>
          ) : null}
          <Input
            label="E-mail (opcional)"
            type="email"
            value={leadEmail}
            onChange={(inputEvent) => {
              setLeadEmail(inputEvent.target.value.slice(0, 255));
              setCreateError("");
            }}
            placeholder="cliente@exemplo.com"
            autoComplete="email"
            error={
              normalizedLeadEmail && !isLeadEmailValid
                ? "Informe um e-mail válido."
                : undefined
            }
            isDisabled={createBusy}
          />
          <fieldset className="space-y-2 pt-1">
            <legend
              className={clsx(
                "text-xs font-semibold uppercase tracking-wide",
                isDarkMode ? "text-zinc-300" : "text-zinc-700",
              )}
            >
              Como ficou sabendo? <span className="text-red-500">*</span>
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DISCOVERY_SOURCE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    discoverySource === option.value
                      ? isDarkMode
                        ? "border-[#e51838] bg-[#e51838]/10 text-white"
                        : "border-[#e51838] bg-red-50 text-zinc-900"
                      : isDarkMode
                        ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        : "border-gray-300 text-zinc-700 hover:bg-gray-50",
                  )}
                >
                  <input
                    type="radio"
                    name="discovery-source"
                    value={option.value}
                    checked={discoverySource === option.value}
                    onChange={() => {
                      setDiscoverySource(option.value);
                      if (option.value !== "outro") {
                        setDiscoverySourceOther("");
                      }
                      setCreateError("");
                    }}
                    className="h-4 w-4 accent-[#e51838]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          {discoverySource === "outro" ? (
            <Input
              label="Qual? *"
              value={discoverySourceOther}
              onChange={(event) =>
                setDiscoverySourceOther(event.target.value.slice(0, 450))
              }
              placeholder="Digite como o cliente ficou sabendo"
              dark={isDarkMode}
            />
          ) : null}
          {createError ? (
            <Notice tone="error" className="text-xs">
              {createError}
            </Notice>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        title="Escanear Convite (QR Code)"
        dark={isDarkMode}
      >
        <div className="space-y-4">
          <p
            className={clsx(
              "text-xs leading-relaxed",
              isDarkMode ? "text-zinc-450" : "text-zinc-550",
            )}
          >
            Aponte a câmera para o QR Code do convite do cliente para realizar o
            check-in automático.
          </p>
          {showScannerModal && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 relative overflow-hidden">
              <LazyQrScanner
                key={scannerKey}
                onScan={(val) => {
                  setScannedToken(val);
                  void handleCheckInByTokenValue(val);
                }}
                onClose={() => setShowScannerModal(false)}
              />
              {tokenBusy ? (
                <p className="mt-2 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Validando convite...
                </p>
              ) : null}
              {tokenHint ? (
                <Notice
                  tone={
                    tokenHint.startsWith("Check-in realizado")
                      ? "success"
                      : "error"
                  }
                  className="mt-2 text-xs"
                >
                  {tokenHint}
                </Notice>
              ) : null}
              {scannedToken && !tokenBusy && !tokenHint ? (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  QR Code identificado.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(quickCheckinLead)}
        onClose={() => {
          if (!quickCheckinBusy) setQuickCheckinLead(null);
        }}
        title="Check-in Rápido"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setQuickCheckinLead(null)}
              isDisabled={quickCheckinBusy}
            >
              Não
            </Button>
            <Button
              onClick={() => void handleQuickCheckin(true)}
              loading={quickCheckinBusy}
            >
              Sim
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p
            className={clsx(
              "text-sm",
              isDarkMode ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            Enviar <strong>{quickCheckinLead?.name}</strong> para a fila de
            atendimento?
          </p>
          <Select
            label="Como deseja chamar?"
            value={quickCheckinVendorId}
            onChange={(event) => {
              setQuickCheckinVendorId(event.target.value);
              setQuickCheckinError("");
            }}
            dark={isDarkMode}
            options={[
              {
                value: "__automatic__",
                label: "Próximo vendedor disponível (automático)",
              },
              ...vendorAvailability
                .filter((vendor) => vendor.eligible)
                .map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                })),
            ]}
          />
          <p
            className={clsx(
              "text-xs",
              isDarkMode ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {vendorAvailability.filter((vendor) => vendor.eligible).length}{" "}
            vendedor(es) online e disponível(is).
          </p>
          {quickCheckinError ? (
            <Notice tone="error" className="text-xs">
              {quickCheckinError}
            </Notice>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
