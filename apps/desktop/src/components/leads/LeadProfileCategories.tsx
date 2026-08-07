import { useEffect, useState } from "react";
import clsx from "clsx";
import { CalendarDays, Car, Clock, FileText, Phone, User } from "lucide-react";
import type { Lead } from "../../types";
import { readStoredSession } from "../../services/auth";
import { listLeadTimeline, type ApiLeadTimelineItem } from "../../services/crm";

type Tab = "personal" | "service" | "vehicle" | "meta" | "history";
type Field = {
  label: string;
  value: string | null;
  wide?: boolean;
  json?: boolean;
};

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

export function LeadProfileCategories({
  lead,
  vendorName,
  dark = false,
  compact = false,
}: {
  lead: Lead;
  vendorName?: string | null;
  dark?: boolean;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("personal");
  const [history, setHistory] = useState<ApiLeadTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab !== "history") return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setLoading(true);
    listLeadTimeline(lead.id, token)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [lead.id, tab]);

  const groups: Record<Exclude<Tab, "history">, Field[]> = {
    personal: [
      { label: "Nome", value: lead.first_name || lead.name || null },
      { label: "Sobrenome", value: lead.last_name || null },
      { label: "Telefone", value: lead.phone || null },
      { label: "E-mail", value: lead.email || null },
      {
        label: "Data de nascimento",
        value: lead.birth_date
          ? new Date(lead.birth_date).toLocaleDateString("pt-BR")
          : null,
      },
      { label: "CPF", value: lead.cpf || null },
    ],
    service: [
      { label: "Evento de interesse", value: lead.event_interest || null },
      { label: "Agendamento", value: dateTime(lead.store_visit_datetime) },
      { label: "Confirmação", value: lead.confirmation_status || null },
      { label: "Etapa atual", value: lead.crm_stage || null },
      { label: "Vendedor", value: vendorName || null },
      {
        label: "Canal preferido",
        value: lead.preferred_contact_channel || null,
      },
      { label: "Acompanhantes", value: lead.companions || null, wide: true },
      { label: "Descrição", value: lead.description || null, wide: true },
      { label: "Observações", value: lead.notes || null, wide: true },
    ],
    vehicle: [
      { label: "Placa", value: lead.vehicle_plate || null },
      { label: "Marca", value: lead.vehicle_brand || null },
      { label: "Modelo", value: lead.vehicle_model || null },
      { label: "Ano", value: lead.vehicle_year || null },
      { label: "Valor FIPE", value: lead.vehicle_fipe_value || null },
    ],
    meta: [
      { label: "ID do lead Meta", value: lead.facebook_lead_id || null },
      { label: "ID do formulário", value: lead.facebook_form_id || null },
      { label: "Campanha", value: lead.facebook_campaign_name || null },
      { label: "ID da campanha", value: lead.facebook_campaign_id || null },
      {
        label: "Conjunto de anúncios",
        value: lead.facebook_ad_set_name || null,
      },
      { label: "ID do conjunto", value: lead.facebook_ad_set_id || null },
      { label: "Anúncio", value: lead.facebook_ad_name || null },
      { label: "ID do anúncio", value: lead.facebook_ad_id || null },
      { label: "Criado na Meta", value: dateTime(lead.source_created_at) },
      {
        label: "Respostas do formulário",
        value: lead.source_payload?.todos_os_campos
          ? JSON.stringify(lead.source_payload.todos_os_campos, null, 2)
          : null,
        wide: true,
        json: true,
      },
    ],
  };
  const tabs: Array<{ id: Tab; label: string; icon: typeof User }> = [
    { id: "personal", label: "Dados pessoais", icon: User },
    { id: "service", label: "Atendimento", icon: Phone },
    { id: "vehicle", label: "Veículo", icon: Car },
    { id: "meta", label: "Origem Meta", icon: FileText },
    { id: "history", label: "Histórico", icon: Clock },
  ];
  const visibleFields =
    tab === "history"
      ? []
      : groups[tab].filter(
          (field) => Boolean(field.value) && field.value !== "—",
        );

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl border",
        dark ? "border-zinc-800 bg-[#111]" : "border-gray-200 bg-white",
      )}
    >
      <div
        className={clsx(
          compact
            ? "grid grid-cols-2 gap-1.5 p-2"
            : "grid grid-cols-2 gap-1.5 border-b p-2 sm:grid-cols-3 lg:grid-cols-5",
          !compact && (dark ? "border-zinc-800" : "border-gray-100"),
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              "flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
              tab === id
                ? dark
                  ? "bg-[#FF0636]/15 text-[#ff496b]"
                  : "bg-[#fff0f3] text-[#e6002d]"
                : dark
                  ? "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            <Icon size={15} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <div className={compact ? "p-3" : "p-4 sm:p-5"}>
        {tab !== "history" ? (
          visibleFields.length > 0 ? (
            <div
              className={clsx(
                "grid gap-2.5",
                !compact && "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {visibleFields.map((field) => (
                <div
                  key={field.label}
                  className={clsx(
                    "rounded-xl border",
                    compact ? "px-3.5 py-3" : "p-4",
                    !compact && field.wide && "sm:col-span-2 lg:col-span-3",
                    dark
                      ? "border-zinc-800 bg-black/20"
                      : "border-gray-100 bg-[#fafafa]",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                    {field.label}
                  </p>
                  {field.json && field.value ? (
                    <pre
                      className={clsx(
                        "mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs",
                        dark
                          ? "bg-black/40 text-zinc-300"
                          : "bg-white text-gray-700",
                      )}
                    >
                      {field.value}
                    </pre>
                  ) : (
                    <p
                      className={clsx(
                        "mt-2 break-words whitespace-pre-wrap text-sm font-medium",
                        field.value
                          ? dark
                            ? "text-zinc-100"
                            : "text-gray-900"
                          : "text-gray-400",
                      )}
                    >
                      {field.value || "—"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              className={clsx(
                "rounded-xl border border-dashed px-4 py-8 text-center",
                dark
                  ? "border-zinc-800 text-zinc-500"
                  : "border-gray-200 bg-gray-50/50 text-gray-400",
              )}
            >
              <p className="text-sm font-medium">
                {tab === "meta" && lead.source !== "facebook_ads"
                  ? "Este lead não veio de uma campanha Meta."
                  : "Nenhuma informação registrada nesta categoria."}
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div
              className={clsx(
                "flex gap-3 rounded-xl border p-4",
                dark ? "border-zinc-800" : "border-gray-100",
              )}
            >
              <CalendarDays size={17} className="mt-0.5 text-emerald-500" />
              <div>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    dark ? "text-white" : "text-gray-900",
                  )}
                >
                  Lead criado
                </p>
                <p className="text-xs text-gray-500">
                  {dateTime(lead.created_at)}
                </p>
              </div>
            </div>
            {loading && (
              <p className="py-5 text-center text-sm text-gray-400">
                Carregando histórico…
              </p>
            )}
            {!loading &&
              history.map((item) => (
                <div
                  key={item.id}
                  className={clsx(
                    "flex gap-3 rounded-xl border p-4",
                    dark ? "border-zinc-800" : "border-gray-100",
                  )}
                >
                  <Clock size={16} className="mt-0.5 text-[#FF0636]" />
                  <div>
                    <p
                      className={clsx(
                        "text-sm font-semibold",
                        dark ? "text-white" : "text-gray-900",
                      )}
                    >
                      {item.event_type.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.notes ||
                        item.actor.name ||
                        "Atualização automática"}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {dateTime(item.occurred_at)}
                    </p>
                  </div>
                </div>
              ))}
            {!loading && history.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                Nenhuma movimentação adicional registrada.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
