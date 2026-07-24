import type { Lead } from "../../types";
import type { ApiCrmStage } from "../../services/crm";
import {
  formatStageLeadCount,
  removeLeadFromBoard,
  upsertLeadInBoard,
} from "./crm-page.model";

function lead(id: string, crmStageId: string | null): Lead {
  return { id, crm_stage_id: crmStageId } as Lead;
}

const stages = [
  { id: "stage-new" },
  { id: "stage-won" },
] as ApiCrmStage[];

describe("crm page board model", () => {
  it("remove o lead sem alterar os arrays do quadro original", () => {
    const original = {
      "stage-new": [lead("lead-1", "stage-new")],
      "stage-won": [lead("lead-2", "stage-won")],
    };

    const next = removeLeadFromBoard(original, "lead-1");

    expect(next["stage-new"]).toEqual([]);
    expect(next["stage-won"]).toEqual(original["stage-won"]);
    expect(original["stage-new"]).toHaveLength(1);
  });

  it("move um lead existente para a etapa informada", () => {
    const original = {
      "stage-new": [lead("lead-1", "stage-new")],
      "stage-won": [],
    };
    const updated = lead("lead-1", "stage-won");

    const next = upsertLeadInBoard(original, updated, stages);

    expect(next["stage-new"]).toEqual([]);
    expect(next["stage-won"]).toEqual([updated]);
  });

  it("usa a primeira etapa quando a etapa recebida nao existe", () => {
    const incoming = lead("lead-3", "unknown");
    const next = upsertLeadInBoard(
      { "stage-new": [], "stage-won": [] },
      incoming,
      stages,
    );

    expect(next["stage-new"]).toEqual([incoming]);
  });

  it("abrevia contagens acima de 999", () => {
    expect(formatStageLeadCount(999)).toBe("999");
    expect(formatStageLeadCount(1000)).toBe("999+");
  });
});
