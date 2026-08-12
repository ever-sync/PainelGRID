import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  Trophy,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { ConfirmationBadge, StageBadge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Notice } from "../../components/ui/Notice";
import type { Event, Lead, User } from "../../types";
import { resolveClientId, resolveVendorId } from "../../utils/userContext";
import { createAudioContext } from "../../utils/audioContext";
import { readStoredSession } from "../../services/auth";
import { createAppointment } from "../../services/appointments";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import {
  checkLeadPhone,
  closeLeadAttendance,
  createLead,
  listLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import {
  getVendorScoreSummary,
  type VendorScoreSummary,
} from "../../services/vendorScore";
import { listPipelineStages, type ApiCrmStage } from "../../services/crm";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  brazilianPhoneValidationError,
  normalizeBrPhoneToE164,
  phoneDigitsForCompare,
} from "../../utils/phone";
import { triggerHapticFeedback } from "../../utils/haptics";

type OutletContext = {
  user: User;
};

function toSaoPauloDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function toPtBrDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(year, (month || 1) - 1, day || 1));
}

const APPOINTMENT_PERIOD_OPTIONS = [
  { value: "manha", label: "Manhã (até 12h)", time: "09:00" },
  { value: "tarde", label: "Tarde (após 12h)", time: "14:00" },
];

function playBeep() {
  try {
    const ctx = createAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); // fade out

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {
    console.error("AudioContext notification beep error", e);
  }
}

function triggerVibration() {
  triggerHapticFeedback([100, 50, 100]);
}

type StageTab = "all" | "new" | "scheduled" | "checkin" | "done";

