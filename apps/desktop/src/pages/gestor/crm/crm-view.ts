import { useEffect, useState } from "react";
import type { Lead } from "../../../types";

/** Tipos, constantes e helpers puros do board do CRM. Ficam fora da pagina
 *  para poderem ser testados e reaproveitados sem carregar a tela inteira. */

export type ViewMode = "kanban" | "compact" | "list";
export type CardSort =
  "recent" | "oldest" | "stalled" | "visit" | "updated" | "name";
export type StageFilter = "all" | string;
export type ConfirmationFilter = "all" | Lead["confirmation_status"];
export type LeadMotionKind = "new" | "stage-change" | "update";
export type StageMotionKind = LeadMotionKind;

export type Toast = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  /** Acao opcional no proprio toast (ex.: desfazer uma movimentacao). */
  action?: { label: string; onAction: () => void };
};

export const CARD_SORT_OPTIONS = [
  ["recent", "Mais recentes"],
  ["oldest", "Mais antigos"],
  ["stalled", "Parados ha mais tempo"],
  ["visit", "Visita mais proxima"],
  ["updated", "Atualizados por ultimo"],
  ["name", "Nome (A-Z)"],
] as const satisfies ReadonlyArray<readonly [CardSort, string]>;

/** Dias na etapa a partir dos quais o card sinaliza que o lead esfriou. */
export const STAGE_AGE_WARNING_DAYS = 7;
export const STAGE_AGE_CRITICAL_DAYS = 14;

/** Dias inteiros desde a entrada na etapa atual. */
export function stageAgeInDays(lead: Lead) {
  if (!lead.crm_stage_since) return null;
  const since = Date.parse(lead.crm_stage_since);
  if (Number.isNaN(since)) return null;
  const days = Math.floor((Date.now() - since) / 86_400_000);
  return days >= 0 ? days : null;
}

export const CARD_SORT_STORAGE_KEY = "crm_card_sort";

/** true abaixo do breakpoint `md` do Tailwind (768px). No celular o Kanban
 *  mostra uma etapa por vez em vez do quadro rolando na horizontal. */
export function useIsMobileViewport() {
  const query = "(max-width: 767px)";
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

/** Compara duas datas ISO. Lead sem data (ou com data invalida) sempre vai
 *  para o fim da coluna, nas duas direcoes. */
export function compareByDate(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc",
) {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;
  const aMissing = Number.isNaN(aTime);
  const bMissing = Number.isNaN(bTime);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

/** Ordenacao dos cards dentro da etapa. O desempate por nome mantem a ordem
 *  estavel quando dois leads tem a mesma data. */
export function compareLeads(sort: CardSort) {
  return (a: Lead, b: Lead) => {
    const byName = a.name.localeCompare(b.name);
    switch (sort) {
      case "recent":
        return compareByDate(a.created_at, b.created_at, "desc") || byName;
      case "oldest":
        return compareByDate(a.created_at, b.created_at, "asc") || byName;
      case "stalled":
        return (
          compareByDate(a.crm_stage_since, b.crm_stage_since, "asc") || byName
        );
      case "visit":
        return (
          compareByDate(
            a.store_visit_datetime,
            b.store_visit_datetime,
            "asc",
          ) || byName
        );
      case "updated":
        return compareByDate(a.updated_at, b.updated_at, "desc") || byName;
      case "name":
      default:
        return byName;
    }
  };
}
