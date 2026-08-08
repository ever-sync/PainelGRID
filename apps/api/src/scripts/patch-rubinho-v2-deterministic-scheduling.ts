type WorkflowNode = {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

type Workflow = {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
};

const baseUrl =
  process.env.N8N_BASE_URL ?? "https://n9n.gridlabs.digital/api/v1";
const apiKey = process.env.N8N_API_KEY;
const targetId = process.env.N8N_TARGET_WORKFLOW_ID;
const automationSourceId =
  process.env.N8N_AUTOMATION_SOURCE_WORKFLOW_ID ?? "BFOlwmNldv2rWGnM";

if (!apiKey || !targetId) {
  throw new Error("N8N_API_KEY e N8N_TARGET_WORKFLOW_ID sao obrigatorios");
}
const safeApiKey = apiKey;
const safeTargetId = targetId;

async function n8n<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": safeApiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`n8n ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

function node(workflow: Workflow, name: string) {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) throw new Error(`No nao encontrado: ${name}`);
  return found;
}

function automationKeyFrom(workflow: Workflow) {
  for (const current of workflow.nodes) {
    const parameters = current.parameters as {
      headerParameters?: {
        parameters?: Array<{ name?: string; value?: string }>;
      };
    };
    const header = parameters.headerParameters?.parameters?.find(
      (item) => item.name?.toLowerCase() === "x-n8n-automation-key",
    );
    if (header?.value) return header.value;
  }
  throw new Error("Chave de automacao nao encontrada no workflow de origem");
}

