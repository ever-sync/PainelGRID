import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  Trophy,
  CalendarPlus,
  CheckCircle2,
  Copy,
  MessageCircle,
  Plus,
  ShoppingCart,
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
  assignLeadToMe,
  checkLeadPhone,
  closeLeadAttendance,
  createLead,
  listLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import { createSale, type SaleType } from "../../services/sales";
import {
  getVendorScoreSummary,
  type VendorScoreSummary,
} from "../../services/vendorScore";
import { listPipelineStages, type ApiCrmStage } from "../../services/crm";
import {
  listCarBrands,
  listCarModelsByBrand,
  listCarYearsByBrandAndModel,
  type VehicleOption,
} from "../../services/vehicles";
import { CheckinQrImage } from "../../components/shared/CheckinQrImage";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  normalizeBrPhoneToE164,
  phoneDigitsForCompare,
} from "../../utils/phone";
import { triggerHapticFeedback } from "../../utils/haptics";

type OutletContext = {
  user: User;
};

const SALE_ALLOWED_APPOINTMENT_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "completed",
]);
const APPOINTMENT_ACTIVE_STATUSES = new Set([
  "proposed",
  "scheduled",
  "confirmed",
]);

function getSaleButtonState(lead: Lead): { disabled: boolean; title: string } {
  if (isLeadClosedAfterSale(lead)) {
    return { disabled: true, title: "Lead já concluído com venda" };
  }
  const appointment = lead.active_appointment;
  if (appointment?.sale_id)
    return { disabled: true, title: "Venda já registrada" };
  return { disabled: false, title: "Registrar venda" };
}

function getAppointmentButtonState(lead: Lead): {
  disabled: boolean;
  title: string;
} {
  if (isLeadClosedAfterSale(lead)) {
    return { disabled: true, title: "Lead já concluído com venda" };
  }
  const appointment = lead.active_appointment;
  if (!appointment) return { disabled: false, title: "Agendar visita" };
  if (APPOINTMENT_ACTIVE_STATUSES.has(appointment.status)) {
    return { disabled: true, title: "Lead já possui agendamento ativo" };
  }
  return { disabled: false, title: "Agendar visita" };
}

