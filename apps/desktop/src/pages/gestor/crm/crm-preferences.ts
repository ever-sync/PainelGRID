import type {
  CardSort,
  ConfirmationFilter,
  StageFilter,
  ViewMode,
} from "./crm-view";

export type CrmPreferences = {
  viewMode: ViewMode;
  cardSort: CardSort;
  sourceFilter: string;
  vendorFilter: string;
  tagFilter: string;
  stageFilter: StageFilter;
  confirmationFilter: ConfirmationFilter;
  hiddenStageIds: string[];
  scrollLeft: number;
};

export const DEFAULT_CRM_PREFERENCES: CrmPreferences = {
  viewMode: "kanban",
  cardSort: "recent",
  sourceFilter: "all",
  vendorFilter: "all",
  tagFilter: "all",
  stageFilter: "all",
  confirmationFilter: "all",
  hiddenStageIds: [],
  scrollLeft: 0,
};

const keyFor = (userId: string, clientId: string) =>
  `crm:preferences:${userId}:${clientId}`;

export function readCrmPreferences(
  storage: Pick<Storage, "getItem">,
  userId: string,
  clientId: string,
): CrmPreferences {
  try {
    const raw = storage.getItem(keyFor(userId, clientId));
    if (!raw) return DEFAULT_CRM_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<CrmPreferences>;
    return {
      ...DEFAULT_CRM_PREFERENCES,
      ...parsed,
      hiddenStageIds: Array.isArray(parsed.hiddenStageIds)
        ? parsed.hiddenStageIds.map(String)
        : [],
      scrollLeft:
        typeof parsed.scrollLeft === "number" && parsed.scrollLeft >= 0
          ? parsed.scrollLeft
          : 0,
    };
  } catch {
    return DEFAULT_CRM_PREFERENCES;
  }
}

export function writeCrmPreferences(
  storage: Pick<Storage, "setItem">,
  userId: string,
  clientId: string,
  preferences: CrmPreferences,
) {
  storage.setItem(keyFor(userId, clientId), JSON.stringify(preferences));
}
