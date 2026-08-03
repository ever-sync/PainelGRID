const apiKey = process.env.N8N_API_KEY?.trim();
const apiUrl = (
  process.env.N8N_API_URL ?? "https://n9n.gridlabs.digital/api/v1"
).replace(/\/$/, "");
const apply = process.argv.includes("--apply");

const workflowId = "xrF95mmbiH38K1kS";
const backupName = "BACKUP FASE 5 2026-08-03 - Form - EVENTO";
const ingestionCredential = {
  id: "YkHffwNwzxSXOJ6F",
  name: "PainelGRID - Meta Lead Ingestion",
};

if (!apiKey) {
  throw new Error("Defina N8N_API_KEY somente no ambiente antes de executar.");
}

async function request(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `n8n ${init.method ?? "GET"} ${path}: HTTP ${response.status} ${details.slice(0, 500)}`,
    );
  }

  return response.status === 204 ? null : response.json();
}

function nodeByName(workflow, ...names) {
  const node = workflow.nodes.find((item) => names.includes(item.name));
  if (!node) {
    throw new Error(`Node obrigatorio nao encontrado: ${names.join(" ou ")}`);
  }
  return structuredClone(node);
}

function renameNode(node, name, position) {
  node.name = name;
  node.position = position;
  delete node.disabled;
  return node;
}

function publicWorkflowSettings(settings = {}) {
  const allowed = [
    "saveExecutionProgress",
    "saveManualExecutions",
    "saveDataErrorExecution",
    "saveDataSuccessExecution",
    "executionTimeout",
    "errorWorkflow",
    "timezone",
    "executionOrder",
    "callerPolicy",
    "dataTableUsage",
    "dataTableSaving",
    "availableInMCP",
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  );
}