const validatorCode = String.raw`const response = $json;
const lead = response.items?.[0] ?? response;
const originalOutput = $('AI Agent1').item.json.output ?? '';
const pre = $('V2 - ESTADO PRONTO').item.json.v2_state ?? {};
const preStep = pre.current_step ?? null;
const incoming = String($('V2 - NORMALIZAR ENTRADA').item.json.v2_context.message_text ?? '').trim();
const eventDays = $('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.event_days_iso ?? [];
const claimsFinal = /credencial\s+(foi\s+)?confirmad|qr\s*code|parab[eé]ns pela sua decis[aã]o/i.test(originalOutput);
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const normalizedIncoming = normalize(incoming);
const localParts = (value) => {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date),
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date),
    weekday: normalize(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(date)),
  };
};
const candidates = new Set();
if (preStep === 'WAITING_EVENT_DATE') {
  eventDays.forEach((option, index) => {
    const parts = localParts(option.start);
    const dayNumber = String(Number(parts.day));
    const numericTokens = normalizedIncoming.match(/\b(?:[0-2]?\d|3[01])\b/g) ?? [];
    const dateWithoutYear = parts.date.slice(0, 5);
    const ordinal = index === 0 ? /\b(primeir[oa]|1a?)\s+(data|dia|opcao)\b/ : index === 1 ? /\b(segund[oa]|2a?)\s+(data|dia|opcao)\b/ : /\b(terceir[oa]|3a?)\s+(data|dia|opcao)\b/;
    const storedMatches = lead.store_visit_datetime && new Date(lead.store_visit_datetime).toISOString() === new Date(option.start).toISOString();
    if (
      numericTokens.includes(parts.day) ||
      numericTokens.includes(dayNumber) ||
      normalizedIncoming.includes(parts.date) ||
      normalizedIncoming.includes(dateWithoutYear) ||
      normalizedIncoming.includes(parts.weekday) ||
      ordinal.test(normalizedIncoming) ||
      storedMatches
    ) candidates.add(index);
  });
}
const selectedIndex = candidates.size === 1 ? [...candidates][0] : null;
const selected = selectedIndex === null ? null : eventDays[selectedIndex];

const companionsText = String(lead.companions ?? '').trim();
const companionCount = Number(companionsText.match(/^(\d+)/)?.[1] ?? 0);
const noCompanions = /sem acompanhantes?/i.test(companionsText);
const companionNamesPending = companionCount > 0 && (!companionsText.includes(':') || /nomes? (ainda )?n[aã]o informado/i.test(companionsText));
const description = String(lead.description ?? '').trim().toLowerCase();
const hasFullName = Boolean(lead.first_name?.trim() && lead.last_name?.trim());
const hasCompanions = Boolean(companionsText);
const hasDate = Boolean(lead.store_visit_datetime);
const hasTrade = description.startsWith('carro na troca:');
const tradeYes = description.includes('carro na troca: sim');
const hasPlate = Boolean(lead.vehicle_plate?.trim());
let postStep;
if (!hasFullName) postStep = 'WAITING_FULL_NAME';
else if (!hasCompanions) postStep = 'WAITING_COMPANIONS';
else if (!noCompanions && companionNamesPending) postStep = 'WAITING_COMPANION_NAMES';
else if (!hasDate) postStep = 'WAITING_EVENT_DATE';
else if (!hasTrade) postStep = 'WAITING_TRADE_IN';
else if (tradeYes && !hasPlate) postStep = 'WAITING_VEHICLE_PLATE';
else postStep = 'WAITING_FINAL_CONFIRMATION';

const expected = {
  WAITING_FULL_NAME: { regex: /nome completo/i, text: 'Falaa! Pra continuar seu credenciamento, me informa seu nome completo?' },
  WAITING_COMPANIONS: { regex: /acompanhant/i, text: 'Top! Quantos acompanhantes você vai levar para o evento?' },
  WAITING_COMPANION_NAMES: { regex: /(nome.*acompanh|nome completo.*(vai|vem|com você)|quem vai)/i, text: 'Top! Qual é o nome completo de quem vai com você?' },
  WAITING_EVENT_DATE: { regex: /(qual.*(data|dia)|data.*prefere|dia.*prefere)/i, text: 'Top! Qual data do evento você prefere?' },
  WAITING_TRADE_IN: { regex: /(carro.*troca|troca.*carro)/i, text: 'Show! Outro ponto importante: você vai dar um carro na troca?' },
  WAITING_VEHICLE_PLATE: { regex: /placa/i, text: 'Blz, qual é a placa do seu veículo?' },
  WAITING_FINAL_CONFIRMATION: { regex: /(tudo correto|está tudo correto|confirma.*resumo)/i, text: 'Anotado aqui. Está tudo correto?' },
};

const missing = [];
if (!hasFullName) missing.push('nome completo');
if (!hasCompanions) missing.push('acompanhantes');
if (!hasDate) missing.push('data da visita');
if (!hasTrade) missing.push('resposta sobre carro na troca');
if (tradeYes && !hasPlate) missing.push('placa do veículo');
let output = originalOutput;
let blocked = false;
const autoSchedule = selected ? {
  should_schedule: true,
  scheduled_at: new Date(selected.start).toISOString(),
  display_start: localParts(selected.start).date,
  display_range: $('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.event_days,
} : { should_schedule: false, ambiguous: candidates.size > 1 };

if (preStep === 'WAITING_EVENT_DATE' && candidates.size > 1) {
  blocked = true;
  output = 'Você indicou mais de uma data. Qual delas você prefere?';
} else if (!autoSchedule.should_schedule) {
  const rule = expected[postStep];
  if (rule && !rule.regex.test(output)) {
    blocked = true;
    output = rule.text;
  }
}

if (claimsFinal) {
  if (missing.length) {
    blocked = true;
    const key = missing[0];
    output = key === 'nome completo' ? expected.WAITING_FULL_NAME.text : key === 'acompanhantes' ? expected.WAITING_COMPANIONS.text : key === 'data da visita' ? expected.WAITING_EVENT_DATE.text : key === 'resposta sobre carro na troca' ? expected.WAITING_TRADE_IN.text : expected.WAITING_VEHICLE_PLATE.text;
  } else {
    const finalized = ['scheduled','confirmed'].includes(lead.confirmation_status) && String(lead.crm_stage_code ?? '').endsWith('_PRESENCA_AGENDADA') && Boolean(lead.active_appointment?.id);
    if (!finalized) {
      blocked = true;
      output = 'Não consegui concluir seu credenciamento agora. Seus dados continuam salvos com segurança.';
    } else {
      blocked = false;
      output = originalOutput;
    }
  }
}
return { json: { ...lead, output, validator_claims_final: claimsFinal, validator_missing: missing, validator_blocked: blocked, validator_needs_status: false, validator_needs_move: false, v2_expected_step: postStep, v2_auto_schedule: autoSchedule } };`;

