import { Trophy } from "lucide-react";
import {
  avatarColor,
  vendorInitials,
  type PodiumAccent,
  type PodiumItem,
} from "./shared";

const PODIUM_ACCENT: Record<
  PodiumAccent,
  { glow: string; text: string; bgHex: string }
> = {
  emerald: {
    glow: "rgba(16,185,129,0.5)",
    text: "text-emerald-300",
    bgHex: "#10B981",
  },
  amber: {
    glow: "rgba(251,191,36,0.55)",
    text: "text-amber-300",
    bgHex: "#FBBB49",
  },
  sky: {
    glow: "rgba(56,189,248,0.55)",
    text: "text-sky-300",
    bgHex: "#38BDF8",
  },
};

const PLACE_META: Record<
  1 | 2 | 3,
  {
    label: string;
    height: string;
    barFrom: string;
    barTo: string;
    ring: string;
    medal: string;
    numColor: string;
  }
> = {
  1: {
    label: "1º LUGAR",
    height: "h-[34vh]",
    barFrom: "from-amber-400",
    barTo: "to-yellow-600",
    ring: "ring-amber-400/60",
    medal: "text-amber-300",
    numColor: "text-amber-300",
  },
  2: {
    label: "2º LUGAR",
    height: "h-[26vh]",
    barFrom: "from-zinc-300",
    barTo: "to-zinc-500",
    ring: "ring-zinc-300/50",
    medal: "text-zinc-200",
    numColor: "text-zinc-200",
  },
  3: {
    label: "3º LUGAR",
    height: "h-[20vh]",
    barFrom: "from-orange-500",
    barTo: "to-orange-800",
    ring: "ring-orange-500/50",
    medal: "text-orange-300",
    numColor: "text-orange-300",
  },
};

export function PodiumSlide({
  title,
  subtitle,
  accent,
  items,
}: {
  title: string;
  subtitle?: string;
  accent: PodiumAccent;
  items: PodiumItem[];
}) {
  const [first, second, third] = [items[0], items[1], items[2]];
  const accentMeta = PODIUM_ACCENT[accent];

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-zinc-500">
        <p className="text-xl">Ainda sem dados para este pódio.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-between gap-2 py-2">
      <div className="text-center">
        <p
          className={`text-2xl font-bold uppercase tracking-[0.4em] ${accentMeta.text}`}
          style={{ textShadow: `0 0 24px ${accentMeta.glow}` }}
        >
          🏁 {title}
        </p>
        {subtitle && <p className="mt-2 text-base text-zinc-400">{subtitle}</p>}
      </div>

      <div className="flex w-full max-w-[1600px] items-end justify-center gap-10 px-4">
        {second ? (
          <PodiumStep place={2} item={second} accent={accent} />
        ) : (
          <div className="flex-1 max-w-[28rem]" />
        )}
        {first ? (
          <PodiumStep place={1} item={first} accent={accent} />
        ) : (
          <div className="flex-1 max-w-[28rem]" />
        )}
        {third ? (
          <PodiumStep place={3} item={third} accent={accent} />
        ) : (
          <div className="flex-1 max-w-[28rem]" />
        )}
      </div>
    </div>
  );
}

function PodiumStep({
  place,
  item,
  accent,
}: {
  place: 1 | 2 | 3;
  item: PodiumItem;
  accent: PodiumAccent;
}) {
  const meta = PLACE_META[place];
  const accentMeta = PODIUM_ACCENT[accent];
  const palette = avatarColor(item.id);
  const avatarSize = place === 1 ? "h-44 w-44" : "h-36 w-36";
  const avatarText = place === 1 ? "text-5xl" : "text-4xl";
  const nameSize = place === 1 ? "text-5xl" : "text-4xl";
  const metricSize = place === 1 ? "text-9xl" : "text-8xl";

  return (
    <div className="flex flex-1 max-w-[28rem] flex-col items-center">
      {/* Card com avatar, nome e métrica */}
      <div className="mb-4 flex flex-col items-center text-center">
        {item.logoUrl ? (
          <img
            src={item.logoUrl}
            alt={item.name}
            className={`${avatarSize} rounded-full object-cover ring-4 ${meta.ring} shadow-2xl`}
          />
        ) : (
          <span
            className={`flex ${avatarSize} items-center justify-center rounded-full bg-gradient-to-br ${palette[0]} ${palette[1]} ${avatarText} font-black ${palette[2]} ring-4 ${meta.ring} shadow-2xl`}
          >
            {vendorInitials(item.name)}
          </span>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Trophy size={28} className={meta.medal} />
          <p className="text-base font-bold uppercase tracking-[0.3em] text-zinc-400">
            {meta.label}
          </p>
        </div>
        <p
          className={`mt-2 ${nameSize} font-black tracking-tight text-zinc-100`}
        >
          {item.name}
        </p>
        {item.sub && <p className="mt-1 text-base text-zinc-500">{item.sub}</p>}
        <p
          className={`mt-3 ${metricSize} font-black tabular-nums leading-none ${meta.numColor}`}
          style={{ textShadow: `0 0 32px ${accentMeta.glow}` }}
        >
          {item.metric}
        </p>
        <p className="mt-2 text-base font-bold uppercase tracking-[0.25em] text-zinc-500">
          {item.metricLabel}
        </p>
      </div>

      {/* Pedestal */}
      <div
        className={`flex w-full ${meta.height} items-start justify-center rounded-t-2xl bg-gradient-to-b ${meta.barFrom} ${meta.barTo} pt-6 shadow-2xl`}
      >
        <span className="font-mono text-[9rem] font-black leading-none text-zinc-950/70">
          {place}
        </span>
      </div>
    </div>
  );
}
