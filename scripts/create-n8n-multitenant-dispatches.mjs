import { randomUUID } from "node:crypto";

const apiKey = process.env.N8N_API_KEY?.trim();
const apiUrl = (
  process.env.N8N_API_URL ?? "https://n9n.gridlabs.digital/api/v1"
).replace(/\/$/, "");
const apply = process.argv.includes("--apply");

if (!apiKey) throw new Error("Defina N8N_API_KEY somente no ambiente.");

const postgresCredential = {
  id: "KD4ayWlB35xCWXAq",
  name: "Postgres account",
};

const definitions = [
  {
    slug: "followup-6h",
    name: "DISPAROS MULTIEMPRESA - 01 Follow-up 6h",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_FOLLOWUP_6H",
    stage: "EM_CONTATO",
    targetStage: "LIGACAO",
    timing: "l.updated_at <= now() - interval '6 hours'",
    eventStatus: "e.status = 'active'::\"EventStatus\"",
  },
  {
    slug: "credencial-email",
    name: "DISPAROS MULTIEMPRESA - 02 Credencial Email",
    channel: "email",
    template: "CONFIGURAR_TEMPLATE_CREDENCIAL_EMAIL",
    stage: "PRESENCA_AGENDADA",
    targetStage: "ENVIAR_CONFIRMACAO",
    timing: "l.updated_at <= now() - interval '1 minute'",
    eventStatus: "e.status = 'active'::\"EventStatus\"",
  },
  {
    slug: "confirmacao-16h",
    name: "DISPAROS MULTIEMPRESA - 03 Confirmação 16h",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_CONFIRMACAO_16H",
    stage: "ENVIAR_CONFIRMACAO",
    targetStage: null,
    timing:
      "l.store_visit_datetime BETWEEN now() + interval '15 hours 55 minutes' AND now() + interval '16 hours 5 minutes'",
    eventStatus: "e.status = 'active'::\"EventStatus\"",
  },
  {
    slug: "aguardando-evento",
    name: "DISPAROS MULTIEMPRESA - 04 Preparar Aguardando",
    channel: "internal",
    template: "SEM_TEMPLATE_MOVIMENTACAO",
    stage: "AGENDADOS_CONFIRMADOS",
    targetStage: "AGUARDANDO",
    timing:
      "l.store_visit_datetime BETWEEN now() AND now() + interval '12 hours'",
    eventStatus: "e.status = 'active'::\"EventStatus\"",
  },
  {
    slug: "recuperacao-presenca",
    name: "DISPAROS MULTIEMPRESA - 05 Recuperação de Presença",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_RECUPERACAO_PRESENCA",
    stage: "LEAD_AUSENTE",
    targetStage: "RECUPERACAO_PRESENCA",
    timing: "l.updated_at <= now() - interval '1 minute'",
    eventStatus:
      "e.status IN ('active'::\"EventStatus\", 'completed'::\"EventStatus\")",
  },
  {
    slug: "feedback-vendedor-4h",
    name: "DISPAROS MULTIEMPRESA - 06 Feedback Vendedor 4h",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_FEEDBACK_VENDEDOR_4H",
    stage: "COMPRARAM",
    targetStage: "FEEDBACK",
    timing: "l.updated_at <= now() - interval '4 hours'",
    eventStatus:
      "e.status IN ('active'::\"EventStatus\", 'completed'::\"EventStatus\")",
  },
  {
    slug: "feedback-evento-24h",
    name: "DISPAROS MULTIEMPRESA - 07 Feedback Evento 24h",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_FEEDBACK_EVENTO_24H",
    stage: "FEEDBACK",
    targetStage: "RESPONDEU_FEEDBACK",
    timing: "l.updated_at <= now() - interval '24 hours'",
    eventStatus:
      "e.status IN ('active'::\"EventStatus\", 'completed'::\"EventStatus\")",
  },
  {
    slug: "recuperacao-venda-1m",
    name: "DISPAROS MULTIEMPRESA - 08 Recuperação de Venda 1m",
    channel: "whatsapp",
    template: "CONFIGURAR_TEMPLATE_RECUPERACAO_VENDA_1M",
    stage: "LEAD_PERDIDO",
    targetStage: "RECUPERACAO_VENDA",
    timing: "l.updated_at <= now() - interval '1 minute'",
    eventStatus:
      "e.status IN ('active'::\"EventStatus\", 'completed'::\"EventStatus\")",
  },
];

