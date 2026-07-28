/**
 * Seed de dados DEMO para validar o Relatório Executivo.
 *
 * Cria 4 clientes marcados como demo (settings.demo=true, nome com "(DEMO)"),
 * sob o gestor informado. O cliente primário recebe 2 eventos com dados ricos:
 * vendedores, equipes, leads no funil, agendamentos, check-ins, vendas para
 * todos os vendedores, campanhas do Meta + atribuição e conversas do Rubinho.
 *
 * Reexecutável: apaga os dados demo anteriores (por client_id) antes de recriar.
 *
 * Uso:
 *   set -a && source ../../.env && set +a
 *   npx ts-node prisma/seed-executive-demo.ts
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Gestor "Gestor Grid" (accounts@gridlabs.digital) — dono dos clientes do painel.
const GESTOR_ID = 'd958412d-92f5-4420-9bca-8ed20ff5d1ce';

// hash bcrypt fixo (senha "demo1234") — vendedores demo não precisam logar.
const DEMO_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const weighted = <T>(pairs: Array<[T, number]>): T => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[0][0];
};

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduardo', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Juliana', 'Lucas', 'Marina', 'Rafael', 'Sofia', 'Thiago', 'Vanessa', 'Rodrigo', 'Patrícia', 'Felipe', 'Camila'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Almeida', 'Lima', 'Carvalho', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Araújo'];
const MODELS_0KM = ['HB20', 'Creta', 'Tucson', 'Santa Fe', 'Kona'];
const MODELS_SEMI = ['Onix 2022', 'Corolla 2021', 'Compass 2020', 'T-Cross 2022', 'Kicks 2021'];
const SOURCES: Array<['facebook_ads' | 'whatsapp' | 'form_page' | 'manual', number]> = [
  ['facebook_ads', 5],
  ['whatsapp', 3],
  ['form_page', 2],
  ['manual', 1],
];

type EventSpec = {
  id: string;
  name: string;
  date: Date; // primeiro dia
  days: number;
  leadCount: number;
  totalInvestment: number;
  paidTraffic: number;
};

async function deleteClientData(clientId: string) {
  // Ordem segura de FKs (filhos antes de pais).
  await prisma.serviceRating.deleteMany({ where: { vendor: { client_id: clientId } } });
  await prisma.scoreEvent.deleteMany({ where: { client_id: clientId } });
  await prisma.sale.deleteMany({ where: { client_id: clientId } });
  await prisma.appointment.deleteMany({ where: { client_id: clientId } });
  await prisma.agentActionLog.deleteMany({ where: { client_id: clientId } });
  await prisma.message.deleteMany({ where: { conversation: { client_id: clientId } } });
  await prisma.conversationState.deleteMany({ where: { client_id: clientId } });
  await prisma.conversation.deleteMany({ where: { client_id: clientId } });
  await prisma.leadTimeline.deleteMany({ where: { client_id: clientId } });
  await prisma.crmHistory.deleteMany({ where: { lead: { client_id: clientId } } });
  await prisma.metaLeadImport.deleteMany({ where: { client_id: clientId } });
  await prisma.metaDailyInsight.deleteMany({ where: { client_id: clientId } });
  await prisma.metaAd.deleteMany({ where: { client_id: clientId } });
  await prisma.metaAdSet.deleteMany({ where: { client_id: clientId } });
  await prisma.metaCampaign.deleteMany({ where: { client_id: clientId } });
  await prisma.metaCreative.deleteMany({ where: { client_id: clientId } });
  await prisma.metaLeadForm.deleteMany({ where: { client_id: clientId } });
  await prisma.metaAssetSelection.deleteMany({
    where: { meta_connection: { client_id: clientId } },
  });
  await prisma.metaConnection.deleteMany({ where: { client_id: clientId } });
  await prisma.salesTeamMember.deleteMany({ where: { team: { client_id: clientId } } });
  await prisma.salesTeam.deleteMany({ where: { client_id: clientId } });
  await prisma.rubinhoAgentEvent.deleteMany({
    where: { rubinho_agent: { client_id: clientId } },
  });
  await prisma.rubinhoAgentFaq.deleteMany({
    where: { rubinho_agent: { client_id: clientId } },
  });
  await prisma.rubinhoAgentDocument.deleteMany({
    where: { rubinho_agent: { client_id: clientId } },
  });
  await prisma.rubinhoAgent.deleteMany({ where: { client_id: clientId } });
  await prisma.lead.deleteMany({ where: { client_id: clientId } });
  await prisma.crmStage.deleteMany({ where: { client_id: clientId } });
  await prisma.crmPipeline.deleteMany({ where: { client_id: clientId } });
  await prisma.eventParticipant.deleteMany({ where: { client_id: clientId } });
  await prisma.event.deleteMany({ where: { client_id: clientId } });
  await prisma.vehicle.deleteMany({ where: { client_id: clientId } });
  await prisma.user.deleteMany({ where: { client_id: clientId } });
}

async function seedClient(opts: {
  name: string;
  events: EventSpec[];
  vendorCount: number;
  teamCount: number;
  rich: boolean;
}) {
  const clientId = randomUUID();
  await prisma.client.create({
    data: {
      id: clientId,
      gestor_id: GESTOR_ID,
      company_name: opts.name,
      plan: 'pro',
      settings: { demo: true },
    },
  });

  // ── Pipeline + estágios ──
  const pipelineId = randomUUID();
  const suffix = clientId.slice(0, 8);
  await prisma.crmPipeline.create({
    data: { id: pipelineId, client_id: clientId, code: `demo-${suffix}`, name: 'Funil Evento' },
  });
  const STAGE_DEFS = [
    ['Novo Lead', '#3b82f6', false],
    ['Em Contato', '#8b5cf6', false],
    ['Agendado', '#f59e0b', false],
    ['Confirmado', '#a855f7', false],
    ['Check-in', '#10b981', false],
    ['Compraram', '#FF0636', true],
    ['Perdido', '#6b7280', true],
  ] as const;
  const stageIds: Record<string, string> = {};
  for (let i = 0; i < STAGE_DEFS.length; i++) {
    const [name, color, final] = STAGE_DEFS[i];
    const id = randomUUID();
    stageIds[name] = id;
    await prisma.crmStage.create({
      data: {
        id,
        client_id: clientId,
        pipeline_id: pipelineId,
        code: `demo-${suffix}-${i}`,
        name,
        display_order: i,
        color,
        is_final_stage: final,
      },
    });
  }

  // ── Vendedores ──
  const vendors = Array.from({ length: opts.vendorCount }).map(() => {
    const id = randomUUID();
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return { id, name };
  });
  await prisma.user.createMany({
    data: vendors.map((v, i) => ({
      id: v.id,
      name: v.name,
      email: `vend.${suffix}.${i}@demo.gpdevendas.app`,
      password_hash: DEMO_PASSWORD_HASH,
      role: 'vendedor' as const,
      client_id: clientId,
      vendor_category: 'novo' as const,
    })),
  });

  // ── Eventos (antes das equipes: SalesTeam referencia event_id) ──
  for (const ev of opts.events) {
    await prisma.event.create({
      data: {
        id: ev.id,
        client_id: clientId,
        name: ev.name,
        event_date: ev.date,
        event_end_date: new Date(ev.date.getTime() + (ev.days - 1) * 864e5),
        location: pick(['São Paulo - SP', 'Campinas - SP', 'Rio de Janeiro - RJ', 'Curitiba - PR']),
        status: 'completed',
        capacity: 800,
        sales_target: 60,
        event_type: 'Feirão',
        total_investment: ev.totalInvestment,
        paid_traffic_investment: ev.paidTraffic,
      },
    });
    await prisma.eventParticipant.create({
      data: { event_id: ev.id, client_id: clientId },
    });
  }

  // ── Equipes (referenciam o evento principal) ──
  const teams = Array.from({ length: opts.teamCount }).map((_, i) => ({
    id: randomUUID(),
    name: `Equipe ${['Alfa', 'Bravo', 'Charlie', 'Delta'][i] ?? i + 1}`,
  }));
  await prisma.salesTeam.createMany({
    data: teams.map((t) => ({
      id: t.id,
      client_id: clientId,
      name: t.name,
      event_id: opts.events[0]?.id ?? null,
    })),
  });
  const memberRows = vendors.map((v, i) => ({
    team_id: teams[i % teams.length].id,
    user_id: v.id,
  }));
  await prisma.salesTeamMember.createMany({ data: memberRows });
  const teamByVendor = new Map(memberRows.map((m) => [m.user_id, m.team_id]));

  // ── Meta: conexão + campanhas + insights + adsets/ads ──
  const connectionId = randomUUID();
  await prisma.metaConnection.create({
    data: {
      id: connectionId,
      client_id: clientId,
      business_id: `demo-biz-${suffix}`,
      business_name: `${opts.name} Business`,
      access_token: 'DEMO_TOKEN',
      status: 'connected',
      scopes: ['ads_read', 'leads_retrieval'],
      last_sync_at: new Date(),
    },
  });
  const CAMP_DEFS = opts.rich
    ? [
        { name: 'SUV Weekend — Feirão', spend: 8500, leads: 520, impr: 520000, reach: 310000, conv: 210 },
        { name: 'Seminovos Premium', spend: 6200, leads: 430, impr: 480000, reach: 280000, conv: 175 },
        { name: 'Troca Inteligente', spend: 3100, leads: 180, impr: 180000, reach: 120000, conv: 90 },
      ]
    : [{ name: 'Campanha Local', spend: 2200, leads: 120, impr: 90000, reach: 60000, conv: 48 }];
  const campaigns = CAMP_DEFS.map((c) => ({ ...c, meta_id: `camp-${randomUUID().slice(0, 12)}` }));
  await prisma.metaCampaign.createMany({
    data: campaigns.map((c) => ({
      id: randomUUID(),
      client_id: clientId,
      meta_connection_id: connectionId,
      meta_campaign_id: c.meta_id,
      name: c.name,
      status: 'ACTIVE',
      objective: 'LEAD_GENERATION',
    })),
  });
  // insights por campanha (uma linha por dia distribui o total em ~7 dias)
  const insightRows: Array<Record<string, unknown>> = [];
  for (const c of campaigns) {
    for (let d = 0; d < 7; d++) {
      insightRows.push({
        id: randomUUID(),
        client_id: clientId,
        meta_connection_id: connectionId,
        level: 'campaign',
        entity_id: c.meta_id,
        entity_name: c.name,
        date: new Date(2026, 6, 6 + d),
        spend: c.spend / 7,
        impressions: Math.round(c.impr / 7),
        clicks: Math.round(c.impr / 7 / 30),
        leads: Math.round(c.leads / 7),
        reach: Math.round(c.reach / 7),
        raw_payload: {
          actions: [
            {
              action_type: 'onsite_conversion.messaging_conversation_started_7d',
              value: String(Math.round(c.conv / 7)),
            },
          ],
        },
      });
    }
  }
  await prisma.metaDailyInsight.createMany({ data: insightRows as never });

  // ── Leads + funil + agendamentos + check-ins + vendas + score + rubinho ──
  const leadRows: Array<Record<string, unknown>> = [];
  const apptRows: Array<Record<string, unknown>> = [];
  const saleRows: Array<Record<string, unknown>> = [];
  const scoreRows: Array<Record<string, unknown>> = [];
  const importRows: Array<Record<string, unknown>> = [];
  const convRows: Array<Record<string, unknown>> = [];
  const msgRows: Array<Record<string, unknown>> = [];
  const agentRows: Array<Record<string, unknown>> = [];
  const ratingRows: Array<Record<string, unknown>> = [];

  // garante ao menos 1 venda por vendedor (no evento principal)
  const forcedSaleVendors = new Set(vendors.map((v) => v.id));

  for (const ev of opts.events) {
    const eventDayList = Array.from({ length: ev.days }).map(
      (_, i) => new Date(ev.date.getTime() + i * 864e5),
    );
    for (let i = 0; i < ev.leadCount; i++) {
      const leadId = randomUUID();
      const vendor = vendors[i % vendors.length];
      const source = weighted(SOURCES);
      const createdAt = new Date(ev.date.getTime() - rnd(1, 20) * 864e5);

      // funil cumulativo
      const reachStage = weighted<'novo' | 'contato' | 'agendado' | 'confirmado' | 'checkin'>([
        ['checkin', 55],
        ['confirmado', 12],
        ['agendado', 12],
        ['contato', 11],
        ['novo', 10],
      ]);
      const isScheduled = ['agendado', 'confirmado', 'checkin'].includes(reachStage);
      const isConfirmed = ['confirmado', 'checkin'].includes(reachStage);
      const isCheckedIn = reachStage === 'checkin';

      const confirmation = isCheckedIn
        ? 'checked_in'
        : isConfirmed
          ? 'confirmed'
          : isScheduled
            ? 'scheduled'
            : reachStage === 'contato'
              ? 'pending'
              : 'pending';

      const stageName = isCheckedIn
        ? 'Check-in'
        : isConfirmed
          ? 'Confirmado'
          : isScheduled
            ? 'Agendado'
            : reachStage === 'contato'
              ? 'Em Contato'
              : 'Novo Lead';

      const eventDay = pick(eventDayList);
      // horário de chegada com pico 11h-13h
      const hour = weighted<number>([
        [9, 2], [10, 4], [11, 7], [12, 9], [13, 6], [14, 5], [15, 4], [16, 3], [17, 2],
      ]);
      const visitAt = isCheckedIn
        ? new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate(), hour, rnd(0, 59))
        : null;

      leadRows.push({
        id: leadId,
        client_id: clientId,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        email: `lead.${leadId.slice(0, 6)}@demo.com`,
        phone: `5511${rnd(90000, 99999)}${rnd(1000, 9999)}`,
        source,
        crm_pipeline_id: pipelineId,
        crm_stage_id: stageIds[stageName],
        confirmation_status: confirmation,
        event_interest_id: ev.id,
        assigned_vendor_id: vendor.id,
        team_id: teamByVendor.get(vendor.id) ?? null,
        store_visit_datetime: visitAt,
        created_at: createdAt,
      });

      // atribuição Meta: 72% dos leads vieram de uma campanha
      if (Math.random() < 0.72) {
        const camp = pick(campaigns);
        importRows.push({
          id: randomUUID(),
          client_id: clientId,
          meta_connection_id: connectionId,
          lead_id: leadId,
          meta_lead_id: `mlead-${leadId.slice(0, 10)}`,
          meta_campaign_id: camp.meta_id,
          imported_at: createdAt,
        });
      }

      // agendamento para quem chegou a agendado+
      let apptId: string | null = null;
      if (isScheduled) {
        apptId = randomUUID();
        const bySeller = Math.random() < 0.35; // 35% agendado pelo vendedor, resto pela IA
        apptRows.push({
          id: apptId,
          client_id: clientId,
          lead_id: leadId,
          event_id: ev.id,
          scheduled_at: new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate(), rnd(9, 17), 0),
          status: isCheckedIn ? 'completed' : isConfirmed ? 'confirmed' : 'scheduled',
          channel: 'whatsapp',
          source: bySeller ? 'vendedor' : 'n8n_ai_agent',
          created_by_type: bySeller ? 'user' : 'external_agent',
          created_by_id: bySeller ? vendor.id : null,
          confirmed_at: isConfirmed ? new Date(eventDay.getTime() - 864e5) : null,
          completed_at: isCheckedIn ? visitAt : null,
        });
        scoreRows.push({
          id: randomUUID(),
          client_id: clientId,
          vendor_id: vendor.id,
          lead_id: leadId,
          appointment_id: apptId,
          kind: 'scheduled',
          points: 20,
          earned_at: createdAt,
        });
      }

      // venda para parte dos check-ins (+ garante 1 por vendedor)
      const forceSale = forcedSaleVendors.has(vendor.id) && isCheckedIn;
      const convert = isCheckedIn && (forceSale || Math.random() < 0.28);
      if (convert && apptId) {
        forcedSaleVendors.delete(vendor.id);
        const type = weighted<'NOVO' | 'SEMINOVO' | 'VENDA_DIRETA' | 'PCD'>([
          ['NOVO', 5],
          ['SEMINOVO', 4],
          ['VENDA_DIRETA', 2],
          ['PCD', 1],
        ]);
        const model = type === 'SEMINOVO' ? pick(MODELS_SEMI) : pick(MODELS_0KM);
        const value = rnd(80, 260) * 1000;
        saleRows.push({
          id: randomUUID(),
          client_id: clientId,
          lead_id: leadId,
          appointment_id: apptId,
          vendor_id: vendor.id,
          team_id: teamByVendor.get(vendor.id) ?? null,
          type,
          model,
          value,
          sold_at: visitAt ?? eventDay,
        });
        scoreRows.push({
          id: randomUUID(),
          client_id: clientId,
          vendor_id: vendor.id,
          lead_id: leadId,
          appointment_id: apptId,
          kind: 'checked_in',
          points: 30,
          earned_at: visitAt ?? eventDay,
        });
      }

      // Avaliação do cliente ao vendedor: ~65% dos que fizeram check-in avaliam
      if (isCheckedIn && Math.random() < 0.65) {
        const score = weighted<number>([
          [5, 55],
          [4, 30],
          [3, 10],
          [2, 4],
          [1, 1],
        ]);
        ratingRows.push({
          id: randomUUID(),
          vendor_id: vendor.id,
          event_id: ev.id,
          score,
          customer_name: `${pick(FIRST)} ${pick(LAST)}`,
          comment:
            score >= 4
              ? pick(['Ótimo atendimento!', 'Muito atencioso', 'Recomendo', 'Nota 10'])
              : score === 3
                ? 'Atendimento ok'
                : 'Poderia ser melhor',
          created_at: visitAt ?? eventDay,
        });
      }

      // Rubinho: conversa + mensagens + log de ação para ~40% dos leads
      if (Math.random() < 0.4) {
        const convId = randomUUID();
        convRows.push({
          id: convId,
          client_id: clientId,
          lead_id: leadId,
          channel: 'whatsapp',
          last_message_at: createdAt,
        });
        const nMsg = rnd(4, 18);
        for (let m = 0; m < nMsg; m++) {
          msgRows.push({
            id: randomUUID(),
            conversation_id: convId,
            sender_type: m % 2 === 0 ? 'lead' : 'system',
            content: m % 2 === 0 ? 'Tenho interesse no feirão' : 'Perfeito! Posso te agendar?',
            created_at: new Date(createdAt.getTime() + m * 60000),
          });
        }
        agentRows.push({
          id: randomUUID(),
          client_id: clientId,
          lead_id: leadId,
          conversation_id: convId,
          provider: 'openai',
          model: 'gpt-4o',
          trigger_type: 'inbound_message',
          decision_type: isScheduled ? 'schedule_appointment' : 'qualify_lead',
          confidence: Math.random() * 0.3 + 0.7,
          result_status: 'success',
          action_payload: {},
          created_at: createdAt,
        });
      }
    }
  }

  // Rubinho agent config
  await prisma.rubinhoAgent.create({
    data: {
      client_id: clientId,
      name: 'Rubinho',
      prompt: 'Você é o Rubinho, assistente de vendas do feirão.',
      tone: 'Amigável',
    },
  });

  // Inserts em lote (ordem de FK)
  await prisma.lead.createMany({ data: leadRows as never });
  await prisma.metaLeadImport.createMany({ data: importRows as never });
  await prisma.appointment.createMany({ data: apptRows as never });
  await prisma.sale.createMany({ data: saleRows as never });
  await prisma.scoreEvent.createMany({ data: scoreRows as never, skipDuplicates: true });
  await prisma.conversation.createMany({ data: convRows as never });
  await prisma.message.createMany({ data: msgRows as never });
  await prisma.agentActionLog.createMany({ data: agentRows as never });
  await prisma.serviceRating.createMany({ data: ratingRows as never });

  return {
    clientId,
    name: opts.name,
    events: opts.events.map((e) => ({ id: e.id, name: e.name })),
    counts: {
      vendors: vendors.length,
      teams: teams.length,
      leads: leadRows.length,
      appointments: apptRows.length,
      sales: saleRows.length,
      conversations: convRows.length,
    },
  };
}

async function main() {
  // Remove clientes demo anteriores (por nome marcado) e seus dados.
  const existing = await prisma.client.findMany({
    where: { gestor_id: GESTOR_ID, company_name: { contains: '(DEMO)' } },
    select: { id: true },
  });
  for (const c of existing) {
    await deleteClientData(c.id);
    await prisma.client.delete({ where: { id: c.id } });
  }

  const results = [];

  // Cliente primário — 2 eventos, dados ricos
  results.push(
    await seedClient({
      name: '🏁 Grand Prix Hyundai (DEMO)',
      rich: true,
      vendorCount: 6,
      teamCount: 2,
      events: [
        {
          id: randomUUID(),
          name: 'Grand Prix Hyundai — Julho 2026',
          date: new Date(2026, 6, 18),
          days: 3,
          leadCount: 220,
          totalInvestment: 82300,
          paidTraffic: 17800,
        },
        {
          id: randomUUID(),
          name: 'Grand Prix Hyundai — Junho 2026',
          date: new Date(2026, 5, 20),
          days: 2,
          leadCount: 150,
          totalInvestment: 68000,
          paidTraffic: 14500,
        },
      ],
    }),
  );

  // 3 clientes secundários — 2 eventos cada (para o histórico funcionar)
  const light = [
    ['🏎️ Feirão Nissan (DEMO)', 'Feirão Nissan'],
    ['🚗 Test Drive Renault (DEMO)', 'Test Drive Renault'],
    ['🛻 GWM Experience (DEMO)', 'GWM Experience'],
  ] as const;
  for (const [cname, ename] of light) {
    results.push(
      await seedClient({
        name: cname,
        rich: false,
        vendorCount: 4,
        teamCount: 2,
        events: [
          {
            id: randomUUID(),
            name: `${ename} — Julho 2026`,
            date: new Date(2026, 6, 12),
            days: 2,
            leadCount: 90,
            totalInvestment: 34000,
            paidTraffic: 7200,
          },
          {
            id: randomUUID(),
            name: `${ename} — Junho 2026`,
            date: new Date(2026, 5, 14),
            days: 2,
            leadCount: 70,
            totalInvestment: 28000,
            paidTraffic: 6100,
          },
        ],
      }),
    );
  }

  console.log('\n✅ Seed demo concluído:\n');
  for (const r of results) {
    console.log(`• ${r.name} [${r.clientId}]`);
    for (const e of r.events) console.log(`    evento: ${e.name} [${e.id}]`);
    console.log(`    ${JSON.stringify(r.counts)}`);
  }
  console.log('\nAbra /gestor/relatorio-executivo e selecione "Grand Prix Hyundai (DEMO)".\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