const deriveStateCode = String.raw`const context = $json;
const lead = $('V2 - VALIDAR ESCOPO LEAD EVENTO').item.json.items?.[0] ?? {};
const conversation = context.conversation;
const previous = context.conversation_state?.state_payload ?? {};
const trade = String(lead.description ?? '').trim().toLowerCase();
const hasFullName = Boolean(lead.first_name?.trim() && lead.last_name?.trim());
const companionsText = String(lead.companions ?? '').trim();
const hasCompanions = Boolean(companionsText);
const companionCount = Number(companionsText.match(/^(\d+)/)?.[1] ?? 0);
const noCompanions = /sem acompanhantes?/i.test(companionsText);
const companionNamesPending = companionCount > 0 && (!companionsText.includes(':') || /nomes? (ainda )?n[aã]o informado/i.test(companionsText));
const hasDate = Boolean(lead.store_visit_datetime);
const hasTradeAnswer = trade.startsWith('carro na troca:');
const tradeYes = trade.includes('carro na troca: sim');
const hasPlate = Boolean(lead.vehicle_plate?.trim());
let currentStep;
if (context.flags?.handoff_required) currentStep = 'HUMAN_HANDOFF';
else if (lead.confirmation_status === 'cancelled') currentStep = 'CANCELLED';
else if (previous.current_step === 'COMPLETED' || ['confirmed','checked_in','closed'].includes(lead.confirmation_status)) currentStep = 'COMPLETED';
else if (!hasFullName) currentStep = 'WAITING_FULL_NAME';
else if (!hasCompanions) currentStep = 'WAITING_COMPANIONS';
else if (!noCompanions && companionNamesPending) currentStep = 'WAITING_COMPANION_NAMES';
else if (!hasDate) currentStep = 'WAITING_EVENT_DATE';
else if (!hasTradeAnswer) currentStep = 'WAITING_TRADE_IN';
else if (tradeYes && !hasPlate) currentStep = 'WAITING_VEHICLE_PLATE';
else currentStep = 'WAITING_FINAL_CONFIRMATION';
const pendingQuestions = {WAITING_FULL_NAME:'Qual é o seu nome completo?',WAITING_COMPANIONS:'Quantos acompanhantes você vai levar?',WAITING_COMPANION_NAMES:'Qual é o nome completo de cada acompanhante?',WAITING_EVENT_DATE:'Qual dia do evento você prefere?',WAITING_TRADE_IN:'Você pretende dar algum carro na troca?',WAITING_VEHICLE_PLATE:'Qual é a placa do veículo?',WAITING_FINAL_CONFIRMATION:'Está tudo correto?',COMPLETED:null,CANCELLED:null,HUMAN_HANDOFF:null};
const collected = {full_name:hasFullName,companions:hasCompanions,companion_names:hasCompanions&&!companionNamesPending,event_date:hasDate,trade_in_answer:hasTradeAnswer,vehicle_plate:hasPlate,vehicle_details:!tradeYes||hasPlate};
const missing=[];
if(!hasFullName)missing.push('full_name'); if(!hasCompanions)missing.push('companions'); if(hasCompanions&&companionNamesPending)missing.push('companion_names'); if(!hasDate)missing.push('event_date'); if(!hasTradeAnswer)missing.push('trade_in_answer'); if(tradeYes&&!hasPlate)missing.push('vehicle_plate');
return [{json:{...context,v2_conversation_id:conversation?.id??null,v2_state_update:{current_intent:'credentialing',awaiting_confirmation:currentStep==='WAITING_FINAL_CONFIRMATION',last_offered_event_id:lead.event_id??lead.event_interest_id??null,last_offered_slot:lead.store_visit_datetime??null,last_agent_action:previous.last_agent_action??null,handoff_required:context.flags?.handoff_required??false,handoff_reason:context.conversation_state?.handoff_reason??null,state_payload:{version:2,current_step:currentStep,pending_question:pendingQuestions[currentStep],collected_fields:collected,missing_fields:missing,last_customer_intent:previous.last_customer_intent??null,last_agent_action:previous.last_agent_action??null,last_tool_result:previous.last_tool_result??null,conversation_status:currentStep,retry_count:Number(previous.retry_count??0),last_message_id:$('V2 - NORMALIZAR ENTRADA').item.json.v2_context.message_id,updated_by:'rubinho_v2_pre_turn'}}}}];`;