function node(name, type, position, parameters, extra = {}) {
  return {
    id: randomUUID(),
    name,
    type,
    typeVersion: type === "n8n-nodes-base.postgres" ? 2.6 : 2,
    position,
    parameters,
    ...extra,
  };
}

function candidateSql(def) {
  const channelColumns =
    def.channel === "whatsapp"
      ? `mas.phone_number_id, mc.access_token,`
      : `NULL::text AS phone_number_id, NULL::text AS access_token,`;
  const channelJoins =
    def.channel === "whatsapp"
      ? `JOIN LATERAL (
  SELECT s.phone_number_id, s.meta_connection_id
  FROM meta_asset_selections s
  WHERE s.meta_connection_id IN (
    SELECT id FROM meta_connections WHERE client_id = l.client_id AND status = 'connected'
  ) AND s.phone_number_id IS NOT NULL
  ORDER BY s.is_primary DESC, s.updated_at DESC
  LIMIT 1
) mas ON true
JOIN meta_connections mc ON mc.id = mas.meta_connection_id`
      : "";

  return `SELECT
  l.id AS lead_id,
  l.client_id,
  l.name AS lead_name,
  l.phone,
  l.email,
  l.store_visit_datetime,
  e.id AS event_id,
  e.name AS event_name,
  e.location AS event_location,
  e.status::text AS event_status,
  ${channelColumns}
  '${def.slug}:' || l.id || ':' || e.id AS dispatch_key
FROM leads l
JOIN events e ON e.id = l.event_interest_id
JOIN crm_stages cs ON cs.id = l.crm_stage_id
${channelJoins}
WHERE l.deleted_at IS NULL
  AND right(cs.code, length('_${def.stage}')) = '_${def.stage}'
  AND ${def.eventStatus}
  AND ${def.timing}
  AND NOT EXISTS (
    SELECT 1 FROM lead_timeline lt
    WHERE lt.lead_id = l.id
      AND lt.metadata->>'dispatch_key' = '${def.slug}:' || l.id || ':' || e.id
  )
ORDER BY l.updated_at ASC
LIMIT 100;`;
}