function buildWorkflow(source) {
  const webhook = renameNode(
    nodeByName(source, "Webhook1", "RECEBER LEAD META"),
    "RECEBER LEAD META",
    [-960, 0],
  );
  webhook.parameters = {
    httpMethod: "POST",
    path: "meta-leads",
    options: {},
  };

  const extract = renameNode(
    nodeByName(source, "Code in JavaScript1", "EXTRAIR EVENTO LEADGEN"),
    "EXTRAIR EVENTO LEADGEN",
    [-720, 0],
  );
  extract.parameters = {
    jsCode: `const body = $json.body ?? $json;
const leadgenEvents = (body.entry ?? [])
  .flatMap((entry) => entry.changes ?? [])
  .filter((change) => change.field === "leadgen")
  .map((change) => change.value)
  .filter((value) => value?.leadgen_id);

return leadgenEvents.map((leadgen) => ({
  json: {
    leadgen_id: String(leadgen.leadgen_id),
    page_id: leadgen.page_id ? String(leadgen.page_id) : null,
    form_id: leadgen.form_id ? String(leadgen.form_id) : null,
    ad_id: leadgen.ad_id ? String(leadgen.ad_id) : null,
    adgroup_id: leadgen.adgroup_id ? String(leadgen.adgroup_id) : null,
    created_time: leadgen.created_time ?? null,
    payload_original: body,
  },
}));`,
  };

  const fetchLead = renameNode(
    nodeByName(source, "HTTP Request", "BUSCAR DADOS DO LEAD NA META"),
    "BUSCAR DADOS DO LEAD NA META",
    [-480, 0],
  );
  fetchLead.parameters = {
    ...fetchLead.parameters,
    url: "=https://graph.facebook.com/v26.0/{{ $json.leadgen_id }}",
    sendQuery: true,
    queryParameters: {
      parameters: [
        {
          name: "fields",
          value:
            "id,created_time,field_data,form_id,ad_id,ad_name,campaign_id,campaign_name",
        },
      ],
    },
    options: {},
  };

  const mapFields = renameNode(
    nodeByName(source, "Code in JavaScript2", "MAPEAR CAMPOS DO LEAD"),
    "MAPEAR CAMPOS DO LEAD",
    [-240, 0],
  );
  mapFields.parameters = {
    jsCode: `const fieldData = Array.isArray($json.field_data) ? $json.field_data : [];
const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\\u0300-\\u036f]/g, "")
  .replace(/:\\s*$/, "")
  .trim()
  .toLowerCase();

const allFields = {};
for (const field of fieldData) {
  allFields[field.name] = field.values?.[0] ?? null;
}

const getField = (...aliases) => {
  const wanted = aliases.map(normalize);
  const exact = fieldData.find((field) => wanted.includes(normalize(field.name)));
  if (exact) return exact.values?.[0] ?? null;
  const partial = fieldData.find((field) =>
    wanted.some((alias) => normalize(field.name).includes(alias)),
  );
  return partial?.values?.[0] ?? null;
};

const rawChannel = getField(
  "prefere_ser_atendido_por",
  "preferencia_atendimento",
  "gostaria_de_confirmar_sua_credencial_por",
);
const normalizedChannel = normalize(rawChannel);
const preferredChannel = normalizedChannel.includes("whatsapp")
  ? "whatsapp"
  : normalizedChannel.includes("ligacao") || normalizedChannel.includes("telefone")
    ? "ligacao"
    : rawChannel;
const fullName = getField("full_name", "nome_completo", "nome")
  ?? [getField("first_name", "primeiro_nome"), getField("last_name", "sobrenome")]
    .filter(Boolean)
    .join(" ")
    .trim();

return {
  lead_id: String($json.id ?? ""),
  nome: fullName,
  email: getField("email"),
  telefone: getField("phone_number", "telefone", "celular"),
  preferencia_atendimento: preferredChannel,
  formulario_id: String($json.form_id ?? ""),
  anuncio_id: $json.ad_id ? String($json.ad_id) : null,
  anuncio: $json.ad_name ?? null,
  campanha_id: $json.campaign_id ? String($json.campaign_id) : null,
  campanha: $json.campaign_name ?? null,
  criado_em: $json.created_time ?? null,
  origem: "facebook_lead_ads",
  todos_os_campos: allFields,
};`,
  };

  const validate = renameNode(
    nodeByName(
      source,
      "VALIDAR FORMULARIO - GPDEVENDAS",
      "VALIDAR PAYLOAD DO LEAD",
    ),
    "VALIDAR PAYLOAD DO LEAD",
    [0, 0],
  );
  validate.parameters = {
    jsCode: `const required = {
  lead_id: $json.lead_id,
  formulario_id: $json.formulario_id,
  nome: $json.nome,
};
const missing = Object.entries(required)
  .filter(([, value]) => !String(value ?? "").trim())
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(\`Payload Meta incompleto: \${missing.join(", ")}\`);
}

if (!$json.telefone && !$json.email) {
  throw new Error("Payload Meta sem telefone e sem email");
}

return $json;`,
  };

  const importLead = renameNode(
    nodeByName(
      source,
      "CRIAR LEAD - GPDEVENDAS1",
      "IMPORTAR LEAD - ROTEAMENTO AUTOMATICO",
    ),
    "IMPORTAR LEAD - ROTEAMENTO AUTOMATICO",
    [240, 0],
  );
  importLead.parameters = {
    method: "POST",
    url: "https://api.gpdevendas.app/api/integrations/v1/leads/facebook/auto",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Content-Type", value: "application/json" }],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: '={{ [$("VALIDAR PAYLOAD DO LEAD").item.json] }}',
    options: {},
  };
  importLead.credentials = { httpHeaderAuth: ingestionCredential };

  const nodes = [webhook, extract, fetchLead, mapFields, validate, importLead];
  const connections = {
    "RECEBER LEAD META": {
      main: [[{ node: "EXTRAIR EVENTO LEADGEN", type: "main", index: 0 }]],
    },
    "EXTRAIR EVENTO LEADGEN": {
      main: [
        [{ node: "BUSCAR DADOS DO LEAD NA META", type: "main", index: 0 }],
      ],
    },
    "BUSCAR DADOS DO LEAD NA META": {
      main: [[{ node: "MAPEAR CAMPOS DO LEAD", type: "main", index: 0 }]],
    },
    "MAPEAR CAMPOS DO LEAD": {
      main: [[{ node: "VALIDAR PAYLOAD DO LEAD", type: "main", index: 0 }]],
    },
    "VALIDAR PAYLOAD DO LEAD": {
      main: [
        [
          {
            node: "IMPORTAR LEAD - ROTEAMENTO AUTOMATICO",
            type: "main",
            index: 0,
          },
        ],
      ],
    },
  };

  return {
    name: source.name,
    nodes,
    connections,
    settings: publicWorkflowSettings(source.settings),
  };
}

