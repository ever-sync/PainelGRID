import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  ConfirmationStatus,
  EventStatus,
  LeadSource,
  Prisma,
  SaleType,
} from "@prisma/client";
import { Role } from "../../common/types";
import { EventDashboardService } from "./event-dashboard.service";

describe("EventDashboardService.getTvDashboard", () => {
  const eventId = "99999999-9999-4999-8999-999999999999";
  const clientA = "11111111-1111-4111-8111-111111111111";
  const clientB = "22222222-2222-4222-8222-222222222222";
  const vendor1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const vendor2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const teamId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  const gestorUser = {
    sub: "gestor-1",
    role: Role.GESTOR,
    email: "g@x",
    name: "G",
  } as never;
  const otherClienteUser = {
    sub: "cli-x",
    role: Role.CLIENTE,
    email: "c@x",
    name: "C",
    client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  } as never;

  let prisma: any;
  let redis: any;
  let service: EventDashboardService;

  beforeEach(() => {
    prisma = {
      event: { findUnique: jest.fn() },
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      scoreEvent: { findMany: jest.fn().mockResolvedValue([]) },
      leadTimeline: { findMany: jest.fn().mockResolvedValue([]) },
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      salesTeam: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      client: { count: jest.fn().mockResolvedValue(1) },
    };
    redis = {
      client: {
        scan: jest.fn().mockResolvedValue(["0", []]),
        get: jest.fn().mockResolvedValue(null),
      },
    };
    service = new EventDashboardService(prisma, redis);
  });

  function setupEvent() {
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      name: "Grand Prix de Vendas",
      event_date: new Date("2026-05-22T10:00:00-03:00"),
      event_end_date: new Date("2026-05-24T18:00:00-03:00"),
      location: "SP",
      capacity: 500,
      sales_target: 200,
      scheduled_target: 20,
      status: EventStatus.active,
      participants: [{ client_id: clientA }, { client_id: clientB }],
    });
  }

  describe("getOperationalReport", () => {
    it("agrega no servidor e pagina a lista com o mesmo filtro", async () => {
      setupEvent();
      prisma.lead.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      prisma.lead.groupBy
        .mockResolvedValueOnce([
          {
            confirmation_status: ConfirmationStatus.scheduled,
            _count: { _all: 2 },
          },
          {
            confirmation_status: ConfirmationStatus.pending,
            _count: { _all: 1 },
          },
        ])
        .mockResolvedValueOnce([
          { source: LeadSource.facebook_ads, _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([
          { crm_stage_id: "stage-1", _count: { _all: 3 } },
        ]);
      prisma.lead.findMany.mockResolvedValue([
        { id: "lead-2", name: "Lead 2" },
      ]);
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: "appointment-1",
          lead_id: "lead-1",
          status: AppointmentStatus.completed,
          confirmed_at: new Date("2026-08-06T12:00:00.000Z"),
          completed_at: new Date("2026-08-06T13:00:00.000Z"),
        },
        {
          id: "appointment-2",
          lead_id: "lead-2",
          status: AppointmentStatus.scheduled,
          confirmed_at: null,
          completed_at: null,
        },
      ]);
      prisma.sale.findMany.mockResolvedValue([
        { id: "sale-1", lead_id: "lead-1", value: new Prisma.Decimal(85000) },
      ]);
      prisma.leadTimeline.findMany.mockResolvedValue([{ lead_id: "lead-3" }]);

      const result = await service.getOperationalReport(gestorUser, {
        client_id: clientA,
        event_id: eventId,
        source: LeadSource.facebook_ads,
        search: "Raphael",
        page: 2,
        page_size: 1,
      });

      expect(prisma.lead.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          client_id: clientA,
          event_interest_id: eventId,
          source: LeadSource.facebook_ads,
          deleted_at: null,
          OR: expect.arrayContaining([
            { name: { contains: "Raphael", mode: "insensitive" } },
          ]),
        }),
      });
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 1, take: 1 }),
      );
      expect(result).toMatchObject({
        summary: {
          leads: 3,
          funnel: {
            leads: 3,
            scheduled: 2,
            confirmed: 1,
            checked_in: 2,
            sold: 2,
          },
          appointments: {
            records: 2,
            leads: 2,
            confirmed_leads: 1,
            checked_in_leads: 2,
          },
          sales: {
            records: 1,
            leads: 2,
            revenue: 85000,
            average_ticket: 85000,
          },
          rates: {
            lead_to_appointment: 66.67,
            appointment_to_checkin: 100,
            checkin_to_sale: 100,
            lead_to_sale: 66.67,
          },
          inconsistencies: {
            marked_scheduled_without_appointment: 0,
          },
          by_confirmation_status: { scheduled: 2, pending: 1 },
          by_source: [{ source: LeadSource.facebook_ads, count: 3 }],
          by_crm_stage: [{ crm_stage_id: "stage-1", count: 3 }],
        },
        pagination: { page: 2, page_size: 1, total: 3, total_pages: 3 },
        items: [{ id: "lead-2", name: "Lead 2" }],
        data_quality: {
          aggregation: "server",
          appointment_metrics: "real_appointment_records",
          checkin_metrics: "appointment_completion_or_checkin_timeline",
          sales_metrics: "real_sale_records",
        },
      });
    });

    it("impede cliente de consultar outro cliente", async () => {
      await expect(
        service.getOperationalReport(otherClienteUser, {
          client_id: clientA,
          page: 1,
          page_size: 25,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.lead.count).not.toHaveBeenCalled();
    });
  });

  it("lança NotFound quando evento não existe", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(
      service.getTvDashboard(gestorUser, eventId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("bloqueia cliente que não participa do evento", async () => {
    setupEvent();
    await expect(
      service.getTvDashboard(otherClienteUser, eventId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("agrega funil, vendedores, equipes, segmentos e diário", async () => {
    setupEvent();

    prisma.user.findMany.mockResolvedValue([
      { id: vendor1, name: "Ana", client_id: clientA },
      { id: vendor2, name: "Bruno", client_id: clientA },
    ]);

    prisma.salesTeam.findMany.mockResolvedValue([
      {
        id: teamId,
        name: "Ferrari",
        members: [
          {
            user_id: vendor1,
            user: { id: vendor1, name: "Ana", client_id: clientA },
          },
          {
            user_id: vendor2,
            user: { id: vendor2, name: "Bruno", client_id: clientA },
          },
        ],
      },
    ]);

    prisma.lead.findMany.mockResolvedValue([
      // 4 leads no total — 3 atribuídos
      {
        id: "lead-1",
        source: LeadSource.whatsapp,
        assigned_vendor_id: vendor1,
        team_id: teamId,
        created_at: new Date("2026-05-22T09:00:00-03:00"),
        confirmation_status: ConfirmationStatus.checked_in,
      },
      {
        id: "lead-2",
        source: LeadSource.facebook_ads,
        assigned_vendor_id: vendor2,
        team_id: teamId,
        created_at: new Date("2026-05-22T11:00:00-03:00"),
        confirmation_status: ConfirmationStatus.checked_in,
      },
      {
        id: "lead-3",
        source: LeadSource.form_page,
        assigned_vendor_id: vendor2,
        team_id: teamId,
        created_at: new Date("2026-05-23T09:00:00-03:00"),
        confirmation_status: ConfirmationStatus.cancelled,
      },
      {
        id: "lead-4",
        source: LeadSource.whatsapp,
        assigned_vendor_id: null,
        team_id: null,
        created_at: new Date("2026-05-23T15:00:00-03:00"),
        confirmation_status: ConfirmationStatus.pending,
      },
    ]);

    prisma.appointment.findMany.mockResolvedValue([
      // lead-1: agendou, confirmou, compareceu
      {
        id: "app-1",
        lead_id: "lead-1",
        status: AppointmentStatus.completed,
        scheduled_at: new Date("2026-05-22T14:00:00-03:00"),
        confirmed_at: new Date("2026-05-22T10:00:00-03:00"),
        completed_at: new Date("2026-05-22T14:30:00-03:00"),
      },
      // lead-2: agendou, confirmou, compareceu
      {
        id: "app-2",
        lead_id: "lead-2",
        status: AppointmentStatus.completed,
        scheduled_at: new Date("2026-05-23T11:00:00-03:00"),
        confirmed_at: new Date("2026-05-23T09:00:00-03:00"),
        completed_at: new Date("2026-05-23T11:15:00-03:00"),
      },
      // lead-3: agendou e cancelou
      {
        id: "app-3",
        lead_id: "lead-3",
        status: AppointmentStatus.cancelled,
        scheduled_at: new Date("2026-05-23T10:00:00-03:00"),
        confirmed_at: null,
        completed_at: null,
      },
    ]);

    prisma.sale.findMany.mockResolvedValue([
      {
        id: "sale-1",
        lead_id: "lead-1",
        vendor_id: vendor1,
        team_id: teamId,
        type: SaleType.NOVO,
        model: "Haval H6",
        value: new Prisma.Decimal("150000.00"),
        sold_at: new Date("2026-05-22T16:00:00-03:00"),
      },
      {
        id: "sale-2",
        lead_id: "lead-2",
        vendor_id: vendor2,
        team_id: teamId,
        type: SaleType.SEMINOVO,
        model: "Haval H6",
        value: new Prisma.Decimal("120000.00"),
        sold_at: new Date("2026-05-23T17:30:00-03:00"),
      },
    ]);

    const result = await service.getTvDashboard(gestorUser, eventId);

    expect(result.event.id).toBe(eventId);
    expect(result.event.sales_target).toBe(200);
    expect(result.event.scheduled_target).toBe(20);
    expect(result.event.participant_client_ids).toEqual([clientA, clientB]);

    // Funil: 4 leads, 2 agendados não cancelados (lead-1, lead-2),
    // 2 confirmados, 2 check-in, 2 vendas
    expect(result.funnel).toEqual({
      leads: 4,
      scheduled: 2,
      confirmed: 2,
      checked_in: 2,
      no_show: 0,
      sold: 2,
    });

    // Vendedores: Ana (1 lead, 1 sold), Bruno (2 leads: lead-2 e lead-3, 1 sold)
    expect(result.vendors).toHaveLength(2);
    const ana = result.vendors.find((vendor) => vendor.vendor_id === vendor1)!;
    expect(ana).toMatchObject({
      vendor_name: "Ana",
      leads: 1,
      scheduled: 1,
      confirmed: 1,
      checked_in: 1,
      sold: 1,
      revenue: 150000,
      team_id: teamId,
      team_name: "Ferrari",
    });
    const bruno = result.vendors.find(
      (vendor) => vendor.vendor_id === vendor2,
    )!;
    expect(bruno).toMatchObject({
      vendor_name: "Bruno",
      leads: 2,
      scheduled: 1,
      confirmed: 1,
      checked_in: 1,
      sold: 1,
      revenue: 120000,
    });

    // Ranking: empate total → desempata alfabético; Ana primeiro
    expect(result.vendors[0].vendor_id).toBe(vendor1);

    // Equipes: Ferrari agrega vendedores → 3 leads, 2 sold
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({
      team_name: "Ferrari",
      leads: 3,
      sold: 2,
      checked_in: 2,
      revenue: 270000,
    });

    // Carros: 1 NOVO + 1 SEMINOVO, Haval H6 top com 2
    expect(result.cars.by_segment).toEqual(
      expect.arrayContaining([
        { type: SaleType.NOVO, count: 1 },
        { type: SaleType.SEMINOVO, count: 1 },
      ]),
    );
    expect(result.cars.top_models[0]).toEqual({ model: "Haval H6", count: 2 });
    expect(result.cars.total_value).toBe("270000");

    // Diário: 22/05 e 23/05
    expect(result.daily).toHaveLength(2);
    const dia22 = result.daily.find((day) => day.date === "2026-05-22")!;
    expect(dia22).toMatchObject({
      leads: 2,
      scheduled: 1,
      sold: 1,
      checked_in: 1,
    });
    const dia23 = result.daily.find((day) => day.date === "2026-05-23")!;
    expect(dia23).toMatchObject({
      leads: 2,
      scheduled: 1,
      sold: 1,
      checked_in: 1,
    });

    // Check-in por canal: lead-1 (whatsapp) + lead-2 (facebook_ads)
    expect(result.checkin_by_source).toEqual(
      expect.arrayContaining([
        { source: LeadSource.whatsapp, count: 1 },
        { source: LeadSource.facebook_ads, count: 1 },
      ]),
    );
    expect(result.arrivals_by_hour).toEqual(
      expect.arrayContaining([
        { hour: 11, count: 1 },
        { hour: 14, count: 1 },
      ]),
    );
    expect(result.arrival_data_quality).toEqual({
      checked_in_leads: 2,
      with_real_timestamp: 2,
      missing_timestamp: 0,
      coverage_percent: 100,
      appointment_timestamps: 2,
      timeline_timestamps: 0,
    });

    expect(typeof result.generated_at).toBe("string");
  });

  it("usa timeline real para check-in sem agendamento e nunca usa criação do lead", async () => {
    setupEvent();
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-timeline",
        source: LeadSource.manual,
        assigned_vendor_id: null,
        team_id: null,
        created_at: new Date("2026-05-01T09:00:00-03:00"),
        confirmation_status: ConfirmationStatus.checked_in,
      },
    ]);
    prisma.leadTimeline.findMany.mockResolvedValue([
      {
        lead_id: "lead-timeline",
        occurred_at: new Date("2026-05-22T15:35:00.000Z"),
      },
    ]);

    const result = await service.getTvDashboard(gestorUser, eventId);

    expect(result.arrivals_by_hour).toEqual([{ hour: 12, count: 1 }]);
    expect(result.arrival_data_quality).toEqual({
      checked_in_leads: 1,
      with_real_timestamp: 1,
      missing_timestamp: 0,
      coverage_percent: 100,
      appointment_timestamps: 0,
      timeline_timestamps: 1,
    });
    expect(result.arrivals_by_hour).not.toContainEqual({ hour: 9, count: 1 });
  });
});

describe("EventDashboardService.getExecutiveReport attribution", () => {
  const eventId = "99999999-9999-4999-8999-999999999999";
  const clientId = "11111111-1111-4111-8111-111111111111";
  const vendor1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const teamId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const gestor = {
    sub: "gestor-1",
    role: Role.GESTOR,
    email: "g@x",
    name: "G",
  } as never;
  let prisma: any;
  let service: EventDashboardService;

  beforeEach(() => {
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: eventId,
          client_id: clientId,
          launch_date: new Date("2026-08-01T00:00:00.000Z"),
          event_date: new Date("2026-08-14T12:00:00.000Z"),
          event_end_date: new Date("2026-08-15T21:00:00.000Z"),
          total_investment: null,
          paid_traffic_investment: null,
          participants: [{ client_id: clientId }],
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      client: { count: jest.fn().mockResolvedValue(1) },
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "sale-1",
            lead_id: "lead-1",
            appointment_id: "appointment-1",
            vendor_id: vendor1,
            team_id: teamId,
            value: new Prisma.Decimal("100000"),
            sold_at: new Date("2026-08-14T16:00:00.000Z"),
          },
        ]),
      },
      metaLeadImport: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "appointment-1",
            lead_id: "lead-1",
            meta_campaign_id: "campaign-1",
            meta_campaign_name: "Campanha 1",
            meta_ad_set_id: "adset-1",
            meta_ad_set_name: "Conjunto 1",
            meta_ad_id: "ad-1",
            meta_ad_name: "Anuncio 1",
            source_created_at: new Date("2026-08-04T00:45:49.000Z"),
            imported_at: new Date("2026-08-04T00:46:00.000Z"),
            lead: { confirmation_status: ConfirmationStatus.checked_in },
          },
        ]),
      },
      metaCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            meta_campaign_id: "campaign-1",
            name: "Campanha 1",
            start_time: new Date("2026-08-01T00:00:00.000Z"),
          },
          {
            meta_campaign_id: "campaign-unlinked",
            name: "Campanha fora do evento",
            start_time: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
      },
      metaAdSet: {
        findMany: jest.fn().mockResolvedValue([
          {
            meta_campaign_id: "campaign-1",
            meta_ad_set_id: "adset-1",
            name: "Conjunto 1",
          },
        ]),
      },
      metaAd: {
        findMany: jest.fn().mockResolvedValue([
          {
            meta_campaign_id: "campaign-1",
            meta_ad_set_id: "adset-1",
            meta_ad_id: "ad-1",
            name: "Anuncio 1",
          },
        ]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "appointment-1",
            lead_id: "lead-1",
            status: AppointmentStatus.completed,
            source: "n8n_ai_agent",
            created_by_type: "external_agent",
            completed_at: new Date("2026-08-14T15:00:00.000Z"),
            created_at: new Date("2026-08-05T15:00:00.000Z"),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      metaCampaignAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { meta_campaign_id: "campaign-1", campaign_name: null },
          ]),
      },
      metaDailyInsight: {
        findMany: jest.fn().mockResolvedValue([
          {
            level: "campaign",
            entity_id: "campaign-1",
            spend: new Prisma.Decimal("1000"),
            leads: 25,
            impressions: 10000,
            reach: 8000,
            raw_payload: {
              actions: [
                {
                  action_type:
                    "onsite_conversion.messaging_conversation_started_7d",
                  value: "12",
                },
              ],
            },
          },
          {
            level: "adset",
            entity_id: "adset-1",
            spend: new Prisma.Decimal("600"),
          },
          { level: "ad", entity_id: "ad-1", spend: new Prisma.Decimal("300") },
          {
            level: "campaign",
            entity_id: "campaign-unlinked",
            spend: new Prisma.Decimal("9999"),
            leads: 999,
            impressions: 999999,
            reach: 999999,
            raw_payload: null,
          },
        ]),
      },
      serviceRating: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      dispatchEvent: { findMany: jest.fn().mockResolvedValue([]) },
      agentActionLog: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new EventDashboardService(prisma, { client: {} } as never);
  });

  it("cruza resultados e investimento por campanha, conjunto e anuncio sem duplicar a venda", async () => {
    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.attribution_by_level.campaigns[0]).toMatchObject({
      entity_id: "campaign-1",
      name: "Campanha 1",
      leads: 1,
      scheduled: 1,
      checked_in: 1,
      sold: 1,
      revenue: 100000,
      spend: 1000,
      meta_leads: 25,
      impressions: 10000,
      reach: 8000,
      conversations: 12,
      cost_per_conversation: 83.33,
      cpl: 1000,
      cost_per_scheduled: 1000,
      cost_per_sale: 1000,
      roas: 100,
      roi_percent: 9900,
    });
    expect(result.attribution_by_level.ad_sets[0]).toMatchObject({
      entity_id: "adset-1",
      spend: 600,
      sold: 1,
    });
    expect(result.attribution_by_level.ads[0]).toMatchObject({
      entity_id: "ad-1",
      spend: 300,
      sold: 1,
    });
    expect(result.attribution_by_level.campaigns).toHaveLength(1);
    expect(result.attribution_by_level.campaigns).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_id: "campaign-unlinked" }),
      ]),
    );
    expect(result.attribution_coverage).toEqual({
      attributed_leads: 1,
      total_leads: 1,
      attributed_sold: 1,
      total_sold: 1,
    });
    expect(result.attribution_period).toEqual({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-15T23:59:59.999Z"),
      source: "event_launch_date",
      timezone: "America/Sao_Paulo",
      default_lookback_days: null,
      campaigns_started_before_window: 0,
    });
    expect(result.rubinho).toMatchObject({
      agendamentos: 1,
      comparecimentos: 1,
      vendas_originadas: 1,
      receita_influenciada: 100000,
      attribution_method: "agent_created_appointment",
      attribution_breakdown: {
        originated: {
          leads: 1,
          appointments: 1,
          checked_in: 1,
          sales: 1,
          revenue: 100000,
        },
        influenced: {
          leads: 0,
          appointments: 0,
          checked_in: 0,
          sales: 0,
          revenue: 0,
        },
        recovered: {
          leads: 0,
          appointments: 0,
          checked_in: 0,
          sales: 0,
          revenue: 0,
        },
        manual: {
          leads: 0,
          appointments: 0,
          checked_in: 0,
          sales: 0,
          revenue: 0,
        },
      },
      appointment_ownership: {
        rubinho: {
          leads: 1,
          appointments: 1,
          checked_in: 1,
          sales: 1,
          revenue: 100000,
        },
        seller: {
          leads: 0,
          appointments: 0,
          checked_in: 0,
          sales: 0,
          revenue: 0,
        },
        human_manual: {
          leads: 0,
          appointments: 0,
          checked_in: 0,
          sales: 0,
          revenue: 0,
        },
        rule: "appointment_creator",
      },
    });
    expect(result.commercial_revenue).toEqual({
      total_sales: 1,
      total_revenue: 100000,
      by_vendor: [
        {
          vendor_id: vendor1,
          sales: 1,
          revenue: 100000,
          average_ticket: 100000,
        },
      ],
      by_team: [
        {
          team_id: teamId,
          sales: 1,
          revenue: 100000,
          average_ticket: 100000,
        },
      ],
      coverage: {
        vendor_sales: 1,
        vendor_percent: 100,
        team_sales: 1,
        team_percent: 100,
        unassigned_team_sales: 0,
        unassigned_team_revenue: 0,
      },
    });
    expect(prisma.metaDailyInsight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            gte: new Date("2026-08-01T00:00:00.000Z"),
            lte: new Date("2026-08-15T23:59:59.999Z"),
          },
        }),
      }),
    );
  });

  it("separa jornadas recuperadas, originadas, influenciadas e manuais sem dupla contagem", async () => {
    const at = (day: number) =>
      new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "appointment-recovered",
        lead_id: "lead-recovered",
        status: AppointmentStatus.completed,
        source: "n8n_ai_agent",
        created_by_type: "external_agent",
        completed_at: at(11),
        created_at: at(10),
      },
      {
        id: "appointment-originated",
        lead_id: "lead-originated",
        status: AppointmentStatus.scheduled,
        source: "n8n_ai_agent",
        created_by_type: "external_agent",
        completed_at: null,
        created_at: at(10),
      },
      {
        id: "appointment-influenced",
        lead_id: "lead-influenced",
        status: AppointmentStatus.completed,
        source: "vendedor",
        created_by_type: "user",
        completed_at: at(11),
        created_at: at(10),
      },
      {
        id: "appointment-manual",
        lead_id: "lead-manual",
        status: AppointmentStatus.scheduled,
        source: "gestor",
        created_by_type: "user",
        completed_at: null,
        created_at: at(10),
      },
    ]);
    prisma.sale.findMany.mockResolvedValue([
      {
        id: "sale-recovered",
        lead_id: "lead-recovered",
        appointment_id: "appointment-recovered",
        vendor_id: vendor1,
        team_id: teamId,
        value: new Prisma.Decimal("40000"),
        sold_at: at(12),
      },
      {
        id: "sale-originated",
        lead_id: "lead-originated",
        appointment_id: "appointment-originated",
        vendor_id: vendor1,
        team_id: teamId,
        value: new Prisma.Decimal("30000"),
        sold_at: at(12),
      },
      {
        id: "sale-influenced",
        lead_id: "lead-influenced",
        appointment_id: "appointment-influenced",
        vendor_id: vendor1,
        team_id: teamId,
        value: new Prisma.Decimal("20000"),
        sold_at: at(12),
      },
      {
        id: "sale-manual",
        lead_id: "lead-manual",
        appointment_id: "appointment-manual",
        vendor_id: vendor1,
        team_id: teamId,
        value: new Prisma.Decimal("10000"),
        sold_at: at(12),
      },
    ]);
    prisma.message.findMany.mockResolvedValue([
      {
        conversation_id: "conversation-influenced",
        created_at: at(8),
        conversation: { lead_id: "lead-influenced" },
      },
      {
        conversation_id: "conversation-recovered",
        created_at: at(8),
        conversation: { lead_id: "lead-recovered" },
      },
    ]);
    prisma.dispatchEvent.findMany.mockResolvedValue([
      {
        lead_id: "lead-recovered",
        appointment_id: "appointment-recovered",
        sale_id: "sale-recovered",
        workflow_key: "follow-up-em-contato",
        dispatch_type: "reactivation",
        sent_at: at(8),
        replied_at: at(9),
        converted_at: at(10),
      },
    ]);

    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.rubinho.attribution_breakdown).toEqual({
      recovered: {
        leads: 1,
        appointments: 1,
        checked_in: 1,
        sales: 1,
        revenue: 40000,
      },
      originated: {
        leads: 1,
        appointments: 1,
        checked_in: 0,
        sales: 1,
        revenue: 30000,
      },
      influenced: {
        leads: 1,
        appointments: 1,
        checked_in: 1,
        sales: 1,
        revenue: 20000,
      },
      manual: {
        leads: 1,
        appointments: 1,
        checked_in: 0,
        sales: 1,
        revenue: 10000,
      },
      precedence: ["recovered", "originated", "influenced", "manual"],
    });
    expect(result.rubinho.appointment_ownership).toEqual({
      rubinho: {
        leads: 2,
        appointments: 2,
        checked_in: 1,
        sales: 2,
        revenue: 70000,
      },
      seller: {
        leads: 1,
        appointments: 1,
        checked_in: 1,
        sales: 1,
        revenue: 20000,
      },
      human_manual: {
        leads: 1,
        appointments: 1,
        checked_in: 0,
        sales: 1,
        revenue: 10000,
      },
      rule: "appointment_creator",
    });
  });

  it("expõe receita real sem equipe como lacuna de cobertura", async () => {
    prisma.sale.findMany.mockResolvedValue([
      {
        id: "sale-without-team",
        lead_id: "lead-1",
        appointment_id: "appointment-1",
        vendor_id: vendor1,
        team_id: null,
        value: new Prisma.Decimal("87500.50"),
        sold_at: new Date("2026-08-14T16:00:00.000Z"),
      },
    ]);

    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.commercial_revenue).toMatchObject({
      total_sales: 1,
      total_revenue: 87500.5,
      by_vendor: [
        {
          vendor_id: vendor1,
          sales: 1,
          revenue: 87500.5,
          average_ticket: 87500.5,
        },
      ],
      by_team: [],
      coverage: {
        team_sales: 0,
        team_percent: 0,
        unassigned_team_sales: 1,
        unassigned_team_revenue: 87500.5,
      },
    });
  });

  it("separa avaliação do evento, NPS e jornada Google", async () => {
    prisma.serviceRating.findMany.mockResolvedValue([
      {
        event_score: 5,
        nps_score: 10,
        google_review_requested_at: new Date(),
        google_review_clicked_at: new Date(),
        google_review_verified_at: null,
      },
      {
        event_score: 3,
        nps_score: 6,
        google_review_requested_at: new Date(),
        google_review_clicked_at: null,
        google_review_verified_at: null,
      },
      {
        event_score: null,
        nps_score: 8,
        google_review_requested_at: null,
        google_review_clicked_at: null,
        google_review_verified_at: null,
      },
    ]);

    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.event_feedback).toEqual({
      event_rating: { average: 4, responses: 2 },
      nps: {
        score: 0,
        responses: 3,
        promoters: 1,
        passives: 1,
        detractors: 1,
      },
      google: { requested: 2, clicked: 1, verified_published: 0 },
    });
  });

  it("calcula potencial FIPE e conversão sem confundir troca com modelo desejado", async () => {
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        confirmation_status: ConfirmationStatus.checked_in,
        vehicle_plate: "ABC1D23",
        vehicle_brand: "Chevrolet",
        vehicle_model: "Onix",
        vehicle_year: "2020",
        vehicle_fipe_value: "R$ 45.500,00",
        description: "Carro na troca: Sim",
      },
      {
        id: "lead-2",
        confirmation_status: ConfirmationStatus.scheduled,
        vehicle_plate: "DEF4G56",
        vehicle_brand: "Volkswagen",
        vehicle_model: "T-Cross",
        vehicle_year: "2023",
        vehicle_fipe_value: "105000.50",
        description: "Carro na troca: Sim",
      },
      {
        id: "lead-3",
        confirmation_status: ConfirmationStatus.pending,
        vehicle_plate: null,
        vehicle_brand: "Chevrolet",
        vehicle_model: "Onix",
        vehicle_year: "2019",
        vehicle_fipe_value: "indisponível",
        description: "Carro na troca: Sim",
      },
    ]);

    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.vehicle_intelligence).toMatchObject({
      coverage: {
        total_leads: 3,
        identified_vehicles: 3,
        with_fipe_value: 2,
        vehicle_percent: 100,
        fipe_percent: 66.67,
      },
      trade_in_fleet: {
        total_fipe: 150500.5,
        average_fipe: 75250.25,
        by_brand: [
          { name: "Chevrolet", count: 2 },
          { name: "Volkswagen", count: 1 },
        ],
        by_model: [
          { name: "Onix", count: 2 },
          { name: "T-Cross", count: 1 },
        ],
      },
      conversion: {
        identified_vehicle_leads: 3,
        sold_with_vehicle: 1,
        conversion_percent: 33.33,
        identified_not_sold: 2,
      },
      desired_vehicle: {
        available: false,
      },
    });
    expect(result.vehicle_intelligence.trade_in_fleet.by_fipe_range).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "30k_to_60k",
          leads: 1,
          sold: 1,
          conversion_percent: 100,
        }),
        expect.objectContaining({
          key: "above_100k",
          leads: 1,
          sold: 0,
          conversion_percent: 0,
        }),
      ]),
    );
  });

  it("limita mídia a 30 dias quando o evento não tem data de lançamento", async () => {
    const event = await prisma.event.findUnique();
    prisma.event.findUnique.mockResolvedValue({ ...event, launch_date: null });
    prisma.metaCampaign.findMany.mockResolvedValue([
      {
        meta_campaign_id: "campaign-1",
        name: "Campanha antiga vinculada",
        start_time: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.attribution_period).toMatchObject({
      from: new Date("2026-07-15T00:00:00.000Z"),
      source: "default_30_days",
      default_lookback_days: 30,
      campaigns_started_before_window: 1,
    });
    expect(result.data_quality.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("30 dias"),
        expect.stringContaining("gasto anterior não foi incluído"),
      ]),
    );
    expect(prisma.metaDailyInsight.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({
            gte: new Date("2026-07-15T00:00:00.000Z"),
          }),
        }),
      }),
    );
  });
});