export function LeadsVendedorPage() {
  const navigate = useNavigate();
  const { user } = useOutletContext<OutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const vendorId = resolveVendorId(user) ?? user.id;
  const clientId = resolveClientId(user);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allClientLeads, setAllClientLeads] = useState<Lead[]>([]);
  const [vendorNamesById, setVendorNamesById] = useState<
    Record<string, string>
  >({});
  const [events, setEvents] = useState<Event[]>([]);
  const [score, setScore] = useState<VendorScoreSummary | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [noteModal, setNoteModal] = useState<Lead | null>(null);
  const [stageModal, setStageModal] = useState<Lead | null>(null);
  const [closeAttendanceModal, setCloseAttendanceModal] = useState<Lead | null>(
    null,
  );
  const [closeAttendanceStep, setCloseAttendanceStep] = useState<
    "confirm" | "sale"
  >("confirm");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [appointmentEventId, setAppointmentEventId] = useState("");
  const [appointmentDateKey, setAppointmentDateKey] = useState("");
  const [appointmentPeriod, setAppointmentPeriod] = useState("");
  const [showAppointmentOptions, setShowAppointmentOptions] = useState(false);
  const [note, setNote] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [stageOptions, setStageOptions] = useState<ApiCrmStage[]>([]);
  const [stageLoading, setStageLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneCheckError, setPhoneCheckError] = useState("");
  const [phoneCheckRetryNonce, setPhoneCheckRetryNonce] = useState(0);
  const [phoneDuplicateHint, setPhoneDuplicateHint] = useState<{
    id: string;
    name: string;
    assigned_vendor_id: string | null;
    assigned_vendor_name: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStageTab, setSelectedStageTab] = useState<StageTab>("all");

  const isLeadNew = useCallback((l: Lead) => {
    const stage = (l.crm_stage || "").toLowerCase();
    const status = (l.confirmation_status || "").toLowerCase();
    const apptStatus = (l.active_appointment?.status || "").toLowerCase();
    return (
      stage === "novo" ||
      stage === "new" ||
      stage === "contactado" ||
      stage === "nao_responde" ||
      status === "pending" ||
      apptStatus === "pending" ||
      (!stage && !status)
    );
  }, []);

  const isLeadScheduled = useCallback((l: Lead) => {
    const stage = (l.crm_stage || "").toLowerCase();
    const status = (l.confirmation_status || "").toLowerCase();
    const apptStatus = (l.active_appointment?.status || "").toLowerCase();

    // Pre-agendamento pendente NAO e considerado agendado confirmado!
    if (status === "pending" || apptStatus === "pending") {
      return false;
    }

    return (
      stage === "agendado" ||
      stage === "scheduled" ||
      status === "scheduled" ||
      apptStatus === "scheduled" ||
      apptStatus === "confirmed"
    );
  }, []);

  const isLeadCheckin = useCallback((l: Lead) => {
    const stage = (l.crm_stage || "").toLowerCase();
    const status = (l.confirmation_status || "").toLowerCase();
    return (
      stage === "checkin" ||
      stage === "checked_in" ||
      status === "checked_in" ||
      Boolean(l.checkin_token) ||
      Boolean(l.checkin_voucher)
    );
  }, []);

  const isLeadDone = useCallback((l: Lead) => {
    const stage = (l.crm_stage || "").toLowerCase();
    const status = (l.confirmation_status || "").toLowerCase();
    return (
      stage === "convertido" ||
      stage === "perdido" ||
      stage === "done" ||
      status === "closed"
    );
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        (lead.vehicle_plate && lead.vehicle_plate.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedStageTab === "new") return isLeadNew(lead);
      if (selectedStageTab === "scheduled") return isLeadScheduled(lead);
      if (selectedStageTab === "checkin") return isLeadCheckin(lead);
      if (selectedStageTab === "done") return isLeadDone(lead);

      return true;
    });
  }, [
    leads,
    searchQuery,
    selectedStageTab,
    isLeadNew,
    isLeadScheduled,
    isLeadCheckin,
    isLeadDone,
  ]);
  const normalizedLeadPhone = useMemo(
    () => normalizeBrPhoneToE164(leadPhone),
    [leadPhone],
  );
  const leadPhoneValidationError = useMemo(
    () => (leadPhone.trim() ? brazilianPhoneValidationError(leadPhone) : ""),
    [leadPhone],
  );
  const duplicatePhoneLead = useMemo(() => {
    if (!normalizedLeadPhone) return null;
    const normalizedDigits = phoneDigitsForCompare(normalizedLeadPhone);
    const localMatch =
      allClientLeads.find(
        (lead) =>
          phoneDigitsForCompare(lead.phone) === normalizedDigits &&
          (lead.event_id === appointmentEventId ||
            lead.active_appointment?.event_id === appointmentEventId),
      ) ?? null;
    if (localMatch) return localMatch;
    if (!phoneDuplicateHint) return null;
    return {
      id: phoneDuplicateHint.id,
      name: phoneDuplicateHint.name,
      assigned_vendor_id: phoneDuplicateHint.assigned_vendor_id,
    } as Lead;
  }, [
    allClientLeads,
    appointmentEventId,
    normalizedLeadPhone,
    phoneDuplicateHint,
  ]);
  const duplicateLeadOwnerName = duplicatePhoneLead?.assigned_vendor_id
    ? (vendorNamesById[duplicatePhoneLead.assigned_vendor_id] ??
      phoneDuplicateHint?.assigned_vendor_name ??
      "outro vendedor")
    : null;

  const refreshLeads = useCallback(async () => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    try {
      const rows = await listLeads({}, t);
      const mapped = rows.map(mapApiLeadToLead);
      setAllClientLeads(mapped);
      const matches = mapped.filter(
        (l) =>
          l.assigned_vendor_id === vendorId ||
          l.registered_by_id === vendorId ||
          !l.assigned_vendor_id,
      );
      setLeads(matches.length > 0 ? matches : mapped);
    } catch {
      setLeads([]);
      setAllClientLeads([]);
    }
  }, [vendorId]);

  const refreshScore = useCallback(async () => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    try {
      setScore(await getVendorScoreSummary(t));
    } catch {
      setScore(null);
    }
  }, []);

  const refreshVendorData = useCallback(() => {
    void refreshLeads();
    void refreshScore();
  }, [refreshLeads, refreshScore]);

  useEffect(() => {
    void refreshLeads();
  }, [refreshLeads]);

  useLeadRealtimeSync(clientId, refreshVendorData, {
    onEvent: (name, payload) => {
      if (name === "lead_checkin") {
        const matchingLead = allClientLeads.find(
          (l) => l.id === payload.lead_id,
        );
        if (matchingLead && matchingLead.assigned_vendor_id === vendorId) {
          playBeep();
          triggerVibration();
          setSuccessMessage(
            `Cliente ${matchingLead.name} acabou de fazer check-in! Dirija-se ao atendimento.`,
          );
        }
      }
    },
  });

  useEffect(() => {
    const action = searchParams.get("acao");
    if (action === "appointment") {
      setLeadModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("acao");
      nextParams.delete("leadMode");
      nextParams.delete("modo");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t || !clientId) return;

    void listEvents({ client_id: clientId }, t)
      .then((rows) => setEvents(rows.map(mapApiEventToEvent)))
      .catch(() => setEvents([]));
    void listClientStaff(clientId, t)
      .then((rows) => {
        const byId = Object.fromEntries(
          rows
            .map(mapStaffToUser)
            .map((staffUser) => [staffUser.id, staffUser.name] as const),
        );
        setVendorNamesById(byId);
      })
      .catch(() => setVendorNamesById({}));
    void refreshScore();
  }, [clientId, refreshScore]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t || !normalizedLeadPhone) {
      setPhoneDuplicateHint(null);
      setCheckingPhone(false);
      setPhoneCheckError("");
      return;
    }
    setCheckingPhone(true);
    setPhoneCheckError("");
    const timeout = window.setTimeout(() => {
      void checkLeadPhone(
        normalizedLeadPhone,
        t,
        clientId ?? undefined,
        appointmentEventId || undefined,
      )
        .then((result) => {
          if (!result.exists || !result.lead) {
            setPhoneDuplicateHint(null);
            return;
          }
          setPhoneDuplicateHint(result.lead);
        })
        .catch(() => {
          setPhoneDuplicateHint(null);
          setPhoneCheckError(
            "A pré-verificação está indisponível. Você pode continuar; o telefone será validado novamente ao cadastrar.",
          );
        })
        .finally(() => setCheckingPhone(false));
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [appointmentEventId, clientId, normalizedLeadPhone, phoneCheckRetryNonce]);

  useEffect(() => {
    const pipelineId = stageModal?.crm_pipeline_id;
    const t = readStoredSession()?.accessToken;
    if (!stageModal || !pipelineId || !t) {
      setStageOptions([]);
      setSelectedStageId("");
      return;
    }
    setStageLoading(true);
    setActionError("");
    void listPipelineStages(pipelineId, t)
      .then((stages) => {
        setStageOptions(stages);
        const current = stageModal.crm_stage_id;
        setSelectedStageId(
          current && stages.some((s) => s.id === current)
            ? current
            : (stages[0]?.id ?? ""),
        );
      })
      .catch(() => {
        setStageOptions([]);
        setActionError("Não foi possível carregar as etapas do CRM.");
      })
      .finally(() => setStageLoading(false));
  }, [stageModal]);

  const activeEvents = useMemo(
    () => events.filter((event) => event.status === "active"),
    [events],
  );

  useEffect(() => {
    if (!leadModalOpen || appointmentEventId || activeEvents.length === 0) {
      return;
    }

    setAppointmentEventId(activeEvents[0].id);
  }, [activeEvents, appointmentEventId, leadModalOpen]);

  useEffect(() => {
    if (!leadModalOpen || appointmentPeriod) return;
    setAppointmentPeriod(APPOINTMENT_PERIOD_OPTIONS[0].value);
  }, [appointmentPeriod, leadModalOpen]);

  const appointmentDateOptions = useMemo(() => {
    if (!appointmentEventId) return [];
    const selectedEvent = events.find(
      (event) => event.id === appointmentEventId,
    );
    if (!selectedEvent) return [];

    const eventName = selectedEvent.name.trim().toLowerCase();
    const matchingEvents = events.filter(
      (event) => event.name.trim().toLowerCase() === eventName,
    );

    const uniqueByDay = new Map<string, string>();

    const addDateKey = (dateStr: string, evId: string) => {
      if (!dateStr) return;
      try {
        const dateKey = toSaoPauloDateKey(dateStr);
        if (dateKey && !uniqueByDay.has(dateKey)) {
          uniqueByDay.set(dateKey, evId);
        }
      } catch {
        // ignore
      }
    };

    for (const event of matchingEvents) {
      if (Array.isArray(event.event_days) && event.event_days.length > 0) {
        for (const day of event.event_days) {
          if (day.start) {
            addDateKey(day.start, event.id);
            if (day.end) {
              const startMs = new Date(day.start).getTime();
              const endMs = new Date(day.end).getTime();
              if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                const curr = new Date(startMs);
                const endDate = new Date(endMs);
                while (curr <= endDate) {
                  addDateKey(curr.toISOString(), event.id);
                  curr.setDate(curr.getDate() + 1);
                }
              }
            }
          }
        }
      }

      if (event.event_date) {
        const startMs = new Date(event.event_date).getTime();
        const endMs = event.event_end_date
          ? new Date(event.event_end_date).getTime()
          : startMs;
        if (!isNaN(startMs)) {
          const curr = new Date(startMs);
          const endDate =
            !isNaN(endMs) && endMs >= startMs ? new Date(endMs) : curr;
          while (curr <= endDate) {
            addDateKey(curr.toISOString(), event.id);
            curr.setDate(curr.getDate() + 1);
          }
        }
      }
    }

    return Array.from(uniqueByDay.entries())
      .map(([dateKey, eventId]) => ({ dateKey, eventId }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [appointmentEventId, events]);

  useEffect(() => {
    if (!appointmentDateOptions.length) {
      setAppointmentDateKey("");
      return;
    }
    const current = appointmentDateOptions.find(
      (item) => item.dateKey === appointmentDateKey,
    );
    if (current) return;
    setAppointmentDateKey(appointmentDateOptions[0].dateKey);
    setAppointmentEventId(appointmentDateOptions[0].eventId);
  }, [appointmentDateKey, appointmentDateOptions]);

  const saveLead = async () => {
    const t = readStoredSession()?.accessToken;
    if (!t || !clientId) return;

    if (!leadName.trim()) {
      setActionError("Informe o nome do lead.");
      return;
    }
    if (leadPhoneValidationError || !normalizedLeadPhone) {
      setActionError(
        leadPhoneValidationError ||
          "Informe um telefone válido (ex: +5512981092776).",
      );
      return;
    }
    if (checkingPhone) {
      setActionError("Aguarde a verificação do telefone.");
      return;
    }
    if (!appointmentEventId || !appointmentDateKey || !appointmentPeriod) {
      setActionError("Selecione evento, dia e período do agendamento.");
      return;
    }
    if (duplicatePhoneLead) {
      if (duplicatePhoneLead.assigned_vendor_id !== vendorId) {
        setActionError(
          duplicatePhoneLead.assigned_vendor_id
            ? `Este lead já foi cadastrado neste evento e está atribuído ao vendedor ${duplicateLeadOwnerName}.`
            : "Este lead já foi cadastrado neste evento e não pode ser assumido por outro vendedor.",
        );
      } else {
        setActionError(
          "Este lead já foi cadastrado neste evento e está na sua carteira.",
        );
      }
      return;
    }
    if (saving) return;

    setActionError("");
    setSaving(true);
    try {
      // A consulta antecipada melhora a experiência, mas não pode travar o
      // cadastro em caso de indisponibilidade. O endpoint de criação repete a
      // validação de telefone de forma autoritativa antes de persistir o lead.
      const check = await checkLeadPhone(
        normalizedLeadPhone,
        t,
        clientId ?? undefined,
        appointmentEventId,
      ).catch(() => null);
      if (check?.exists && check.lead) {
        if (check.lead.assigned_vendor_id !== vendorId) {
          setActionError(
            check.lead.assigned_vendor_id
              ? `Este lead já foi cadastrado neste evento e está atribuído ao vendedor ${check.lead.assigned_vendor_name ?? "outro vendedor"}.`
              : "Este lead já foi cadastrado neste evento e não pode ser assumido por outro vendedor.",
          );
        } else {
          setActionError(
            "Este lead já foi cadastrado neste evento e está na sua carteira.",
          );
        }
        return;
      }

      const row = await createLead(
        {
          client_id: clientId,
          name: leadName,
          email: leadEmail || null,
          phone: normalizedLeadPhone || null,
          source: "manual",
          event_interest_id: appointmentEventId,
        },
        t,
      );
      const next = mapApiLeadToLead(row);

      try {
        const periodTime =
          APPOINTMENT_PERIOD_OPTIONS.find((p) => p.value === appointmentPeriod)
            ?.time ?? "09:00";
        const [year, month, day] = appointmentDateKey.split("-");
        const scheduledAt = new Date(
          `${year}-${month}-${day}T${periodTime}:00`,
        );
        await createAppointment(t, {
          lead_id: next.id,
          event_id: appointmentEventId,
          scheduled_at: scheduledAt.toISOString(),
          timezone: "America/Sao_Paulo",
        });
      } catch {
        setLeadModalOpen(false);
        setLeadName("");
        setLeadPhone("");
        setLeadEmail("");
        setAppointmentEventId("");
        setAppointmentDateKey("");
        setAppointmentPeriod("");
        await refreshLeads();
        await refreshScore();
        setActionError(
          `Lead "${next.name}" cadastrado, mas não foi possível concluir o agendamento automático. Solicite apoio ao gestor ou à recepção.`,
        );
        return;
      }

      setLeadModalOpen(false);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setAppointmentEventId("");
      setAppointmentDateKey("");
      setAppointmentPeriod("");
      setSuccessMessage(
        next.email
          ? `Lead cadastrado! Agendamento confirmado para ${next.name} e QR Code de credenciamento enviado por e-mail (${next.email}).`
          : `Lead cadastrado! Pré-agendamento confirmado com sucesso para ${next.name}.`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
      // O agendamento já foi persistido. Atualizações de carteira e pontuação
      // não devem manter o modal travado depois da confirmação ao vendedor.
      void Promise.all([refreshLeads(), refreshScore()]).catch(() => undefined);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o lead.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCloseAttendanceModal = (lead: Lead) => {
    setCloseAttendanceModal(lead);
    setCloseAttendanceStep("confirm");
    setActionError("");
  };

  const handleContinueCloseAttendance = () => {
    if (!closeAttendanceModal) return;
    setActionError("");
    setCloseAttendanceStep("sale");
  };

  const handleSaleDecision = async (sold: boolean) => {
    if (!closeAttendanceModal) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    setActionError("");
    setSaving(true);
    try {
      await closeLeadAttendance(closeAttendanceModal.id, { sold }, t);
      setCloseAttendanceModal(null);
      setCloseAttendanceStep("confirm");
      await refreshLeads();
      setSuccessMessage(
        sold
          ? "Atendimento concluído e lead movido para Compraram."
          : "Atendimento concluído e lead movido para Atendimento encerrado.",
      );
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Não foi possível encerrar o atendimento.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!noteModal) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    setActionError("");
    setSaving(true);
    try {
      const row = await updateLead(noteModal.id, { notes: note }, t);
      const next = mapApiLeadToLead(row);
      setLeads((prev) => prev.map((l) => (l.id === noteModal.id ? next : l)));
      setNoteModal(null);
      setNote("");
    } catch {
      setActionError("Não foi possível salvar a nota.");
    } finally {
      setSaving(false);
    }
  };

  const saveStage = async () => {
    if (!stageModal || !selectedStageId) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    setActionError("");
    setSaving(true);
    try {
      const row = await updateLead(
        stageModal.id,
        { crm_stage_id: selectedStageId },
        t,
      );
      const next = mapApiLeadToLead(row);
      setLeads((prev) => prev.map((l) => (l.id === stageModal.id ? next : l)));
      setStageModal(null);
    } catch {
      setActionError("Não foi possível mover a etapa.");
    } finally {
      setSaving(false);
    }
  };

  const openLeadChat = (lead: Lead) => {
    if (lead.phone) {
      const cleanPhone = lead.phone.replace(/\D/g, "");
      const fullPhone =
        cleanPhone.length <= 11 && !cleanPhone.startsWith("55")
          ? `55${cleanPhone}`
          : cleanPhone;
      const text = `Olá ${lead.name || ""}! Sou ${user.name || "o seu vendedor"}. Como posso te ajudar hoje?`;
      window.open(
        `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`,
        "_blank",
      );
      return;
    }
    const params = new URLSearchParams({
      client_id: lead.client_id,
      lead_id: lead.id,
    });
    navigate(`/vendedor/chat?${params.toString()}`);
  };

  const showCreateFields =
    !!normalizedLeadPhone && !checkingPhone && !duplicatePhoneLead;
  const canCreateNewLead = showCreateFields && !duplicatePhoneLead;

  const countNew = useMemo(
    () => leads.filter(isLeadNew).length,
    [leads, isLeadNew],
  );
  const countScheduled = useMemo(
    () => leads.filter(isLeadScheduled).length,
    [leads, isLeadScheduled],
  );
  const countCheckin = useMemo(
    () => leads.filter(isLeadCheckin).length,
    [leads, isLeadCheckin],
  );
  const countDone = useMemo(
    () => leads.filter(isLeadDone).length,
    [leads, isLeadDone],
  );

  return (
    <div>
      <PageHeader
        title="Meus Leads"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Meus Leads" }]}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-500/10 via-amber-50 to-amber-100/50 p-4 shadow-sm dark:border-amber-900/40 dark:from-amber-950/40 dark:via-zinc-900 dark:to-zinc-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Pontuação Total
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500 text-white font-bold shadow-md shadow-amber-500/30">
              <Trophy size={15} />
            </span>
          </div>
          <p className="text-2xl md:text-3xl font-black tabular-nums text-amber-950 dark:text-amber-300">
            {(score?.scheduled.points ?? 0) +
              (score?.checked_in.points ?? 0) +
              (score?.sold.points ?? 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-500/10 via-blue-50 to-indigo-100/50 p-4 shadow-sm dark:border-blue-900/40 dark:from-blue-950/40 dark:via-zinc-900 dark:to-zinc-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Agendamentos
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30">
              <CalendarPlus size={15} />
            </span>
          </div>
          <p className="text-2xl md:text-3xl font-black tabular-nums text-blue-950 dark:text-blue-300">
            {score?.scheduled.count ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-green-100/50 p-4 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Compareceram
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/30">
              <CheckCircle2 size={15} />
            </span>
          </div>
          <p className="text-2xl md:text-3xl font-black tabular-nums text-emerald-950 dark:text-emerald-300">
            {score?.checked_in.count ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-50 to-pink-100/50 p-4 shadow-sm dark:border-fuchsia-900/40 dark:from-fuchsia-950/40 dark:via-zinc-900 dark:to-zinc-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-400">
              Vendas Concluídas
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-fuchsia-500 text-white font-bold shadow-md shadow-fuchsia-500/30">
              <ShoppingCart size={15} />
            </span>
          </div>
          <p className="text-2xl md:text-3xl font-black tabular-nums text-fuchsia-950 dark:text-fuchsia-300">
            {score?.sold.count ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou placa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800 py-2.5 pl-10 pr-4 text-xs font-medium outline-none focus:border-[#FF0636] transition-colors bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
          />
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => setLeadModalOpen(true)}
          className="hidden sm:inline-flex w-full sm:w-auto justify-center"
        >
          Cadastrar Lead
        </Button>
      </div>

      {/* Filtro Mobile (Dropdown Select) */}
      <div className="mb-5 md:hidden">
        <div className="relative">
          <Filter
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          />
          <select
            value={selectedStageTab}
            onChange={(e) => setSelectedStageTab(e.target.value as StageTab)}
            className="w-full appearance-none rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-3 pl-10 pr-10 text-xs font-bold text-zinc-900 dark:text-zinc-100 shadow-sm outline-none focus:border-[#FF0636]"
          >
            <option value="all">Todos os Leads ({leads.length})</option>
            <option value="new">Novos / Contatos ({countNew})</option>
            <option value="scheduled">Agendados ({countScheduled})</option>
            <option value="checkin">Check-in ({countCheckin})</option>
            <option value="done">Concluídos ({countDone})</option>
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          />
        </div>
      </div>

      {/* Abas Pill de Etapas Desktop */}
      <div className="mb-6 hidden md:flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {[
          ["all", `Todos (${leads.length})`],
          ["new", `Novos (${countNew})`],
          ["scheduled", `Agendados (${countScheduled})`],
          ["checkin", `Check-in (${countCheckin})`],
          ["done", `Concluídos (${countDone})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedStageTab(key as StageTab)}
            className={clsx(
              "rounded-full px-4 py-2 text-xs font-bold transition-all shrink-0 border",
              selectedStageTab === key
                ? "bg-[#FF0636] text-white border-[#FF0636] shadow-md shadow-[#FF0636]/20"
                : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <Notice tone="error" className="mb-3">
          {actionError}
        </Notice>
      ) : null}

      {successMessage ? (
        <Notice tone="success" className="mb-3">
          {successMessage}
        </Notice>
      ) : null}

      <div className="space-y-3 md:hidden">
        {filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {leads.length > 0
                ? `Nenhum lead nesta etapa (${selectedStageTab.toUpperCase()}) no momento.`
                : "Você ainda não possui nenhum lead atribuído na sua carteira."}
            </p>
            {leads.length > 0 && selectedStageTab !== "all" ? (
              <button
                type="button"
                onClick={() => setSelectedStageTab("all")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF0636] text-white text-xs font-bold shadow-md shadow-[#FF0636]/20 transition-transform active:scale-95"
              >
                Ver Todos os Leads ({leads.length})
              </button>
            ) : null}
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              className="rounded-2xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800/80 p-4 shadow-sm space-y-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF0636] to-[#b3102b] text-xs font-black text-white shadow-sm">
                    {lead.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {lead.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                      {lead.phone}
                    </p>
                  </div>
                </div>
                <StageBadge stage={lead.crm_stage} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950/60 p-3 border border-zinc-100 dark:border-zinc-800/60">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Evento
                  </p>
                  <p className="mt-0.5 truncate text-zinc-800 dark:text-zinc-200 font-semibold">
                    {lead.event_interest || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Status
                  </p>
                  <div className="mt-0.5 inline-flex">
                    <ConfirmationBadge
                      status={lead.confirmation_status}
                      closedLabel="Concluído"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Visita
                  </p>
                  <p className="mt-0.5 text-zinc-800 dark:text-zinc-200 font-semibold font-mono">
                    {lead.store_visit_datetime
                      ? new Date(lead.store_visit_datetime).toLocaleDateString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Check-in
                  </p>
                  <p className="mt-0.5 text-zinc-800 dark:text-zinc-200 font-semibold">
                    {lead.checkin_token ? "Disponível" : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openLeadChat(lead)}
                  disabled={lead.confirmation_status === "closed"}
                  className="flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 disabled:opacity-30 transition-all active:scale-95"
                  title={
                    lead.confirmation_status === "closed"
                      ? "Atendimento encerrado"
                      : "WhatsApp"
                  }
                >
                  <MessageCircle size={15} />
                  <span className="mt-0.5">Whats</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCloseAttendanceModal(lead)}
                  disabled={lead.confirmation_status === "closed"}
                  className="flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 transition-all active:scale-95"
                  title="Encerrar"
                >
                  <XCircle size={15} />
                  <span className="mt-0.5">Fim</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/80 text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-950/40">
                <th className="py-3 px-4">Lead / Cliente</th>
                <th className="py-3 px-4">Telefone</th>
                <th className="py-3 px-4">Evento</th>
                <th className="py-3 px-4">Etapa CRM</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Visita</th>
                <th className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                    {lead.name}
                  </td>
                  <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400 font-mono">
                    {lead.phone}
                  </td>
                  <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300 font-medium">
                    {lead.event_interest || "—"}
                  </td>
                  <td className="py-3 px-4">
                    <StageBadge stage={lead.crm_stage} />
                  </td>
                  <td className="py-3 px-4">
                    <ConfirmationBadge
                      status={lead.confirmation_status}
                      closedLabel="Concluído"
                    />
                  </td>
                  <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400 font-mono">
                    {lead.store_visit_datetime
                      ? new Date(lead.store_visit_datetime).toLocaleDateString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openLeadChat(lead)}
                        disabled={lead.confirmation_status === "closed"}
                        className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-30"
                        title={
                          lead.confirmation_status === "closed"
                            ? "Atendimento encerrado"
                            : "Abrir WhatsApp"
                        }
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCloseAttendanceModal(lead)}
                        disabled={lead.confirmation_status === "closed"}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30"
                        title="Encerrar Atendimento"
                      >
                        <XCircle size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={leadModalOpen}
        onClose={() => {
          setLeadModalOpen(false);
          setActionError("");
          setAppointmentEventId("");
          setAppointmentDateKey("");
          setAppointmentPeriod("");
          setShowAppointmentOptions(false);
        }}
        title="Cadastrar lead"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLeadModalOpen(false);
                setActionError("");
                setAppointmentEventId("");
                setAppointmentDateKey("");
                setAppointmentPeriod("");
                setShowAppointmentOptions(false);
              }}
            >
              Cancelar
            </Button>
            {canCreateNewLead ? (
              <Button
                onClick={() => void saveLead()}
                loading={saving}
                isDisabled={
                  !leadName.trim() ||
                  !appointmentEventId ||
                  !appointmentDateKey ||
                  !appointmentPeriod
                }
              >
                Cadastrar e agendar
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              Cadastro rápido
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Informe telefone e nome. O próximo evento e horário já vêm
              selecionados.
            </p>
          </div>

          <div className="space-y-2">
            <Input
              label="Telefone do lead"
              icon={<Phone size={16} />}
              value={leadPhone}
              onChange={(e) => {
                setLeadPhone(e.target.value);
                setActionError("");
                setPhoneCheckError("");
              }}
              placeholder="(12) 98109-2776"
              autoFocus
            />
            <p
              className={clsx(
                "text-xs",
                leadPhone.replace(/\D/g, "").length >= 10 &&
                  leadPhoneValidationError
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {leadPhone.replace(/\D/g, "").length >= 10 &&
              leadPhoneValidationError
                ? leadPhoneValidationError
                : normalizedLeadPhone
                  ? `Será salvo como ${normalizedLeadPhone}`
                  : "Digite o telefone primeiro para verificarmos se o lead já existe."}
            </p>
          </div>

          {checkingPhone && normalizedLeadPhone ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Verificando telefone...
            </div>
          ) : null}

          {phoneCheckError ? (
            <div className="space-y-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-700/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {phoneCheckError}
              </div>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={checkingPhone || !normalizedLeadPhone}
                onClick={() => {
                  setPhoneCheckError("");
                  setPhoneCheckRetryNonce((n) => n + 1);
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : null}

          {duplicatePhoneLead && !checkingPhone ? (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {duplicatePhoneLead.assigned_vendor_id === vendorId
                ? "Esse lead já foi cadastrado neste evento e está na sua carteira."
                : duplicatePhoneLead.assigned_vendor_id
                  ? `Esse lead já foi cadastrado neste evento pelo vendedor ${duplicateLeadOwnerName}.`
                  : "Esse lead já foi cadastrado neste evento e não pode ser assumido por outro vendedor."}
            </div>
          ) : null}

          <div
            className={clsx(
              "space-y-3 overflow-hidden transition-all duration-200",
              showCreateFields
                ? "max-h-[40rem] opacity-100"
                : "max-h-0 opacity-0",
            )}
          >
            {showCreateFields ? (
              <>
                <Input
                  label="Nome"
                  icon={<UserIcon size={16} />}
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Nome completo do lead"
                />
                <Input
                  label="E-mail"
                  type="email"
                  icon={<Mail size={16} />}
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="E-mail (opcional)"
                />

                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        Agendamento automático
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {activeEvents.find(
                          (event) => event.id === appointmentEventId,
                        )?.name ?? "Carregando evento"}
                        {appointmentDateKey
                          ? ` · ${toPtBrDateLabel(appointmentDateKey)}`
                          : ""}
                        {appointmentPeriod
                          ? ` · ${APPOINTMENT_PERIOD_OPTIONS.find((p) => p.value === appointmentPeriod)?.label ?? ""}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAppointmentOptions((value) => !value)
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      Alterar
                      <ChevronDown
                        size={14}
                        className={clsx(
                          "transition-transform",
                          showAppointmentOptions && "rotate-180",
                        )}
                      />
                    </button>
                  </div>
                </div>

                {showAppointmentOptions ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <Select
                      label="Evento"
                      value={appointmentEventId}
                      placeholder="Selecione um evento"
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setAppointmentEventId(nextId);
                        setAppointmentDateKey("");
                      }}
                      options={activeEvents.map((event) => ({
                        value: event.id,
                        label: event.name,
                      }))}
                    />
                    <Select
                      label="Dia do evento"
                      value={appointmentDateKey}
                      placeholder={
                        appointmentEventId
                          ? "Nenhum dia configurado"
                          : "Selecione o evento primeiro"
                      }
                      disabled={
                        !appointmentEventId ||
                        appointmentDateOptions.length === 0
                      }
                      onChange={(e) => {
                        const nextDateKey = e.target.value;
                        setAppointmentDateKey(nextDateKey);
                        const match = appointmentDateOptions.find(
                          (item) => item.dateKey === nextDateKey,
                        );
                        if (match) setAppointmentEventId(match.eventId);
                      }}
                      options={appointmentDateOptions.map((item) => ({
                        value: item.dateKey,
                        label: toPtBrDateLabel(item.dateKey),
                      }))}
                    />
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-foreground">
                        Período
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {APPOINTMENT_PERIOD_OPTIONS.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setAppointmentPeriod(p.value)}
                            className={clsx(
                              "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                              appointmentPeriod === p.value
                                ? "border-[#FF0636] bg-[#FF0636] text-white"
                                : "border-border bg-background text-foreground hover:border-[#FF0636] hover:text-[#FF0636]",
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!noteModal}
        onClose={() => setNoteModal(null)}
        title={`Nota — ${noteModal?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteModal(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveNote()} loading={saving}>
              Salvar Nota
            </Button>
          </>
        }
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          rows={5}
          placeholder="Digite sua nota sobre este lead..."
        />
      </Modal>

      <Modal
        open={!!stageModal}
        onClose={() => setStageModal(null)}
        title={`Mover Etapa — ${stageModal?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStageModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void saveStage()}
              loading={saving}
              isDisabled={!selectedStageId || stageLoading}
            >
              Mover
            </Button>
          </>
        }
      >
        {stageModal && !stageModal.crm_pipeline_id ? (
          <p className="text-sm text-amber-700">
            Este lead ainda não está vinculado a um pipeline CRM. Peça ao gestor
            para configurar.
          </p>
        ) : stageLoading ? (
          <p className="text-sm text-gray-500">Carregando etapas...</p>
        ) : (
          <Select
            label="Nova etapa"
            value={selectedStageId}
            onChange={(e) => setSelectedStageId(e.target.value)}
            options={stageOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
      </Modal>

      <Modal
        open={!!closeAttendanceModal}
        onClose={() => {
          setCloseAttendanceModal(null);
          setCloseAttendanceStep("confirm");
          setActionError("");
        }}
        title="Finalizar atendimento"
        footer={
          closeAttendanceStep === "confirm" ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setCloseAttendanceModal(null)}
              >
                Não
              </Button>
              <Button onClick={handleContinueCloseAttendance}>Sim</Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => void handleSaleDecision(false)}
                loading={saving}
              >
                Não
              </Button>
              <Button
                onClick={() => void handleSaleDecision(true)}
                loading={saving}
              >
                Sim
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3 text-left">
          {actionError && (
            <div className="p-3 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-lg text-sm">
              {actionError}
            </div>
          )}
          <p className="text-base font-semibold text-foreground">
            {closeAttendanceStep === "confirm"
              ? "Deseja finalizar este atendimento?"
              : `Vendeu para o cliente ${closeAttendanceModal?.name}?`}
          </p>
          {closeAttendanceStep === "confirm" ? (
            <p className="text-sm text-muted-foreground">
              Ao confirmar, você informará se houve venda para este cliente.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
