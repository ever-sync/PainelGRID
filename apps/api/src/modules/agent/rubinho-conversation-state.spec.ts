import { deriveRubinhoConversationState } from "./rubinho-conversation-state";

describe("deriveRubinhoConversationState", () => {
  const completeLead = {
    first_name: "Raphael",
    last_name: "dos Santos",
    companions: "1 acompanhante: Gael Lobo",
    store_visit_datetime: "2026-08-15T12:00:00.000Z",
    description: "Carro na troca: sim",
    vehicle_plate: "PYZ3452",
    confirmation_status: "scheduled",
  };

  it.each([
    [
      { ...completeLead, first_name: null, last_name: null },
      "WAITING_FULL_NAME",
    ],
    [{ ...completeLead, companions: null }, "WAITING_COMPANIONS"],
    [{ ...completeLead, companions: "1" }, "WAITING_COMPANION_NAMES"],
    [{ ...completeLead, store_visit_datetime: null }, "WAITING_EVENT_DATE"],
    [{ ...completeLead, description: null }, "WAITING_TRADE_IN"],
    [{ ...completeLead, vehicle_plate: null }, "WAITING_VEHICLE_PLATE"],
    [completeLead, "WAITING_FINAL_CONFIRMATION"],
  ])(
    "deriva a etapa exclusivamente dos dados persistidos",
    (lead, expected) => {
      expect(deriveRubinhoConversationState(lead).current_step).toBe(expected);
    },
  );

  it("considera nomes de acompanhantes persistidos", () => {
    const state = deriveRubinhoConversationState(completeLead);
    expect(state.collected_fields.companion_names).toBe(true);
    expect(state.missing_fields).not.toContain("companion_names");
  });

  it("prioriza a escolha da data imediatamente depois do nome completo", () => {
    const state = deriveRubinhoConversationState({
      first_name: "Raphael",
      last_name: "dos Santos",
      companions: null,
      store_visit_datetime: null,
    });

    expect(state.current_step).toBe("WAITING_EVENT_DATE");
    expect(state.missing_fields.slice(0, 2)).toEqual([
      "event_date",
      "companions",
    ]);
  });

  it("pergunta acompanhantes somente depois que a data foi salva", () => {
    const state = deriveRubinhoConversationState({
      first_name: "Raphael",
      last_name: "dos Santos",
      companions: null,
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
    });

    expect(state.current_step).toBe("WAITING_COMPANIONS");
  });

  it("nao considera o atendimento concluido apenas porque o lead foi agendado", () => {
    const state = deriveRubinhoConversationState({
      first_name: "Raphael",
      last_name: "dos Santos",
      companions: null,
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      confirmation_status: "scheduled",
    });

    expect(state.current_step).toBe("WAITING_COMPANIONS");
  });

  it("nao exige placa quando a resposta de troca ainda nao existe", () => {
    const state = deriveRubinhoConversationState({
      ...completeLead,
      description: null,
      vehicle_plate: null,
    });
    expect(state.missing_fields).toContain("trade_in_answer");
    expect(state.missing_fields).not.toContain("vehicle_plate");
  });

  it("preserva encerramento e handoff como estados terminais", () => {
    expect(
      deriveRubinhoConversationState(completeLead, {
        previouslyCompleted: true,
      }).current_step,
    ).toBe("COMPLETED");
    expect(
      deriveRubinhoConversationState(completeLead, {
        handoffRequired: true,
      }).current_step,
    ).toBe("HUMAN_HANDOFF");
  });
});
