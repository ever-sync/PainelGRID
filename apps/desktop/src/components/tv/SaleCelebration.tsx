export function SaleCelebration({
  vendorName,
  teamName,
  salesCount = 1,
  pendingCount = 0,
}: {
  vendorName: string;
  teamName: string | null;
  salesCount?: number;
  pendingCount?: number;
}) {
  return (
    <>
      <style>{`
        @keyframes senna-cross {
          0%   { transform: translate(-30vw, 0) rotate(-2deg); }
          50%  { transform: translate(50vw, -6px) rotate(0deg); }
          100% { transform: translate(130vw, 0) rotate(2deg); }
        }
        @keyframes flag-wave {
          0%, 100% { transform: rotate(-12deg) skewX(-6deg); }
          50%      { transform: rotate(8deg)  skewX(8deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-2px); }
          75% { transform: translateY(2px); }
        }
        @keyframes flash-bg {
          0%, 100% { background-color: rgba(16, 185, 129, 0); }
          50%      { background-color: rgba(16, 185, 129, 0.12); }
        }
        @keyframes pulse-celebration {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 60px rgba(16,185,129,0.45), 0 0 120px rgba(16,185,129,0.25);
          }
          50% {
            transform: scale(1.03);
            box-shadow: 0 0 90px rgba(16,185,129,0.7), 0 0 180px rgba(16,185,129,0.35);
          }
        }
        @keyframes banner-drop {
          0%   { opacity: 0; transform: translateY(-100px); }
          60%  { opacity: 1; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .senna-track     { animation: senna-cross 8s linear forwards; }
        .senna-shake     { animation: shake 0.15s ease-in-out infinite; display: inline-block; }
        .senna-flag      { animation: flag-wave 0.45s ease-in-out infinite; display: inline-block; transform-origin: bottom left; }
        .celebration-flash  { animation: flash-bg 1.4s ease-in-out 2; }
        .celebration-banner {
          animation: banner-drop 0.5s cubic-bezier(.2,1.5,.4,1) forwards,
                     pulse-celebration 1.2s ease-in-out 0.5s infinite;
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 z-40 celebration-flash" />

      {/* Banner pulsante no topo: vendedor + equipe */}
      <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-2 px-8">
        <div className="celebration-banner inline-flex items-center gap-6 rounded-3xl border-4 border-emerald-400 bg-zinc-950/95 px-12 py-6 backdrop-blur">
          <span className="text-6xl" role="img" aria-label="Bandeira xadrez">
            🏁
          </span>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-emerald-400">
              {salesCount > 1
                ? `${salesCount} vendas confirmadas!`
                : "Venda confirmada!"}
            </p>
            <p
              className="mt-1 text-7xl font-black tracking-tight text-white drop-shadow-[0_0_24px_rgba(16,185,129,0.8)]"
              style={{ lineHeight: 0.95 }}
            >
              {vendorName.toUpperCase()}
            </p>
            {teamName && (
              <p className="mt-2 text-2xl font-bold uppercase tracking-widest text-emerald-300">
                Equipe {teamName}
              </p>
            )}
          </div>
          <div className="relative">
            <span className="text-6xl" role="img" aria-label="Bandeira xadrez">
              🏁
            </span>
            {salesCount > 1 && (
              <span className="absolute -right-4 -top-3 flex h-12 w-12 items-center justify-center rounded-full border-4 border-zinc-950 bg-amber-400 text-2xl font-black text-zinc-900 shadow-[0_0_18px_rgba(251,191,36,0.7)]">
                ×{salesCount}
              </span>
            )}
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="rounded-full border border-emerald-400/40 bg-zinc-950/80 px-4 py-1 text-xs font-bold uppercase tracking-widest text-emerald-300 backdrop-blur">
            + {pendingCount} {pendingCount === 1 ? "venda" : "vendas"} na fila
          </div>
        )}
      </div>

      {/* Senna no F1 cruzando a tela com bandeira do Brasil */}
      <div className="pointer-events-none fixed inset-x-0 top-1/2 z-50 -translate-y-1/2">
        <div className="senna-track flex items-center gap-6 whitespace-nowrap">
          <span
            className="senna-flag"
            role="img"
            aria-label="Bandeira do Brasil"
            style={{ fontSize: "12rem", lineHeight: 1 }}
          >
            🇧🇷
          </span>
          <span
            style={{
              display: "inline-block",
              transform: "scaleX(-1)",
              filter: "drop-shadow(0 0 30px rgba(16,185,129,0.7))",
            }}
            aria-label="Carro de F1"
          >
            <span
              className="senna-shake"
              role="img"
              style={{ fontSize: "18rem", lineHeight: 1 }}
            >
              🏎️💨
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
