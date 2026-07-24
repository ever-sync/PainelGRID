import { formatElapsedSinceEnd } from "./shared";

export function CountdownCard({ end, now }: { end: Date | null; now: Date }) {
  const diffMs = end ? end.getTime() - now.getTime() : 0;
  const finished = Boolean(end) && diffMs <= 0;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const blink = Math.floor(now.getTime() / 500) % 2 === 0;

  // ── Estado pós-evento: card verde com tempo decorrido ─────────────────────
  if (finished && end) {
    const elapsedLabel = formatElapsedSinceEnd(now.getTime() - end.getTime());
    return (
      <div
        className="relative overflow-hidden rounded-2xl border p-4 shadow-lg"
        style={{
          borderColor: "#10b98155",
          background:
            "linear-gradient(135deg, #10b98122 0%, #10b98108 60%, transparent 100%), #050505",
          boxShadow: "0 0 28px rgba(16,185,129,0.18) inset",
        }}
      >
        <div
          className="absolute -right-3 -top-3 h-20 w-20 rounded-full opacity-20 blur-2xl"
          style={{ backgroundColor: "#10b981" }}
        />
        <div className="relative flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
            🏁 Evento encerrado
          </p>
          <span
            className="h-2 w-2 rounded-full bg-emerald-400"
            style={{ boxShadow: "0 0 8px #10b981" }}
          />
        </div>
        <p
          className="relative mt-2 text-center text-5xl font-black uppercase tracking-tight text-emerald-300"
          style={{ textShadow: "0 0 18px rgba(16,185,129,0.55)" }}
        >
          {elapsedLabel}
        </p>
        <p className="relative mt-1 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-500/70">
          desde o término
        </p>
      </div>
    );
  }

  // ── Sem data fim configurada: estado vazio amigável ──────────────────────
  if (!end) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Fim do evento
        </p>
        <p className="mt-3 text-center text-sm text-zinc-500">
          Sem data de término configurada
        </p>
      </div>
    );
  }

  // ── Contagem regressiva (LED vermelho F1) ────────────────────────────────
  const total = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-4 shadow-lg"
      style={{
        borderColor: "#dc262655",
        background:
          "linear-gradient(135deg, #dc262622 0%, #dc262608 60%, transparent 100%), #050505",
        boxShadow: "0 0 28px rgba(220,38,38,0.18) inset",
      }}
    >
      <div
        className="absolute -right-3 -top-3 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: "#dc2626" }}
      />
      <div className="relative flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-red-500">
          Fim do evento
        </p>
        <span className="flex h-2 w-2 items-center justify-center">
          <span
            className={`h-2 w-2 rounded-full bg-red-500 ${blink ? "opacity-100" : "opacity-30"}`}
            style={{ boxShadow: "0 0 8px #dc2626" }}
          />
        </span>
      </div>
      <div
        className="relative mt-1 flex items-baseline justify-center gap-1 font-mono font-black tabular-nums leading-none text-red-500"
        style={{
          textShadow: "0 0 8px #dc2626, 0 0 20px #dc2626aa, 0 0 36px #dc262666",
          letterSpacing: "0.02em",
        }}
      >
        {days > 0 && (
          <>
            <span className="text-6xl">{pad(days)}</span>
            <span className="self-end text-base uppercase text-red-700">d</span>
          </>
        )}
        <span className="text-6xl">{pad(hours)}</span>
        <span
          className={`text-6xl transition-opacity ${blink ? "opacity-100" : "opacity-20"}`}
        >
          :
        </span>
        <span className="text-6xl">{pad(minutes)}</span>
        <span
          className={`text-6xl transition-opacity ${blink ? "opacity-100" : "opacity-20"}`}
        >
          :
        </span>
        <span className="text-6xl">{pad(seconds)}</span>
      </div>
      <p className="relative mt-3 text-center text-xs font-bold uppercase tracking-[0.3em] text-red-700">
        🏁 race time
      </p>
    </div>
  );
}