const postStateCode = String.raw`const validated = $json;
const lead = validated;
const trade=String(lead.description??'').trim().toLowerCase(), companionsText=String(lead.companions??'').trim(), companionCount=Number(companionsText.match(/^(\d+)/)?.[1]??0), noCompanions=/sem acompanhantes?/i.test(companionsText), companionNamesPending=companionCount>0&&(!companionsText.includes(':')||/nomes? (ainda )?n[aã]o informado/i.test(companionsText));
const hasFullName=Boolean(lead.first_name?.trim()&&lead.last_name?.trim()), hasCompanions=Boolean(companionsText), hasDate=Boolean(lead.store_visit_datetime), hasTrade=trade.startsWith('carro na troca:'), tradeYes=trade.includes('carro na troca: sim'), hasPlate=Boolean(lead.vehicle_plate?.trim());
const completeData=hasFullName&&hasCompanions&&!companionNamesPending&&hasDate&&hasTrade&&(!tradeYes||hasPlate);
const finalized=lead.validator_claims_final===true&&!lead.validator_blocked&&completeData&&Boolean(lead.active_appointment?.id)&&['scheduled','confirmed'].includes(lead.confirmation_status);
let step;
if(lead.confirmation_status==='cancelled')step='CANCELLED'; else if(finalized)step='COMPLETED'; else if(!hasFullName)step='WAITING_FULL_NAME'; else if(!hasCompanions)step='WAITING_COMPANIONS'; else if(!noCompanions&&companionNamesPending)step='WAITING_COMPANION_NAMES'; else if(!hasDate)step='WAITING_EVENT_DATE'; else if(!hasTrade)step='WAITING_TRADE_IN'; else if(tradeYes&&!hasPlate)step='WAITING_VEHICLE_PLATE'; else step='WAITING_FINAL_CONFIRMATION';
const q={WAITING_FULL_NAME:'Qual é o seu nome completo?',WAITING_COMPANIONS:'Quantos acompanhantes você vai levar?',WAITING_COMPANION_NAMES:'Qual é o nome completo de cada acompanhante?',WAITING_EVENT_DATE:'Qual dia do evento você prefere?',WAITING_TRADE_IN:'Você pretende dar algum carro na troca?',WAITING_VEHICLE_PLATE:'Qual é a placa do veículo?',WAITING_FINAL_CONFIRMATION:'Está tudo correto?',COMPLETED:null,CANCELLED:null};
const pre=$('V2 - ESTADO PRONTO').item.json.v2_state??{};
const payload={version:2,current_step:step,pending_question:q[step],collected_fields:{full_name:hasFullName,companions:hasCompanions,companion_names:hasCompanions&&!companionNamesPending,event_date:hasDate,trade_in_answer:hasTrade,vehicle_plate:hasPlate,vehicle_details:!tradeYes||hasPlate},missing_fields:[...(lead.validator_missing??[]),...(companionNamesPending?['companion_names']:[])],last_customer_intent:pre.last_customer_intent??null,last_agent_action:validated.v2_qr_delivery?.status==='sent'?'checkin_notification_sent':validated.v2_qr_delivery?.status==='failed'?'checkin_notification_failed':lead.v2_auto_schedule_result==='scheduled'?'scheduled_date_reconciled':lead.validator_claims_final?'final_confirmation':step,last_tool_result:validated.v2_qr_delivery?.status??(lead.validator_blocked?'blocked':'success'),conversation_status:step,retry_count:(lead.validator_blocked||validated.v2_qr_delivery?.status==='failed')?Number(pre.retry_count??0)+1:0,last_message_id:$('V2 - NORMALIZAR ENTRADA').item.json.v2_context.message_id,updated_by:'rubinho_v2_post_turn'};
return [{json:{...validated,v2_post_state_update:{current_intent:'credentialing',awaiting_confirmation:step==='WAITING_FINAL_CONFIRMATION',last_offered_event_id:lead.event_id??lead.event_interest_id??null,last_offered_slot:lead.store_visit_datetime??null,last_agent_action:payload.last_agent_action,handoff_required:false,state_payload:payload}}}];`;

