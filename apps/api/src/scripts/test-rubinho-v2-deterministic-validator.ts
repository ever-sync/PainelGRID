import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const apiKey = process.env.N8N_API_KEY;
const workflowId = process.env.N8N_TARGET_WORKFLOW_ID;
const baseUrl =
  process.env.N8N_BASE_URL ?? "https://n9n.gridlabs.digital/api/v1";

async function loadValidatorCode() {
  if (apiKey && workflowId) {
    const workflowResponse = await fetch(`${baseUrl}/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": apiKey },
    });
    if (!workflowResponse.ok) {
      throw new Error(
        `Falha ao consultar workflow de homologacao: ${workflowResponse.status}`,
      );
    }

    const workflow = (await workflowResponse.json()) as {
      nodes?: Array<{ name?: string; parameters?: { jsCode?: string } }>;
    };
    const code = workflow.nodes?.find(
      (node) => node.name === "V2 - VALIDAR RESPOSTA",
    )?.parameters?.jsCode;
    if (!code) throw new Error("Codigo do validador nao encontrado");
    return { code, source: "n8n_homologation" };
  }

  const patchPath = path.resolve(
    process.cwd(),
    "apps/api/src/scripts/patch-rubinho-v2-deterministic-scheduling.ts",
  );
  const source = await readFile(patchPath, "utf8");
  const match = source.match(
    /const validatorCode = String\.raw`([\s\S]*?)`;\n\nconst deriveStateCode/,
  );
  if (!match?.[1]) {
    throw new Error("Codigo local do validador nao encontrado");
  }
  return { code: match[1], source: "local_patch" };
}

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
  const { code, source } = await loadValidatorCode();

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
    lead: {
      companions: null,
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
    },
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

  const completedQuestion = run(code, {
    step: "COMPLETED",
    incoming: "Quais são as ofertas?",
    output:
      "As condições incluem bônus na troca e taxa especial, conforme disponibilidade.",
    lead: {
      companions: "Sem acompanhantes",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: "Carro na troca: não",
      confirmation_status: "scheduled",
      crm_stage_code: "CLIENTE_PRESENCA_AGENDADA",
      active_appointment: { id: "appointment-1" },
    },
  });
  assert.equal(completedQuestion.v2_expected_step, "COMPLETED");
  assert.equal(completedQuestion.validator_blocked, false);
  assert.match(String(completedQuestion.output), /bônus na troca/i);

  const reasoningLeak = run(code, {
    step: "WAITING_FULL_NAME",
    incoming: "Neymar Luciano de Oliveira",
    output:
      "The user now must answer the pending question: \"Qual dia do evento você prefere?\" But system says one question per message. The current assistant message already asked companions. Now user will respond. Let's see user's next message. (Wait for user's next input)",
    lead: {
      first_name: "Neymar",
      last_name: "Luciano de Oliveira",
      companions: null,
      store_visit_datetime: null,
    },
  });
  assert.equal(reasoningLeak.validator_blocked, true);
  assert.equal(reasoningLeak.validator_internal_reasoning_blocked, true);
  assert.doesNotMatch(
    String(reasoningLeak.output),
    /the user|pending question|system says|wait for/i,
  );
  assert.match(String(reasoningLeak.output), /14\/08\/2026/);

  const portugueseReasoningLeak = run(code, {
    step: "WAITING_COMPANIONS",
    incoming: "uma pessoa",
    output:
      "A mensagem atual responde à pergunta pendente. Preciso responder ao usuário somente depois de salvar. Vamos aguardar a próxima mensagem.",
    lead: {
      companions: null,
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
    },
  });
  assert.equal(portugueseReasoningLeak.validator_blocked, true);
  assert.deepEqual(
    portugueseReasoningLeak.validator_internal_reasoning_categories,
    ["meta_reasoning"],
  );
  assert.doesNotMatch(
    String(portugueseReasoningLeak.output),
    /mensagem atual|pergunta pendente|vamos aguardar/i,
  );
  assert.match(String(portugueseReasoningLeak.output), /acompanhantes/i);

  const structuredReasoningLeak = run(code, {
    step: "WAITING_TRADE_IN",
    incoming: "sim",
    output:
      '{"role":"tool","tool_calls":[{"name":"atualizar_dados_lead"}],"current_step":"WAITING_TRADE_IN"}',
    lead: {
      companions: "Sem acompanhantes",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: null,
    },
  });
  assert.equal(structuredReasoningLeak.validator_blocked, true);
  assert.deepEqual(
    structuredReasoningLeak.validator_internal_reasoning_categories,
    ["technical_state", "structured_tool_output"],
  );
  assert.doesNotMatch(String(structuredReasoningLeak.output), /tool_calls/i);
  assert.match(String(structuredReasoningLeak.output), /carro na troca/i);

  const safeCompletedAnswer = run(code, {
    step: "COMPLETED",
    incoming: "Quais são as condições?",
    output:
      "Claro! O evento destaca bônus na troca e condições especiais, conforme disponibilidade.",
    lead: {
      companions: "Sem acompanhantes",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: "Carro na troca: não",
      confirmation_status: "scheduled",
      crm_stage_code: "CLIENTE_PRESENCA_AGENDADA",
      active_appointment: { id: "appointment-1" },
    },
  });
  assert.equal(safeCompletedAnswer.validator_internal_reasoning_blocked, false);
  assert.deepEqual(
    safeCompletedAnswer.validator_internal_reasoning_categories,
    [],
  );
  assert.equal(
    safeCompletedAnswer.output,
    "Claro! O evento destaca bônus na troca e condições especiais, conforme disponibilidade.",
  );

  const repeatedDateAfterSelection = run(code, {
    step: "WAITING_EVENT_DATE",
    incoming: "dia 15",
    output: "Show! Qual data você prefere?",
    lead: {
      companions: null,
      store_visit_datetime: null,
    },
  });
  assert.equal(
    repeatedDateAfterSelection.v2_expected_step,
    "WAITING_COMPANIONS",
  );
  assert.equal(
    repeatedDateAfterSelection.validator_question_flow_blocked,
    true,
  );
  assert.match(
    String(repeatedDateAfterSelection.output),
    /quantos acompanhantes/i,
  );
  assert.equal(
    (String(repeatedDateAfterSelection.output).match(/\?/g) ?? []).length,
    1,
  );

  const repeatedCompanionNames = run(code, {
    step: "WAITING_COMPANION_NAMES",
    incoming: "Rafaela Lobo dos Santos",
    output: "Top! Qual é o nome completo de quem vai com você?",
    lead: {
      companions: "1 acompanhante: Rafaela Lobo dos Santos",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: null,
    },
  });
  assert.equal(repeatedCompanionNames.v2_expected_step, "WAITING_TRADE_IN");
  assert.equal(repeatedCompanionNames.validator_question_flow_blocked, true);
  assert.match(String(repeatedCompanionNames.output), /carro na troca/i);

  const validFinalQuestion = run(code, {
    step: "WAITING_FINAL_CONFIRMATION",
    incoming: "PYZ3452",
    output:
      "Anotado aqui, Raphael. Confere o resumo do seu credenciamento:\n\n• Nome: Raphael dos Santos\n• Data: 15/08/2026 às 09:00\n• Acompanhante: Sem acompanhantes\n• Carro na troca: sim\n• Placa: PYZ3452\n\nEstá tudo correto?",
    lead: {
      first_name: "Raphael",
      last_name: "dos Santos",
      companions: "Sem acompanhantes",
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
      description: "Carro na troca: sim",
      vehicle_plate: "PYZ3452",
    },
  });
  assert.equal(
    validFinalQuestion.v2_expected_step,
    "WAITING_FINAL_CONFIRMATION",
  );
  assert.equal(validFinalQuestion.validator_question_flow_blocked, false);
  assert.equal(validFinalQuestion.validator_blocked, false);

  const multipleQuestions = run(code, {
    step: "WAITING_COMPANIONS",
    incoming: "15 de agosto",
    output: "Quantos acompanhantes você vai levar? E quais são os nomes?",
    lead: {
      companions: null,
      store_visit_datetime: "2026-08-15T12:00:00.000Z",
    },
  });
  assert.equal(multipleQuestions.validator_question_flow_blocked, true);
  assert.equal((String(multipleQuestions.output).match(/\?/g) ?? []).length, 1);
  assert.match(String(multipleQuestions.output), /quantos acompanhantes/i);

  console.log(JSON.stringify({ passed: 14, failed: 0, source }));
}

main();
