import { randomUUID } from "node:crypto";

const apiKey = process.env.N8N_API_KEY?.trim();
const apiUrl = (
  process.env.N8N_API_URL ?? "https://n9n.gridlabs.digital/api/v1"
).replace(/\/$/, "");
const apply = process.argv.includes("--apply");
const slugArg = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);
const automationKey = process.env.N8N_AUTOMATION_API_KEY?.trim();

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
    template: "__FREEFORM__",
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
  if (def.slug === "followup-6h") {
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
  conv.id AS conversation_id,
  latest.created_at AS latest_message_at,
  inbound.last_inbound_at,
  mas.phone_number_id,
  mc.access_token,
  'followup-6h:' || l.id || ':' || e.id AS dispatch_key
FROM leads l
JOIN events e ON e.id = l.event_interest_id
JOIN crm_stages cs ON cs.id = l.crm_stage_id
JOIN LATERAL (
  SELECT c.id, c.last_message_at, c.created_at
  FROM conversations c
  WHERE c.lead_id = l.id
    AND c.client_id = l.client_id
    AND c.channel = 'whatsapp'::"ConversationChannel"
  ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  LIMIT 1
) conv ON true
JOIN LATERAL (
  SELECT m.sender_type::text AS sender_type, m.created_at
  FROM messages m
  WHERE m.conversation_id = conv.id
  ORDER BY m.created_at DESC
  LIMIT 1
) latest ON true
JOIN LATERAL (
  SELECT max(m.created_at) AS last_inbound_at
  FROM messages m
  WHERE m.conversation_id = conv.id
    AND m.sender_type = 'lead'::"SenderType"
) inbound ON inbound.last_inbound_at IS NOT NULL
LEFT JOIN conversation_states state ON state.conversation_id = conv.id
JOIN LATERAL (
  SELECT s.phone_number_id, s.meta_connection_id
  FROM meta_asset_selections s
  WHERE s.meta_connection_id IN (
    SELECT id FROM meta_connections WHERE client_id = l.client_id AND status = 'connected'
  )
    AND s.phone_number_id IS NOT NULL
  ORDER BY s.is_primary DESC, s.updated_at DESC
  LIMIT 1
) mas ON true
JOIN meta_connections mc ON mc.id = mas.meta_connection_id
WHERE l.deleted_at IS NULL
  AND right(cs.code, length('_EM_CONTATO')) = '_EM_CONTATO'
  AND e.status = 'active'::"EventStatus"
  AND COALESCE(l.confirmation_status::text, 'pending') = 'pending'
  AND COALESCE(state.handoff_required, false) = false
  AND latest.sender_type IN ('system', 'user')
  AND latest.created_at <= now() - interval '6 hours'
  AND latest.created_at > now() - interval '24 hours'
  AND inbound.last_inbound_at > now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM lead_timeline lt
    WHERE lt.lead_id = l.id
      AND lt.metadata->>'dispatch_key' = 'followup-6h:' || l.id || ':' || e.id
  )
ORDER BY latest.created_at ASC
LIMIT 10;`;
  }
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
      jsCode: def.slug === "followup-6h" ? `const cfg = ${JSON.stringify({
        dispatch_type: def.slug,
        channel: def.channel,
        template_name: def.template,
        template_language: "pt_BR",
        target_stage_suffix: null,
      })};

const hour = Number(new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
}).format(new Date()));
if (hour < 8 || hour >= 23) return [];

