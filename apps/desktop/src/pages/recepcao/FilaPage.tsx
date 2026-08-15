import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  Clock,
  Flag,
  Radio,
  RefreshCw,
  UserCheck,
  Users,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { User } from "../../types";
import { PageHeader } from "../../components/shared/PageHeader";
import { Notice } from "../../components/ui/Notice";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { readStoredSession } from "../../services/auth";
import {
  getReceptionQueue,
  closeLeadAttendance,
  changeAttendanceVendor,
  listVendorAvailability,
  type ReceptionQueueLead,
  type VendorAvailability,
} from "../../services/leads";
import { resolveClientId } from "../../utils/userContext";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import gpLogo from "../../assets/logo.png";

type OutletContext = { user: User };
type QueueTab = "clients" | "vendors";
type VendorQueueSegment = "seminovo" | "pcd" | "novo" | "vd" | "assinatura";
const QUEUE_CATEGORIES: Array<{
  value: VendorQueueSegment;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "seminovo", label: "Seminovo" },
  { value: "pcd", label: "PCD" },
  { value: "vd", label: "VD" },
  { value: "assinatura", label: "Assinatura" },
];

function arrivalTime(lead: ReceptionQueueLead) {
  return new Date(lead.confirmation_date || lead.updated_at || lead.created_at);
}

