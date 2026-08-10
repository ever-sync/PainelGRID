type WorkflowNode = {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  webhookId?: string;
};

type Workflow = {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

const baseUrl =
  process.env.N8N_BASE_URL ?? "https://n9n.gridlabs.digital/api/v1";
const apiKey = process.env.N8N_API_KEY;
const sourceId =
  process.env.N8N_SOURCE_WORKFLOW_ID ??
  process.env.N8N_TARGET_WORKFLOW_ID ??
  "rQ92Kohukkw7X7ex";
const targetId = process.env.N8N_TARGET_WORKFLOW_ID;
const allowUpdateExisting = process.env.N8N_ALLOW_UPDATE_EXISTING === "true";
const automationSourceId =
  process.env.N8N_AUTOMATION_SOURCE_WORKFLOW_ID ?? "BFOlwmNldv2rWGnM";

if (!apiKey) {
  throw new Error("N8N_API_KEY e obrigatoria");
}
const safeApiKey = apiKey;

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
const formatEventDateQuestion = () => {
  const lines = eventDays.map((option) => {
    const start = new Date(option.start);
    const end = option.end ? new Date(option.end) : null;
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(start);
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(start);
    const startTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(start);
    const endTime = end && !Number.isNaN(end.getTime()) ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(end) : null;
    return '• ' + date + ' (' + weekday.charAt(0).toUpperCase() + weekday.slice(1) + '), das ' + startTime + (endTime ? ' às ' + endTime : '');
  });
  if (!lines.length) return 'Não encontrei as datas disponíveis agora. Você pode tentar novamente?';
  return 'Top! Agora escolha uma data para o credenciamento:\n\n' + lines.join('\n') + '\n\nQual data você prefere?';
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
const alreadyCompleted = preStep === 'COMPLETED' || ['confirmed','checked_in','closed'].includes(String(lead.confirmation_status ?? ''));
let postStep;
if (alreadyCompleted) postStep = 'COMPLETED';
else if (!hasFullName) postStep = 'WAITING_FULL_NAME';
else if (!hasDate) postStep = 'WAITING_EVENT_DATE';
else if (!hasCompanions) postStep = 'WAITING_COMPANIONS';
else if (!noCompanions && companionNamesPending) postStep = 'WAITING_COMPANION_NAMES';
else if (!hasTrade) postStep = 'WAITING_TRADE_IN';
else if (tradeYes && !hasPlate) postStep = 'WAITING_VEHICLE_PLATE';
else postStep = 'WAITING_FINAL_CONFIRMATION';

const expected = {
  WAITING_FULL_NAME: { regex: /nome completo/i, text: 'Falaa! Pra continuar seu credenciamento, me informa seu nome completo?' },
  WAITING_COMPANIONS: { regex: /acompanhant/i, text: 'Top! Quantos acompanhantes você vai levar para o evento?' },
  WAITING_COMPANION_NAMES: { regex: /(nome.*acompanh|nome completo.*(vai|vem|com você)|quem vai)/i, text: 'Top! Qual é o nome completo de quem vai com você?' },
  WAITING_EVENT_DATE: { regex: /(qual.*(data|dia)|data.*prefere|dia.*prefere)/i, text: formatEventDateQuestion() },
  WAITING_TRADE_IN: { regex: /(carro.*troca|troca.*carro)/i, text: 'Show! Outro ponto importante: você vai dar um carro na troca?' },
  WAITING_VEHICLE_PLATE: { regex: /placa/i, text: 'Blz, qual é a placa do seu veículo?' },
  WAITING_FINAL_CONFIRMATION: { regex: /(tudo correto|está tudo correto|confirma.*resumo)/i, text: 'Anotado aqui. Está tudo correto?' },
};

const missing = [];
if (!hasFullName) missing.push('nome completo');
if (!hasDate) missing.push('data da visita');
if (!hasCompanions) missing.push('acompanhantes');
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
} else if (!alreadyCompleted && !autoSchedule.should_schedule) {
  const rule = expected[postStep];
  const outputNormalized = normalize(output);
  const containsConfiguredDate = eventDays.some((option) => {
    const parts = localParts(option.start);
    return outputNormalized.includes(parts.date) || outputNormalized.includes(parts.date.slice(0, 5));
  });
  const validForStep = rule && rule.regex.test(output) && (postStep !== 'WAITING_EVENT_DATE' || containsConfiguredDate);
  if (rule && !validForStep) {
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
else if (!hasDate) currentStep = 'WAITING_EVENT_DATE';
else if (!hasCompanions) currentStep = 'WAITING_COMPANIONS';
else if (!noCompanions && companionNamesPending) currentStep = 'WAITING_COMPANION_NAMES';
else if (!hasTradeAnswer) currentStep = 'WAITING_TRADE_IN';
else if (tradeYes && !hasPlate) currentStep = 'WAITING_VEHICLE_PLATE';
else currentStep = 'WAITING_FINAL_CONFIRMATION';
const pendingQuestions = {WAITING_FULL_NAME:'Qual é o seu nome completo?',WAITING_COMPANIONS:'Quantos acompanhantes você vai levar?',WAITING_COMPANION_NAMES:'Qual é o nome completo de cada acompanhante?',WAITING_EVENT_DATE:'Qual dia do evento você prefere?',WAITING_TRADE_IN:'Você pretende dar algum carro na troca?',WAITING_VEHICLE_PLATE:'Qual é a placa do veículo?',WAITING_FINAL_CONFIRMATION:'Está tudo correto?',COMPLETED:null,CANCELLED:null,HUMAN_HANDOFF:null};
const collected = {full_name:hasFullName,companions:hasCompanions,companion_names:hasCompanions&&!companionNamesPending,event_date:hasDate,trade_in_answer:hasTradeAnswer,vehicle_plate:hasPlate,vehicle_details:!tradeYes||hasPlate};
const missing=[];
if(!hasFullName)missing.push('full_name'); if(!hasDate)missing.push('event_date'); if(!hasCompanions)missing.push('companions'); if(hasCompanions&&companionNamesPending)missing.push('companion_names'); if(!hasTradeAnswer)missing.push('trade_in_answer'); if(tradeYes&&!hasPlate)missing.push('vehicle_plate');
return [{json:{...context,v2_conversation_id:conversation?.id??null,v2_state_update:{current_intent:'credentialing',awaiting_confirmation:currentStep==='WAITING_FINAL_CONFIRMATION',last_offered_event_id:lead.event_id??lead.event_interest_id??null,last_offered_slot:lead.store_visit_datetime??null,last_agent_action:previous.last_agent_action??null,handoff_required:context.flags?.handoff_required??false,handoff_reason:context.conversation_state?.handoff_reason??null,state_payload:{version:2,current_step:currentStep,pending_question:pendingQuestions[currentStep],collected_fields:collected,missing_fields:missing,last_customer_intent:previous.last_customer_intent??null,last_agent_action:previous.last_agent_action??null,last_tool_result:previous.last_tool_result??null,conversation_status:currentStep,retry_count:Number(previous.retry_count??0),last_message_id:$('V2 - NORMALIZAR ENTRADA').item.json.v2_context.message_id,updated_by:'rubinho_v2_pre_turn'}}}}];`;

const postStateCode = String.raw`const validated = $json;
const lead = validated;
const pre=$('V2 - ESTADO PRONTO').item.json.v2_state??{};
const trade=String(lead.description??'').trim().toLowerCase(), companionsText=String(lead.companions??'').trim(), companionCount=Number(companionsText.match(/^(\d+)/)?.[1]??0), noCompanions=/sem acompanhantes?/i.test(companionsText), companionNamesPending=companionCount>0&&(!companionsText.includes(':')||/nomes? (ainda )?n[aã]o informado/i.test(companionsText));
const hasFullName=Boolean(lead.first_name?.trim()&&lead.last_name?.trim()), hasCompanions=Boolean(companionsText), hasDate=Boolean(lead.store_visit_datetime), hasTrade=trade.startsWith('carro na troca:'), tradeYes=trade.includes('carro na troca: sim'), hasPlate=Boolean(lead.vehicle_plate?.trim());
const completeData=hasFullName&&hasCompanions&&!companionNamesPending&&hasDate&&hasTrade&&(!tradeYes||hasPlate);
const wasCompleted=pre.current_step==='COMPLETED'||['confirmed','checked_in','closed'].includes(String(lead.confirmation_status??''));
const finalized=wasCompleted||(lead.validator_claims_final===true&&!lead.validator_blocked&&completeData&&Boolean(lead.active_appointment?.id)&&['scheduled','confirmed'].includes(lead.confirmation_status));
let step;
if(lead.confirmation_status==='cancelled')step='CANCELLED'; else if(finalized)step='COMPLETED'; else if(!hasFullName)step='WAITING_FULL_NAME'; else if(!hasDate)step='WAITING_EVENT_DATE'; else if(!hasCompanions)step='WAITING_COMPANIONS'; else if(!noCompanions&&companionNamesPending)step='WAITING_COMPANION_NAMES'; else if(!hasTrade)step='WAITING_TRADE_IN'; else if(tradeYes&&!hasPlate)step='WAITING_VEHICLE_PLATE'; else step='WAITING_FINAL_CONFIRMATION';
const q={WAITING_FULL_NAME:'Qual é o seu nome completo?',WAITING_COMPANIONS:'Quantos acompanhantes você vai levar?',WAITING_COMPANION_NAMES:'Qual é o nome completo de cada acompanhante?',WAITING_EVENT_DATE:'Qual dia do evento você prefere?',WAITING_TRADE_IN:'Você pretende dar algum carro na troca?',WAITING_VEHICLE_PLATE:'Qual é a placa do veículo?',WAITING_FINAL_CONFIRMATION:'Está tudo correto?',COMPLETED:null,CANCELLED:null};
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
return [{json:{...base,store_visit_datetime:selectedAt,confirmation_status:'scheduled',crm_stage_code:String(base.crm_stage_code??'').replace(/_[^_]+$/,'_PRESENCA_AGENDADA'),active_appointment:appointment,output:'Show, sua visita ficou para '+display+'. Quantos acompanhantes você vai levar para o evento?',validator_blocked:false,v2_auto_schedule_result:'scheduled'}}];`;

async function main() {
  if (targetId === sourceId && !allowUpdateExisting) {
    throw new Error(
      "Protecao de producao: use outro N8N_TARGET_WORKFLOW_ID ou defina N8N_ALLOW_UPDATE_EXISTING=true explicitamente",
    );
  }

  const [sourceWorkflow, automationSource] = await Promise.all([
    n8n<Workflow>(`/workflows/${sourceId}`),
    n8n<Workflow>(`/workflows/${automationSourceId}`),
  ]);
  const workflow = targetId
    ? await n8n<Workflow>(`/workflows/${targetId}`)
    : structuredClone(sourceWorkflow);
  if (!targetId) {
    const suffix = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    workflow.name = `${sourceWorkflow.name} [HOMOLOG ${suffix}]`;
  }
  const triggerWebhookId = process.env.N8N_TRIGGER_WEBHOOK_ID;
  if (triggerWebhookId) {
    node(workflow, "WhatsApp Trigger").webhookId = triggerWebhookId;
  }
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
  const toneMarker = "# TOM DE CONVERSA HOMOLOGADO V4";
  if (!options.systemMessage.includes(toneMarker)) {
    options.systemMessage += `\n\n${toneMarker}\nEstas regras V4 substituem qualquer regra de tom anterior que conflite com elas.\n- Fale como um brasileiro simpático e descontraído. Bordões como Falaa, Top, Show, Blz e Anotado aqui são opcionais: use no máximo um quando combinar com a mensagem, nunca por obrigação e nunca repita em mensagens consecutivas.\n- Evite construções artificiais como \"Top você perguntar\", \"Show sua dúvida\" e elogios automáticos a qualquer pergunta. Responda diretamente, como uma pessoa conversando no WhatsApp.\n- Use o primeiro nome do lead quando ele estiver disponível, mas não em todas as mensagens. Se não estiver, não deixe vírgula, espaço ou variável vazia no lugar do nome. Nunca escreva \"Oi, !\".\n- Durante a coleta, cada mensagem deve ter exatamente uma pergunta, sempre no final. Respostas informativas pós-credenciamento podem terminar sem pergunta quando não houver dado pendente.\n- Prefira mensagens curtas, com no máximo três frases antes da pergunta. Não repita o nome completo do evento em todas as mensagens.\n- Reconheça brevemente a resposta anterior e faça apenas a próxima pergunta pendente.\n- Se a conversa estiver COMPLETED, preserve esse estado. Responda dúvidas normalmente sem pedir nova confirmação e sem reiniciar o credenciamento.\n- Se o lead repetir uma pergunta, não copie novamente a resposta inteira. Resuma, esclareça o ponto e pergunte apenas sobre uma condição que esteja literalmente descrita no evento, se isso for útil.\n- Não transforme respostas automáticas de ausência, horário comercial ou atendimento empresarial em dados do credenciamento.\n- Não diga que uma operação foi concluída sem retorno de sucesso da ferramenta e do validador. Para QR Code, use o status real retornado pela API; não prometa envio futuro sem evidência.\n`;
  }

  const memoryMarker =
    "# REGISTRO OBRIGATORIO DE RESPOSTAS V6 — PRIORIDADE MAXIMA";
  if (!options.systemMessage.includes(memoryMarker)) {
    options.systemMessage += `\n\n${memoryMarker}\nEstas regras substituem qualquer instrução conflitante sobre avanço de etapa.\n- Antes de responder, leia current_step e trate a mensagem atual como resposta da pergunta pendente. Nunca repita uma pergunta que o lead acabou de responder.\n- Em WAITING_FULL_NAME, ao receber nome e sobrenome, chame atualizar_dados_lead com first_name e last_name. Só depois apresente todas as datas e avance para a escolha da data.\n- Em WAITING_EVENT_DATE, sempre mostre todas as datas e horários exatos de event_days_iso antes de perguntar a preferência. Nunca pergunte apenas "qual data" sem listar as opções. Depois de registrar a escolha, avance para acompanhantes.\n- Em WAITING_COMPANIONS, interprete "minha esposa", "meu marido", "mais uma pessoa" ou equivalente como 1 acompanhante. Salve companions como "1 acompanhante, nome ainda não informado" e pergunte apenas o nome completo.\n- Em WAITING_COMPANION_NAMES, se a resposta possuir nome e sobrenome, chame atualizar_dados_lead e sobrescreva companions no formato "N acompanhante(s): Nome completo". Só depois do sucesso avance para carro na troca.\n- Se uma ferramenta falhar, não repita como se o lead não tivesse respondido. Informe brevemente que não conseguiu registrar o dado e peça somente uma nova tentativa.\n`;
  }

  const conversationOrderMarker =
    "# ORDEM DE CONVERSA HOMOLOGADA V7 — DATA IMEDIATAMENTE APOS O NOME";
  if (!options.systemMessage.includes(conversationOrderMarker)) {
    options.systemMessage += `\n\n${conversationOrderMarker}\nEstas regras V7 substituem qualquer ordem anterior conflitante.\n- O gatilho oficial de abertura e o texto exibido ao lead são \"Garantir minha vaga\". Durante a transição do template da Meta, \"Finalizar credenciamento\" e \"Finalizar credencial\" ainda devem ser aceitos silenciosamente como gatilhos legados, mas nunca apresentados como CTA oficial.\n- A ordem obrigatória é: nome completo, escolha da data, quantidade de acompanhantes, nomes dos acompanhantes quando houver, carro na troca, placa quando houver troca, resumo e confirmação final.\n- Em WAITING_FULL_NAME, depois de salvar first_name e last_name, apresente imediatamente todas as datas e horários exatos de event_days_iso e pergunte qual data o lead prefere.\n- Em WAITING_EVENT_DATE, depois de salvar o start exato escolhido, o fluxo determinístico cria ou reutiliza o agendamento, define o status como scheduled e move o card para PRESENCA_AGENDADA silenciosamente. Depois pergunte quantos acompanhantes o lead levará.\n- Em WAITING_COMPANIONS, se não houver acompanhantes, salve \"Sem acompanhantes\" e avance para a pergunta sobre carro na troca. Se houver, salve a quantidade e pergunte os nomes completos.\n- Em WAITING_COMPANION_NAMES, depois de salvar os nomes, avance para a pergunta sobre carro na troca.\n- O status scheduled não encerra o atendimento. A conclusão continua dependendo do resumo confirmado e do sucesso de finalizar_credenciamento.\n- Nunca volte para acompanhantes antes da escolha da data e nunca repita uma data já escolhida.\n`;
  }

  const openingTriggerNode = workflow.nodes.find((item) =>
    String(item.parameters?.jsCode ?? "").includes("isOpeningTrigger"),
  );
  if (openingTriggerNode) {
    openingTriggerNode.parameters.jsCode = String(
      openingTriggerNode.parameters.jsCode,
    ).replace(
      /\^\(finalizar credenciamento\|oi\|olá\|ola\|bom dia\|boa tarde\|boa noite\)/,
      "^(garantir minha vaga|finalizar credenciamento|finalizar credencial|oi|olá|ola|bom dia|boa tarde|boa noite)",
    );
  }

  const updateLeadTool = workflow.nodes.find(
    (item) => item.name === "atualizar_dados_lead",
  );
  if (updateLeadTool) {
    updateLeadTool.parameters.toolDescription =
      "Salva imediatamente a resposta da pergunta atual. Em nome completo, envie first_name e last_name. Em acompanhantes, preserve a quantidade e grave os nomes no campo companions no formato 'N acompanhante(s): Nome completo'. Nunca envie campo vazio e nunca responda ao lead antes do sucesso desta ferramenta.";
  }

  const claimsMarker =
    "# TRAVA DE CONHECIMENTO DO EVENTO V5 — PRIORIDADE MAXIMA";
  if (!options.systemMessage.includes(claimsMarker)) {
    options.systemMessage += `\n\n${claimsMarker}\nEstas regras substituem qualquer instrução anterior conflitante.\n- A descrição do evento presente no contexto é a ÚNICA fonte autorizada para ofertas, condições, modelos, versões, preços, valores, estoque, características e informações comerciais.\n- O Rubinho NÃO possui catálogo de veículos e NÃO sabe preços, valores, versões, especificações, equipamentos, estoque, autonomia, consumo, potência, prazo de entrega, parcelas, entrada ou condições que não estejam escritas literalmente na descrição do evento.\n- Nunca use conhecimento geral, memória do modelo, nome da marca, FAQ genérica, suposição ou inferência para completar uma resposta. Nada além da descrição do evento pode ser apresentado como fato.\n- Se a descrição trouxer explicitamente um modelo, valor ou condição, repita somente o que está escrito, sem calcular, comparar, extrapolar, prometer ou adicionar adjetivos.\n- Se o lead perguntar por modelo, versão, preço, valor ou detalhe que não consta literalmente na descrição, responda: \"Essa informação específica não está na descrição do evento. Por aqui eu consigo te orientar somente sobre as condições divulgadas para o evento.\" Depois retome apenas a pergunta pendente do credenciamento, se existir.\n- Nunca diga que pode explicar detalhes de um modelo ou condição ausente. Nunca convide o lead a perguntar sobre modelos específicos se a descrição não os apresentar.\n- Quando houver dúvida se uma informação está ou não na descrição, aplique bloqueio por padrão: não informe.\n`;
  }

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

  const shouldSendQr = node(workflow, "V2 - DEVE ENVIAR QRCODE?");
  const shouldSendQrParameters = shouldSendQr.parameters as {
    conditions: {
      conditions: Array<{ leftValue: string }>;
    };
  };
  shouldSendQrParameters.conditions.conditions[0].leftValue =
    "={{ $('V2 - ESTADO PRONTO').item.json.v2_state.current_step === 'WAITING_FINAL_CONFIRMATION' && $json.validator_claims_final === true && !$json.validator_blocked && ['scheduled','confirmed'].includes($json.confirmation_status) && !!$json.active_appointment?.id && !!$json.checkin_voucher }}";

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

  const body = JSON.stringify({
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    // A API publica apenas um subconjunto das settings retornadas no GET.
    // Usar um objeto limpo evita copiar propriedades internas/rejeitadas e
    // mantém a cópia de homologação inativa por padrão.
    settings: {},
  });
  const saved = targetId
    ? await n8n<Workflow>(`/workflows/${targetId}`, { method: "PUT", body })
    : await n8n<Workflow>("/workflows", { method: "POST", body });
  console.log(
    JSON.stringify({
      workflow_id: saved.id,
      source_workflow_id: sourceId,
      mode: targetId
        ? "updated-explicit-target"
        : "created-inactive-homologation",
      nodes: workflow.nodes.length,
      patched: true,
    }),
  );
}

main();