return $input.all().map((item) => {
  const row = item.json;
  const firstName = String(row.lead_name || '').trim().split(/\s+/)[0];
  const greeting = firstName ? 'Oi, ' + firstName + '!' : 'Oi!';
  const messageText = greeting + ' Seu credenciamento para o ' + row.event_name +
    ' ficou pela metade. Quer continuar de onde parou para garantir sua vaga?';
  const phone = String(row.phone || '').replace(/\D/g, '');
  if (!phone || !row.conversation_id || !row.phone_number_id || !row.access_token) return null;
  return { json: { ...row, ...cfg, phone, message_text: messageText } };
}).filter(Boolean);` : `const cfg = ${JSON.stringify({
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
      def.slug === "followup-6h" ? "Enviar follow-up WhatsApp" : "Enviar template WhatsApp",
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
        jsonBody: def.slug === "followup-6h"
          ? "={{ { messaging_product: 'whatsapp', recipient_type: 'individual', to: $json.phone, type: 'text', text: { preview_url: false, body: $json.message_text } } }}"
          : "={{ { messaging_product: 'whatsapp', to: $json.phone, type: 'template', template: { name: $json.template_name, language: { code: $json.template_language } } } }}",
        options: {},
      },
    );
    nodes.push(send);
    connections[prepare.name] = {
      main: [[{ node: send.name, type: "main", index: 0 }]],
    };
    previous = send;
  } else if (def.channel === "email") {
    const sendEmail = node(
      "Enviar credencial pelo PainelGRID",
      "n8n-nodes-base.httpRequest",
      [780, 300],
      {
        method: "POST",
        url: "https://api.gpdevendas.app/api/integrations/v1/automations/credential-email",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "X-N8N-Automation-Key",
              value: automationKey || "CONFIGURAR_AUTOMATION_KEY",
            },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ { lead_id: $json.lead_id, dispatch_key: $json.dispatch_key } }}",
        options: {},
      },
    );
    nodes.push(sendEmail);
    connections[prepare.name] = {
      main: [[{ node: sendEmail.name, type: "main", index: 0 }]],
    };
    previous = sendEmail;
  }

  const mark = node(
    def.slug === "followup-6h" ? "Registrar follow-up e idempotência" : "Registrar idempotência e mover etapa",
    "n8n-nodes-base.postgres",
    [1040, 300],
    {
      operation: "executeQuery",
      query: def.slug === "followup-6h" ? `WITH recorded_message AS (
  INSERT INTO messages (
    id, conversation_id, sender_type, content, external_id, author_type,
    origin, workflow_key, created_at
  ) VALUES (
    gen_random_uuid(), $4::uuid, 'system'::"SenderType", $3, $5,
    'automation', 'n8n_followup', 'followup-6h', now()
  )
  ON CONFLICT (external_id) DO NOTHING
  RETURNING id
), updated_conversation AS (
  UPDATE conversations
  SET last_message_at = now()
  WHERE id = $4::uuid
  RETURNING id
)
INSERT INTO lead_timeline (
  id, client_id, lead_id, event_type, origin, actor_label, notes, metadata, occurred_at, created_at
) SELECT
  gen_random_uuid(), $1::uuid, $2::uuid, 'message', 'n8n',
  'Follow-up automático', 'Follow-up de 6 horas enviado',
  jsonb_build_object('dispatch_key', $6, 'dispatch_type', 'followup-6h', 'provider_message_id', $5),
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM lead_timeline
  WHERE lead_id = $2::uuid AND metadata->>'dispatch_key' = $6
)
RETURNING id;` : `WITH target AS (
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
) SELECT
  gen_random_uuid(), $1::uuid, $2::uuid, 'message', 'n8n',
  'Disparos multiempresa', $3,
  jsonb_build_object('dispatch_key', $5, 'dispatch_type', $6, 'template_name', $7),
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM lead_timeline
  WHERE lead_id = $2::uuid AND metadata->>'dispatch_key' = $5
)
RETURNING id;`,
      options: {
        queryReplacement: def.slug === "followup-6h" ? `={{ [
  $('Validar evento e preparar disparo').item.json.client_id,
  $('Validar evento e preparar disparo').item.json.lead_id,
  $('Validar evento e preparar disparo').item.json.message_text,
  $('Validar evento e preparar disparo').item.json.conversation_id,
  $json.messages?.[0]?.id || ('followup-6h-' + $('Validar evento e preparar disparo').item.json.lead_id + '-' + Date.now()),
  $('Validar evento e preparar disparo').item.json.dispatch_key,
] }}` : `={{ [
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
      saveDataErrorExecution: def.slug === "followup-6h" ? "all" : "none",
      saveDataSuccessExecution: def.slug === "followup-6h" ? "all" : "none",
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
const selectedDefinitions = slugArg ? definitions.filter((def) => def.slug === slugArg) : definitions;
if (slugArg && selectedDefinitions.length === 0) throw new Error(`Workflow desconhecido: ${slugArg}`);
for (const def of selectedDefinitions) {
  const workflow = buildWorkflow(def);
  const found = existing.data?.find((item) => item.name === workflow.name);
  if (!apply) {
    results.push({ name: workflow.name, action: found ? "update" : "create", nodes: workflow.nodes.length });
    continue;
  }
  const saved = found
    ? await request(`/workflows/${found.id}`, { method: "PUT", body: JSON.stringify(workflow) })
    : await request("/workflows", { method: "POST", body: JSON.stringify(workflow) });
  const shouldRemainActive = Boolean(found?.active);
  let active = Boolean(saved.active);
  if (shouldRemainActive && !active) {
    const activated = await request(`/workflows/${saved.id}/activate`, { method: "POST" });
    active = Boolean(activated.active);
  }
  results.push({ id: saved.id, name: saved.name, active, nodes: saved.nodes.length });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", workflows: results }, null, 2));
