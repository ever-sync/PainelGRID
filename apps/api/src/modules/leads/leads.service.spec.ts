import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfirmationStatus, LeadSource } from "@prisma/client";
import { Role } from "../../common/types";
import { LeadsService } from "./leads.service";

describe("LeadsService", () => {
  const clientId = "22222222-2222-4222-8222-222222222222";
  const partnerClientId = "33333333-3333-4333-8333-333333333333";
  const gestorId = "11111111-1111-4111-8111-111111111111";
  const vendorId = "44444444-4444-4444-8444-444444444444";
  const eventId = "55555555-5555-4555-8555-555555555555";
  const teamId = "66666666-6666-4666-8666-666666666666";

  let prisma: {
    lead: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      createMany: jest.Mock;
    };
    crmStage: { findFirst: jest.Mock; findUnique: jest.Mock };
    crmPipeline: { findFirst: jest.Mock };
    crmHistory: { create: jest.Mock; deleteMany: jest.Mock };
    event: { findFirst: jest.Mock };
    user: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    vendorAttendance: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    vendorAvailability: { upsert: jest.Mock; updateMany: jest.Mock };
    salesTeamMember: { findFirst: jest.Mock };
    metaAssetSelection: { findMany: jest.Mock; findFirst: jest.Mock };
    metaLeadRoutingRule: { findMany: jest.Mock };
    metaAd: { findMany: jest.Mock };
    metaAdSet: { findMany: jest.Mock };
    metaCampaign: { findMany: jest.Mock };
    metaLeadImport: { upsert: jest.Mock; deleteMany: jest.Mock };
    conversation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    message: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    appointment: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    scoreEvent: { deleteMany: jest.Mock };
    sale: { deleteMany: jest.Mock };
    conversationState: { deleteMany: jest.Mock };
    agentActionLog: { deleteMany: jest.Mock };
    whatsAppAttributionEvent: { deleteMany: jest.Mock };
    dispatchEvent: { deleteMany: jest.Mock };
    operationalIssue: { deleteMany: jest.Mock; upsert: jest.Mock };
    leadTimeline: { deleteMany: jest.Mock };
    webhookEvent: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let clientsService: {
    assertGestorOwnsClient: jest.Mock;
  };
  let realtimeEvents: {
    emitLeadCheckin: jest.Mock;
    emitLeadUpdated: jest.Mock;
    emitVendorCalled: jest.Mock;
    emitVendorAttendanceUpdated: jest.Mock;
    emitVendorAvailabilityChanged: jest.Mock;
    emitNewMessage: jest.Mock;
    getOnlineUserIds: jest.Mock;
    isUserOnline: jest.Mock;
  };
  let leadTimeline: { record: jest.Mock; originFromSource: jest.Mock };
  let metaService: {
    sendClientWhatsappMessage: jest.Mock;
    sendClientWhatsappMediaMessage: jest.Mock;
    sendClientWhatsappTemplate: jest.Mock;
  };
  let appointmentsService: {
    sendEventCredentialEmailForAutomation: jest.Mock;
  };
  let service: LeadsService;

  beforeEach(() => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        createMany: jest.fn(),
      },
      crmStage: { findFirst: jest.fn(), findUnique: jest.fn() },
      crmPipeline: { findFirst: jest.fn() },
      crmHistory: { create: jest.fn(), deleteMany: jest.fn() },
      event: { findFirst: jest.fn() },
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      vendorAttendance: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      vendorAvailability: { upsert: jest.fn(), updateMany: jest.fn() },
      salesTeamMember: { findFirst: jest.fn() },
      metaAssetSelection: { findMany: jest.fn(), findFirst: jest.fn() },
      metaLeadRoutingRule: { findMany: jest.fn() },
      metaAd: { findMany: jest.fn() },
      metaAdSet: { findMany: jest.fn() },
      metaCampaign: { findMany: jest.fn() },
      metaLeadImport: { upsert: jest.fn(), deleteMany: jest.fn() },
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      message: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      scoreEvent: { deleteMany: jest.fn() },
      sale: { deleteMany: jest.fn() },
      conversationState: { deleteMany: jest.fn() },
      agentActionLog: { deleteMany: jest.fn() },
      whatsAppAttributionEvent: { deleteMany: jest.fn() },
      dispatchEvent: { deleteMany: jest.fn() },
      operationalIssue: { deleteMany: jest.fn(), upsert: jest.fn() },
      leadTimeline: { deleteMany: jest.fn() },
      webhookEvent: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.createMany.mockResolvedValue({ count: 0 });
    prisma.lead.delete.mockResolvedValue({ id: "lead-deleted" });
    prisma.crmStage.findFirst.mockResolvedValue(null);
    prisma.crmStage.findUnique.mockResolvedValue(null);
    prisma.crmPipeline.findFirst.mockResolvedValue(null);
    prisma.crmHistory.create.mockResolvedValue({ id: "hist-1" });
    prisma.crmHistory.deleteMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: gestorId });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.vendorAttendance.findMany.mockResolvedValue([]);
    prisma.vendorAttendance.findFirst.mockResolvedValue(null);
    prisma.vendorAttendance.update.mockResolvedValue({});
    prisma.vendorAttendance.updateMany.mockResolvedValue({ count: 0 });
    prisma.vendorAvailability.upsert.mockResolvedValue({});
    prisma.vendorAvailability.updateMany.mockResolvedValue({ count: 0 });
    prisma.metaAssetSelection.findMany.mockResolvedValue([
      {
        form_id: "27515534804767924",
        form_name: "Form - OFICIAL-copy",
      },
    ]);
    prisma.metaAssetSelection.findFirst.mockResolvedValue({
      phone_number_id: "phone-number-shared",
    });
    prisma.metaLeadRoutingRule.findMany.mockResolvedValue([]);
    prisma.metaAd.findMany.mockResolvedValue([]);
    prisma.metaAdSet.findMany.mockResolvedValue([]);
    prisma.metaCampaign.findMany.mockResolvedValue([]);
    prisma.metaLeadImport.upsert.mockResolvedValue({ id: "meta-import-1" });
    prisma.metaLeadImport.deleteMany.mockResolvedValue({ count: 0 });
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: "conversation-1",
      last_message_at: null,
      created_at: new Date("2026-08-04T00:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue({});
    prisma.message.findUnique.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({
      id: "message-1",
      conversation_id: "conversation-1",
      content: "Template WhatsApp enviado: boas_vindas_a",
      created_at: new Date("2026-08-04T00:00:01.000Z"),
    });
    for (const model of [
      prisma.conversation,
      prisma.message,
      prisma.appointment,
      prisma.scoreEvent,
      prisma.sale,
      prisma.conversationState,
      prisma.agentActionLog,
      prisma.whatsAppAttributionEvent,
      prisma.dispatchEvent,
      prisma.operationalIssue,
      prisma.leadTimeline,
      prisma.webhookEvent,
    ]) {
      model.deleteMany?.mockResolvedValue({ count: 0 });
    }
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$executeRaw.mockResolvedValue(0);
    clientsService = {
      assertGestorOwnsClient: jest.fn(),
    };
    realtimeEvents = {
      emitLeadCheckin: jest.fn(),
      emitLeadUpdated: jest.fn(),
      emitVendorCalled: jest.fn(),
      emitVendorAttendanceUpdated: jest.fn(),
      emitVendorAvailabilityChanged: jest.fn(),
      emitNewMessage: jest.fn(),
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    };
    leadTimeline = {
      record: jest.fn().mockResolvedValue(undefined),
      originFromSource: jest.fn(() => "crm"),
    };
    metaService = {
      sendClientWhatsappMessage: jest.fn(),
      sendClientWhatsappMediaMessage: jest.fn(),
      sendClientWhatsappTemplate: jest
        .fn()
        .mockResolvedValue("wamid-template-1"),
    };
    appointmentsService = {
      sendEventCredentialEmailForAutomation: jest
        .fn()
        .mockResolvedValue({ sent: true, idempotent_replay: false }),
    };

    service = new LeadsService(
      prisma as never,
      clientsService as never,
      {
        get: jest.fn((key: string, fallback?: unknown) =>
          key === "LEADFLOW_INTEGRATION_ACTOR_USER_ID" ? gestorId : fallback,
        ),
      } as never,
      // `closeAttendance` pontua a venda por fora da transacao, via `award`, e
      // encadeia `.catch` no retorno — o mock precisa devolver promise.
      {
        awardWithTx: jest.fn(),
        award: jest.fn().mockResolvedValue(undefined),
      } as never,
      realtimeEvents as never,
      { dispatch: jest.fn() } as never,
      metaService as never,
      leadTimeline as never,
      { upsert: jest.fn().mockResolvedValue({ id: "dispatch-1" }) } as never,
      appointmentsService as never,
      {
        sendCredentialRecoveryEmail: jest.fn(),
      } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("mantem elegivel o vendedor ONLINE mesmo sem socket conectado", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: vendorId,
        name: "Vendedor online",
        vendor_availability: { status: "online", last_assigned_at: null },
        sales_team_memberships: [],
      },
      {
        id: "vendor-away",
        name: "Vendedor ausente",
        vendor_availability: { status: "away", last_assigned_at: null },
        sales_team_memberships: [],
      },
    ]);

    const result = await service.listVendorAvailability({
      sub: gestorId,
      role: Role.CLIENTE,
      client_id: clientId,
    } as never);

    expect(result).toEqual([
      expect.objectContaining({
        id: vendorId,
        connected: false,
        operational_status: "online",
        eligible: true,
      }),
      expect.objectContaining({
        id: "vendor-away",
        connected: false,
        operational_status: "away",
        eligible: false,
      }),
    ]);
  });

  it("carrega a fila da recepcao em uma consulta enxuta de leads", async () => {
    const event = { id: eventId, name: "Evento ativo" };
    const queueLead = {
      id: "lead-queue-1",
      name: "Lead na fila",
      phone: "5511999999999",
      assigned_vendor_id: null,
      confirmation_date: new Date("2026-08-14T12:00:00.000Z"),
      store_visit_datetime: null,
      created_at: new Date("2026-08-14T11:00:00.000Z"),
      updated_at: new Date("2026-08-14T12:00:00.000Z"),
    };
    prisma.event.findFirst.mockResolvedValue(event);
    prisma.lead.findMany.mockResolvedValue([queueLead]);

    const result = await service.getReceptionQueue({
      sub: "reception-1",
      role: Role.RECEPCAO,
      name: "Recepcao",
      email: "recepcao@teste.com",
      client_id: clientId,
    });

    expect(result).toEqual({ event, leads: [queueLead] });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          client_id: clientId,
          event_interest_id: eventId,
          confirmation_status: ConfirmationStatus.checked_in,
          deleted_at: null,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          assigned_vendor_id: true,
          confirmation_date: true,
          store_visit_datetime: true,
          created_at: true,
          updated_at: true,
        },
      }),
    );
  });

  it("exporta CSV com cabeçalho e linha de lead", async () => {
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        client_id: clientId,
        name: "Lead Teste",
        email: "lead@teste.com",
        phone: "11999999999",
        source: LeadSource.manual,
        tags: ["vip", "quente"],
        crm_pipeline_id: null,
        crm_stage_id: null,
        crm_stage: { id: "stage-1", code: "LEAD_NOVO", name: "Novo" },
        event_interest: { id: "event-1", name: "Evento XPTO" },
        event_interest_id: "event-1",
        confirmation_status: "pending",
        notes: "Observacao",
        created_at: new Date("2026-05-03T12:00:00.000Z"),
        appointments: [],
      },
    ]);

    const csv = await service.exportCsv(
      {
        sub: gestorId,
        role: Role.GESTOR,
        name: "Gestor",
        email: "gestor@teste.com",
        client_id: null,
      },
      {
        client_id: clientId,
      },
    );

    expect(csv).toContain("id,client_id,name,email,phone,source");
    expect(csv).toContain("Lead Teste");
    expect(csv).toContain("LEAD_NOVO");
    expect(csv).toContain("vip|quente");
    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(
      gestorId,
      clientId,
    );
  });

  it("importa CSV para cliente do gestor usando createMany em batch", async () => {
    prisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await service.importCsv(
      {
        sub: gestorId,
        role: Role.GESTOR,
        name: "Gestor",
        email: "gestor@teste.com",
        client_id: null,
      },
      { client_id: clientId },
      {
        buffer: Buffer.from(
          "name,email,phone,source,tags,notes\nLead Um,lead@um.com,11911111111,manual,vip|novo,Obs",
          "utf8",
        ),
      },
    );

    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(
      gestorId,
      clientId,
    );
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            client_id: clientId,
            name: "Lead Um",
            source: LeadSource.manual,
            tags: ["vip", "novo"],
          }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
  });

  it("rejeita arquivo com extensao XLSX sem assinatura ZIP", async () => {
    await expect(
      service.importCsv(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "Gestor",
          email: "gestor@teste.com",
          client_id: null,
        },
        { client_id: clientId },
        {
          buffer: Buffer.from("conteudo falso"),
          originalname: "leads.xlsx",
          mimetype:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ),
    ).rejects.toThrow("Arquivo XLSX invalido");
  });

  it("importa CSV ignorando linhas com telefone ja existente (bulk dedup)", async () => {
    prisma.lead.findMany.mockResolvedValue([{ phone: "+5511911111111" }]);
    prisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await service.importCsv(
      {
        sub: "vendor-1",
        role: Role.VENDEDOR,
        name: "V",
        email: "v@x",
        client_id: clientId,
      },
      {},
      {
        buffer: Buffer.from(
          "name,phone\nLead Dup,11911111111\nLead Novo,11922222222",
          "utf8",
        ),
      },
    );

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.errors[0]).toContain("telefone ja cadastrado");
  });

  it("bloqueia importacao de gestor sem client_id", async () => {
    await expect(
      service.importCsv(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "Gestor",
          email: "gestor@teste.com",
          client_id: null,
        },
        {},
        {
          buffer: Buffer.from("name\nLead", "utf8"),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("bloqueia importacao com source invalido", async () => {
    const result = await service.importCsv(
      {
        sub: "vendor-1",
        role: Role.VENDEDOR,
        name: "Vendedor",
        email: "vend@teste.com",
        client_id: clientId,
      },
      {},
      {
        buffer: Buffer.from("name,source\nLead Invalido,nao_existe", "utf8"),
      },
    );

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.createMany).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain("source invalido");
  });

  it("bloqueia criacao de lead com telefone duplicado", async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    await expect(
      service.create(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "Gestor",
          email: "gestor@teste.com",
          client_id: null,
        },
        {
          client_id: clientId,
          name: "Novo Lead",
          phone: "11987654321",
          source: LeadSource.manual,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("bloqueia vendedor quando o telefone ja esta cadastrado no mesmo evento", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: clientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });
    prisma.event.findFirst.mockResolvedValue({ id: eventId });
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    await expect(
      service.create(
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: "Vendedor",
          email: "vend@teste.com",
          client_id: clientId,
        },
        {
          client_id: clientId,
          name: "Lead repetido",
          phone: "11987654321",
          source: LeadSource.manual,
          event_interest_id: eventId,
        } as never,
      ),
    ).rejects.toThrow("Telefone ja cadastrado neste evento");

    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: clientId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { event_interest_id: eventId },
                { appointments: { some: { event_id: eventId } } },
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("cria lead do vendedor já vinculado ao time do evento", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: clientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });
    prisma.event.findFirst.mockResolvedValue({ id: eventId });
    prisma.lead.create.mockResolvedValue({
      ...baseExistingLead,
      id: "lead-vendor",
      client_id: clientId,
      event_interest_id: eventId,
      assigned_vendor_id: vendorId,
      team_id: teamId,
    });

    await service.create(
      {
        sub: vendorId,
        role: Role.VENDEDOR,
        name: "Vendedor",
        email: "vend@teste.com",
        client_id: clientId,
      },
      {
        client_id: clientId,
        name: "Lead do Evento",
        phone: "11977777777",
        source: LeadSource.manual,
        event_interest_id: eventId,
      } as never,
    );

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          assigned_vendor_id: vendorId,
          registered_by_id: vendorId,
          event_interest_id: eventId,
          team_id: teamId,
        }),
      }),
    );
  });

  it("bloqueia atribuir lead para vendedor de outra empresa", async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      id: "lead-transfer",
      client_id: clientId,
      event_interest_id: eventId,
      assigned_vendor_id: null,
      team_id: null,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: partnerClientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });

    await expect(
      service.update(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "Gestor",
          email: "gestor@teste.com",
          client_id: null,
        },
        "lead-transfer",
        {
          assigned_vendor_id: vendorId,
          event_interest_id: eventId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("bloqueia vendedor tentando importar para outro cliente", async () => {
    await expect(
      service.importCsv(
        {
          sub: "vendor-1",
          role: Role.VENDEDOR,
          name: "Vendedor",
          email: "vend@teste.com",
          client_id: clientId,
        },
        { client_id: "33333333-3333-4333-8333-333333333333" },
        {
          buffer: Buffer.from("name\nLead", "utf8"),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── createForIntegration — deduplicação ──────────────────────────────────

  const baseExistingLead = {
    id: "lead-existente-1",
    client_id: clientId,
    name: "Ana Silva",
    email: "ana@example.com",
    phone: "11999999999",
    source: LeadSource.form_page,
    tags: [],
    crm_pipeline_id: null,
    crm_stage_id: null,
    crm_stage: null,
    crm_pipeline: null,
    event_interest: null,
    event_interest_id: null,
    confirmation_status: "pending",
    confirmation_date: null,
    store_visit_datetime: null,
    team_id: null,
    assigned_vendor_id: null,
    campaign_id: null,
    notes: null,
    facebook_lead_id: null,
    checkin_token: null,
    created_at: new Date("2026-05-01T10:00:00.000Z"),
    updated_at: new Date("2026-05-01T10:00:00.000Z"),
    appointments: [],
    deleted_at: null,
  };

  it("impede vendedor de assumir lead ja cadastrado no evento", async () => {
    prisma.lead.findFirst.mockResolvedValue({
      ...baseExistingLead,
      event_interest_id: eventId,
    });

    await expect(
      service.assignToMe(
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: "Vendedor",
          email: "vendedor@teste.com",
          client_id: clientId,
        },
        baseExistingLead.id,
      ),
    ).rejects.toThrow(
      "Lead ja cadastrado neste evento nao pode ser assumido pelo vendedor",
    );
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("remove definitivamente o lead e todos os registros relacionados", async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);
    prisma.conversation.findMany.mockResolvedValue([
      { id: "conversation-1" },
      { id: "conversation-2" },
    ]);
    prisma.appointment.findMany.mockResolvedValue([{ id: "appointment-1" }]);
    prisma.message.deleteMany.mockResolvedValue({ count: 7 });
    prisma.conversation.deleteMany.mockResolvedValue({ count: 2 });
    prisma.appointment.deleteMany.mockResolvedValue({ count: 1 });
    prisma.agentActionLog.deleteMany.mockResolvedValue({ count: 3 });
    prisma.metaLeadImport.deleteMany.mockResolvedValue({ count: 1 });
    prisma.dispatchEvent.deleteMany.mockResolvedValue({ count: 4 });
    prisma.operationalIssue.deleteMany.mockResolvedValue({ count: 2 });
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    prisma.$executeRaw.mockResolvedValue(5);

    const result = await service.remove(
      {
        sub: "cliente-user",
        role: Role.CLIENTE,
        name: "Cliente",
        email: "cliente@teste.com",
        client_id: clientId,
      },
      baseExistingLead.id,
    );

    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        rescheduled_from_appointment_id: { in: ["appointment-1"] },
      },
      data: { rescheduled_from_appointment_id: null },
    });
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: {
        conversation_id: { in: ["conversation-1", "conversation-2"] },
      },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.dispatchEvent.deleteMany).toHaveBeenCalledWith({
      where: { lead_id: baseExistingLead.id },
    });
    expect(prisma.operationalIssue.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { lead_id: baseExistingLead.id },
          {
            conversation_id: {
              in: ["conversation-1", "conversation-2"],
            },
          },
        ],
      },
    });
    expect(prisma.lead.delete).toHaveBeenCalledWith({
      where: { id: baseExistingLead.id },
    });
    expect(prisma.lead.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleted_at: expect.anything() }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        deleted: true,
        hard_deleted: true,
        related_records: expect.objectContaining({
          messages: 7,
          conversations: 2,
          appointments: 1,
          agent_action_logs: 3,
          meta_lead_imports: 1,
          dispatch_events: 4,
          operational_issues: 2,
          n8n_agent_memory: 5,
        }),
      }),
    );
  });

  it("agenda silenciosamente e move o lead quando o Rubinho salva a primeira data", async () => {
    const scheduledAt = "2026-08-15T12:00:00.000Z";
    const scheduledStage = {
      id: "77777777-7777-4777-8777-777777777777",
      pipeline_id: "88888888-8888-4888-8888-888888888888",
    };
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);
    prisma.crmStage.findFirst.mockResolvedValue(scheduledStage);
    prisma.lead.update.mockResolvedValue({
      ...baseExistingLead,
      tags: ["agendado"],
      store_visit_datetime: new Date(scheduledAt),
      confirmation_status: ConfirmationStatus.scheduled,
      crm_stage_id: scheduledStage.id,
      crm_pipeline_id: scheduledStage.pipeline_id,
      crm_stage: { id: scheduledStage.id, name: "Presenca agendada" },
    });

    await service.patchLeadForIntegration(baseExistingLead.id, {
      store_visit_datetime: scheduledAt,
    });

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseExistingLead.id },
        data: expect.objectContaining({
          store_visit_datetime: new Date(scheduledAt),
          crm_stage_id: scheduledStage.id,
          crm_pipeline_id: scheduledStage.pipeline_id,
          confirmation_status: ConfirmationStatus.scheduled,
          tags: ["agendado"],
        }),
      }),
    );
    expect(metaService.sendClientWhatsappMediaMessage).not.toHaveBeenCalled();
    expect(
      appointmentsService.sendEventCredentialEmailForAutomation,
    ).toHaveBeenCalledWith(
      baseExistingLead.id,
      `lead-scheduled-email:${baseExistingLead.id}:${scheduledAt}`,
    );
    expect(leadTimeline.record).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: baseExistingLead.id,
        eventType: "stage_moved",
        origin: "automation",
        toStageId: scheduledStage.id,
        actorLabel: "Rubinho",
      }),
    );
  });

  it("createForIntegration: retorna lead existente com already_existed=true quando telefone coincide", async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    const result = await service.createForIntegration({
      client_id: clientId,
      name: "Ana Silva",
      phone: "11999999999",
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(result.already_existed).toBe(true);
    expect(result.id).toBe("lead-existente-1");
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: clientId,
          deleted_at: null,
          OR: expect.arrayContaining([{ phone: "11999999999" }]),
        }),
      }),
    );
  });

  it("createForIntegration: retorna lead existente com already_existed=true quando e-mail coincide", async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    const result = await service.createForIntegration({
      client_id: clientId,
      name: "Ana Silva",
      email: "ANA@EXAMPLE.COM",
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(result.already_existed).toBe(true);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ email: "ana@example.com" }]),
        }),
      }),
    );
  });

  it("createForIntegration: cria novo lead com already_existed=false quando nao existe duplicata", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue({
      ...baseExistingLead,
      id: "lead-novo-1",
    });

    const result = await service.createForIntegration({
      client_id: clientId,
      name: "Bruno Costa",
      phone: "11988888888",
      email: "bruno@example.com",
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          name: "Bruno Costa",
          phone: "+5511988888888",
          email: "bruno@example.com",
        }),
      }),
    );
    expect(result.already_existed).toBe(false);
    expect(result.id).toBe("lead-novo-1");
  });

  it("importa o payload bruto do Facebook com metadados de campanha no lead", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue({
      ...baseExistingLead,
      id: "lead-facebook-1",
      source: LeadSource.facebook_ads,
      external_ref: "1946096999403754",
      facebook_lead_id: "1946096999403754",
      facebook_form_id: "27515534804767924",
      facebook_ad_id: "120247888509270620",
      facebook_ad_name: "Novo anúncio de Leads",
      facebook_campaign_id: "120247888509250620",
      facebook_campaign_name: "teste",
      preferred_contact_channel: "whatsapp",
      source_created_at: new Date("2026-07-14T02:25:25.000Z"),
      source_payload: { lead_id: "1946096999403754" },
    });

    const result = await service.createFacebookLeadsForIntegration(clientId, [
      {
        lead_id: "1946096999403754",
        nome: "Raphael",
        email: "raphaelbetel3@gmail.com",
        telefone: "+5512981092776",
        preferencia_atendimento: "whatsapp",
        formulario_id: "27515534804767924",
        anuncio_id: "120247888509270620",
        anuncio: "Novo anúncio de Leads",
        campanha_id: "120247888509250620",
        campanha: "teste",
        criado_em: "2026-07-14T02:25:25+0000",
        origem: "facebook_lead_ads",
        todos_os_campos: {
          "prefere_ser_atendido_por:": "whatsapp",
          full_name: "Raphael",
          phone_number: "+5512981092776",
          email: "raphaelbetel3@gmail.com",
        },
      },
    ]);

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          name: "Raphael",
          email: "raphaelbetel3@gmail.com",
          phone: "+5512981092776",
          source: LeadSource.facebook_ads,
          external_ref: "1946096999403754",
          facebook_lead_id: "1946096999403754",
          facebook_form_id: "27515534804767924",
          facebook_ad_id: "120247888509270620",
          facebook_ad_name: "Novo anúncio de Leads",
          facebook_campaign_id: "120247888509250620",
          facebook_campaign_name: "teste",
          preferred_contact_channel: "whatsapp",
          source_created_at: new Date("2026-07-14T02:25:25.000Z"),
          source_payload: expect.objectContaining({
            origem: "facebook_lead_ads",
            todos_os_campos: expect.objectContaining({ full_name: "Raphael" }),
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      received: 1,
      created: 1,
      already_existed: 0,
    });
    expect(result.validated_forms).toEqual([
      { id: "27515534804767924", name: "Form - OFICIAL-copy" },
    ]);
    expect(result.items[0]).toMatchObject({
      id: "lead-facebook-1",
      facebook_campaign_name: "teste",
      already_existed: false,
    });
  });

  it("reenvio do Facebook atualiza atribuicao no lead existente sem duplicar", async () => {
    prisma.lead.findFirst.mockResolvedValue({
      ...baseExistingLead,
      external_ref: "1946096999403754",
      source_created_at: new Date("2026-07-13T02:25:25.000Z"),
    });
    prisma.lead.update.mockResolvedValue({
      ...baseExistingLead,
      external_ref: "1946096999403754",
      facebook_lead_id: "1946096999403754",
      facebook_campaign_id: "120247888509250620",
      facebook_campaign_name: "teste",
      source_created_at: new Date("2026-07-14T02:25:25.000Z"),
      source_payload: { lead_id: "1946096999403754" },
    });

    const result = await service.createFacebookLeadsForIntegration(clientId, [
      {
        lead_id: "1946096999403754",
        nome: "Raphael",
        campanha_id: "120247888509250620",
        campanha: "teste",
        criado_em: "2026-07-14T02:25:25+0000",
        formulario_id: "27515534804767924",
      },
    ]);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseExistingLead.id },
        data: expect.objectContaining({
          facebook_lead_id: "1946096999403754",
          facebook_campaign_id: "120247888509250620",
          facebook_campaign_name: "teste",
          source_created_at: new Date("2026-07-14T02:25:25.000Z"),
        }),
      }),
    );
    expect(result).toMatchObject({
      received: 1,
      created: 0,
      already_existed: 1,
    });
  });

  it("prioriza lead ativo pelo telefone quando o mesmo lead_id pertence a um arquivado", async () => {
    const activeLead = {
      ...baseExistingLead,
      id: "lead-ativo-pelo-telefone",
      name: "Raphael",
      email: "raphaelbetel3@gmail.com",
      phone: "+5512981092776",
      external_ref: "lead-meta-anterior",
      facebook_lead_id: "lead-meta-anterior",
      source_created_at: new Date("2026-07-13T23:00:45.000Z"),
    };
    const archivedLead = {
      ...baseExistingLead,
      id: "lead-arquivado-pelo-id-meta",
      name: "Raphael",
      email: null,
      phone: "+5512981092776",
      external_ref: "1946096999403754",
      facebook_lead_id: "1946096999403754",
      deleted_at: new Date("2026-08-03T13:11:34.233Z"),
    };

    prisma.lead.findFirst.mockImplementation(async ({ where }) => {
      const conditions = Array.isArray(where?.OR) ? where.OR : [];
      if (
        conditions.some(
          (condition: Record<string, unknown>) => "phone" in condition,
        )
      ) {
        return activeLead;
      }
      if (
        conditions.some(
          (condition: Record<string, unknown>) => "external_ref" in condition,
        )
      ) {
        return archivedLead;
      }
      return null;
    });
    prisma.lead.update.mockImplementation(async ({ data }) => ({
      ...activeLead,
      ...data,
    }));

    const result = await service.createFacebookLeadsForIntegration(clientId, [
      {
        lead_id: "1946096999403754",
        nome: "Raphael",
        email: "raphaelbetel3@gmail.com",
        telefone: "+5512981092776",
        formulario_id: "27515534804767924",
        criado_em: "2026-07-14T02:25:25+0000",
      },
    ]);

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: activeLead.id },
        data: expect.not.objectContaining({ deleted_at: null }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: activeLead.id,
      already_existed: true,
    });
  });

  it("reativa lead arquivado encontrado pelo id do Facebook e preenche e-mail vazio", async () => {
    const archivedLead = {
      ...baseExistingLead,
      email: null,
      external_ref: "1946096999403754",
      facebook_lead_id: "1946096999403754",
      deleted_at: new Date("2026-08-01T10:00:00.000Z"),
    };
    prisma.lead.findFirst.mockImplementation(async ({ where }) => {
      if (where?.deleted_at?.not === null) {
        return archivedLead;
      }
      return null;
    });
    prisma.lead.update.mockResolvedValue({
      ...baseExistingLead,
      email: "raphaelbetel3@gmail.com",
      external_ref: "1946096999403754",
      facebook_lead_id: "1946096999403754",
      deleted_at: null,
    });

    const result = await service.createFacebookLeadsForIntegration(clientId, [
      {
        lead_id: "1946096999403754",
        nome: "Raphael",
        email: "raphaelbetel3@gmail.com",
        formulario_id: "27515534804767924",
      },
    ]);

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseExistingLead.id },
        data: expect.objectContaining({
          deleted_at: null,
          email: "raphaelbetel3@gmail.com",
        }),
      }),
    );
    expect(result).toMatchObject({
      received: 1,
      created: 0,
      already_existed: 1,
    });
  });

  it("rejeita formulario do Facebook que nao foi selecionado para o cliente", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValue([]);

    await expect(
      service.createFacebookLeadsForIntegration(clientId, [
        {
          lead_id: "meta-lead-outro-cliente",
          nome: "Lead externo",
          formulario_id: "formulario-de-outro-cliente",
        },
      ]),
    ).rejects.toThrow(
      new ForbiddenException(
        "Formulario Meta nao vinculado ao cliente desta integracao: formulario-de-outro-cliente",
      ),
    );

    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  const buildAutomaticRoutingRule = (
    formId: string,
    ownerClientId: string,
    suffix: string,
  ) => ({
    form_id: formId,
    form_name: `Formulario ${suffix}`,
    client_id: ownerClientId,
    event_id: `event-${suffix}`,
    crm_pipeline_id: `pipeline-${suffix}`,
    call_stage_id: `stage-call-${suffix}`,
    whatsapp_stage_id: `stage-whatsapp-${suffix}`,
    whatsapp_template_name: `boas_vindas_${suffix.toLowerCase()}`,
    whatsapp_template_language: "pt_BR",
    whatsapp_template_parameter_keys: ["lead_name", "event_name"],
    client: {
      company_name: `Cliente ${suffix}`,
      settings: {
        crm_stage_status_rules: [
          {
            status: ConfirmationStatus.pending,
            stage_id: `stage-call-${suffix}`,
          },
        ],
      },
    },
    event: {
      name: `Evento ${suffix}`,
      event_date: new Date("2026-08-14T15:00:00.000Z"),
      location: `Loja ${suffix}`,
      participants: [{ client_id: ownerClientId }],
    },
    crm_pipeline: {
      client_id: ownerClientId,
      code: `PIPELINE_${suffix}`,
      is_active: true,
    },
    call_stage: {
      id: `stage-call-${suffix}`,
      client_id: ownerClientId,
      pipeline_id: `pipeline-${suffix}`,
      code: `CALL_${suffix}`,
      name: `Ligacao ${suffix}`,
    },
    whatsapp_stage: {
      id: `stage-whatsapp-${suffix}`,
      client_id: ownerClientId,
      pipeline_id: `pipeline-${suffix}`,
      code: `WHATSAPP_${suffix}`,
      name: `WhatsApp ${suffix}`,
    },
  });

  const buildAutomaticLead = (
    id: string,
    data: Record<string, unknown>,
    suffix: string,
  ) => {
    const stageId =
      typeof data.crm_stage_id === "string" ? data.crm_stage_id : null;
    const pipelineId =
      typeof data.crm_pipeline_id === "string" ? data.crm_pipeline_id : null;
    const interestEventId =
      typeof data.event_interest_id === "string"
        ? data.event_interest_id
        : null;

    return {
      ...baseExistingLead,
      id,
      source: LeadSource.facebook_ads,
      external_ref: null,
      facebook_form_id: null,
      facebook_ad_id: null,
      facebook_ad_name: null,
      facebook_campaign_id: null,
      facebook_campaign_name: null,
      preferred_contact_channel: null,
      source_created_at: null,
      source_payload: null,
      ...data,
      crm_stage: stageId
        ? {
            id: stageId,
            code: stageId.includes("whatsapp")
              ? `WHATSAPP_${suffix}`
              : `CALL_${suffix}`,
            name: stageId.includes("whatsapp")
              ? `WhatsApp ${suffix}`
              : `Ligacao ${suffix}`,
          }
        : null,
      crm_pipeline: pipelineId
        ? { id: pipelineId, code: `PIPELINE_${suffix}` }
        : null,
      event_interest: interestEventId
        ? { id: interestEventId, name: `Evento ${suffix}` }
        : null,
      updated_at: new Date("2026-08-03T19:00:00.000Z"),
    };
  };

  it("resolve clientes e roteia WhatsApp/ligacao em uma unica transacao", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-cliente-a",
        form_name: "Formulario Cliente A",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
      {
        form_id: "form-cliente-b",
        form_name: "Formulario Cliente B",
        meta_connection: { id: "connection-b", client_id: partnerClientId },
      },
    ]);
    prisma.metaLeadRoutingRule.findMany.mockResolvedValueOnce([
      buildAutomaticRoutingRule("form-cliente-a", clientId, "A"),
      buildAutomaticRoutingRule("form-cliente-b", partnerClientId, "B"),
    ]);

    const existingPartnerLead = buildAutomaticLead(
      "lead-b",
      {
        client_id: partnerClientId,
        name: "Lead B",
        phone: "+5511988888888",
        external_ref: "meta-b-anterior",
        facebook_lead_id: "meta-b-anterior",
        event_interest_id: "event-anterior-b",
        crm_pipeline_id: "pipeline-anterior-b",
        crm_stage_id: "stage-whatsapp-anterior-b",
      },
      "B",
    );
    prisma.lead.findFirst.mockImplementation(async ({ where }) => {
      const conditions = Array.isArray(where?.OR) ? where.OR : [];
      const isPhoneLookup = conditions.some(
        (condition: Record<string, unknown>) => "phone" in condition,
      );
      if (where?.client_id === partnerClientId && isPhoneLookup) {
        return existingPartnerLead;
      }
      return null;
    });
    prisma.lead.create.mockImplementation(async ({ data }) =>
      buildAutomaticLead("lead-a", data, "A"),
    );
    prisma.lead.update.mockImplementation(async ({ data }) =>
      buildAutomaticLead("lead-b", { ...existingPartnerLead, ...data }, "B"),
    );

    const result = await service.createFacebookLeadsAutomatically([
      {
        lead_id: "meta-a",
        nome: "Lead A",
        telefone: "11999999999",
        formulario_id: "form-cliente-a",
        preferencia_atendimento: "WhatsApp",
      },
      {
        lead_id: "meta-b",
        nome: "Lead B",
        telefone: "11988888888",
        formulario_id: "form-cliente-b",
        preferencia_atendimento: "ligacao",
      },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          event_interest_id: "event-A",
          crm_pipeline_id: "pipeline-A",
          crm_stage_id: "stage-whatsapp-A",
          preferred_contact_channel: "whatsapp",
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-b" },
        data: expect.objectContaining({
          event_interest_id: "event-B",
          crm_pipeline_id: "pipeline-B",
          crm_stage_id: "stage-call-B",
          preferred_contact_channel: "ligacao",
          confirmation_status: ConfirmationStatus.pending,
        }),
      }),
    );
    expect(prisma.crmHistory.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      received: 2,
      created: 1,
      already_existed: 1,
      transaction: "committed",
      resolved_forms: [
        {
          id: "form-cliente-a",
          name: "Formulario Cliente A",
          client_id: clientId,
          event_id: "event-A",
          whatsapp_stage_id: "stage-whatsapp-A",
        },
        {
          id: "form-cliente-b",
          name: "Formulario Cliente B",
          client_id: partnerClientId,
          event_id: "event-B",
          call_stage_id: "stage-call-B",
        },
      ],
    });
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lead-a",
          already_existed: false,
          routing_applied: expect.objectContaining({
            channel: "whatsapp",
            crm_stage_id: "stage-whatsapp-A",
            stage_moved: true,
          }),
          whatsapp_dispatch: {
            status: "sent",
            template_name: "boas_vindas_a",
            template_language: "pt_BR",
            message_id: "wamid-template-1",
            chat_recorded: true,
          },
        }),
        expect.objectContaining({
          id: "lead-b",
          already_existed: true,
          routing_applied: expect.objectContaining({
            channel: "ligacao",
            crm_stage_id: "stage-call-B",
            stage_moved: true,
          }),
          whatsapp_dispatch: {
            status: "not_requested",
            reason: "channel_ligacao",
          },
        }),
      ]),
    );
    expect(metaService.sendClientWhatsappTemplate).toHaveBeenCalledTimes(1);
    expect(metaService.sendClientWhatsappTemplate).toHaveBeenCalledWith({
      clientId,
      to: "+5511999999999",
      templateName: "boas_vindas_a",
      language: "pt_BR",
      parameters: ["Lead A", "Evento A"],
    });
    expect(realtimeEvents.emitLeadUpdated).toHaveBeenCalledTimes(2);
    expect(leadTimeline.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "created", leadId: "lead-a" }),
    );
    expect(leadTimeline.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "stage_moved", leadId: "lead-b" }),
    );
  });

  it("enriquece e grava a atribuicao anuncio -> conjunto -> campanha na mesma transacao", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-cliente-a",
        form_name: "Formulario Cliente A",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
    ]);
    prisma.metaLeadRoutingRule.findMany.mockResolvedValueOnce([
      buildAutomaticRoutingRule("form-cliente-a", clientId, "A"),
    ]);
    prisma.metaAd.findMany.mockResolvedValueOnce([
      {
        meta_connection_id: "connection-a",
        meta_ad_id: "ad-1",
        meta_ad_set_id: "adset-1",
        meta_campaign_id: "campaign-1",
        meta_creative_id: "creative-1",
        name: "Anuncio 1",
      },
    ]);
    prisma.metaAdSet.findMany.mockResolvedValueOnce([
      {
        meta_connection_id: "connection-a",
        meta_ad_set_id: "adset-1",
        meta_campaign_id: "campaign-1",
        name: "Conjunto 1",
      },
    ]);
    prisma.metaCampaign.findMany.mockResolvedValueOnce([
      {
        meta_connection_id: "connection-a",
        meta_campaign_id: "campaign-1",
        name: "Campanha 1",
      },
    ]);
    prisma.lead.create.mockImplementation(async ({ data }) =>
      buildAutomaticLead("lead-attributed", data, "A"),
    );

    await service.createFacebookLeadsAutomatically([
      {
        lead_id: "meta-attributed",
        nome: "Lead atribuido",
        telefone: "11977777777",
        formulario_id: "form-cliente-a",
        anuncio_id: "ad-1",
        preferencia_atendimento: "whatsapp",
        criado_em: "2026-08-04T00:45:49.000Z",
      },
    ]);

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          facebook_ad_id: "ad-1",
          facebook_ad_name: "Anuncio 1",
          facebook_ad_set_id: "adset-1",
          facebook_ad_set_name: "Conjunto 1",
          facebook_campaign_id: "campaign-1",
          facebook_campaign_name: "Campanha 1",
        }),
      }),
    );
    expect(prisma.metaLeadImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          meta_connection_id_meta_lead_id: {
            meta_connection_id: "connection-a",
            meta_lead_id: "meta-attributed",
          },
        },
        create: expect.objectContaining({
          lead_id: "lead-attributed",
          event_id: "event-A",
          meta_campaign_id: "campaign-1",
          meta_ad_set_id: "adset-1",
          meta_ad_id: "ad-1",
          meta_creative_id: "creative-1",
          preferred_contact_channel: "whatsapp",
        }),
      }),
    );
  });

  it("bloqueia o lote automatico inteiro quando o formulario e desconhecido", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([]);
    await expect(
      service.createFacebookLeadsAutomatically([
        {
          lead_id: "meta-desconhecido",
          nome: "Lead sem cliente",
          formulario_id: "form-desconhecido",
        },
      ]),
    ).rejects.toThrow(
      new ForbiddenException(
        "Formulario Meta nao vinculado a nenhum cliente ativo: form-desconhecido",
      ),
    );

    expect(prisma.metaLeadRoutingRule.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("bloqueia formulario vinculado a clientes diferentes", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-duplicado",
        form_name: "Formulario duplicado",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
      {
        form_id: "form-duplicado",
        form_name: "Formulario duplicado",
        meta_connection: { id: "connection-b", client_id: partnerClientId },
      },
    ]);
    await expect(
      service.createFacebookLeadsAutomatically([
        {
          lead_id: "meta-ambiguo",
          nome: "Lead ambiguo",
          formulario_id: "form-duplicado",
        },
      ]),
    ).rejects.toThrow(
      new ConflictException(
        "Formulario Meta vinculado a mais de um cliente: form-duplicado",
      ),
    );

    expect(prisma.metaLeadRoutingRule.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita formulario selecionado sem regra de roteamento antes da transacao", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-sem-regra",
        form_name: "Formulario sem regra",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
    ]);
    prisma.metaLeadRoutingRule.findMany.mockResolvedValueOnce([]);

    await expect(
      service.createFacebookLeadsAutomatically([
        {
          lead_id: "meta-sem-regra",
          nome: "Lead sem regra",
          formulario_id: "form-sem-regra",
          preferencia_atendimento: "whatsapp",
        },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("preserva etapa avancada no reenvio exato do mesmo lead Meta", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-cliente-a",
        form_name: "Formulario Cliente A",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
    ]);
    prisma.metaLeadRoutingRule.findMany.mockResolvedValueOnce([
      buildAutomaticRoutingRule("form-cliente-a", clientId, "A"),
    ]);
    const progressedLead = buildAutomaticLead(
      "lead-progressed",
      {
        client_id: clientId,
        name: "Lead em atendimento",
        external_ref: "meta-replay",
        facebook_lead_id: "meta-replay",
        event_interest_id: "event-A",
        crm_pipeline_id: "pipeline-A",
        crm_stage_id: "stage-venda-A",
        source_created_at: new Date("2026-08-03T17:00:00.000Z"),
      },
      "A",
    );
    prisma.lead.findFirst.mockImplementation(async ({ where }) =>
      where?.deleted_at === null ? progressedLead : null,
    );
    prisma.lead.update.mockImplementation(async ({ data }) => ({
      ...progressedLead,
      ...data,
    }));

    const result = await service.createFacebookLeadsAutomatically([
      {
        lead_id: "meta-replay",
        nome: "Lead em atendimento",
        formulario_id: "form-cliente-a",
        preferencia_atendimento: "whatsapp",
        criado_em: "2026-08-03T18:00:00.000Z",
      },
    ]);

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          event_interest_id: expect.anything(),
          crm_pipeline_id: expect.anything(),
          crm_stage_id: expect.anything(),
        }),
      }),
    );
    expect(prisma.crmHistory.create).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      id: "lead-progressed",
      already_existed: true,
      crm_stage_id: "stage-venda-A",
      routing_applied: { stage_moved: false },
      whatsapp_dispatch: {
        status: "skipped",
        reason: "duplicate_delivery",
      },
    });
    expect(metaService.sendClientWhatsappTemplate).not.toHaveBeenCalled();
  });

  it("nao publica efeitos externos quando a transacao falha", async () => {
    prisma.metaAssetSelection.findMany.mockResolvedValueOnce([
      {
        form_id: "form-cliente-a",
        form_name: "Formulario Cliente A",
        meta_connection: { id: "connection-a", client_id: clientId },
      },
    ]);
    prisma.metaLeadRoutingRule.findMany.mockResolvedValueOnce([
      buildAutomaticRoutingRule("form-cliente-a", clientId, "A"),
    ]);
    prisma.$transaction.mockRejectedValueOnce(new Error("falha transacional"));

    await expect(
      service.createFacebookLeadsAutomatically([
        {
          lead_id: "meta-falha",
          nome: "Lead falha",
          formulario_id: "form-cliente-a",
          preferencia_atendimento: "whatsapp",
        },
      ]),
    ).rejects.toThrow("falha transacional");

    expect(realtimeEvents.emitLeadUpdated).not.toHaveBeenCalled();
    expect(leadTimeline.record).not.toHaveBeenCalled();
    expect(metaService.sendClientWhatsappTemplate).not.toHaveBeenCalled();
  });

  it("bloqueia update de lead quando telefone pertence a outro lead do mesmo cliente", async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce({
        ...baseExistingLead,
        id: "lead-atual",
        phone: "11988888888",
      })
      .mockResolvedValueOnce(baseExistingLead);

    await expect(
      service.update(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "Gestor",
          email: "gestor@teste.com",
          client_id: null,
        },
        "lead-atual",
        {
          phone: "11999999999",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  // ─── create: validações de FK e dedup por e-mail ──────────────────────────

  it("bloqueia create quando crm_stage_id nao pertence ao cliente", async () => {
    prisma.crmStage.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "G",
          email: "g@x",
          client_id: null,
        } as never,
        {
          client_id: clientId,
          name: "Lead X",
          source: LeadSource.manual,
          crm_pipeline_id: "88888888-8888-4888-8888-888888888888",
          crm_stage_id: "99999999-9999-4999-8999-999999999999",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "99999999-9999-4999-8999-999999999999",
          client_id: clientId,
        },
      }),
    );
  });

  it("bloqueia create quando event_interest_id nao pertence ao cliente", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "G",
          email: "g@x",
          client_id: null,
        } as never,
        {
          client_id: clientId,
          name: "Lead Y",
          source: LeadSource.manual,
          event_interest_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          participants: {
            some: { client_id: clientId },
          },
        },
      }),
    );
  });

  it("bloqueia create quando e-mail ja esta cadastrado para o cliente", async () => {
    prisma.lead.findFirst.mockResolvedValueOnce(baseExistingLead); // email check: duplicata encontrada

    await expect(
      service.create(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "G",
          email: "g@x",
          client_id: null,
        } as never,
        {
          client_id: clientId,
          name: "Lead Dup Email",
          email: "ANA@EXAMPLE.COM",
          source: LeadSource.manual,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("closeAttendance: vendedor encerra sem CPF/pulseira e move para ATENDIMENTO_ENCERRADO", async () => {
    prisma.vendorAttendance.findFirst.mockResolvedValueOnce({
      id: "attendance-1",
    });
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      crm_pipeline_id: "pipeline-1",
      crm_stage_id: "stage-old",
    });
    prisma.crmStage.findFirst.mockResolvedValueOnce({ id: "stage-encerrado" });
    prisma.lead.update.mockResolvedValueOnce({
      ...baseExistingLead,
      confirmation_status: ConfirmationStatus.closed,
      crm_stage_id: "stage-encerrado",
    });

    const result = await service.closeAttendance(
      {
        sub: vendorId,
        role: Role.VENDEDOR,
        name: "V",
        email: "v@x",
        client_id: clientId,
      } as never,
      baseExistingLead.id,
      { sold: false },
    );

    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: expect.stringContaining("_ATENDIMENTO_ENCERRADO"),
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseExistingLead.id },
        data: expect.objectContaining({
          confirmation_status: ConfirmationStatus.closed,
          crm_stage_id: "stage-encerrado",
        }),
      }),
    );
    const updateData = prisma.lead.update.mock.calls[0]?.[0]?.data;
    expect(updateData).not.toHaveProperty("wristband_number");
    expect(updateData).not.toHaveProperty("cpf");
    expect(updateData).not.toHaveProperty("phone");
    expect(prisma.crmHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: baseExistingLead.id,
          to_stage_id: "stage-encerrado",
          notes: "Atendimento encerrado sem venda",
        }),
      }),
    );
    expect(result.confirmation_status).toBe(ConfirmationStatus.closed);
  });

  it("closeAttendance: move para COMPRARAM quando o vendedor confirma a venda", async () => {
    prisma.vendorAttendance.findFirst.mockResolvedValueOnce({
      id: "attendance-2",
    });
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      crm_pipeline_id: "pipeline-1",
      crm_stage_id: "stage-old",
    });
    prisma.crmStage.findFirst.mockResolvedValueOnce({ id: "stage-vendido" });
    prisma.lead.update.mockResolvedValueOnce({
      ...baseExistingLead,
      confirmation_status: ConfirmationStatus.closed,
      crm_stage_id: "stage-vendido",
      sold_by_vendor_id: vendorId,
    });

    await service.closeAttendance(
      {
        sub: vendorId,
        role: Role.VENDEDOR,
        name: "V",
        email: "v@x",
        client_id: clientId,
      } as never,
      baseExistingLead.id,
      { sold: true },
    );

    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: expect.stringContaining("_COMPRARAM"),
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crm_stage_id: "stage-vendido",
          sold_by_vendor_id: vendorId,
        }),
      }),
    );
  });

  it("closeAttendance: mantém CPF obrigatório para perfis que fazem a baixa completa", async () => {
    await expect(
      service.closeAttendance(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: "G",
          email: "g@x",
          client_id: clientId,
        } as never,
        baseExistingLead.id,
        { sold: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
  });

  it("bloqueia check-in do vendedor quando o evento não permite", async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      event_interest_id: eventId,
      checkin_token: "convite-evento",
    });
    prisma.event.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.checkInByToken(
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: "V",
          email: "v@x",
          client_id: clientId,
        } as never,
        "convite-evento",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("bloqueia consulta FIPE do vendedor quando o evento não permite", async () => {
    prisma.event.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getFipeDataPublic(
        "ABC1D23",
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: "V",
          email: "v@x",
          client_id: clientId,
        } as never,
        eventId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("consulta placa no Gateway V2 usando somente Bearer Token", async () => {
    const previousToken = process.env.APIBRASIL_TOKEN;
    process.env.APIBRASIL_TOKEN = "token-de-teste";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: false,
        data: {
          marca: "FORD",
          modelo: "FORD/FIESTA FLEX",
          anoModelo: "2014",
          valor_fipe: "35.500,00",
        },
      }),
    } as Response);

    try {
      const result = await service.getFipeDataPublic("OQH3A65", {
        sub: gestorId,
        role: Role.GESTOR,
        name: "Gestor",
        email: "gestor@example.com",
        client_id: null,
      });

      expect(result).toEqual({
        brand: "FORD",
        model: "FORD/FIESTA FLEX",
        modelYear: "2014",
        value: "R$ 35.500,00",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://gateway.apibrasil.io/api/v2/vehicles/dados",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer token-de-teste",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ placa: "OQH3A65" }),
        }),
      );
    } finally {
      if (previousToken === undefined) delete process.env.APIBRASIL_TOKEN;
      else process.env.APIBRASIL_TOKEN = previousToken;
    }
  });

  describe("normalizacao de nome", () => {
    // Os formularios do Meta ja gravaram 57 leads como `"Fulano"`, e o nome
    // saia com aspas no chat, no CRM e nos relatorios.
    const normalize = (value: string) =>
      (
        service as unknown as { normalizePersonName(v: string): string }
      ).normalizePersonName(value);

    it("remove aspas e espacos das pontas", () => {
      expect(normalize('"Samuel Diniz"')).toBe("Samuel Diniz");
      expect(normalize("  'Jose Osni' ")).toBe("Jose Osni");
      expect(normalize("Camilla Siqueira")).toBe("Camilla Siqueira");
    });

    it("preserva aspas e apostrofos no meio do nome", () => {
      expect(normalize('Ze "Grandao" Silva')).toBe('Ze "Grandao" Silva');
      expect(normalize("Maria D'Avila")).toBe("Maria D'Avila");
    });
  });
});