const validateScheduledCode = String.raw`const base=$('VALIDADOR - ANALISAR').item.json;
const appointment=$json.appointment??null;
if(!$json.reconciled||!appointment?.id){
  return [{json:{...base,output:'Não consegui registrar essa data agora. Qual data do evento você prefere?',validator_blocked:true,v2_auto_schedule_result:'failed'}}];
}
const selectedAt=base.v2_auto_schedule.scheduled_at;
const date=new Date(selectedAt);
const display=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(date);
const location=$('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.location;
return [{json:{...base,store_visit_datetime:selectedAt,confirmation_status:'scheduled',crm_stage_code:String(base.crm_stage_code??'').replace(/_[^_]+$/,'_PRESENCA_AGENDADA'),active_appointment:appointment,output:'Show, você escolheu '+display+'. O endereço do evento é '+location+'. Outro ponto importante: você vai dar um carro na troca?',validator_blocked:false,v2_auto_schedule_result:'scheduled'}}];`;

async function main() {
  const [workflow, automationSource] = await Promise.all([
    n8n<Workflow>(`/workflows/${safeTargetId}`),
    n8n<Workflow>(`/workflows/${automationSourceId}`),
  ]);
  const automationKey = automationKeyFrom(automationSource);

  node(workflow, "VALIDADOR - ANALISAR").parameters = { jsCode: validatorCode };
  node(workflow, "V2 - DERIVAR ESTADO").parameters = {
    jsCode: deriveStateCode,
  };
  node(workflow, "V2 - CALCULAR ESTADO POS TURNO").parameters = {
    jsCode: postStateCode,
  };

  const agent = node(workflow, "AI Agent1");
  const options = agent.parameters.options as { systemMessage: string };
  options.systemMessage = options.systemMessage
    .replace(
      "Ao receber a escolha, salve exatamente o start correspondente de event_days_iso. Nunca invente nem calcule uma data.",
      "Ao receber a escolha, o fluxo determinístico registra a data, cria ou reutiliza o agendamento, altera o status para Agendado e move o card para Presença agendada. Não repita essas operações e não anuncie a movimentação interna.",
    )
    .replace(
      "9. Nunca chame `mover_lead_crm` com `PRESENCA_AGENDADA`; `finalizar_credenciamento` executa agendamento, status e etapa de forma transacional.",
      "9. Nunca chame `mover_lead_crm` com `PRESENCA_AGENDADA`; a data escolhida já é reconciliada de forma transacional pelo fluxo.",
    )
    .replace(
      "Cria o agendamento, sincroniza data e evento, altera o status para scheduled e move o CRM para PRESENCA_AGENDADA em uma operação transacional e idempotente.",
      "Revalida de forma idempotente o agendamento já criado na escolha da data e libera a entrega controlada da credencial.",
    );

  const finalizer = node(workflow, "finalizar_credenciamento");
  finalizer.parameters = {
    toolDescription:
      "Use somente em WAITING_FINAL_CONFIRMATION após confirmação clara do resumo. Revalida o agendamento já criado na escolha da data e retorna o agendamento ativo. Se retornar erro, não anuncie confirmação.",
    method: "POST",
    url: "https://api.gpdevendas.app/api/integrations/v1/automations/reconcile-scheduled-lead",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "X-N8N-Automation-Key", value: automationKey },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ { lead_id: $('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.items[0].id, scheduled_at: $('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.items[0].store_visit_datetime, dispatch_key: 'lead-scheduled-email:' + $('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.items[0].id + ':' + new Date($('RESUMO DO LEAD/EVENTO/RUBINHO').item.json.items[0].store_visit_datetime).toISOString() } }}",
    options: {},
  };
  delete finalizer.credentials;

  const additions: WorkflowNode[] = [
    {
      id: "v2-date-selected-if",
      name: "V2 - DATA ESCOLHIDA?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [3296, 640],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 3,
          },
          conditions: [
            {
              id: "v2-date-selected-condition",
              leftValue:
                "={{ $json.v2_auto_schedule.should_schedule === true }}",
              rightValue: true,
              operator: {
                type: "boolean",
                operation: "true",
                singleValue: true,
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      id: "v2-reconcile-selected-date",
      name: "V2 - AGENDAR DATA ESCOLHIDA",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [3520, 672],
      parameters: {
        method: "POST",
        url: "https://api.gpdevendas.app/api/integrations/v1/automations/reconcile-scheduled-lead",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "X-N8N-Automation-Key", value: automationKey },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ { lead_id: $('VALIDADOR - ANALISAR').item.json.id, scheduled_at: $('VALIDADOR - ANALISAR').item.json.v2_auto_schedule.scheduled_at, dispatch_key: 'lead-scheduled-email:' + $('VALIDADOR - ANALISAR').item.json.id + ':' + $('VALIDADOR - ANALISAR').item.json.v2_auto_schedule.scheduled_at } }}",
        options: {},
      },
    },
    {
      id: "v2-validate-selected-date",
      name: "V2 - VALIDAR AGENDAMENTO DA DATA",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3744, 672],
      parameters: { jsCode: validateScheduledCode },
    },
  ];
  workflow.nodes = workflow.nodes.filter(
    (item) => !additions.some((addition) => addition.name === item.name),
  );
  workflow.nodes.push(...additions);

  workflow.connections["VALIDADOR - ANALISAR"] = {
    main: [[{ node: "V2 - DATA ESCOLHIDA?", type: "main", index: 0 }]],
  };
  workflow.connections["V2 - DATA ESCOLHIDA?"] = {
    main: [
      [{ node: "V2 - AGENDAR DATA ESCOLHIDA", type: "main", index: 0 }],
      [{ node: "V2 - DEVE ENVIAR QRCODE?", type: "main", index: 0 }],
    ],
  };
  workflow.connections["V2 - AGENDAR DATA ESCOLHIDA"] = {
    main: [
      [{ node: "V2 - VALIDAR AGENDAMENTO DA DATA", type: "main", index: 0 }],
    ],
  };
  workflow.connections["V2 - VALIDAR AGENDAMENTO DA DATA"] = {
    main: [
      [{ node: "V2 - CALCULAR ESTADO POS TURNO", type: "main", index: 0 }],
    ],
  };

  await n8n(`/workflows/${safeTargetId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: {},
    }),
  });
  console.log(
    JSON.stringify({
      workflow_id: safeTargetId,
      nodes: workflow.nodes.length,
      patched: true,
    }),
  );
}

main();
