import { Medal } from "lucide-react";
import { Section } from "./Section";
import {
  avatarColor,
  MEDAL_STYLE,
  pct,
  vendorInitials,
  type VendorSummary,
} from "./shared";

export function VendorRanking({
  vendors,
  className,
}: {
  vendors: VendorSummary[];
  className?: string;
}) {
  return (
    <Section className={className} title="Ranking de vendedores">
      <div className="h-full overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#17171a]/95 text-[10px] uppercase tracking-[0.14em] text-zinc-500 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Vendedor</th>
              <th className="px-3 py-2 text-left">Equipe</th>
              <th className="px-3 py-2 text-right">Agend.</th>
              <th className="px-3 py-2 text-right">Conf.</th>
              <th className="px-3 py-2 text-right">Comp.</th>
              <th className="px-3 py-2 text-right">Conv.</th>
              <th className="px-3 py-2 text-right">Vendas</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor, idx) => {
              const medal = idx < 3 ? MEDAL_STYLE[idx] : null;
              const palette = avatarColor(vendor.vendor_id);
              const conversion = pct(vendor.sold, vendor.scheduled);
              return (
                <tr
                  key={vendor.vendor_id}
                  className="border-t border-white/[0.06] transition-colors odd:bg-white/[0.015]"
                >
                  <td className="px-3 py-2.5">
                    {medal ? (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${medal.bg} ${medal.text} ring-1 ${medal.ring}`}
                      >
                        <Medal size={14} />
                      </span>
                    ) : (
                      <span className="ml-1 text-xs font-bold text-zinc-600">
                        {idx + 1}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${palette[0]} ${palette[1]} text-[11px] font-bold ${palette[2]} ring-1 ring-white/10`}
                      >
                        {vendorInitials(vendor.vendor_name)}
                      </span>
                      <span className="font-semibold text-zinc-100">
                        {vendor.vendor_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {vendor.team_name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {vendor.scheduled}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {vendor.confirmed}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {vendor.checked_in}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {vendor.scheduled > 0 ? (
                      <span
                        className={`tabular-nums font-semibold ${
                          conversion >= 60
                            ? "text-emerald-300"
                            : conversion >= 30
                              ? "text-amber-300"
                              : "text-zinc-500"
                        }`}
                      >
                        {conversion}%
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xl font-black tabular-nums text-[#ff3159]">
                    {vendor.sold}
                  </td>
                </tr>
              );
            })}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  Sem vendedores cadastrados nas equipes do evento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