function buildWorkflow(def) {
  const schedule = node(
    "A cada 5 minutos",
    "n8n-nodes-base.scheduleTrigger",
    [0, 300],
    { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
  );
  const candidates = node(
    "Buscar candidatos multiempresa",
    "n8n-nodes-base.postgres",
    [260, 300],
    { operation: "executeQuery", query: candidateSql(def), options: {} },
    { credentials: { postgres: postgresCredential } },
  );
  const prepare = node(
    "Validar evento e preparar disparo",
    "n8n-nodes-base.code",
    [520, 300],
    {
      jsCode: `const cfg = ${JSON.stringify({
        dispatch_type: def.slug,
        channel: def.channel,
        template_name: def.template,
        template_language: "pt_BR",
        target_stage_suffix: def.targetStage,
      })};

return $input.all().map((item) => {
  const row = item.json;
  const allowedStatuses = cfg.dispatch_type.startsWith('feedback-') || cfg.dispatch_type.startsWith('recuperacao-')
    ? ['active', 'completed']
    : ['active'];
  if (!allowedStatuses.includes(row.event_status)) return null;
  if (cfg.channel !== 'internal' && cfg.template_name.startsWith('CONFIGURAR_')) return null;
  const hour = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
  }).format(new Date()));
  if (cfg.channel !== 'internal' && (hour < 8 || hour >= 23)) return null;
  return { json: { ...row, ...cfg } };
}).filter(Boolean);`,
    },
  );

  const nodes = [schedule, candidates, prepare];
  const connections = {
    [schedule.name]: { main: [[{ node: candidates.name, type: "main", index: 0 }]] },
    [candidates.name]: { main: [[{ node: prepare.name, type: "main", index: 0 }]] },
  };

  let previous = prepare;
  if (def.channel === "whatsapp") {
    const send = node(
      "Enviar template WhatsApp",
      "n8n-nodes-base.httpRequest",
      [780, 220],
      {
        method: "POST",
        url: "=https://graph.facebook.com/v23.0/{{ $json.phone_number_id }}/messages",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: "=Bearer {{ $json.access_token }}" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ { messaging_product: 'whatsapp', to: $json.phone, type: 'template', template: { name: $json.template_name, language: { code: $json.template_language } } } }}",
        options: {},
      },
    );
    nodes.push(send);
    connections[prepare.name] = {
      main: [[{ node: send.name, type: "main", index: 0 }]],
    };
    previous = send;
  } else if (def.channel === "email") {
    const placeholder = node(
      "Enviar e-mail pela API configurada",
      "n8n-nodes-base.code",
      [780, 300],
      {
        jsCode:
          "throw new Error('Configure o provedor/template de e-mail antes de ativar este workflow.');",
      },
    );
    nodes.push(placeholder);
    connections[prepare.name] = {
      main: [[{ node: placeholder.name, type: "main", index: 0 }]],
    };
    previous = placeholder;
  }

  const mark = node(
    "Registrar idempotência e mover etapa",
    "n8n-nodes-base.postgres",
    [1040, 300],
    {
      operation: "executeQuery",
      query: `WITH target AS (
  SELECT cs.id
  FROM crm_stages cs
  JOIN crm_pipelines cp ON cp.id = cs.pipeline_id
  WHERE cs.client_id = $1
    AND right(cs.code, length($4)) = $4
    AND cp.is_active = true
  LIMIT 1
), moved AS (
  UPDATE leads
  SET crm_stage_id = COALESCE((SELECT id FROM target), crm_stage_id), updated_at = now()
  WHERE id = $2
  RETURNING id
)
INSERT INTO lead_timeline (
  id, client_id, lead_id, event_type, origin, actor_label, notes, metadata, occurred_at, created_at
) VALUES (
  gen_random_uuid(), $1::uuid, $2::uuid, 'message', 'n8n',
  'Disparos multiempresa', $3,
  jsonb_build_object('dispatch_key', $5, 'dispatch_type', $6, 'template_name', $7),
  now(), now()
)
RETURNING id;`,
      options: {
        queryReplacement: `={{ [
  $('Validar evento e preparar disparo').item.json.client_id,
  $('Validar evento e preparar disparo').item.json.lead_id,
  'Disparo processado: ' + $('Validar evento e preparar disparo').item.json.dispatch_type,
  $('Validar evento e preparar disparo').item.json.target_stage_suffix ? '_' + $('Validar evento e preparar disparo').item.json.target_stage_suffix : '__SEM_ETAPA__',
  $('Validar evento e preparar disparo').item.json.dispatch_key,
  $('Validar evento e preparar disparo').item.json.dispatch_type,
  $('Validar evento e preparar disparo').item.json.template_name,
] }}`,
      },
    },
    { credentials: { postgres: postgresCredential } },
  );
  nodes.push(mark);
  connections[previous.name] = {
    main: [[{ node: mark.name, type: "main", index: 0 }]],
  };

  return {
    name: def.name,
    nodes,
    connections,
    settings: {
      executionOrder: "v1",
      timezone: "America/Sao_Paulo",
      saveDataErrorExecution: "none",
      saveDataSuccessExecution: "none",
      saveManualExecutions: false,
      availableInMCP: false,
    },
  };
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
    throw new Error(`n8n ${init.method ?? "GET"} ${path}: HTTP ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

const existing = await request("/workflows?limit=250");
const results = [];
for (const def of definitions) {
  const workflow = buildWorkflow(def);
  const found = existing.data?.find((item) => item.name === workflow.name);
  if (!apply) {
    results.push({ name: workflow.name, action: found ? "update" : "create", nodes: workflow.nodes.length });
    continue;
  }
  const saved = found
    ? await request(`/workflows/${found.id}`, { method: "PUT", body: JSON.stringify(workflow) })
    : await request("/workflows", { method: "POST", body: JSON.stringify(workflow) });
  if (saved.active) await request(`/workflows/${saved.id}/deactivate`, { method: "POST" });
  results.push({ id: saved.id, name: saved.name, active: false, nodes: saved.nodes.length });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", workflows: results }, null, 2));
