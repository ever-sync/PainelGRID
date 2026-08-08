import assert from "node:assert/strict";

const apiKey = process.env.N8N_API_KEY;
const workflowId = process.env.N8N_TARGET_WORKFLOW_ID;
const baseUrl =
  process.env.N8N_BASE_URL ?? "https://n9n.gridlabs.digital/api/v1";
if (!apiKey || !workflowId)
  throw new Error("Credenciais do teste nao informadas");
const safeApiKey = apiKey;
const safeWorkflowId = workflowId;

const eventDays = [
  { start: "2026-08-14T12:00:00.000Z", end: "2026-08-14T21:00:00.000Z" },
  { start: "2026-08-15T12:00:00.000Z", end: "2026-08-15T21:00:00.000Z" },
  { start: "2026-08-16T12:00:00.000Z", end: "2026-08-16T17:00:00.000Z" },
];

function run(
  code: string,
  input: {
    step: string;
    incoming: string;
    output: string;
    lead?: Record<string, unknown>;
  },
) {
  const data = {
    first_name: "Raphael",
    last_name: "dos Santos",
    companions: "Sem acompanhantes",
    store_visit_datetime: null,
    description: null,
    vehicle_plate: null,
    confirmation_status: "pending",
    crm_stage_code: "CLIENTE_EM_CONTATO",
    ...input.lead,
  };
  const values: Record<string, unknown> = {
    "AI Agent1": { output: input.output },
    "V2 - ESTADO PRONTO": { v2_state: { current_step: input.step } },
    "V2 - NORMALIZAR ENTRADA": { v2_context: { message_text: input.incoming } },
    "RESUMO DO LEAD/EVENTO/RUBINHO": {
      event_days_iso: eventDays,
      event_days: "14/08/2026, 15/08/2026 e 16/08/2026",
    },
  };
  const select = (name: string) => ({ item: { json: values[name] } });
  const execute = new Function("$json", "$", code) as (
    json: Record<string, unknown>,
    selector: typeof select,
  ) => { json: Record<string, unknown> };
  return execute(data, select).json;
}

async function main() {
  const workflowResponse = await fetch(
    `${baseUrl}/workflows/${safeWorkflowId}`,
    {
      headers: { "X-N8N-API-KEY": safeApiKey },
    },
  );
  const workflow = (await workflowResponse.json()) as {
    nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
  };
  const code = workflow.nodes.find(
    (item) => item.name === "VALIDADOR - ANALISAR",
  )?.parameters.jsCode;
  if (!code) throw new Error("Codigo do validador nao encontrado");

  const numeric = run(code, {
    step: "WAITING_EVENT_DATE",
    incoming: "dia 15",
    output: "Blz, qual é a placa?",
  });
  assert.equal(
    (numeric.v2_auto_schedule as { scheduled_at: string }).scheduled_at,
    "2026-08-15T12:00:00.000Z",
  );

  const weekday = run(code, {
    step: "WAITING_EVENT_DATE",
    incoming: "prefiro domingo",
    output: "Perfeito",
  });
  assert.equal(
    (weekday.v2_auto_schedule as { scheduled_at: string }).scheduled_at,
    "2026-08-16T12:00:00.000Z",
  );

  const ambiguous = run(code, {
    step: "WAITING_EVENT_DATE",
    incoming: "14 e 15",
    output: "Show",
  });
  assert.equal(
    (ambiguous.v2_auto_schedule as { should_schedule: boolean })
      .should_schedule,
    false,
  );
  assert.match(String(ambiguous.output), /mais de uma data/i);

  const companions = run(code, {
    step: "WAITING_COMPANIONS",
    incoming: "sim",
    output: "Blz, qual é a placa do seu veículo?",
    lead: { companions: null },
  });
  assert.match(String(companions.output), /quantos acompanhantes/i);
  assert.equal(companions.validator_blocked, true);

  const finalized = run(code, {
    step: "WAITING_FINAL_CONFIRMATION",
    incoming: "sim, tudo certo",
    output: "Sua credencial foi confirmada.",
    lead: {
      companions: "Sem acompanhantes",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: "Carro na troca: não",
      confirmation_status: "scheduled",
      crm_stage_code: "CLIENTE_PRESENCA_AGENDADA",
      active_appointment: { id: "appointment-1" },
    },
  });
  assert.equal(finalized.validator_claims_final, true);
  assert.equal(finalized.validator_blocked, false);
  assert.match(String(finalized.output), /credencial foi confirmada/i);

  console.log(JSON.stringify({ passed: 5, failed: 0 }));
}

main();
