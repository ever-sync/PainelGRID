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
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      scoreEvent: { findMany: jest.fn().mockResolvedValue([]) },
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

    expect(typeof result.generated_at).toBe("string");
  });
});

describe("EventDashboardService.getExecutiveReport attribution", () => {
  const eventId = "99999999-9999-4999-8999-999999999999";
  const clientId = "11111111-1111-4111-8111-111111111111";
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { lead_id: "lead-1", value: new Prisma.Decimal("100000") },
          ]),
      },
      metaLeadImport: {
        findMany: jest.fn().mockResolvedValue([
          {
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { lead_id: "lead-1", status: AppointmentStatus.completed },
          ]),
        count: jest.fn().mockResolvedValue(1),
      },
      metaCampaignAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ meta_campaign_id: "campaign-1" }]),
      },
      metaDailyInsight: {
        findMany: jest.fn().mockResolvedValue([
          {
            level: "campaign",
            entity_id: "campaign-1",
            spend: new Prisma.Decimal("1000"),
          },
          {
            level: "adset",
            entity_id: "adset-1",
            spend: new Prisma.Decimal("600"),
          },
          { level: "ad", entity_id: "ad-1", spend: new Prisma.Decimal("300") },
        ]),
      },
      serviceRating: { groupBy: jest.fn().mockResolvedValue([]) },
      message: { count: jest.fn().mockResolvedValue(0) },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      agentActionLog: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new EventDashboardService(prisma, { client: {} } as never);
  });

  it("cruza resultados e investimento por campanha, conjunto e anuncio sem duplicar a venda", async () => {
    const result = await service.getExecutiveReport(gestor, eventId);

    expect(result.attribution_by_level.campaigns[0]).toMatchObject({
      entity_id: "campaign-1",
      leads: 1,
      scheduled: 1,
      checked_in: 1,
      sold: 1,
      revenue: 100000,
      spend: 1000,
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
    expect(result.attribution_coverage).toEqual({
      attributed_leads: 1,
      total_leads: 1,
      attributed_sold: 1,
      total_sold: 1,
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
});
