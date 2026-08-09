export const RUBINHO_STEPS = [
  "WAITING_FULL_NAME",
  "WAITING_COMPANIONS",
  "WAITING_COMPANION_NAMES",
  "WAITING_EVENT_DATE",
  "WAITING_TRADE_IN",
  "WAITING_VEHICLE_PLATE",
  "WAITING_FINAL_CONFIRMATION",
  "COMPLETED",
  "CANCELLED",
  "HUMAN_HANDOFF",
] as const;

export type RubinhoStep = (typeof RUBINHO_STEPS)[number];

export type RubinhoLeadStateInput = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  companions?: string | null;
  store_visit_datetime?: Date | string | null;
  description?: string | null;
  vehicle_plate?: string | null;
  confirmation_status?: string | null;
};

export type RubinhoConversationState = {
  version: 3;
  current_step: RubinhoStep;
  pending_question: string | null;
  collected_fields: Record<string, boolean>;
  missing_fields: string[];
  conversation_status: RubinhoStep;
};

const QUESTIONS: Record<RubinhoStep, string | null> = {
  WAITING_FULL_NAME: "Qual é o seu nome completo?",
  WAITING_COMPANIONS: "Quantos acompanhantes você vai levar?",
  WAITING_COMPANION_NAMES:
    "Qual é o nome completo de cada acompanhante?",
  WAITING_EVENT_DATE: "Qual dia do evento você prefere?",
  WAITING_TRADE_IN: "Você pretende dar algum carro na troca?",
  WAITING_VEHICLE_PLATE: "Qual é a placa do veículo?",
  WAITING_FINAL_CONFIRMATION: "Está tudo correto?",
  COMPLETED: null,
  CANCELLED: null,
  HUMAN_HANDOFF: null,
};

function hasFullName(lead: RubinhoLeadStateInput) {
  const structured = [lead.first_name, lead.last_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
  const candidate = structured || lead.name?.trim() || "";
  return candidate.split(/\s+/).filter(Boolean).length >= 2;
}

function companionState(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return { collected: false, namesCollected: false };
  if (/^sem acompanhantes?$/i.test(text) || /^0(?:\s|$)/.test(text)) {
    return { collected: true, namesCollected: true };
  }
  const count = Number(text.match(/^(\d+)/)?.[1] ?? Number.NaN);
  if (!Number.isInteger(count) || count < 0) {
    return { collected: true, namesCollected: false };
  }
  if (count === 0) return { collected: true, namesCollected: true };
  const names = text.split(":").slice(1).join(":").trim();
  return {
    collected: true,
    namesCollected:
      Boolean(names) && !/nomes? (ainda )?n[aã]o informados?/i.test(names),
  };
}

export function deriveRubinhoConversationState(
  lead: RubinhoLeadStateInput,
  options?: {
    handoffRequired?: boolean;
    previouslyCompleted?: boolean;
  },
): RubinhoConversationState {
  const fullName = hasFullName(lead);
  const companions = companionState(lead.companions);
  const eventDate = Boolean(lead.store_visit_datetime);
  const tradeText = lead.description?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const tradeAnswer = tradeText.startsWith("carro na troca:");
  const tradeYes = tradeText.startsWith("carro na troca: sim");
  const plate = Boolean(lead.vehicle_plate?.trim());

  let currentStep: RubinhoStep;
  if (options?.handoffRequired) currentStep = "HUMAN_HANDOFF";
  else if (lead.confirmation_status === "cancelled") currentStep = "CANCELLED";
  else if (
    options?.previouslyCompleted ||
    ["confirmed", "checked_in", "closed"].includes(
      lead.confirmation_status ?? "",
    )
  ) {
    currentStep = "COMPLETED";
  } else if (!fullName) currentStep = "WAITING_FULL_NAME";
  else if (!companions.collected) currentStep = "WAITING_COMPANIONS";
  else if (!companions.namesCollected) {
    currentStep = "WAITING_COMPANION_NAMES";
  } else if (!eventDate) currentStep = "WAITING_EVENT_DATE";
  else if (!tradeAnswer) currentStep = "WAITING_TRADE_IN";
  else if (tradeYes && !plate) currentStep = "WAITING_VEHICLE_PLATE";
  else currentStep = "WAITING_FINAL_CONFIRMATION";

  const collectedFields = {
    full_name: fullName,
    companions: companions.collected,
    companion_names: companions.namesCollected,
    event_date: eventDate,
    trade_in_answer: tradeAnswer,
    vehicle_plate: plate,
    vehicle_details: !tradeYes || plate,
  };
  const missingFields: string[] = [];
  if (!fullName) missingFields.push("full_name");
  if (!companions.collected) missingFields.push("companions");
  if (companions.collected && !companions.namesCollected) {
    missingFields.push("companion_names");
  }
  if (!eventDate) missingFields.push("event_date");
  if (!tradeAnswer) missingFields.push("trade_in_answer");
  if (tradeYes && !plate) missingFields.push("vehicle_plate");

  return {
    version: 3,
    current_step: currentStep,
    pending_question: QUESTIONS[currentStep],
    collected_fields: collectedFields,
    missing_fields: missingFields,
    conversation_status: currentStep,
  };
}
