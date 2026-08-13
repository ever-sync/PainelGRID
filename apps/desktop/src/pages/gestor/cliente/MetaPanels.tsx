import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  Building2,
  Check,
  Facebook,
  FileText,
  Globe,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import type { MetaBusinessApiOption } from "../../../services/meta";
import type {
  MetaBusinessOption,
  MetaConnectionState,
} from "../../../types/meta";

/** Mapeadores da API do Meta e os blocos de UI da aba de Ads. */

export function mapMetaConnectionFromApi(
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

  const whatsappAssets = selectedAssets.filter(
    (item) =>
      item.asset_type === "whatsapp" || item.waba_id || item.phone_number_id,
  );
  const whatsappOptions = whatsappAssets.map((item) => ({
    id: String(item.phone_number_id ?? item.external_id ?? ""),
    waba_id: String(item.waba_id ?? ""),
    name: String(item.asset_name ?? item.waba_id ?? "WhatsApp"),
    phone_number_id: String(item.phone_number_id ?? ""),
    display_phone_number: String(
      item.display_phone_number ?? item.phone_number_id ?? "—",
    ),
  }));
  const whatsapp =
    whatsappAssets.find((item) => item.is_primary === true) ??
    whatsappAssets[0];
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
          id: String(whatsapp.phone_number_id ?? whatsapp.external_id ?? ""),
          waba_id: String(whatsapp.waba_id ?? ""),
          name: String(whatsapp.asset_name ?? whatsapp.waba_id ?? "WhatsApp"),
          phone_number_id: String(whatsapp.phone_number_id ?? ""),
          display_phone_number: String(whatsapp.phone_number_id ?? "—"),
        }
      : null,
    selected_whatsapps: whatsappOptions,
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

export function mapMetaBusinessFromApi(
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
      waba_id: String(item.waba_id ?? item.id),
      name: String(item.name ?? item.id),
      phone_number_id: String(item.phone_number_id ?? ""),
      display_phone_number: String(
        item.display_phone_number ?? item.phone_number_id ?? "—",
      ),
    })),
  };
}

export type AdsSubTab =
  "conexoes" | "campanhas" | "relatorios" | "financeiro" | "ia";

export const ADS_SUB_TABS: Array<{ id: AdsSubTab; label: string }> = [
  { id: "conexoes", label: "Conexões" },
  { id: "campanhas", label: "Campanhas" },
  { id: "relatorios", label: "Relatórios" },
  { id: "financeiro", label: "Financeiro" },
  { id: "ia", label: "IA Análise" },
];