function getCheckinButtonState(lead: Lead): {
  disabled: boolean;
  title: string;
} {
  if (isLeadClosedAfterSale(lead)) {
    return { disabled: true, title: "Lead já concluído com venda" };
  }
  if (lead.confirmation_status === "checked_in") {
    return { disabled: true, title: "Check-in já realizado" };
  }
  if (!lead.active_appointment) {
    return { disabled: true, title: "Agende antes de liberar check-in" };
  }
  if (!lead.checkin_token) {
    return { disabled: false, title: "Gerar/capturar convite de check-in" };
  }
  return { disabled: false, title: "Copiar convite/check-in" };
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const cents = Number(digits);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isLeadClosedAfterSale(lead: Lead) {
  return (
    lead.active_appointment?.sale_id != null || lead.crm_stage === "convertido"
  );
}

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
  const [appointmentModal, setAppointmentModal] = useState<Lead | null>(null);
  const [saleModal, setSaleModal] = useState<Lead | null>(null);
  const [noteModal, setNoteModal] = useState<Lead | null>(null);
  const [stageModal, setStageModal] = useState<Lead | null>(null);
  const [closeAttendanceModal, setCloseAttendanceModal] = useState<Lead | null>(
    null,
  );
  const [closeWristbandNumber, setCloseWristbandNumber] = useState("");
  const [closeCpf, setCloseCpf] = useState("");
  const [closePhone, setClosePhone] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [appointmentEventId, setAppointmentEventId] = useState("");
  const [appointmentDateKey, setAppointmentDateKey] = useState("");
  const [appointmentPeriod, setAppointmentPeriod] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("NOVO");
  const [saleProduct, setSaleProduct] = useState("");
  const [saleCarBrandCode, setSaleCarBrandCode] = useState("");
  const [saleCarModelCode, setSaleCarModelCode] = useState("");
  const [saleCarYearCode, setSaleCarYearCode] = useState("");
  const [carBrands, setCarBrands] = useState<VehicleOption[]>([]);
  const [carModels, setCarModels] = useState<VehicleOption[]>([]);
  const [carYears, setCarYears] = useState<VehicleOption[]>([]);
  const [carLoading, setCarLoading] = useState(false);
  const [carLoadError, setCarLoadError] = useState("");
  const [saleValue, setSaleValue] = useState("");
  const [saleDate, setSaleDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [saleNotes, setSaleNotes] = useState("");
  const [note, setNote] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [stageOptions, setStageOptions] = useState<ApiCrmStage[]>([]);
  const [stageLoading, setStageLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [duplicateLeadIdToClaim, setDuplicateLeadIdToClaim] = useState<
    string | null
  >(null);
  const [wantsAssignDuplicate, setWantsAssignDuplicate] = useState<
    boolean | null
  >(null);
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
  const [selectedStageTab, setSelectedStageTab] = useState<
    "all" | "new" | "scheduled" | "checkin" | "done"
  >("all");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        (lead.vehicle_plate && lead.vehicle_plate.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedStageTab === "new") {
        return (
          lead.crm_stage === "novo" ||
          lead.crm_stage === "contactado" ||
          lead.crm_stage === "nao_responde"
        );
      }
      if (selectedStageTab === "scheduled") {
        return lead.crm_stage === "agendado";
      }
      if (selectedStageTab === "checkin") {
        return lead.crm_stage === "checkin";
      }
      if (selectedStageTab === "done") {
        return lead.crm_stage === "convertido" || lead.crm_stage === "perdido";
      }

      return true;
    });
  }, [leads, searchQuery, selectedStageTab]);
  const normalizedLeadPhone = useMemo(
    () => normalizeBrPhoneToE164(leadPhone),
    [leadPhone],
  );
  const duplicatePhoneLead = useMemo(() => {
    if (!normalizedLeadPhone) return null;
    const normalizedDigits = phoneDigitsForCompare(normalizedLeadPhone);
    const localMatch =
      allClientLeads.find(
        (lead) => phoneDigitsForCompare(lead.phone) === normalizedDigits,
      ) ?? null;
    if (localMatch) return localMatch;
    if (!phoneDuplicateHint) return null;
    return {
      id: phoneDuplicateHint.id,
      name: phoneDuplicateHint.name,
      assigned_vendor_id: phoneDuplicateHint.assigned_vendor_id,
    } as Lead;
  }, [allClientLeads, normalizedLeadPhone, phoneDuplicateHint]);
  const duplicateLeadOwnerName = duplicatePhoneLead?.assigned_vendor_id
    ? (vendorNamesById[duplicatePhoneLead.assigned_vendor_id] ??
      phoneDuplicateHint?.assigned_vendor_name ??
      "outro vendedor")
    : null;
  const selectedCarBrandLabel = useMemo(
    () =>
      carBrands.find((item) => item.value === saleCarBrandCode)?.label ?? "",
    [carBrands, saleCarBrandCode],
  );
  const selectedCarModelLabel = useMemo(
    () =>
      carModels.find((item) => item.value === saleCarModelCode)?.label ?? "",
    [carModels, saleCarModelCode],
  );
  const selectedCarYearLabel = useMemo(
    () => carYears.find((item) => item.value === saleCarYearCode)?.label ?? "",
    [carYears, saleCarYearCode],
  );
  const isFipeProductSelected = Boolean(
    selectedCarBrandLabel && selectedCarModelLabel,
  );

  const resetSaleVehicleFields = useCallback(() => {
    setSaleCarBrandCode("");
    setSaleCarModelCode("");
    setSaleCarYearCode("");
    setCarModels([]);
    setCarYears([]);
    setSaleProduct("");
    setSaleDate(new Date().toISOString().split("T")[0]);
  }, []);

  const refreshLeads = useCallback(async () => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    try {
      const rows = await listLeads({}, t);
      const mapped = rows.map(mapApiLeadToLead);
      setAllClientLeads(mapped);
      setLeads(mapped.filter((l) => l.assigned_vendor_id === vendorId));
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
      if (name === "lead_checkin" || name === "lead_updated") {
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
    }
    if (action === "sale") {
      const firstSellableLead = leads.find((lead) => {
        const appointment = lead.active_appointment;
        return (
          !!appointment &&
          !appointment.sale_id &&
          SALE_ALLOWED_APPOINTMENT_STATUSES.has(appointment.status)
        );
      });
      if (!firstSellableLead) {
        return;
      }
      setSaleModal(firstSellableLead);
    }
    if (action === "appointment" || action === "sale") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("acao");
      nextParams.delete("leadMode");
      nextParams.delete("modo");
      setSearchParams(nextParams, { replace: true });
    }
  }, [leads, searchParams, setSearchParams]);

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
    if (!saleModal || carBrands.length > 0 || carLoading) return;
    setCarLoading(true);
    setCarLoadError("");
    void listCarBrands()
      .then(setCarBrands)
      .catch(() =>
        setCarLoadError("Não foi possível carregar marcas de carro agora."),
      )
      .finally(() => setCarLoading(false));
  }, [saleModal, carBrands.length, carLoading]);

  useEffect(() => {
    if (!saleCarBrandCode) {
      setCarModels([]);
      setCarYears([]);
      setSaleCarModelCode("");
      setSaleCarYearCode("");
      return;
    }
    setCarLoading(true);
    setCarLoadError("");
    void listCarModelsByBrand(saleCarBrandCode)
      .then((rows) => {
        setCarModels(rows);
        setSaleCarModelCode("");
        setSaleCarYearCode("");
        setCarYears([]);
      })
      .catch(() => {
        setCarModels([]);
        setCarYears([]);
        setCarLoadError("Não foi possível carregar modelos para esta marca.");
      })
      .finally(() => setCarLoading(false));
  }, [saleCarBrandCode]);

  useEffect(() => {
    if (!saleCarBrandCode || !saleCarModelCode) {
      setCarYears([]);
      setSaleCarYearCode("");
      return;
    }
    setCarLoading(true);
    setCarLoadError("");
    void listCarYearsByBrandAndModel(saleCarBrandCode, saleCarModelCode)
      .then((rows) => {
        setCarYears(rows);
        setSaleCarYearCode("");
      })
      .catch(() => {
        setCarYears([]);
        setCarLoadError(
          "Não foi possível carregar anos/versões para este modelo.",
        );
      })
      .finally(() => setCarLoading(false));
  }, [saleCarBrandCode, saleCarModelCode]);

  useEffect(() => {
    if (!selectedCarBrandLabel || !selectedCarModelLabel) return;
    if (!selectedCarYearLabel) {
      setSaleProduct(`${selectedCarBrandLabel} ${selectedCarModelLabel}`);
      return;
    }
    setSaleProduct(
      `${selectedCarBrandLabel} ${selectedCarModelLabel} ${selectedCarYearLabel}`,
    );
  }, [selectedCarBrandLabel, selectedCarModelLabel, selectedCarYearLabel]);

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
      void checkLeadPhone(normalizedLeadPhone, t, clientId ?? undefined)
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
            "Não foi possível verificar o telefone agora. Tente novamente.",
          );
        })
        .finally(() => setCheckingPhone(false));
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [clientId, normalizedLeadPhone, phoneCheckRetryNonce]);

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
    if (!normalizedLeadPhone) {
      setActionError("Informe um telefone válido (ex: +5512981092776).");
      setDuplicateLeadIdToClaim(null);
      return;
    }
    if (checkingPhone) {
      setActionError("Aguarde a verificação do telefone.");
      return;
    }
    if (phoneCheckError) {
      setActionError(phoneCheckError);
      return;
    }
    if (duplicatePhoneLead) {
      if (!duplicatePhoneLead.assigned_vendor_id) {
        setDuplicateLeadIdToClaim(duplicatePhoneLead.id);
        setActionError(
          'Lead já cadastrado, mas sem vendedor. Clique em "Adicionar e atribuir".',
        );
      } else if (duplicatePhoneLead.assigned_vendor_id !== vendorId) {
        setDuplicateLeadIdToClaim(null);
        setActionError(
          `Este lead já está atribuído ao vendedor ${duplicateLeadOwnerName}.`,
        );
      } else {
        setDuplicateLeadIdToClaim(null);
        setActionError("Este lead já está na sua carteira.");
      }
      return;
    }

    try {
      const check = await checkLeadPhone(
        normalizedLeadPhone,
        t,
        clientId ?? undefined,
      );
      if (check.exists && check.lead) {
        if (!check.lead.assigned_vendor_id) {
          setDuplicateLeadIdToClaim(check.lead.id);
          setActionError(
            'Lead já cadastrado, mas sem vendedor. Clique em "Adicionar e atribuir".',
          );
        } else if (check.lead.assigned_vendor_id !== vendorId) {
          setDuplicateLeadIdToClaim(null);
          setActionError(
            `Este lead já está atribuído ao vendedor ${check.lead.assigned_vendor_name ?? "outro vendedor"}.`,
          );
        } else {
          setDuplicateLeadIdToClaim(null);
          setActionError("Este lead já está na sua carteira.");
        }
        return;
      }
    } catch {
      setActionError(
        "Não foi possível verificar o telefone agora. Tente novamente.",
      );
      return;
    }

    setDuplicateLeadIdToClaim(null);
    setActionError("");
    setSaving(true);
    try {
      const row = await createLead(
        {
          client_id: clientId,
          name: leadName,
          email: leadEmail || null,
          phone: normalizedLeadPhone || null,
          source: "manual",
        },
        t,
      );
      const next = mapApiLeadToLead(row);
      setLeads((prev) => [next, ...prev]);
      setAllClientLeads((prev) => [next, ...prev]);
      setLeadModalOpen(false);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setAppointmentModal(next);
      setAppointmentEventId(next.event_id ?? events[0]?.id ?? "");
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

  const claimDuplicateLead = async () => {
    const t = readStoredSession()?.accessToken;
    if (!t || !duplicateLeadIdToClaim) return;
    setSaving(true);
    try {
      const row = await assignLeadToMe(duplicateLeadIdToClaim, t);
      const mapped = mapApiLeadToLead(row);
      setAllClientLeads((prev) =>
        prev.some((lead) => lead.id === mapped.id)
          ? prev.map((lead) => (lead.id === mapped.id ? mapped : lead))
          : [mapped, ...prev],
      );
      setLeads((prev) =>
        prev.some((lead) => lead.id === mapped.id) ? prev : [mapped, ...prev],
      );
      setLeadModalOpen(false);
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      setDuplicateLeadIdToClaim(null);
      setPhoneDuplicateHint(null);
      setActionError("");
      setAppointmentModal(mapped);
      setAppointmentEventId(mapped.event_id ?? events[0]?.id ?? "");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar este lead.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveAppointment = async () => {
    const t = readStoredSession()?.accessToken;
    if (!t || !clientId) return;
    if (!appointmentEventId || !appointmentDateKey || !appointmentPeriod) {
      setActionError("Informe evento, dia e período do agendamento.");
      return;
    }
    const selectedLead = appointmentModal;
    if (!selectedLead) return;

    const periodTime =
      APPOINTMENT_PERIOD_OPTIONS.find((p) => p.value === appointmentPeriod)
        ?.time ?? "09:00";
    setActionError("");
    setSaving(true);
    try {
      const [year, month, day] = appointmentDateKey.split("-");
      const scheduledAt = new Date(`${year}-${month}-${day}T${periodTime}:00`);
      await createAppointment(t, {
        lead_id: selectedLead.id,
        event_id: appointmentEventId,
        scheduled_at: scheduledAt.toISOString(),
        timezone: "America/Sao_Paulo",
      });
      setAppointmentModal(null);
      setAppointmentEventId("");
      setAppointmentDateKey("");
      setAppointmentPeriod("");
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      await refreshLeads();
      await refreshScore();
    } catch {
      setActionError("Não foi possível criar o agendamento.");
    } finally {
      setSaving(false);
    }
  };

  const saveSale = async () => {
    const t = readStoredSession()?.accessToken;
    if (!t || !clientId) return;
    if (!saleProduct.trim() || !saleValue.trim()) {
      setActionError("Informe produto e valor da venda.");
      return;
    }
    const selectedLead = saleModal;
    if (!selectedLead) return;

    setActionError("");
    setSaving(true);
    try {
      const appointmentId = selectedLead.active_appointment?.id;
      if (!appointmentId) {
        setActionError("Crie um agendamento antes de registrar a venda.");
        return;
      }

      await createSale(t, {
        appointment_id: appointmentId,
        type: saleType,
        product: saleProduct,
        value: saleValue,
        sold_at: saleDate
          ? new Date(saleDate + "T12:00:00.000Z").toISOString()
          : undefined,
        notes: saleNotes,
      });
      setSaleModal(null);
      setSaleType("NOVO");
      resetSaleVehicleFields();
      setSaleValue("");
      setSaleDate(new Date().toISOString().split("T")[0]);
      setSaleNotes("");
      setLeadName("");
      setLeadPhone("");
      setLeadEmail("");
      await refreshLeads();
      await refreshScore();
    } catch {
      setActionError("Não foi possível registrar a venda.");
    } finally {
      setSaving(false);
    }
  };

  const currentLeadEvent = useMemo(() => {
    if (!closeAttendanceModal) return null;
    const eventId =
      closeAttendanceModal.event_id ||
      closeAttendanceModal.active_appointment?.event_id;
    if (eventId) {
      const found = events.find((e) => e.id === eventId);
      if (found) return found;
    }
    if (closeAttendanceModal.event_interest) {
      const foundByName = events.find(
        (e) =>
          e.name.toLowerCase() ===
          closeAttendanceModal.event_interest?.toLowerCase(),
      );
      if (foundByName) return foundByName;
    }
    return events[0] ?? null;
  }, [closeAttendanceModal, events]);

  const isWristbandRequired = currentLeadEvent?.require_wristband ?? false;

  const handleOpenCloseAttendanceModal = (lead: Lead) => {
    setCloseAttendanceModal(lead);
    setCloseWristbandNumber(lead.wristband_number ?? "");
    setCloseCpf(lead.cpf ?? "");
    setClosePhone(lead.phone ?? "");
    setActionError("");
  };

  const handleSaveCloseAttendance = async () => {
    if (!closeAttendanceModal) return;
    if (isWristbandRequired && !closeWristbandNumber.trim()) {
      setActionError("Número da pulseira é obrigatório para este evento.");
      return;
    }
    if (!closeCpf.trim() || !closePhone.trim()) {
      setActionError("CPF e Telefone são obrigatórios.");
      return;
    }
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    setActionError("");
    setSaving(true);
    try {
      await closeLeadAttendance(
        closeAttendanceModal.id,
        {
          wristband_number: closeWristbandNumber.trim(),
          cpf: closeCpf.trim(),
          phone: closePhone.trim(),
        },
        t,
      );
      setCloseAttendanceModal(null);
      await refreshLeads();
    } catch (err: any) {
      setActionError(
        err?.message || "Não foi possível encerrar o atendimento.",
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

  const copyCheckinPayload = (lead: Lead) => {
    const payload = lead.checkin_voucher ?? lead.checkin_token;
    if (!payload) {
      setActionError(
        "Check-in ainda não disponível para este lead. Confirme os dados e tente novamente.",
      );
      setSuccessMessage("");
      return;
    }
    setActionError("");
    void navigator.clipboard?.writeText(payload).then(() => {
      setSuccessMessage(
        "Voucher de check-in copiado para a área de transferência!",
      );
      setTimeout(() => {
        setSuccessMessage("");
      }, 5000);
    });
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
    !!normalizedLeadPhone &&
    !checkingPhone &&
    !phoneCheckError &&
    (!duplicatePhoneLead || wantsAssignDuplicate === true) &&
    !(
      duplicatePhoneLead?.assigned_vendor_id &&
      duplicatePhoneLead.assigned_vendor_id !== vendorId
    );
  const canCreateNewLead =
    showCreateFields && !duplicatePhoneLead && !phoneCheckError;
  const leadModalStep: "phone" | "checking" | "decision" | "data" =
    !normalizedLeadPhone
      ? "phone"
      : checkingPhone
        ? "checking"
        : phoneCheckError
          ? "checking"
          : duplicatePhoneLead
            ? "decision"
            : "data";
  const phoneStepDone = leadModalStep !== "phone";
  const verifyStepActive =
    leadModalStep === "checking" || leadModalStep === "decision";
  const verifyStepDone = leadModalStep === "data";

  const countNew = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.crm_stage === "novo" ||
          l.crm_stage === "contactado" ||
          l.crm_stage === "nao_responde",
      ).length,
    [leads],
  );
  const countScheduled = useMemo(
    () => leads.filter((l) => l.crm_stage === "agendado").length,
    [leads],
  );
  const countCheckin = useMemo(
    () => leads.filter((l) => l.crm_stage === "checkin").length,
    [leads],
  );
  const countDone = useMemo(
    () =>
      leads.filter(
        (l) => l.crm_stage === "convertido" || l.crm_stage === "perdido",
      ).length,
    [leads],
  );

  return (
    <div>
      <PageHeader
        title="Meus Leads"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Meus Leads" }]}
        subtitle={`${leads.length} leads atribuídos a você`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100 p-3 shadow-sm md:p-4">
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white">
            <Trophy size={16} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Pontos
          </p>
          <p className="mt-1 text-2xl font-extrabold leading-none text-amber-900 md:text-2xl">
            {score?.total_points ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-100 p-3 shadow-sm md:p-4">
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white">
            <CalendarPlus size={16} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Agendou
          </p>
          <p className="mt-1 text-2xl font-extrabold leading-none text-blue-900 md:text-xl">
            {score?.scheduled.count ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-100 p-3 shadow-sm md:p-4">
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <CheckCircle2 size={16} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Compareceu
          </p>
          <p className="mt-1 text-2xl font-extrabold leading-none text-emerald-900 md:text-xl">
            {score?.checked_in.count ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-pink-100 p-3 shadow-sm md:p-4">
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500 text-white">
            <ShoppingCart size={16} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">
            Vendeu
          </p>
          <p className="mt-1 text-2xl font-extrabold leading-none text-fuchsia-900 md:text-xl">
            {score?.sold.count ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou placa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:max-w-xs rounded-xl border border-zinc-200 px-3.5 py-2 text-sm focus:border-[#E51838] focus:outline-none bg-white text-zinc-950 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <Button
          icon={<Plus size={16} />}
          onClick={() => setLeadModalOpen(true)}
          className="w-full sm:w-auto justify-center"
        >
          Cadastrar lead
        </Button>
      </div>

      <div className="mb-6 flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedStageTab("all")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            selectedStageTab === "all"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Todos ({leads.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStageTab("new")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            selectedStageTab === "new"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Novos/Contatos ({countNew})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStageTab("scheduled")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            selectedStageTab === "scheduled"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Agendados ({countScheduled})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStageTab("checkin")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            selectedStageTab === "checkin"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Check-in ({countCheckin})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStageTab("done")}
          className={clsx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors shrink-0",
            selectedStageTab === "done"
              ? "border-[#e51838] text-[#e51838]"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          Concluídos ({countDone})
        </button>
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
          <p className="text-center py-10 text-sm text-zinc-500">
            Nenhum lead encontrado com os filtros atuais.
          </p>
        ) : (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              className="rounded-2xl border border-zinc-100 bg-white dark:bg-[#141414] dark:border-zinc-800 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {lead.name}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {lead.phone}
                  </p>
                </div>
                <StageBadge stage={lead.crm_stage} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Evento
                  </p>
                  <p className="mt-0.5 truncate text-zinc-700 dark:text-zinc-300 font-medium">
                    {lead.event_interest || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Status
                  </p>
                  <div className="mt-0.5 inline-flex">
                    <ConfirmationBadge status={lead.confirmation_status} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Visita
                  </p>
                  <p className="mt-0.5 text-zinc-700 dark:text-zinc-300 font-medium">
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
                  <p className="mt-0.5 text-zinc-700 dark:text-zinc-300 font-medium">
                    {lead.checkin_token ? "Disponível" : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-zinc-50 dark:border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => openLeadChat(lead)}
                  className="flex-1 min-w-[80px] inline-flex py-2 items-center justify-center gap-1.5 rounded-xl text-xs font-bold bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300 border border-green-200/40 dark:border-green-800/30 active:scale-[0.97] transition-all"
                  title="Abrir conversa no WhatsApp"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => copyCheckinPayload(lead)}
                  disabled={getCheckinButtonState(lead).disabled}
                  className="flex-1 min-w-[80px] inline-flex py-2 items-center justify-center gap-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300 border border-blue-200/40 dark:border-blue-800/30 disabled:opacity-40 disabled:scale-100 active:scale-[0.97] transition-all"
                  title={getCheckinButtonState(lead).title}
                >
                  <CheckCircle2 size={14} />
                  Check-in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAppointmentModal(lead);
                    setAppointmentEventId(lead.event_id ?? events[0]?.id ?? "");
                  }}
                  disabled={getAppointmentButtonState(lead).disabled}
                  className="flex-1 min-w-[80px] inline-flex py-2 items-center justify-center gap-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300 border border-indigo-200/40 dark:border-indigo-800/30 disabled:opacity-40 disabled:scale-100 active:scale-[0.97] transition-all"
                  title={getAppointmentButtonState(lead).title}
                >
                  <CalendarPlus size={14} />
                  Agendar
                </button>
                <button
                  type="button"
                  onClick={() => setSaleModal(lead)}
                  disabled={getSaleButtonState(lead).disabled}
                  className="flex-1 min-w-[80px] inline-flex py-2 items-center justify-center gap-1.5 rounded-xl text-xs font-bold bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300 border border-orange-200/40 dark:border-orange-800/30 disabled:opacity-40 disabled:scale-100 active:scale-[0.97] transition-all"
                  title={getSaleButtonState(lead).title}
                >
                  <ShoppingCart size={14} />
                  Vender
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCloseAttendanceModal(lead)}
                  disabled={lead.confirmation_status === "closed"}
                  className="flex-1 min-w-[80px] inline-flex py-2 items-center justify-center gap-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200/40 dark:border-gray-700/30 disabled:opacity-40 disabled:scale-100 active:scale-[0.97] transition-all"
                  title="Encerrar Atendimento"
                >
                  <XCircle size={14} />
                  Encerrar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block">
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
                  Evento
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Etapa
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Visita
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Check-in
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {lead.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {lead.event_interest || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={lead.crm_stage} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfirmationBadge status={lead.confirmation_status} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
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
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px]">
                    {lead.checkin_token ? (
                      <div className="flex flex-col gap-1.5">
                        <CheckinQrImage
                          value={
                            lead.checkin_token ?? lead.checkin_voucher ?? ""
                          }
                          size={144}
                        />
                        <button
                          type="button"
                          onClick={() => copyCheckinPayload(lead)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Copy size={12} /> Copiar convite
                        </button>
                        {lead.checkin_voucher ? (
                          <a
                            href={`${window.location.origin}/convite?v=${encodeURIComponent(lead.checkin_voucher)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700"
                          >
                            Abrir página do convite
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openLeadChat(lead)}
                        className="rounded-lg p-1.5 text-green-500 transition-colors hover:bg-green-50"
                        title="Abrir conversa no WhatsApp"
                      >
                        <MessageCircle size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyCheckinPayload(lead)}
                        disabled={getCheckinButtonState(lead).disabled}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30"
                        title={getCheckinButtonState(lead).title}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAppointmentModal(lead);
                          setAppointmentEventId(
                            lead.event_id ?? events[0]?.id ?? "",
                          );
                        }}
                        disabled={getAppointmentButtonState(lead).disabled}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30"
                        title={getAppointmentButtonState(lead).title}
                      >
                        <CalendarPlus size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSaleModal(lead)}
                        disabled={getSaleButtonState(lead).disabled}
                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-30"
                        title={getSaleButtonState(lead).title}
                      >
                        <ShoppingCart size={15} />
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
          setDuplicateLeadIdToClaim(null);
          setWantsAssignDuplicate(null);
          setActionError("");
        }}
        title="Cadastrar lead"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLeadModalOpen(false);
                setDuplicateLeadIdToClaim(null);
                setWantsAssignDuplicate(null);
                setActionError("");
              }}
            >
              Cancelar
            </Button>
            {canCreateNewLead ? (
              <Button
                onClick={() => void saveLead()}
                loading={saving}
                isDisabled={!leadName.trim()}
              >
                Cadastrar
              </Button>
            ) : null}
            {duplicateLeadIdToClaim && wantsAssignDuplicate ? (
              <Button
                variant="secondary"
                onClick={() => void claimDuplicateLead()}
                loading={saving}
              >
                Sim, atribuir para mim
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-center text-[11px] font-medium transition-all duration-200 ${
                leadModalStep === "phone"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : phoneStepDone
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              {phoneStepDone ? <CheckCircle2 size={12} /> : null}
              1. Telefone
            </div>
            <div
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-center text-[11px] font-medium transition-all duration-200 ${
                verifyStepActive
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : verifyStepDone
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              {verifyStepDone ? <CheckCircle2 size={12} /> : null}
              2. Verificação
            </div>
            <div
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-center text-[11px] font-medium transition-all duration-200 ${
                leadModalStep === "data"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              3. Dados
            </div>
          </div>
          <input
            value={leadPhone}
            onChange={(e) => {
              setLeadPhone(e.target.value);
              setDuplicateLeadIdToClaim(null);
              setWantsAssignDuplicate(null);
              setActionError("");
              setPhoneCheckError("");
            }}
            placeholder="Telefone do lead"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-xs text-gray-500">
            Digite o telefone primeiro para verificarmos se o lead já existe.
          </p>
          {normalizedLeadPhone ? (
            <p className="text-xs text-gray-500">
              Será salvo como: {normalizedLeadPhone}
            </p>
          ) : null}
          {checkingPhone && normalizedLeadPhone ? (
            <Notice tone="info" className="text-xs">
              Verificando telefone...
            </Notice>
          ) : null}
          {phoneCheckError ? (
            <div className="space-y-2">
              <Notice tone="error" className="text-xs">
                {phoneCheckError}
              </Notice>
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
            duplicatePhoneLead.assigned_vendor_id ? (
              <Notice tone="error" className="text-xs">
                {duplicatePhoneLead.assigned_vendor_id === vendorId
                  ? "Esse lead já está na sua carteira."
                  : `Esse lead já tem vendedor: ${duplicateLeadOwnerName}.`}
              </Notice>
            ) : (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-900">
                  Lead já cadastrado e sem vendedor. Quer atribuir para você?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setWantsAssignDuplicate(true);
                      setDuplicateLeadIdToClaim(duplicatePhoneLead.id);
                      setLeadName(duplicatePhoneLead.name ?? "");
                      setActionError("");
                    }}
                  >
                    Sim
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setWantsAssignDuplicate(false);
                      setDuplicateLeadIdToClaim(null);
                    }}
                  >
                    Não
                  </Button>
                </div>
              </div>
            )
          ) : null}
          {leadModalStep === "data" ? (
            <p className="text-xs text-emerald-700">
              Telefone disponível. Complete os dados para finalizar o cadastro.
            </p>
          ) : null}
          <div
            className={`overflow-hidden transition-all duration-200 ${
              showCreateFields ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {showCreateFields ? (
              <>
                <input
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Nome"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <input
                  type="email"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="E-mail (opcional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!appointmentModal}
        onClose={() => setAppointmentModal(null)}
        title={`Agendar — ${appointmentModal?.name}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setAppointmentModal(null)}
            >
              Cancelar
            </Button>
            <Button onClick={() => void saveAppointment()} loading={saving}>
              Criar agendamento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Lead
            </p>
            <p className="mt-1 text-gray-800">
              {appointmentModal?.name} —{" "}
              {appointmentModal?.phone || "sem telefone"}
            </p>
          </div>
          <Select
            label="Evento"
            value={appointmentEventId}
            onChange={(e) => {
              const nextId = e.target.value;
              setAppointmentEventId(nextId);
              setAppointmentDateKey("");
            }}
            options={events.map((event) => ({
              value: event.id,
              label: event.name,
            }))}
          />
          <Select
            label="Dia do evento"
            value={appointmentDateKey}
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
            <p className="mb-1.5 text-xs font-medium text-gray-600">Período</p>
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
                      : "border-gray-200 bg-white text-gray-700 hover:border-[#FF0636] hover:text-[#FF0636]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!saleModal}
        onClose={() => {
          setSaleModal(null);
          resetSaleVehicleFields();
        }}
        title={`Registrar venda — ${saleModal?.name}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSaleModal(null);
                resetSaleVehicleFields();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={() => void saveSale()} loading={saving}>
              Registrar venda
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Lead
            </p>
            <p className="mt-1 text-gray-800">
              {saleModal?.name} — {saleModal?.phone || "sem telefone"}
            </p>
          </div>
          <Select
            label="Tipo"
            value={saleType}
            onChange={(e) => setSaleType(e.target.value as SaleType)}
            options={[
              { value: "NOVO", label: "Novo" },
              { value: "SEMINOVO", label: "Seminovo" },
              { value: "VENDA_DIRETA", label: "Venda direta" },
              { value: "PCD", label: "PCD" },
            ]}
          />
          <Select
            label="Marca do carro"
            value={saleCarBrandCode}
            onChange={(e) => setSaleCarBrandCode(e.target.value)}
            options={carBrands}
            placeholder="Selecione uma marca (FIPE)"
            disabled={carLoading || carBrands.length === 0}
          />
          <Select
            label="Modelo do carro"
            value={saleCarModelCode}
            onChange={(e) => setSaleCarModelCode(e.target.value)}
            options={carModels}
            placeholder={
              saleCarBrandCode
                ? "Selecione um modelo"
                : "Escolha uma marca primeiro"
            }
            disabled={!saleCarBrandCode || carLoading || carModels.length === 0}
          />
          <Select
            label="Ano/versão"
            value={saleCarYearCode}
            onChange={(e) => setSaleCarYearCode(e.target.value)}
            options={carYears}
            placeholder={
              saleCarModelCode
                ? "Selecione o ano/versão"
                : "Escolha um modelo primeiro"
            }
            disabled={!saleCarModelCode || carLoading || carYears.length === 0}
          />
          <input
            value={saleProduct}
            onChange={(e) => setSaleProduct(e.target.value)}
            placeholder="Produto (preenchido automaticamente ao escolher marca/modelo/ano)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {isFipeProductSelected ? (
            <p className="text-xs text-blue-700">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold">
                Dados FIPE
              </span>{" "}
              Produto preenchido automaticamente (você pode editar manualmente).
            </p>
          ) : null}
          {carLoadError ? (
            <p className="text-xs text-amber-700">{carLoadError}</p>
          ) : null}
          <input
            value={saleValue}
            onChange={(e) => setSaleValue(formatCurrencyInput(e.target.value))}
            placeholder="Valor (ex: 120.000,00)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Input
            label="Data da venda *"
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            required
          />
          <textarea
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
            placeholder="Observações (opcional)"
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
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
        onClose={() => setCloseAttendanceModal(null)}
        title={`Baixa do Atendimento — ${closeAttendanceModal?.name}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCloseAttendanceModal(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveCloseAttendance()}
              loading={saving}
              isDisabled={
                (isWristbandRequired && !closeWristbandNumber.trim()) ||
                !closeCpf.trim() ||
                !closePhone.trim()
              }
            >
              Confirmar Encerramento
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-left">
          {actionError && (
            <div className="p-3 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-lg text-sm">
              {actionError}
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Para finalizar o atendimento e dar baixa, informe os campos
            obrigatórios abaixo:
          </p>
          <Input
            label={
              isWristbandRequired
                ? "Número da Pulseira *"
                : "Número da Pulseira (Opcional)"
            }
            value={closeWristbandNumber}
            onChange={(e) => setCloseWristbandNumber(e.target.value)}
            placeholder="Ex: 1042"
            required={isWristbandRequired}
          />
          <Input
            label="CPF *"
            value={closeCpf}
            onChange={(e) => setCloseCpf(e.target.value)}
            placeholder="000.000.000-00"
            required
          />
          <Input
            label="Telefone *"
            value={closePhone}
            onChange={(e) => setClosePhone(e.target.value)}
            placeholder="(11) 99999-9999"
            required
          />
        </div>
      </Modal>
    </div>
  );
}
