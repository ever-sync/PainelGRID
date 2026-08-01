import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useOutletContext } from "react-router-dom";
import {
  Plus,
  Mail,
  Building2,
  CalendarRange,
  CarFront,
  ClipboardList,
  MonitorSmartphone,
  Minimize,
  LayoutGrid,
  List,
  Trophy,
  Clock3,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Card } from "../../components/ui/Card";
import type { User as AppUser } from "../../types";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { resolveClientId } from "../../utils/userContext";
import { readStoredSession } from "../../services/auth";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import { getClient } from "../../services/clients";
import { setStaffApproval } from "../../services/users";
import { pushToast } from "../../components/ui/Toast";
import { VendorSignupLinkCard } from "../../components/shared/VendorSignupLinkCard";
import {
  getVendorScoreRanking,
  type VendorScoreRankingItem,
} from "../../services/vendorScore";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

const TV_ROTATION_MS = 8000;
const TV_RANKING_MS = 10000;
const TV_VENDORS_PER_PAGE = 4;
const REALTIME_FALLBACK_REFRESH_MS = 5000;

type ViewMode = "card" | "list";
type TvScreen = "vendors" | "ranking";
type OutletContext = {
  user: AppUser;
};

export function VendedoresPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [showModal, setShowModal] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [tvPage, setTvPage] = useState(0);
  const [tvScreen, setTvScreen] = useState<TvScreen>("vendors");
  const [now, setNow] = useState(() => new Date());
  const pageRef = useRef<HTMLDivElement | null>(null);
  const refreshingRef = useRef(false);
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([]);
  const [rankingByVendorId, setRankingByVendorId] = useState<
    Record<string, VendorScoreRankingItem>
  >({});
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState("");

  /** O link de cadastro so e necessario quando o modal abre; carrega sob demanda. */
  useEffect(() => {
    if (!showModal || !clientId || signupToken) return;
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void getClient(clientId, t)
      .then((row) => {
        setSignupToken(row.vendor_signup_token);
        setCompanyName(row.company_name);
      })
      .catch(() => undefined);
  }, [showModal, clientId, signupToken]);

  async function handleApproval(
    pending: AppUser,
    status: "approved" | "rejected",
  ) {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    setApproving(pending.id);
    setApprovalError("");
    try {
      const result = await setStaffApproval(t, pending.id, status);
      setStaffUsers((prev) =>
        prev.map((u) =>
          u.id === pending.id
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
            ? `Cadastro de ${pending.name} recusado.`
            : result.email_sent
              ? `${pending.name} aprovado. E-mail para criar a senha enviado.`
              : `${pending.name} aprovado. O e-mail de criação de senha ainda não foi enviado.`,
        type: status === "approved" && !result.email_sent ? "info" : "success",
      });
    } catch {
      setApprovalError("Não foi possível alterar a aprovação. Tente de novo.");
    } finally {
      setApproving(null);
    }
  }

  const refreshVendors = useCallback(() => {
    if (refreshingRef.current) return;
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    refreshingRef.current = true;
    void Promise.all([
      listClientStaff(clientId, t),
      getVendorScoreRanking(t, { client_id: clientId, limit: 100 }).catch(
        () => [],
      ),
    ])
      .then(([staffRows, ranking]) => {
        setStaffUsers(staffRows.map(mapStaffToUser));
        setRankingByVendorId(
          Object.fromEntries(
            ranking.map((item) => [item.vendor_id, item] as const),
          ),
        );
      })
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [clientId]);

  useEffect(() => {
    refreshVendors();
  }, [refreshVendors]);

  useLeadRealtimeSync(clientId, refreshVendors);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshVendors();
    }, REALTIME_FALLBACK_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshVendors]);

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

  const clientVendors = staffUsers.filter(
    (u) => u.role === "vendedor" && u.client_id === clientId,
  );

  /** Só quem foi aprovado entra em cards, ranking e modo TV. */
  const vendors = clientVendors.filter(
    (u) =>
      (u.approval_status ?? "approved") === "approved" && u.is_active !== false,
  );

  const pendingVendors = clientVendors.filter(
    (u) => u.approval_status === "pending",
  );

  const vendorStats = vendors.map((vendor) => {
    const ranking = rankingByVendorId[vendor.id];

    return {
      ...vendor,
      storeName: "Equipe comercial",
      scorePoints: ranking?.total_points ?? 0,
      assigned: ranking?.assigned ?? 0,
      sales: ranking?.sales ?? 0,
      scheduled: ranking?.scheduled.count ?? 0,
      visits: ranking?.visits ?? 0,
      rate:
        (ranking?.assigned ?? 0) > 0
          ? Math.round(
              ((ranking?.visits ?? 0) / (ranking?.assigned ?? 1)) * 100,
            )
          : 0,
    };
  });

  const tvPages = useMemo(() => {
    if (!isTvMode) return [vendorStats];

    const pages = [];
    for (
      let index = 0;
      index < vendorStats.length;
      index += TV_VENDORS_PER_PAGE
    ) {
      pages.push(vendorStats.slice(index, index + TV_VENDORS_PER_PAGE));
    }
    return pages;
  }, [isTvMode, vendorStats]);

  const visibleVendors = isTvMode
    ? (tvPages[tvPage] ?? vendorStats)
    : vendorStats;
  const effectiveViewMode: ViewMode = isTvMode ? "card" : viewMode;
  const rankingVendors = useMemo(
    () =>
      [...vendorStats].sort(
        (a, b) =>
          b.scorePoints - a.scorePoints ||
          b.sales - a.sales ||
          b.rate - a.rate ||
          b.visits - a.visits,
      ),
    [vendorStats],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === pageRef.current;
      setIsTvMode(active);
      if (!active) {
        setTvPage(0);
        setTvScreen("vendors");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isTvMode) return;

    if (tvScreen === "ranking") {
      const rankingTimeout = window.setTimeout(() => {
        setTvScreen("vendors");
        setTvPage(0);
      }, TV_RANKING_MS);

      return () => window.clearTimeout(rankingTimeout);
    }

    const rotationTimeout = window.setTimeout(() => {
      if (tvPage >= tvPages.length - 1) {
        setTvScreen("ranking");
      } else {
        setTvPage((currentPage) => currentPage + 1);
      }
    }, TV_ROTATION_MS);

    return () => window.clearTimeout(rotationTimeout);
  }, [isTvMode, tvPage, tvPages.length, tvScreen]);

  useEffect(() => {
    if (!isTvMode) return;

    const clockInterval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(clockInterval);
  }, [isTvMode]);

  const initials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  const colors = [
    "from-slate-700 via-slate-800 to-amber-500",
    "from-stone-700 via-neutral-800 to-amber-400",
    "from-zinc-700 via-slate-900 to-yellow-500",
  ];
  const formattedTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(now);

  const toggleTvMode = async () => {
    if (!pageRef.current) return;

    if (document.fullscreenElement === pageRef.current) {
      await document.exitFullscreen();
      return;
    }

    setTvPage(0);
    setTvScreen("vendors");
    await pageRef.current.requestFullscreen();
  };

  if (!clientId) return <MissingClientScope />;

  const darkShell = isDarkMode && !isTvMode;

  return (
    <div
      ref={pageRef}
      className={clsx(
        isTvMode &&
          "min-h-screen bg-[radial-gradient(circle_at_top,#fffaf1_0%,#f6efe5_48%,#ede4d4_100%)] px-8 py-8",
        darkShell &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8 bg-black",
      )}
    >
      <style>{`
        @keyframes tvScreenFade {
          0% { opacity: 0; transform: translateY(18px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {isTvMode ? (
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-bold uppercase tracking-[0.22em] text-[#9b886d]">
              Painel Ao Vivo
            </p>
            <h1 className="mt-2 text-[38px] font-extrabold leading-none text-[#1b2431]">
              {tvScreen === "ranking"
                ? "Ranking de vendedores"
                : "Vendedores em tempo real"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-[20px] border border-[#e3d7c4] bg-white/80 px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-[22px] font-extrabold leading-none text-[#1b2431]">
                <Clock3 size={18} className="text-[#b8893f]" />
                <span>{formattedTime}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold capitalize text-[#7c8595]">
                <CalendarDays size={14} className="text-[#b8893f]" />
                <span>{formattedDate}</span>
              </div>
            </div>

            {tvScreen === "ranking" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e3d7c4] bg-white/75 px-4 py-2 text-[14px] font-semibold text-[#6b7280] shadow-sm">
                <Trophy size={15} className="text-[#b8893f]" />
                <span>ranking exibido por 10 segundos</span>
              </div>
            ) : tvPages.length > 1 ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e3d7c4] bg-white/75 px-4 py-2 text-[14px] font-semibold text-[#6b7280] shadow-sm">
                <span>
                  Tela {tvPage + 1}/{tvPages.length}
                </span>
                <span className="text-[#b79d72]">|</span>
                <span>rotação automática</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                void toggleTvMode();
              }}
              className="inline-flex items-center gap-2 rounded-[16px] border border-[#d8ccb5] bg-white/90 px-4 py-2.5 text-[14px] font-bold text-[#4b5563] shadow-sm transition hover:border-[#cdbb98] hover:text-[#111827]"
            >
              <Minimize size={16} />
              <span>Sair do modo TV</span>
            </button>
          </div>
        </div>
      ) : (
        <PageHeader
          title="Vendedores"
          breadcrumbs={[{ label: "TechStore" }, { label: "Vendedores" }]}
          dark={darkShell}
          actions={
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              <div
                className={clsx(
                  "inline-flex rounded-[22px] border p-1.5",
                  darkShell
                    ? "border-zinc-600 bg-zinc-900/95 shadow-[0_14px_28px_rgba(0,0,0,0.35)]"
                    : "border-[#e3d7c4] bg-white/92 shadow-[0_14px_28px_rgba(32,24,14,0.10)]",
                )}
              >
                {[
                  { key: "list" as const, icon: List, label: "Lista" },
                  { key: "card" as const, icon: LayoutGrid, label: "Cards" },
                ].map((option) => {
                  const Icon = option.icon;
                  const isActive = viewMode === option.key;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setViewMode(option.key)}
                      className={clsx(
                        "flex h-12 w-12 items-center justify-center rounded-[16px] border transition-all",
                        darkShell
                          ? isActive
                            ? "border-amber-500/40 bg-zinc-800 text-amber-400 shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
                            : "border-transparent text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-100"
                          : isActive
                            ? "border-[#e7c88f] bg-[linear-gradient(180deg,#fff6e6_0%,#f5dfb6_100%)] text-[#a15b08] shadow-[0_10px_22px_rgba(180,120,40,0.16)]"
                            : "border-transparent text-[#7c8595] hover:border-[#efe3cf] hover:bg-[#faf5ec] hover:text-[#1f2937]",
                      )}
                      aria-label={`Visualizar em ${option.label.toLowerCase()}`}
                      aria-pressed={isActive}
                      title={option.label}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  void toggleTvMode();
                }}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-[14px] border px-3.5 py-2 text-[13px] font-semibold shadow-sm transition",
                  darkShell
                    ? "border-zinc-600 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                    : "border-[#d8ccb5] bg-white/90 text-[#5b6472] hover:border-[#cdbb98] hover:text-[#1f2937]",
                )}
              >
                <MonitorSmartphone size={15} />
                <span>Modo TV</span>
              </button>

              <Button
                icon={<Plus size={16} />}
                onClick={() => setShowModal(true)}
              >
                Link de cadastro
              </Button>
            </div>
          }
        />
      )}

      {!isTvMode && pendingVendors.length > 0 ? (
        <Card className="mb-5 border-amber-200 bg-amber-50/60">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Cadastros pendentes
              </h3>
              <p className="mt-0.5 text-xs text-gray-600">
                {pendingVendors.length}{" "}
                {pendingVendors.length === 1
                  ? "vendedor se cadastrou"
                  : "vendedores se cadastraram"}{" "}
                pelo link e aguarda aprovação. Só depois de aprovado ele recebe
                o e-mail para criar a senha.
              </p>
            </div>
          </div>

          {approvalError ? (
            <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {approvalError}
            </p>
          ) : null}

          <div className="space-y-2">
            {pendingVendors.map((pending) => (
              <div
                key={pending.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {pending.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {pending.email}
                    {pending.phone ? ` · ${pending.phone}` : ""}
                  </p>
                  {pending.vendor_categories?.length ? (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {pending.vendor_categories.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={approving === pending.id}
                    onClick={() => void handleApproval(pending, "approved")}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {approving === pending.id ? "..." : "Aprovar"}
                  </button>
                  <button
                    type="button"
                    disabled={approving === pending.id}
                    onClick={() => void handleApproval(pending, "rejected")}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {isTvMode && tvScreen === "ranking" ? (
        <div
          key="tv-ranking-screen"
          className="grid min-h-[68vh] grid-cols-1 md:grid-cols-3 items-end gap-6 px-6"
          style={{ animation: "tvScreenFade 700ms ease" }}
        >
          {[rankingVendors[1], rankingVendors[0], rankingVendors[2]].map(
            (vendor, index) => {
              if (!vendor) return null;

              const place = index === 0 ? 2 : index === 1 ? 1 : 3;
              const columnHeight = place === 1 ? 440 : place === 2 ? 360 : 320;
              const palette =
                place === 1
                  ? {
                      medalBackground:
                        "linear-gradient(180deg, #d8b15f 0%, #b9852f 100%)",
                      podiumBackground:
                        "linear-gradient(180deg, #f6dfab 0%, #d4a14b 100%)",
                      podiumBorder: "#d6b16a",
                      trophyBackground: "#fff7e4",
                      trophyBorder: "#efd59c",
                      trophyColor: "#a56a10",
                      labelColor: "#7a5310",
                      valueColor: "#3f2a08",
                    }
                  : place === 2
                    ? {
                        medalBackground:
                          "linear-gradient(180deg, #cfd5df 0%, #9ca3af 100%)",
                        podiumBackground:
                          "linear-gradient(180deg, #eef2f7 0%, #b8c1cf 100%)",
                        podiumBorder: "#b9c2cf",
                        trophyBackground: "#ffffff",
                        trophyBorder: "#d7dde7",
                        trophyColor: "#6b7280",
                        labelColor: "#5b6574",
                        valueColor: "#273142",
                      }
                    : {
                        medalBackground:
                          "linear-gradient(180deg, #d9a27b 0%, #b86a38 100%)",
                        podiumBackground:
                          "linear-gradient(180deg, #f0c6a7 0%, #c9824d 100%)",
                        podiumBorder: "#cf946b",
                        trophyBackground: "#fff4eb",
                        trophyBorder: "#e4b18d",
                        trophyColor: "#a6562a",
                        labelColor: "#7f3f1f",
                        valueColor: "#4f2410",
                      };

              return (
                <div
                  key={`podium-${vendor.id}`}
                  className="flex flex-col items-center"
                >
                  <div className="relative mb-5 flex flex-col items-center">
                    <div
                      className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-extrabold text-white shadow-lg"
                      style={{ background: palette.medalBackground }}
                    >
                      {place}
                    </div>

                    {vendor.avatar ? (
                      <img
                        src={vendor.avatar}
                        alt={vendor.name}
                        className={`rounded-full object-cover ring-4 ring-white shadow-[0_18px_36px_rgba(32,24,14,0.18)] ${
                          place === 1 ? "h-32 w-32" : "h-24 w-24"
                        }`}
                      />
                    ) : (
                      <div
                        className={`flex items-center justify-center rounded-full bg-gradient-to-br text-white ring-4 ring-white shadow-[0_18px_36px_rgba(32,24,14,0.18)] ${
                          place === 1
                            ? "h-32 w-32 text-4xl"
                            : "h-24 w-24 text-3xl"
                        } ${colors[index % colors.length]}`}
                      >
                        {initials(vendor.name)}
                      </div>
                    )}

                    {place === 1 ? (
                      <div className="pointer-events-none absolute left-1/2 top-[84px] h-36 w-36 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(216,177,95,0.42)_0%,rgba(216,177,95,0.14)_45%,transparent_72%)] blur-sm" />
                    ) : null}

                    <p
                      className={`mt-4 text-center font-extrabold text-[#18212f] ${place === 1 ? "text-[30px]" : "text-[24px]"}`}
                    >
                      {vendor.name}
                    </p>
                    <p className="mt-1 text-center text-[16px] font-semibold text-[#8b95a7]">
                      {vendor.storeName}
                    </p>
                  </div>

                  <div
                    className={`flex w-full max-w-[340px] flex-col items-center justify-end rounded-t-[34px] border px-6 pb-12 pt-10 shadow-[0_22px_45px_rgba(32,24,14,0.22)] ${
                      place === 1
                        ? "relative overflow-hidden shadow-[0_28px_60px_rgba(185,133,47,0.38)]"
                        : ""
                    }`}
                    style={{
                      height: `${columnHeight}px`,
                      background: palette.podiumBackground,
                      borderColor: palette.podiumBorder,
                    }}
                  >
                    {place === 1 ? (
                      <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] bg-[radial-gradient(circle_at_top,rgba(255,247,228,0.95)_0%,rgba(255,247,228,0.22)_55%,transparent_85%)]" />
                    ) : null}
                    <div
                      className="mb-3 flex h-16 w-16 items-center justify-center rounded-[24px] border shadow-sm"
                      style={{
                        background: palette.trophyBackground,
                        borderColor: palette.trophyBorder,
                        color: palette.trophyColor,
                      }}
                    >
                      <Trophy size={30} />
                    </div>
                    <p
                      className="text-[16px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: palette.labelColor }}
                    >
                      Pontos
                    </p>
                    <p
                      className="mt-4 font-extrabold leading-none drop-shadow-[0_4px_6px_rgba(255,255,255,0.28)]"
                      style={{
                        color: palette.valueColor,
                        fontSize: place === 1 ? "138px" : "118px",
                      }}
                    >
                      {vendor.scorePoints}
                    </p>
                  </div>
                </div>
              );
            },
          )}
        </div>
      ) : (
        <div
          key={`tv-vendors-screen-${tvPage}`}
          className={
            effectiveViewMode === "card"
              ? isTvMode
                ? "grid grid-cols-2 gap-6"
                : "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
              : "space-y-4"
          }
          style={
            isTvMode ? { animation: "tvScreenFade 700ms ease" } : undefined
          }
        >
          {visibleVendors.map((vendor, index) => {
            const colorIndex = vendorStats.findIndex(
              (item) => item.id === vendor.id,
            );
            const tvCard = isTvMode;
            const vendorDarkUi = darkShell && !tvCard;

            const statRows = vendorDarkUi
              ? ([
                  {
                    label: "Atribuídos",
                    value: vendor.assigned,
                    color: "text-sky-300",
                    icon: (
                      <ClipboardList
                        size={tvCard ? 16 : 14}
                        className="text-sky-400"
                      />
                    ),
                  },
                  {
                    label: "Agendadas",
                    value: vendor.scheduled,
                    color: "text-violet-300",
                    icon: (
                      <CalendarRange
                        size={tvCard ? 16 : 14}
                        className="text-violet-400"
                      />
                    ),
                  },
                  {
                    label: "Visitas",
                    value: vendor.visits,
                    color: "text-emerald-300",
                    icon: (
                      <Building2
                        size={tvCard ? 16 : 14}
                        className="text-emerald-400"
                      />
                    ),
                  },
                  {
                    label: "Vendas",
                    value: vendor.sales,
                    color: "text-amber-300",
                    icon: (
                      <Trophy
                        size={tvCard ? 16 : 14}
                        className="text-amber-400"
                      />
                    ),
                  },
                ] as const)
              : ([
                  {
                    label: "Atribuídos",
                    value: vendor.assigned,
                    color: "text-sky-700",
                    icon: (
                      <ClipboardList
                        size={tvCard ? 16 : 14}
                        className="text-sky-600"
                      />
                    ),
                  },
                  {
                    label: "Agendadas",
                    value: vendor.scheduled,
                    color: "text-violet-700",
                    icon: (
                      <CalendarRange
                        size={tvCard ? 16 : 14}
                        className="text-violet-600"
                      />
                    ),
                  },
                  {
                    label: "Visitas",
                    value: vendor.visits,
                    color: "text-emerald-700",
                    icon: (
                      <Building2
                        size={tvCard ? 16 : 14}
                        className="text-emerald-600"
                      />
                    ),
                  },
                  {
                    label: "Vendas",
                    value: vendor.sales,
                    color: "text-amber-700",
                    icon: (
                      <Trophy
                        size={tvCard ? 16 : 14}
                        className="text-amber-600"
                      />
                    ),
                  },
                ] as const);

            return (
              <Card
                key={vendor.id}
                className={clsx(
                  "relative overflow-hidden border shadow-[0_30px_80px_rgba(32,24,14,0.14)]",
                  vendorDarkUi
                    ? "!border-zinc-700/90 !bg-[linear-gradient(160deg,#18181b_0%,#141414_48%,#0c0c0c_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
                    : "border-[#eadfcb] bg-[linear-gradient(160deg,#fffdf8_0%,#f8f2e8_48%,#f5efe5_100%)] shadow-[0_30px_80px_rgba(32,24,14,0.14)]",
                  effectiveViewMode === "list" && "p-5 sm:p-6",
                  tvCard &&
                    "rounded-[30px] p-6 shadow-[0_28px_72px_rgba(32,24,14,0.16)]",
                )}
              >
                <div
                  className={clsx(
                    "pointer-events-none absolute inset-x-0 top-0 h-24",
                    vendorDarkUi
                      ? "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.07),transparent_52%)]"
                      : "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_52%)]",
                  )}
                />
                <div
                  className={clsx(
                    "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full",
                    vendorDarkUi
                      ? "bg-[radial-gradient(circle,rgba(82,82,91,0.35),transparent_70%)]"
                      : "bg-[radial-gradient(circle,rgba(148,163,184,0.22),transparent_70%)]",
                  )}
                />

                <div
                  className={
                    effectiveViewMode === "list"
                      ? "grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center"
                      : ""
                  }
                >
                  <div
                    className={`mb-5 flex items-start gap-4 ${tvCard ? "mb-5 gap-4" : ""}`}
                  >
                    <div className="relative shrink-0">
                      {vendor.avatar ? (
                        <img
                          src={vendor.avatar}
                          alt={vendor.name}
                          className={clsx(
                            "object-cover shadow-[0_14px_35px_rgba(32,24,14,0.18)] ring-4",
                            vendorDarkUi ? "ring-zinc-700" : "ring-[#fff8ee]",
                            "h-20 w-20 rounded-[28px]",
                          )}
                        />
                      ) : (
                        <div
                          className={clsx(
                            "flex items-center justify-center bg-gradient-to-br font-bold text-white shadow-[0_14px_35px_rgba(32,24,14,0.18)] ring-4",
                            vendorDarkUi ? "ring-zinc-700" : "ring-[#fff8ee]",
                            "h-20 w-20 rounded-[28px] text-2xl",
                            colors[
                              (colorIndex >= 0 ? colorIndex : index) %
                                colors.length
                            ],
                          )}
                        >
                          {initials(vendor.name)}
                        </div>
                      )}

                      <div
                        className={clsx(
                          "absolute flex items-center justify-center shadow-md",
                          vendorDarkUi
                            ? "-bottom-1 -right-1 h-8 w-8 rounded-2xl border border-zinc-600 bg-zinc-800"
                            : "-bottom-1 -right-1 h-8 w-8 rounded-2xl border border-[#f4e6c8] bg-[#fff9ef]",
                        )}
                      >
                        <CarFront
                          size={15}
                          className={
                            vendorDarkUi ? "text-amber-400" : "text-amber-600"
                          }
                        />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 pt-1">
                      <p
                        className={clsx(
                          "font-bold leading-tight",
                          vendorDarkUi ? "text-zinc-100" : "text-[#18212f]",
                          tvCard ? "text-[26px]" : "text-[22px] sm:text-[26px]",
                        )}
                      >
                        {vendor.name}
                      </p>
                      <div
                        className={clsx(
                          "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border font-bold",
                          vendorDarkUi
                            ? "border-amber-500/35 bg-amber-950/50 px-3.5 py-2 text-[12px] text-amber-300"
                            : "border-[#eadfcb] bg-[#fff6e8] px-3.5 py-2 text-[12px] text-[#b45309]",
                        )}
                      >
                        <CarFront size={12} />
                        <span className="truncate">{vendor.storeName}</span>
                      </div>
                      <div
                        className={clsx(
                          "mt-3 flex items-center gap-1.5 font-medium text-[15px]",
                          vendorDarkUi ? "text-zinc-400" : "text-[#77829a]",
                        )}
                      >
                        <Mail size={12} />
                        <span className="truncate">{vendor.email}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      className={clsx(
                        "mx-auto mb-5 grid gap-3 w-full",
                        tvCard
                          ? "mb-5 max-w-none"
                          : effectiveViewMode === "list"
                            ? "grid-cols-2 sm:grid-cols-4 max-w-[360px] sm:max-w-none"
                            : "grid-cols-2 max-w-[360px]",
                      )}
                      style={
                        tvCard
                          ? { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }
                          : undefined
                      }
                    >
                      {statRows.map((stat) => (
                        <div
                          key={stat.label}
                          className={clsx(
                            "w-full rounded-[22px] border text-center px-3 py-3",
                            vendorDarkUi
                              ? "border-zinc-600/80 bg-zinc-900/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                              : "border-[#ece3d4] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(249,245,238,0.92)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
                          )}
                        >
                          <div
                            className={`flex justify-center ${tvCard ? "mb-2" : "mb-1.5"}`}
                          >
                            {stat.icon}
                          </div>
                          <p
                            className={clsx(
                              stat.color,
                              tvCard
                                ? "text-[24px] font-extrabold"
                                : "text-[22px] font-extrabold",
                            )}
                          >
                            {stat.value}
                          </p>
                          <p
                            className={clsx(
                              "mt-1 font-semibold tracking-wide text-[13px]",
                              vendorDarkUi ? "text-zinc-500" : "text-[#748096]",
                            )}
                          >
                            {stat.label}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div
                      className={clsx(
                        "rounded-[24px] border px-4 py-4",
                        vendorDarkUi
                          ? "border-zinc-600/90 bg-zinc-900/50"
                          : "border-[#eadfcb] bg-[linear-gradient(180deg,rgba(255,251,245,0.92)_0%,rgba(247,241,231,0.92)_100%)]",
                      )}
                    >
                      <div
                        className={`flex items-center justify-between ${tvCard ? "mb-4" : "mb-3"}`}
                      >
                        <div>
                          <p
                            className={clsx(
                              "font-bold uppercase tracking-[0.18em] text-[13px]",
                              vendorDarkUi ? "text-zinc-500" : "text-[#8d7f69]",
                            )}
                          >
                            Performance
                          </p>
                          <p
                            className={clsx(
                              "font-semibold",
                              vendorDarkUi
                                ? "text-[16px] text-zinc-300"
                                : tvCard
                                  ? "text-[17px] text-[#5f6774]"
                                  : "text-[16px] text-[#5f6774]",
                            )}
                          >
                            Taxa de visitas realizadas
                          </p>
                        </div>
                        <div
                          className={clsx(
                            "rounded-full border px-4 py-1.5 font-extrabold shadow-sm",
                            vendorDarkUi
                              ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                              : "border-[#eee2cb] bg-white/90 text-[#3f3f46]",
                            tvCard ? "text-[20px]" : "text-[18px]",
                          )}
                        >
                          {vendor.rate}%
                        </div>
                      </div>
                      <div
                        className={clsx(
                          "overflow-hidden rounded-full shadow-inner",
                          vendorDarkUi ? "bg-zinc-950/90" : "bg-white/95",
                          tvCard ? "h-4" : "h-3",
                        )}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-lime-400 to-amber-400"
                          style={{ width: `${vendor.rate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isTvMode && tvScreen === "vendors" && tvPages.length > 1 ? (
        <div className="mt-6 flex justify-center gap-2">
          {tvPages.map((_, index) => (
            <button
              key={`tv-page-${index}`}
              type="button"
              onClick={() => setTvPage(index)}
              className={`h-3 rounded-full transition-all ${
                tvPage === index ? "w-10 bg-[#b8893f]" : "w-3 bg-[#d8ccb5]"
              }`}
              aria-label={`Ir para tela ${index + 1}`}
            />
          ))}
        </div>
      ) : null}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Link de cadastro de vendedores"
        size="lg"
        dark={darkShell}
        footer={
          <Button variant="secondary" size="lg" onClick={() => setShowModal(false)}>
            Fechar
          </Button>
        }
      >
        <VendorSignupLinkCard
          clientId={clientId ?? ""}
          companyName={companyName}
          signupToken={signupToken}
          accessToken={readStoredSession()?.accessToken ?? ""}
          canRotate
          onRotated={setSignupToken}
          onNotify={(message, type) => pushToast({ message, type })}
        />
      </Modal>
    </div>
  );
}
