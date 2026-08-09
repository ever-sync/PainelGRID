import assert from "node:assert/strict";

type Node = {
  name: string;
  parameters: Record<string, unknown>;
};
type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: Node[];
  connections: Record<string, unknown>;
};

const apiKey = process.env.N8N_API_KEY;
const productionId =
  process.env.N8N_PRODUCTION_WORKFLOW_ID ?? "rQ92Kohukkw7X7ex";
const homologationId = process.env.N8N_HOMOLOGATION_WORKFLOW_ID;
const baseUrl =
  process.env.N8N_BASE_URL ?? "https://n9n.gridlabs.digital/api/v1";
const expectedProductionActive =
  process.env.N8N_EXPECT_PRODUCTION_ACTIVE !== "false";
const expectedHomologationActive =
  process.env.N8N_EXPECT_HOMOLOGATION_ACTIVE === "true";
if (!apiKey || !homologationId) {
  throw new Error("N8N_API_KEY e N8N_HOMOLOGATION_WORKFLOW_ID sao obrigatorios");
}

async function getWorkflow(id: string) {
  const response = await fetch(`${baseUrl}/workflows/${id}`, {
    headers: { "X-N8N-API-KEY": apiKey! },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body as Workflow;
}

function node(workflow: Workflow, name: string) {
  const found = workflow.nodes.find((item) => item.name === name);
  assert.ok(found, `No ausente: ${name}`);
  return found;
}

async function main() {
  const [production, homologation] = await Promise.all([
    getWorkflow(productionId),
    getWorkflow(homologationId!),
  ]);
  assert.equal(
    production.active,
    expectedProductionActive,
    `Estado inesperado da producao: esperado ${expectedProductionActive}`,
  );
  assert.equal(
    homologation.active,
    expectedHomologationActive,
    `Estado inesperado da homologacao: esperado ${expectedHomologationActive}`,
  );
  assert.notEqual(production.id, homologation.id);
  assert.match(homologation.name, /HOMOLOG/);

  const systemMessage = String(
    (node(homologation, "AI Agent1").parameters.options as {
      systemMessage?: string;
    })?.systemMessage ?? "",
  );
  assert.match(systemMessage, /TOM DE CONVERSA HOMOLOGADO V4/);
  assert.match(systemMessage, /Cada mensagem deve ter exatamente uma pergunta/);
  assert.match(systemMessage, /Nunca escreva \"Oi, !\"/);
  assert.match(
    systemMessage,
    /TRAVA DE CONHECIMENTO DO EVENTO V5 — PRIORIDADE MAXIMA/,
  );
  assert.match(systemMessage, /ÚNICA fonte autorizada/);
  assert.match(systemMessage, /NÃO possui catálogo de veículos/);
  assert.match(systemMessage, /Quando houver dúvida.*bloqueio por padrão/);
  assert.match(
    systemMessage,
    /REGISTRO OBRIGATORIO DE RESPOSTAS V6 — PRIORIDADE MAXIMA/,
  );
  assert.match(systemMessage, /nome completo do acompanhante/);

  const validator = String(
    node(homologation, "VALIDADOR - ANALISAR").parameters.jsCode ?? "",
  );
  assert.match(validator, /validator_blocked/);
  assert.match(validator, /v2_auto_schedule/);
  assert.match(validator, /formatEventDateQuestion/);
  assert.match(validator, /Top! Agora escolha uma data para o credenciamento/);
  node(homologation, "V2 - DATA ESCOLHIDA?");
  node(homologation, "V2 - AGENDAR DATA ESCOLHIDA");
  node(homologation, "V2 - VALIDAR AGENDAMENTO DA DATA");

  const auditBody = String(
    node(homologation, "V2 - REGISTRAR AUDITORIA").parameters.jsonBody ?? "",
  );
  assert.match(auditBody, /previous_state/);
  assert.match(auditBody, /received_message/);
  assert.match(auditBody, /tool_input/);
  assert.match(auditBody, /api_response/);
  assert.match(auditBody, /resulting_state/);
  assert.match(auditBody, /block_reason/);

  console.log(
    JSON.stringify({
      passed: 22,
      failed: 0,
      production_active: production.active,
      homologation_active: homologation.active,
      homologation_nodes: homologation.nodes.length,
    }),
  );
}

main();