export function MetaStatCard({
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

export type CompactAssetTone = "blue" | "purple" | "amber" | "emerald" | "rose";

export const COMPACT_ASSET_TONES: Record<CompactAssetTone, string> = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  purple:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  emerald:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

export const COMPACT_ASSET_ICON_TONES: Record<CompactAssetTone, string> = {
  blue: "text-blue-600 dark:text-blue-300",
  purple: "text-purple-600 dark:text-purple-300",
  amber: "text-amber-700 dark:text-amber-300",
  emerald: "text-emerald-600 dark:text-emerald-300",
  rose: "text-rose-600 dark:text-rose-300",
};

export function CompactAssetList({
  items,
  icon,
  tone,
  emptyLabel,
}: {
  items: Array<{ id: string; label: string; description?: string }>;
  icon: ReactNode;
  tone: CompactAssetTone;
  emptyLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const uniqueItems = Array.from(
    new Map(items.map((item) => [item.id, item])).values(),
  );
  const firstItem = uniqueItems[0];
  const remainingCount = Math.max(uniqueItems.length - 1, 0);
  const toneClass = COMPACT_ASSET_TONES[tone];
  const iconToneClass = COMPACT_ASSET_ICON_TONES[tone];

  if (!firstItem) {
    return <span className="text-xs italic text-zinc-400">{emptyLabel}</span>;
  }

  return (
    <div className="w-full min-w-0 max-w-[230px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          title={firstItem.description ?? firstItem.label}
          className={clsx(
            "inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium",
            toneClass,
          )}
        >
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{firstItem.label}</span>
        </span>

        {remainingCount > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:border-[#FF0636]/30 hover:bg-[#FF0636]/5 hover:text-[#d90030] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {expanded ? "Ocultar" : `+${remainingCount}`}
          </button>
        ) : null}
      </div>

      {expanded && remainingCount > 0 ? (
        <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-950/80">
          {uniqueItems.slice(1).map((item) => (
            <div
              key={item.id}
              title={item.description ?? item.label}
              className="flex items-start gap-2 rounded-lg bg-white px-2 py-1.5 dark:bg-zinc-900"
            >
              <span className={clsx("mt-0.5 shrink-0", iconToneClass)}>
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="block truncate font-mono text-[9px] text-zinc-400">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function normalizeMetaSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function MetaAssetPicker({
  items,
  selectedIds,
  onToggle,
  emptyLabel,
  search,
  onSearchChange,
  searchPlaceholder,
  mode = "multiple",
  onSelectVisible,
  onClear,
}: {
  items: Array<{ id: string; label: string; description?: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  mode?: "multiple" | "single";
  onSelectVisible?: (ids: string[]) => void;
  onClear?: () => void;
}) {
  const normalizedSearch = normalizeMetaSearch(search);
  const visibleItems = normalizedSearch
    ? items.filter((item) =>
        normalizeMetaSearch(
          `${item.label} ${item.id} ${item.description ?? ""}`,
        ).includes(normalizedSearch),
      )
    : items;
  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-10 text-sm text-zinc-900 outline-none transition focus:border-[#FF0636] focus:ring-4 focus:ring-[#FF0636]/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {search ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {visibleItems.length}{" "}
          {visibleItems.length === 1 ? "resultado" : "resultados"}
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">•</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            {selectedIds.length} selecionado
            {selectedIds.length === 1 ? "" : "s"}
          </span>
        </p>

        {mode === "multiple" && (onSelectVisible || onClear) ? (
          <div className="flex items-center gap-1">
            {onSelectVisible && visibleIds.length > 0 ? (
              <button
                type="button"
                onClick={() => onSelectVisible(visibleIds)}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-[#d90030] transition hover:bg-[#FF0636]/5"
              >
                {allVisibleSelected
                  ? "Desmarcar resultados"
                  : "Selecionar resultados"}
              </button>
            ) : null}
            {onClear && selectedIds.length > 0 ? (
              <button
                type="button"
                onClick={onClear}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                Limpar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center dark:border-zinc-800 dark:bg-zinc-950/60">
            <Search
              size={20}
              className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700"
            />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {items.length === 0
                ? emptyLabel
                : "Nenhum ativo encontrado para esta busca."}
            </p>
          </div>
        ) : (
          visibleItems.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role={mode === "single" ? "radio" : "checkbox"}
                aria-checked={checked}
                onClick={() => onToggle(item.id)}
                className={clsx(
                  "group flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all",
                  checked
                    ? "border-[#FF0636]/35 bg-[#FF0636]/[0.045] shadow-[0_8px_22px_rgba(255,6,54,0.06)] dark:border-[#FF0636]/50 dark:bg-[#FF0636]/10"
                    : "border-zinc-200 bg-white hover:-translate-y-px hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700",
                )}
              >
                <span
                  className={clsx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition",
                    mode === "single" ? "rounded-full" : "rounded-md",
                    checked
                      ? "border-[#FF0636] bg-[#FF0636] text-white"
                      : "border-zinc-300 bg-white text-transparent dark:border-zinc-700 dark:bg-zinc-900",
                  )}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {item.description ?? `ID ${item.id}`}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export type MetaSetupStep = 0 | 1 | 2 | 3 | 4;

export const META_SETUP_STEPS: Array<{
  title: string;
  shortTitle: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    title: "Business Manager",
    shortTitle: "BM",
    description: "Escolha a estrutura Meta deste cliente.",
    icon: <Building2 size={18} />,
  },
  {
    title: "Contas de anúncio",
    shortTitle: "Contas",
    description: "Selecione as contas que o painel deve monitorar.",
    icon: <Facebook size={18} />,
  },
  {
    title: "Páginas",
    shortTitle: "Páginas",
    description: "Defina as páginas que pertencem a este cliente.",
    icon: <Globe size={18} />,
  },
  {
    title: "Formulários de lead",
    shortTitle: "Formulários",
    description: "Escolha os formulários autorizados a cadastrar leads.",
    icon: <FileText size={18} />,
  },
  {
    title: "WhatsApp e revisão",
    shortTitle: "Revisão",
    description: "Vincule o WhatsApp, revise tudo e salve.",
    icon: <MessageCircle size={18} />,
  },
];

export function MetaSelectionSummary({
  accountCount,
  pageCount,
  formCount,
  hasWhatsapp,
}: {
  accountCount: number;
  pageCount: number;
  formCount: number;
  hasWhatsapp: boolean;
}) {
  const items = [
    { label: "Contas", value: accountCount },
    { label: "Páginas", value: pageCount },
    { label: "Formulários", value: formCount },
    { label: "WhatsApp", value: hasWhatsapp ? 1 : 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export const CAR_CATEGORIES = [
  "Hatch",
  "Sedan",
  "SUV",
  "Picape",
  "Minivan",
  "Esportivo",
  "Conversível",
  "Van / Utilitário",
];

export function formatPhoneBr(raw: string) {
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
