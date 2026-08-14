import { Medal } from "lucide-react";
import { EmptyChart } from "./EmptyChart";
import { Section } from "./Section";
import { TeamHeadToHead } from "./TeamHeadToHead";
import { MEDAL_STYLE, type TeamSummary } from "./shared";

export function TeamRanking({
  teams,
  className,
}: {
  teams: TeamSummary[];
  className?: string;
}) {
  return (
    <Section className={className} title="Ranking de equipes">
      {teams.length === 0 ? (
        <EmptyChart>Sem equipes cadastradas no evento.</EmptyChart>
      ) : teams.length === 2 ? (
        <TeamHeadToHead a={teams[0]} b={teams[1]} />
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team, idx) => {
            const totalSold = teams.reduce((sum, t) => sum + t.sold, 0) || 1;
            const sharePct = Math.round((team.sold / totalSold) * 100);
            const medal = idx < 3 ? MEDAL_STYLE[idx] : null;
            return (
              <li
                key={team.team_id}
                className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                    <span className="text-base font-bold text-zinc-100">
                      {team.team_name}
                    </span>
                  </div>
                  <span className="text-2xl font-black tabular-nums text-[#ff3159]">
                    {team.sold}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span>{team.scheduled} agendados</span>·
                  <span>{team.checked_in} compareceram</span>·
                  <span className="font-semibold text-zinc-300">
                    {sharePct}% das vendas
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