export function FilaPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [eventName, setEventName] = useState("");
  const [leads, setLeads] = useState<ReceptionQueueLead[]>([]);
  const [vendors, setVendors] = useState<VendorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [queuePage, setQueuePage] = useState(1);
  const [queueHasNextPage, setQueueHasNextPage] = useState(false);
  const [queueTotals, setQueueTotals] = useState({
    waiting: 0,
    active: 0,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [finishingLead, setFinishingLead] = useState<ReceptionQueueLead | null>(
    null,
  );
  const [finishingVendorId, setFinishingVendorId] = useState("");
  const [finishingSold, setFinishingSold] = useState<"yes" | "no" | "">("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [changingLead, setChangingLead] = useState<ReceptionQueueLead | null>(
    null,
  );
  const [nextVendorId, setNextVendorId] = useState("");
  const [changingVendor, setChangingVendor] = useState(false);
  const [changeVendorError, setChangeVendorError] = useState("");
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("clients");
  const [activeClientCategory, setActiveClientCategory] =
    useState<VendorQueueSegment>("novo");

  const load = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId) {
      setError("Não foi possível identificar a empresa deste acesso.");
      setLoading(false);
      return;
    }

    try {
      const [queue, vendorRows] = await Promise.all([
        getReceptionQueue(token, { page: 1, take: 50 }),
        listVendorAvailability(token),
      ]);
      if (!queue.event) {
        setError("Nenhum evento disponível para exibir a fila.");
        setLoading(false);
        return;
      }

      setEventName(queue.event.name);
      setLeads(queue.leads);
      setQueuePage(queue.page_info?.page ?? 1);
      setQueueHasNextPage(queue.page_info?.has_next_page ?? false);
      setQueueTotals({
        waiting:
          queue.page_info?.waiting_total ??
          queue.leads.filter((lead) => lead.queue_state !== "active").length,
        active:
          queue.page_info?.active_total ??
          queue.leads.filter((lead) => lead.queue_state === "active").length,
      });
      setVendors(vendorRows);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar a fila de atendimento.",
      );
    } finally {
      setLoading(false);
    }
  }, [clientId, user.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useLeadRealtimeSync(clientId, load, {
    refreshOnEvent: false,
    onEvent: () => void load(),
  });

  const loadMore = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !queueHasNextPage || loadingMore) return;

    setLoadingMore(true);
    try {
      const queue = await getReceptionQueue(token, {
        page: queuePage + 1,
        take: 50,
      });
      setLeads((current) => {
        const existingIds = new Set(current.map((lead) => lead.id));
        return [
          ...current,
          ...queue.leads.filter((lead) => !existingIds.has(lead.id)),
        ];
      });
      setQueuePage(queue.page_info.page);
      setQueueHasNextPage(queue.page_info.has_next_page);
      setQueueTotals({
        waiting: queue.page_info.waiting_total,
        active: queue.page_info.active_total,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar mais pessoas da fila.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, queueHasNextPage, queuePage]);

  const openFinishAttendance = (lead: ReceptionQueueLead) => {
    setFinishingLead(lead);
    setFinishingVendorId(lead.assigned_vendor_id ?? "");
    setFinishingSold("");
    setFinishError("");
  };

  const closeFinishAttendance = () => {
    if (finishing) return;
    setFinishingLead(null);
    setFinishingVendorId("");
    setFinishingSold("");
    setFinishError("");
  };

  const submitFinishAttendance = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !finishingLead) return;
    if (!finishingVendorId) {
      setFinishError("Selecione quem realizou o atendimento.");
      return;
    }
    if (!finishingSold) {
      setFinishError("Informe se o cliente comprou.");
      return;
    }

    setFinishing(true);
    setFinishError("");
    try {
      await closeLeadAttendance(
        finishingLead.id,
        {
          attended_by_vendor_id: finishingVendorId,
          sold: finishingSold === "yes",
        },
        token,
      );
      setLeads((current) =>
        current.filter((lead) => lead.id !== finishingLead.id),
      );
      setSuccess(
        finishingSold === "yes"
          ? "Atendimento finalizado com venda. Deu certo!"
          : "Atendimento finalizado sem venda.",
      );
      setFinishingLead(null);
      setFinishingVendorId("");
      setFinishingSold("");
      void load();
      window.setTimeout(() => setSuccess(""), 5000);
    } catch (cause) {
      setFinishError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível finalizar o atendimento.",
      );
    } finally {
      setFinishing(false);
    }
  };

  const openChangeVendor = (lead: ReceptionQueueLead) => {
    setChangingLead(lead);
    setNextVendorId("");
    setChangeVendorError("");
  };

  const submitChangeVendor = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !changingLead) return;
    if (!nextVendorId) {
      setChangeVendorError("Selecione o novo vendedor.");
      return;
    }
    setChangingVendor(true);
    setChangeVendorError("");
    try {
      await changeAttendanceVendor(changingLead.id, nextVendorId, token);
      const vendor = vendors.find((row) => row.id === nextVendorId);
      setSuccess(
        `Atendimento de ${changingLead.name} transferido para ${vendor?.name ?? "o novo vendedor"}.`,
      );
      setChangingLead(null);
      setNextVendorId("");
      await load();
      window.setTimeout(() => setSuccess(""), 5000);
    } catch (cause) {
      setChangeVendorError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível mudar o vendedor.",
      );
    } finally {
      setChangingVendor(false);
    }
  };

  const { waitingQueue, activeService } = useMemo(() => {
    const sorted = [...leads].sort(
      (a, b) => arrivalTime(a).getTime() - arrivalTime(b).getTime(),
    );
    return {
      waitingQueue: sorted.filter((lead) => lead.queue_state !== "active"),
      activeService: sorted.filter((lead) => lead.queue_state === "active"),
    };
  }, [leads]);

  const myQueueStatus = useMemo(() => {
    if (user.role !== "vendedor") return null;
    const me = vendors.find((vendor) => vendor.id === user.id);
    if (!me) return null;
    const segment = vendorSegments(me)[0] ?? "novo";
    const ordered = vendors
      .filter(
        (vendor) => vendor.eligible && vendorSegments(vendor).includes(segment),
      )
      .sort((a, b) => {
        const timeA = a.last_assigned_at
          ? new Date(a.last_assigned_at).getTime()
          : 0;
        const timeB = b.last_assigned_at
          ? new Date(b.last_assigned_at).getTime()
          : 0;
        return timeA - timeB || a.id.localeCompare(b.id);
      });
    const index = ordered.findIndex((vendor) => vendor.id === user.id);
    return {
      ...me,
      segment,
      position: index >= 0 ? index + 1 : null,
      queueSize: ordered.length,
    };
  }, [user.id, user.role, vendors]);

  const vendorQueue = useMemo(() => {
    const byLastAssignment = (a: VendorAvailability, b: VendorAvailability) => {
      const timeA = a.last_assigned_at
        ? new Date(a.last_assigned_at).getTime()
        : 0;
      const timeB = b.last_assigned_at
        ? new Date(b.last_assigned_at).getTime()
        : 0;
      return timeA - timeB || a.name.localeCompare(b.name, "pt-BR");
    };
    const available = vendors
      .filter((vendor) => vendor.eligible)
      .sort(byLastAssignment)
      .map((vendor, index) => ({ ...vendor, queuePosition: index + 1 }));
    const unavailable = vendors
      .filter((vendor) => !vendor.eligible)
      .sort((a, b) => {
        const statusOrder = { busy: 0, away: 1, online: 2 };
        return (
          statusOrder[a.operational_status] -
            statusOrder[b.operational_status] ||
          a.name.localeCompare(b.name, "pt-BR")
        );
      })
      .map((vendor) => ({ ...vendor, queuePosition: null }));

    return [...available, ...unavailable].map((vendor) => ({
      ...vendor,
      activeLeadName:
        vendor.operational_status === "busy"
          ? (activeService.find((lead) => lead.assigned_vendor_id === vendor.id)
              ?.name ?? null)
          : null,
    }));
  }, [activeService, vendors]);

  const categoryQueue = useMemo(
    () =>
      waitingQueue.filter(
        (lead) => (lead.queue_category ?? "novo") === activeClientCategory,
      ),
    [activeClientCategory, waitingQueue],
  );

  return (
    <div className="space-y-4 pb-28 sm:space-y-6 sm:pb-6">
      <PageHeader
        title="Fila de Atendimento"
        breadcrumbs={[
          {
            label: user.role === "recepcao" ? "Recepção" : "Vendedor",
          },
          { label: "Fila" },
        ]}
      />

      {user.role === "vendedor" && myQueueStatus ? (
        <div className="relative overflow-hidden rounded-3xl border border-[#ff0038]/25 bg-[#0d0d10] p-5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,0,56,0.18),transparent_42%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ff0038]/30 bg-[#ff0038]/10 text-[#ff3159]">
                <Radio size={23} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ff6684]">
                  Sua ordem · {vendorSegmentLabel(myQueueStatus.segment)}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                  {myQueueStatus.position
                    ? myQueueStatus.position === 1
                      ? "Você é o próximo vendedor"
                      : `${myQueueStatus.position - 1} vendedor${myQueueStatus.position - 1 === 1 ? "" : "es"} à sua frente`
                    : myQueueStatus.operational_status === "busy"
                      ? "Você está em atendimento"
                      : myQueueStatus.operational_status === "away"
                        ? "Você está ausente da fila"
                        : "Conectando você à fila"}
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  A ordem é atualizada automaticamente após cada chamada.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              {myQueueStatus.position ? (
                <>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      Posição
                    </p>
                    <p className="text-xs font-semibold text-zinc-400">
                      de {myQueueStatus.queueSize} disponíveis
                    </p>
                  </div>
                  <span className="flex h-16 min-w-16 items-center justify-center rounded-2xl bg-[#ff0038] px-4 text-3xl font-black shadow-[0_12px_30px_rgba(255,0,56,0.3)]">
                    {myQueueStatus.position}º
                  </span>
                </>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-zinc-300">
                  Fora da fila
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <div className="flex w-full gap-1 rounded-2xl border border-border bg-muted/50 p-1 sm:w-fit">
        {(
          [
            ["clients", "Fila de clientes"],
            ["vendors", "Fila de vendedores"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveQueueTab(value)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors sm:flex-none ${
              activeQueueTab === value
                ? "bg-[#E51838] text-white shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeQueueTab === "vendors" ? (
        <VendorQueuePanel vendors={vendorQueue} currentUserId={user.id} />
      ) : null}

      {activeQueueTab === "clients" ? (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#09090b] p-3 text-white shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:rounded-3xl sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,0,56,0.09),transparent_32%),repeating-linear-gradient(135deg,transparent_0,transparent_28px,rgba(255,255,255,0.015)_29px,transparent_30px)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#ff0038] via-[#ff0038]/50 to-transparent" />

          {eventName ? (
            <div className="relative mb-4 flex flex-col justify-between gap-3 border-b border-white/[0.08] pb-4 sm:mb-5 sm:flex-row sm:items-center sm:gap-4 sm:pb-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ff0038]/30 bg-[#ff0038]/10 sm:h-14 sm:w-14">
                  <img
                    src={gpLogo}
                    alt="GP de Vendas"
                    className="h-8 w-8 object-contain sm:h-10 sm:w-10"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#ff3159] sm:text-[10px] sm:tracking-[0.3em]">
                    GP de Vendas · Atendimento ao vivo
                  </p>
                  <p className="mt-1 line-clamp-2 text-base font-black uppercase leading-tight tracking-tight sm:text-2xl">
                    {eventName}
                  </p>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                <QueueMetric
                  label="Aguardando hoje"
                  value={queueTotals.waiting}
                  tone="waiting"
                />
                <QueueMetric
                  label="Em atendimento"
                  value={queueTotals.active}
                  tone="active"
                />
              </div>
            </div>
          ) : null}

          <div className="relative">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-[#ff0038]" />
                Carregando fila...
              </div>
            ) : leads.length === 0 && !error ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-zinc-500">
                <Users size={38} className="text-zinc-700" />
                <p className="text-sm font-medium">
                  {user.role === "vendedor"
                    ? "Nenhum cliente está aguardando você."
                    : "Ninguém aguardando atendimento."}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  {QUEUE_CATEGORIES.map((category) => {
                    const count = waitingQueue.filter(
                      (lead) =>
                        (lead.queue_category ?? "novo") === category.value,
                    ).length;
                    return (
                      <button
                        key={category.value}
                        type="button"
                        onClick={() => setActiveClientCategory(category.value)}
                        className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                          activeClientCategory === category.value
                            ? "border-[#ff3159] bg-[#ff0038] text-white"
                            : "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-white/20"
                        }`}
                      >
                        {category.label} · {count}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
                  <QueueSection
                    title={`Fila ${QUEUE_CATEGORIES.find((item) => item.value === activeClientCategory)?.label ?? "Novo"}`}
                    subtitle="Clientes aguardando atendimento nesta categoria"
                    icon={<Clock size={19} />}
                    count={categoryQueue.length}
                    tone="waiting"
                  >
                    {categoryQueue.length ? (
                      categoryQueue.map((lead, index) => (
                        <QueueLeadRow
                          key={lead.id}
                          lead={lead}
                          position={index + 1}
                          state="waiting"
                        />
                      ))
                    ) : (
                      <QueueEmpty icon={<Flag size={28} />}>
                        Ninguém aguardando nesta categoria.
                      </QueueEmpty>
                    )}
                  </QueueSection>

                  <QueueSection
                    title="Em atendimento"
                    subtitle="Clientes com vendedor"
                    icon={<UserCheck size={19} />}
                    count={queueTotals.active}
                    tone="active"
                  >
                    {activeService.length ? (
                      activeService.map((lead) => (
                        <QueueLeadRow
                          key={lead.id}
                          lead={lead}
                          state="active"
                          onFinish={
                            user.role === "recepcao"
                              ? openFinishAttendance
                              : undefined
                          }
                          onChangeVendor={
                            user.role === "recepcao"
                              ? openChangeVendor
                              : undefined
                          }
                        />
                      ))
                    ) : (
                      <QueueEmpty icon={<UserCheck size={28} />}>
                        Nenhum atendimento iniciado.
                      </QueueEmpty>
                    )}
                  </QueueSection>
                </div>
              </>
            )}
            {queueHasNextPage && !loading ? (
              <div className="mt-5 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  Carregar mais pessoas
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(finishingLead)}
        onClose={closeFinishAttendance}
        title="Finalizar atendimento"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeFinishAttendance}
              disabled={finishing}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void submitFinishAttendance()}
              loading={finishing}
              icon={<CheckCircle2 size={17} />}
            >
              Finalizar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 size={24} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Deu certo
              </p>
              <p className="font-semibold">{finishingLead?.name}</p>
            </div>
          </div>

          {finishError ? <Notice tone="error">{finishError}</Notice> : null}

          <Select
            label="Atendido por quem?"
            value={finishingVendorId}
            placeholder="Selecione a vendedora"
            onValueChange={setFinishingVendorId}
            options={vendors.map((vendor) => ({
              value: vendor.id,
              label: vendor.name,
            }))}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground">
              Comprou?
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {(["yes", "no"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFinishingSold(value)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
                    finishingSold === value
                      ? value === "yes"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-zinc-800 bg-zinc-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {value === "yes" ? "Sim" : "Não"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </Modal>

      <Modal
        open={Boolean(changingLead)}
        onClose={() => {
          if (!changingVendor) setChangingLead(null);
        }}
        title="Mudar vendedor"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={changingVendor}
              onClick={() => setChangingLead(null)}
            >
              Cancelar
            </Button>
            <Button
              loading={changingVendor}
              icon={<RefreshCw size={16} />}
              onClick={() => void submitChangeVendor()}
            >
              Transferir atendimento
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Cliente: <strong>{changingLead?.name}</strong>
          </p>
          {changeVendorError ? (
            <Notice tone="error">{changeVendorError}</Notice>
          ) : null}
          <Select
            label="Novo vendedor"
            value={nextVendorId}
            placeholder="Selecione um vendedor disponível"
            onValueChange={setNextVendorId}
            options={vendors
              .filter(
                (vendor) =>
                  vendor.eligible &&
                  vendor.id !== changingLead?.assigned_vendor_id,
              )
              .map((vendor) => ({ value: vendor.id, label: vendor.name }))}
          />
        </div>
      </Modal>
    </div>
  );
}

function VendorQueuePanel({
  vendors,
  currentUserId,
}: {
  vendors: Array<
    VendorAvailability & {
      queuePosition: number | null;
      activeLeadName: string | null;
    }
  >;
  currentUserId: string;
}) {
  const [activeSegment, setActiveSegment] =
    useState<VendorQueueSegment>("novo");
  const segments = QUEUE_CATEGORIES;
  const vendorsBySegment = useMemo(() => {
    const segmentVendors = vendors.filter((vendor) =>
      vendorSegments(vendor).includes(activeSegment),
    );
    const byLastAssignment = (
      a: (typeof vendors)[number],
      b: (typeof vendors)[number],
    ) => {
      const timeA = a.last_assigned_at
        ? new Date(a.last_assigned_at).getTime()
        : 0;
      const timeB = b.last_assigned_at
        ? new Date(b.last_assigned_at).getTime()
        : 0;
      return timeA - timeB || a.name.localeCompare(b.name, "pt-BR");
    };
    const available = segmentVendors
      .filter((vendor) => vendor.eligible)
      .sort(byLastAssignment)
      .map((vendor, index) => ({ ...vendor, queuePosition: index + 1 }));
    const unavailable = segmentVendors
      .filter((vendor) => !vendor.eligible)
      .map((vendor) => ({ ...vendor, queuePosition: null }));
    return [...available, ...unavailable];
  }, [activeSegment, vendors]);
  const availableCount = vendors.filter((vendor) => vendor.eligible).length;
  const segmentAvailableCount = vendorsBySegment.filter(
    (vendor) => vendor.eligible,
  ).length;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-[#0d0d10] p-4 text-white shadow-[0_18px_45px_rgba(0,0,0,0.2)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,0,56,0.1),transparent_38%)]" />
      <div className="relative mb-4 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff3159]">
            <Users size={21} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ff6684]">
              Rodízio de atendimento
            </p>
            <h2 className="text-lg font-black uppercase tracking-tight">
              Ordem dos vendedores
            </h2>
          </div>
        </div>
        <span className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-bold text-zinc-300">
          {availableCount} na fila
        </span>
      </div>

      <div className="relative mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/20 p-1">
        {segments.map((segment) => {
          const count = vendors.filter((vendor) =>
            vendorSegments(vendor).includes(segment.value),
          ).length;
          return (
            <button
              key={segment.value}
              type="button"
              onClick={() => setActiveSegment(segment.value)}
              className={`inline-flex min-w-fit flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wide transition-colors ${
                activeSegment === segment.value
                  ? "bg-[#ff0038] text-white"
                  : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              {segment.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                  activeSegment === segment.value
                    ? "bg-white/20 text-white"
                    : "bg-white/[0.06] text-zinc-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-3 text-xs font-semibold text-zinc-500">
        {segmentAvailableCount} vendedor
        {segmentAvailableCount === 1 ? "" : "es"} disponível
        {segmentAvailableCount === 1 ? "" : "is"} nesta fila
      </div>

      <div className="relative grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {vendorsBySegment.length ? (
          vendorsBySegment.map((vendor) => {
            const isCurrentUser = vendor.id === currentUserId;
            const isBusy = vendor.operational_status === "busy";
            const isAway = vendor.operational_status === "away";
            return (
              <div
                key={vendor.id}
                className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition-colors ${
                  isCurrentUser
                    ? "border-[#ff0038]/45 bg-[#ff0038]/10"
                    : "border-white/[0.07] bg-white/[0.025]"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-black ${
                    vendor.queuePosition
                      ? "border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff6684]"
                      : isBusy
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-400"
                        : "border-zinc-700 bg-zinc-800/70 text-zinc-500"
                  }`}
                >
                  {vendor.queuePosition ? (
                    `${vendor.queuePosition}º`
                  ) : isBusy ? (
                    <UserCheck size={19} />
                  ) : (
                    "—"
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-zinc-100">
                      {vendor.name}
                    </p>
                    {isCurrentUser ? (
                      <span className="rounded-full bg-[#ff0038] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        Você
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {vendor.activeLeadName
                      ? `Atendendo ${vendor.activeLeadName}`
                      : vendor.team_name || "Sem equipe informada"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    vendor.eligible
                      ? "bg-[#ff0038]/10 text-[#ff6684]"
                      : isBusy
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {vendor.eligible
                    ? "Na fila"
                    : isBusy
                      ? "Atendendo"
                      : isAway
                        ? "Ausente"
                        : "Indisponível"}
                </span>
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">
            Nenhum vendedor cadastrado nesta categoria.
          </div>
        )}
      </div>
    </section>
  );
}

function vendorSegments(vendor: VendorAvailability): VendorQueueSegment[] {
  const stored = vendor.vendor_categories.length
    ? vendor.vendor_categories
    : vendor.vendor_category
      ? [vendor.vendor_category]
      : [];
  const categoryMap = {
    novo: "novo",
    semininovo: "seminovo",
    pdc: "pcd",
    consorcio: "vd",
    assinatura: "assinatura",
  } as const;
  return stored.map((category) => categoryMap[category]);
}

function vendorSegmentLabel(segment: VendorQueueSegment) {
  const labels: Record<VendorQueueSegment, string> = {
    seminovo: "Seminovo",
    pcd: "PCD",
    novo: "Novo",
    vd: "VD",
    assinatura: "Assinatura",
  };
  return labels[segment];
}

function QueueMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "waiting" | "active";
}) {
  return (
    <div className="min-w-[118px] rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-2xl font-black tabular-nums ${
          tone === "waiting" ? "text-amber-400" : "text-[#ff3159]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function QueueSection({
  title,
  subtitle,
  icon,
  count,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  count: number;
  tone: "waiting" | "active";
  children: ReactNode;
}) {
  const active = tone === "active";
  return (
    <section className="min-h-0 rounded-2xl border border-white/[0.08] bg-[#111114]/95 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.25)] sm:min-h-[280px] sm:p-4">
      <div className="mb-4 flex items-center justify-between border-b border-white/[0.07] pb-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              active
                ? "border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff3159]"
                : "border-amber-400/20 bg-amber-400/10 text-amber-400"
            }`}
          >
            {icon}
          </span>
          <div>
            <h2 className="font-black uppercase tracking-tight text-zinc-100">
              {title}
            </h2>
            <p className="text-[11px] text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <span
          className={`rounded-lg px-3 py-1 text-lg font-black tabular-nums ${
            active
              ? "bg-[#ff0038]/10 text-[#ff3159]"
              : "bg-amber-400/10 text-amber-400"
          }`}
        >
          {count}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function QueueEmpty({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] text-center text-sm text-zinc-600">
      <span className="text-zinc-700">{icon}</span>
      {children}
    </div>
  );
}

function QueueLeadRow({
  lead,
  position,
  state,
  onFinish,
  onChangeVendor,
}: {
  lead: ReceptionQueueLead;
  position?: number;
  state: "waiting" | "personal" | "active";
  onFinish?: (lead: ReceptionQueueLead) => void;
  onChangeVendor?: (lead: ReceptionQueueLead) => void;
}) {
  const active = state === "active";
  const personal = state === "personal";
  return (
    <div
      className={`group relative flex flex-wrap items-start gap-3 overflow-hidden rounded-xl border p-3 transition-colors sm:flex-nowrap sm:items-center sm:p-3.5 ${
        active
          ? "border-[#ff0038]/15 bg-[#ff0038]/[0.045] hover:border-[#ff0038]/30"
          : personal
            ? "border-sky-400/15 bg-sky-400/[0.045] hover:border-sky-400/30"
            : "border-white/[0.07] bg-white/[0.025] hover:border-amber-400/20"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${active ? "bg-[#ff0038]" : personal ? "bg-sky-400" : "bg-amber-400"}`}
      />
      <span
        className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${
          active
            ? "border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff3159]"
            : personal
              ? "border-sky-400/25 bg-sky-400/10 text-sky-300"
              : "border-amber-400/25 bg-amber-400/10 text-amber-300"
        }`}
      >
        {active ? <UserCheck size={18} /> : position}
      </span>
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
        <p className="truncate font-bold text-zinc-100">{lead.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
          <Clock size={13} />
          Check-in às{" "}
          {arrivalTime(lead).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <div className="ml-12 flex w-[calc(100%-3rem)] shrink-0 flex-col items-start gap-2 sm:ml-0 sm:w-auto sm:items-end">
        <span
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            active
              ? "bg-[#ff0038]/10 text-[#ff6684]"
              : personal
                ? "bg-sky-400/10 text-sky-300"
                : "bg-amber-400/10 text-amber-300"
          }`}
        >
          <UserCheck size={14} />
          <span className="truncate">
            {active
              ? lead.assigned_vendor_name || "Em atendimento"
              : personal
                ? `Mérito · ${lead.assigned_vendor_name || "vendedor responsável"}`
                : "Aguardando rodízio"}
          </span>
        </span>
        {active && (onFinish || onChangeVendor) ? (
          <div className="flex gap-2">
            {onChangeVendor ? (
              <button
                type="button"
                onClick={() => onChangeVendor(lead)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10"
              >
                <RefreshCw size={14} />
                Mudar vendedor
              </button>
            ) : null}
            {onFinish ? (
              <button
                type="button"
                onClick={() => onFinish(lead)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white shadow-[0_8px_20px_rgba(16,185,129,0.22)] transition-colors hover:bg-emerald-400"
              >
                <CheckCircle2 size={15} />
                Finalizar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