function assertRefactored(workflow) {
  if (workflow.nodes.length !== 6) {
    throw new Error(`Quantidade inesperada de nodes: ${workflow.nodes.length}`);
  }

  const serialized = JSON.stringify({
    nodes: workflow.nodes,
    connections: workflow.connections,
  });
  const forbidden = [
    "99640561-bdb7-4bfb-9236-f27ecaedf538",
    "20bb5e36-1bbb-4f4e-956f-93e34969f2de",
    "PL_99640561BDB74BFB",
    "99640561BDB74BFB_LIGACAO",
    "99640561BDB74BFB_TENTATIVA_CONTATO",
    "108387448777036",
    "1158769897321849/messages",
  ];
  for (const value of forbidden) {
    if (serialized.includes(value)) {
      throw new Error(`Valor fixo ainda presente: ${value}`);
    }
  }

  const importNode = workflow.nodes.find(
    (node) => node.name === "IMPORTAR LEAD - ROTEAMENTO AUTOMATICO",
  );
  if (
    importNode?.parameters?.url !==
      "https://api.gpdevendas.app/api/integrations/v1/leads/facebook/auto" ||
    importNode?.credentials?.httpHeaderAuth?.id !== ingestionCredential.id
  ) {
    throw new Error("Endpoint ou credencial global de ingestao incorretos.");
  }
}

async function ensureBackup(source) {
  const existing = await request("/workflows?limit=250");
  const found = existing.data?.find((workflow) => workflow.name === backupName);
  if (found) return found;

  return request("/workflows", {
    method: "POST",
    body: JSON.stringify({
      name: backupName,
      nodes: source.nodes,
      connections: source.connections,
      settings: publicWorkflowSettings(source.settings),
    }),
  });
}

const source = await request(`/workflows/${workflowId}`);
const refactored = buildWorkflow(source);
assertRefactored(refactored);

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        workflow_id: workflowId,
        active: source.active,
        before_nodes: source.nodes.length,
        after_nodes: refactored.nodes.length,
        removed_nodes: source.nodes
          .map((node) => node.name)
          .filter(
            (name) =>
              !refactored.nodes.some(
                (node) =>
                  node.id ===
                  source.nodes.find((item) => item.name === name)?.id,
              ),
          ),
        target_endpoint:
          "https://api.gpdevendas.app/api/integrations/v1/leads/facebook/auto",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const backup = await ensureBackup(source);
const updated = await request(`/workflows/${workflowId}`, {
  method: "PUT",
  body: JSON.stringify(refactored),
});
const active = updated.active
  ? updated
  : await request(`/workflows/${workflowId}/activate`, { method: "POST" });
assertRefactored(active);

console.log(
  JSON.stringify(
    {
      workflow_id: active.id,
      workflow_name: active.name,
      active: active.active,
      nodes: active.nodes.length,
      backup_id: backup.id,
      backup_name: backup.name,
      backup_active: backup.active,
      updated_at: active.updatedAt,
    },
    null,
    2,
  ),
);
