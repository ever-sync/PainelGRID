import { Trophy } from "lucide-react";
import { pct, type TeamSummary } from "./shared";

export function TeamHeadToHead({ a, b }: { a: TeamSummary; b: TeamSummary }) {
  const totalSold = Math.max(1, a.sold + b.sold);
  const sharePctA = (a.sold / totalSold) * 100;
  const winnerIsA = a.sold >= b.sold;

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      {/* Placar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide team={a} side="left" leading={winnerIsA && a.sold > b.sold} />
        <span className="text-2xl font-black text-zinc-600">VS</span>
        <TeamSide
          team={b}
          side="right"
          leading={!winnerIsA && b.sold > a.sold}
        />
      </div>

      {/* Barra de share das vendas */}
      <div>
        <div className="relative h-3.5 overflow-hidden rounded-full bg-zinc-800 shadow-inner">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
            style={{ width: `${sharePctA}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-gradient-to-l from-sky-500 to-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.6)]"
            style={{ width: `${100 - sharePctA}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs font-bold">
          <span className="text-rose-400">{Math.round(sharePctA)}%</span>
          <span className="text-sky-400">{Math.round(100 - sharePctA)}%</span>
        </div>
      </div>

      {/* Mini-métricas comparativas */}
      <div className="grid grid-cols-3 gap-3 border-t border-zinc-800/60 pt-3 text-center">
        <CompareRow label="Agendados" a={a.scheduled} b={b.scheduled} />
        <CompareRow label="Compareceram" a={a.checked_in} b={b.checked_in} />
        <CompareRow
          label="Conversão"
          a={pct(a.sold, a.scheduled)}
          b={pct(b.sold, b.scheduled)}
          suffix="%"
        />
      </div>
    </div>
  );
}

function TeamSide({
  team,
  side,
  leading,
}: {
  team: TeamSummary;
  side: "left" | "right";
  leading: boolean;
}) {
  const isLeft = side === "left";
  const labelColor = isLeft ? "text-rose-500" : "text-sky-400";
  const numberColor = isLeft ? "text-rose-500" : "text-sky-400";
  const glow = isLeft
    ? "drop-shadow(0 0 18px rgba(244,63,94,0.55))"
    : "drop-shadow(0 0 18px rgba(56,189,248,0.55))";
  return (
    <div
      className={`flex flex-col ${isLeft ? "items-start" : "items-end"} gap-1`}
    >
      <div className="flex items-center gap-2">
        {leading && isLeft && <Trophy size={18} className="text-amber-300" />}
        {team.logo_url && (
          <img
            src={team.logo_url}
            alt={team.team_name}
            className="h-6 w-6 rounded-full object-cover ring-1 ring-zinc-700"
          />
        )}
        <p
          className={`text-xs font-bold uppercase tracking-widest ${labelColor}`}
        >
          {team.team_name}
        </p>
        {leading && !isLeft && <Trophy size={18} className="text-amber-300" />}
      </div>
      <p
        className={`text-5xl font-black tabular-nums ${numberColor}`}
        style={{ filter: glow }}
      >
        {team.sold}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
        vendas
      </p>
    </div>
  );
}

function CompareRow({
  label,
  a,
  b,
  suffix = "",
}: {
  label: string;
  a: number;
  b: number;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-base">
        <span
          className={`font-black tabular-nums ${a >= b ? "text-rose-400" : "text-zinc-600"}`}
        >
          {a}
          {suffix}
        </span>
        <span className="mx-2 text-zinc-700">·</span>
        <span
          className={`font-black tabular-nums ${b > a ? "text-sky-400" : "text-zinc-600"}`}
        >
          {b}
          {suffix}
        </span>
      </p>
    </div>
  );
}
