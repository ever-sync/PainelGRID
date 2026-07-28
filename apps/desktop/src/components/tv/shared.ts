import confetti from "canvas-confetti";
import { BadgeCheck, CalendarClock, Trophy, UserCheck } from "lucide-react";
import { API_BASE } from "../../services/http";
import type {
  EventDashboardTvResponse,
  SaleSegment,
} from "../../services/events";
import type { LeadSource } from "../../types";

// ── Configurações globais ────────────────────────────────────────────────────

export const POLLING_INTERVAL_MS = 20_000;

export const SLIDES = [
  { key: "dashboard", label: "Dashboard", durationMs: 10_000 },
  { key: "podium-vendas", label: "Pódio Vendas", durationMs: 5_000 },
  { key: "podium-gp", label: "Grand Prix", durationMs: 5_000 },
  { key: "podium-equipes", label: "Equipes", durationMs: 5_000 },
] as const;

// ── Paletas e labels por enum ────────────────────────────────────────────────

export const SEGMENT_COLORS: Record<SaleSegment, string> = {
  NOVO: "#FF0636",
  SEMINOVO: "#3D56A2",
  VENDA_DIRETA: "#10B981",
  PCD: "#FBBB49",
};

export const SEGMENT_LABELS: Record<SaleSegment, string> = {
  NOVO: "Novo",
  SEMINOVO: "Usado",
  VENDA_DIRETA: "Venda direta",
  PCD: "PCD",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  facebook_ads: "Facebook Ads",
  whatsapp: "WhatsApp",
  manual: "Manual",
  form_page: "Formulário",
  import_excel: "Importação",
};

export const SOURCE_COLORS: Record<LeadSource, string> = {
  facebook_ads: "#1877F2",
  whatsapp: "#25D366",
  manual: "#6B7280",
  form_page: "#8B5CF6",
  import_excel: "#F59E0B",
};

// ── Funil ────────────────────────────────────────────────────────────────────

export const FUNNEL_STEPS: Array<{
  key: keyof EventDashboardTvResponse["funnel"];
  label: string;
  color: string;
  icon: typeof CalendarClock;
}> = [
  {
    key: "scheduled",
    label: "Agendaram",
    color: "#60A5FA",
    icon: CalendarClock,
  },
  {
    key: "confirmed",
    label: "Confirmaram",
    color: "#3D56A2",
    icon: BadgeCheck,
  },
  {
    key: "checked_in",
    label: "Compareceram",
    color: "#FBBB49",
    icon: UserCheck,
  },
  { key: "sold", label: "Vendas", color: "#10B981", icon: Trophy },
];

// ── Medalhas e avatares ──────────────────────────────────────────────────────

export const MEDAL_STYLE: Array<{ bg: string; text: string; ring: string }> = [
  { bg: "bg-amber-400/15", text: "text-amber-300", ring: "ring-amber-400/40" },
  { bg: "bg-zinc-400/15", text: "text-zinc-200", ring: "ring-zinc-400/40" },
  {
    bg: "bg-orange-700/20",
    text: "text-orange-300",
    ring: "ring-orange-600/40",
  },
];

export const AVATAR_PALETTE = [
  ["from-rose-500/30", "to-rose-700/20", "text-rose-200"],
  ["from-sky-500/30", "to-sky-700/20", "text-sky-200"],
  ["from-emerald-500/30", "to-emerald-700/20", "text-emerald-200"],
  ["from-amber-500/30", "to-amber-700/20", "text-amber-200"],
  ["from-violet-500/30", "to-violet-700/20", "text-violet-200"],
  ["from-cyan-500/30", "to-cyan-700/20", "text-cyan-200"],
] as const;

export function vendorInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(seed: string): (typeof AVATAR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1)
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ── Formatação ───────────────────────────────────────────────────────────────

export function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

export function formatCurrency(raw: string): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(num);
}

export function ago(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.round(seconds / 60)}min`;
}

export function formatElapsedSinceEnd(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}min`;
  if (minutes >= 1) return `${minutes} min`;
  return "agora há pouco";
}

// ── Celebração (confetti) ────────────────────────────────────────────────────

export function triggerSaleCelebration() {
  const duration = 8000;
  const end = Date.now() + duration;
  const colors = ["#10B981", "#FBBB49", "#FF0636", "#3D56A2", "#FFFFFF"];
  // Fogos vindo dos dois lados
  (function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
      scalar: 1.2,
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
      scalar: 1.2,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  // Estouro central na hora da venda
  confetti({
    particleCount: 180,
    spread: 100,
    startVelocity: 55,
    origin: { x: 0.5, y: 0.6 },
    colors,
    scalar: 1.4,
  });
}

// ── Tipos compartilhados ─────────────────────────────────────────────────────

export type TeamSummary = EventDashboardTvResponse["teams"][number];
export type VendorSummary = EventDashboardTvResponse["vendors"][number];

export type ConnectionStatus = "online" | "stale" | "offline";

export type CelebrationEvent = {
  id: string;
  vendor_name: string;
  team_name: string | null;
  sales_count: number;
};

export type PodiumItem = {
  id: string;
  name: string;
  sub?: string;
  metric: number;
  metricLabel: string;
  logoUrl?: string | null;
};

export type PodiumAccent = "emerald" | "amber" | "sky";

/**
 * `User.avatar_url` vem relativo (`/auth/avatar/:id`). Prefixa com a base da API
 * para virar `src` de <img>; URLs absolutas (logo de cliente) passam direto.
 */
export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}
