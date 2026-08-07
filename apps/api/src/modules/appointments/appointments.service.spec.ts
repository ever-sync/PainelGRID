import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  EventStatus,
  ConfirmationStatus,
} from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { AppointmentsService } from "./appointments.service";

describe("AppointmentsService", () => {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const clientId = "22222222-2222-4222-8222-222222222222";
  const partnerClientId = "99999999-9999-4999-8999-999999999999";
  const eventId = "33333333-3333-4333-8333-333333333333";
  const appointmentId = "44444444-4444-4444-8444-444444444444";
  const rescheduledAppointmentId = "55555555-5555-4555-8555-555555555555";

  const lead = {
    id: leadId,
    client_id: clientId,
    deleted_at: null,
    confirmation_date: null,
  };

  const event = {
    id: eventId,
    client_id: clientId,
    status: EventStatus.active,
    capacity: 10,
  };

  const baseAppointment = {
    id: appointmentId,
    client_id: clientId,
    lead_id: leadId,
    event_id: eventId,
    conversation_id: null,
    scheduled_at: new Date("2026-04-24T17:00:00.000Z"),
    timezone: "America/Sao_Paulo",
    status: AppointmentStatus.scheduled,
    channel: AppointmentChannel.whatsapp,
    source: AppointmentSource.n8n_ai_agent,
    created_by_type: AppointmentActorType.external_agent,
    created_by_id: null,
    confirmed_at: null,
    cancelled_at: null,
    completed_at: null,
    no_show_at: null,
    rescheduled_from_appointment_id: null,
    notes: "Agendado pela IA",
    created_at: new Date("2026-04-20T12:00:00.000Z"),
    updated_at: new Date("2026-04-20T12:00:00.000Z"),
    lead: {
      id: leadId,
      client_id: clientId,
      confirmation_date: null,
      confirmation_status: ConfirmationStatus.pending,
    },
    event,
    conversation: null,
  };

  let prisma: any;
  let service: AppointmentsService;
  let configService: ConfigService;
  let mail: { sendAppointmentWelcome: jest.Mock };
  let meta: { sendClientWhatsappMediaMessage: jest.Mock };

  beforeEach(() => {
    prisma = {
      apiIdempotencyRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      leadTimeline: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      client: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      event: {
        findUnique: jest.fn(),
      },
      eventParticipant: {
        findMany: jest.fn(),
      },
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
      crmHistory: {
        create: jest.fn(),
      },
      crmStage: {
        findFirst: jest.fn(),
      },
      crmPipeline: {
        findFirst: jest.fn(),
      },
      appointment: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      scoreEvent: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === "LEADFLOW_INTEGRATION_ACTOR_USER_ID") {
          return undefined;
        }
        return undefined;
      }),
    } as any as ConfigService;
    mail = { sendAppointmentWelcome: jest.fn() };
    meta = {
      sendClientWhatsappMediaMessage: jest.fn().mockResolvedValue({
        wamid: "wamid-checkin-1",
        mediaId: "media-checkin-1",
        mediaUrl: null,
        contentLabel: "Credencial QR Code",
      }),
    };

    service = new AppointmentsService(
      prisma,
      configService,
      {
        awardWithTx: jest.fn(),
      } as any,
      { dispatch: jest.fn() } as any,
      { emitLeadUpdated: jest.fn(), emitNewMessage: jest.fn() } as any,
      mail as any,
      meta as any,
      { markConversion: jest.fn().mockResolvedValue(null) } as any,
    );
    prisma.eventParticipant.findMany.mockResolvedValue([
      { client_id: clientId },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("cria appointment e sincroniza Lead.store_visit_datetime", async () => {
    prisma.lead.findUnique.mockResolvedValue(lead);
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.eventParticipant.findMany.mockResolvedValue([
      { client_id: clientId },
    ]);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-1" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-1" });
    prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.appointment.create.mockResolvedValue(baseAppointment);
    prisma.appointment.findFirst.mockResolvedValue(baseAppointment);

    const result = await service.create({
      lead_id: leadId,
      event_id: eventId,
      scheduled_at: "2026-04-24T14:00:00-03:00",
      notes: "Agendado pela IA",
    });

    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          lead_id: leadId,
          event_id: eventId,
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { store_visit_datetime: baseAppointment.scheduled_at },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: appointmentId,
        lead_id: leadId,
        event_id: eventId,
        idempotent_replay: false,
      }),
    );
  });

  it("ao criar agendamento por vendedor, move para PRESENCA_AGENDADA e nao altera confirmation_status", async () => {
    prisma.lead.findUnique.mockResolvedValue(lead);
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.eventParticipant.findMany.mockResolvedValue([
      { client_id: clientId },
    ]);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-2" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-2" });
    prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.appointment.create.mockResolvedValue({
      ...baseAppointment,
      source: AppointmentSource.vendedor,
      created_by_type: AppointmentActorType.user,
      created_by_id: "user-vendor-1",
    });
    prisma.user.findUnique.mockResolvedValue({ id: "user-vendor-1" });
    prisma.crmPipeline.findFirst.mockResolvedValue({ id: "pipeline-1" });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: "stage-pre-agendamento",
    });

    await service.create({
      lead_id: leadId,
      event_id: eventId,
      scheduled_at: "2026-04-24T14:00:00-03:00",
      source: AppointmentSource.vendedor,
      created_by_type: AppointmentActorType.user,
      created_by_id: "user-vendor-1",
    });

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: leadId },
        data: expect.not.objectContaining({
          confirmation_status: ConfirmationStatus.scheduled,
        }),
      }),
    );

    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: "2222222222224222_PRESENCA_AGENDADA",
        }),
      }),
    );
  });

  it("usa nome e foto do vendedor que criou o agendamento no email do lead", async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: "Vendedor Responsavel",
      avatar_url: "/auth/avatar/user-vendor-1?v=123",
    });
    prisma.client.findUnique.mockResolvedValue({
      company_name: "Concessionaria Teste",
    });

    await (service as any).sendAppointmentWelcomeEmail({
      ...baseAppointment,
      created_by_type: AppointmentActorType.user,
      created_by_id: "user-vendor-1",
      lead: {
        ...baseAppointment.lead,
        name: "Cliente Teste",
        email: "cliente@example.com",
        assigned_vendor_id: "outro-vendedor",
      },
      event: {
        ...event,
        name: "Evento Teste",
        location: "Sao Paulo",
      },
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-vendor-1" },
      select: { name: true, avatar_url: true },
    });
    expect(mail.sendAppointmentWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cliente@example.com",
        vendorName: "Vendedor Responsavel",
        vendorAvatarUrl: "/auth/avatar/user-vendor-1?v=123",
      }),
    );
  });

  it("envia credencial por e-mail para automacao quando evento esta ativo", async () => {
    prisma.leadTimeline.findFirst.mockResolvedValue(null);
    prisma.appointment.findFirst.mockResolvedValue({
      ...baseAppointment,
      lead: {
        ...baseAppointment.lead,
        name: "Lead Teste",
        email: "lead@example.com",
        assigned_vendor_id: null,
        checkin_token: "checkin-1",
      },
      event: {
        ...event,
        name: "Evento Teste",
        location: "Local Teste",
      },
    });
    prisma.client.findUnique.mockResolvedValue({ company_name: "Cliente" });
    prisma.leadTimeline.create.mockResolvedValue({
      id: "timeline-1",
      occurred_at: new Date("2026-08-06T20:00:00.000Z"),
    });

    const result = await service.sendEventCredentialEmailForAutomation(
      leadId,
      `credencial-email:${leadId}:${eventId}`,
    );

    expect(result.sent).toBe(true);
    expect(mail.sendAppointmentWelcome).toHaveBeenCalledTimes(1);
    expect(prisma.leadTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: leadId,
          metadata: expect.objectContaining({
            dispatch_type: "credencial-email",
          }),
        }),
      }),
    );
  });

  it("bloqueia credencial por e-mail quando evento nao esta ativo", async () => {
    prisma.leadTimeline.findFirst.mockResolvedValue(null);
    prisma.appointment.findFirst.mockResolvedValue({
      ...baseAppointment,
      lead: { ...baseAppointment.lead, email: "lead@example.com" },
      event: { ...event, status: EventStatus.completed },
    });

    await expect(
      service.sendEventCredentialEmailForAutomation(
        leadId,
        `credencial-email:${leadId}:${eventId}`,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.sendAppointmentWelcome).not.toHaveBeenCalled();
  });

  it("nao reenvia credencial com a mesma chave idempotente", async () => {
    prisma.leadTimeline.findFirst.mockResolvedValue({
      id: "timeline-existing",
      occurred_at: new Date("2026-08-06T20:00:00.000Z"),
    });

    const result = await service.sendEventCredentialEmailForAutomation(
      leadId,
      `credencial-email:${leadId}:${eventId}`,
    );

    expect(result.idempotent_replay).toBe(true);
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
    expect(mail.sendAppointmentWelcome).not.toHaveBeenCalled();
  });

  it("permite criar appointment para empresa convidada no evento compartilhado", async () => {
    prisma.lead.findUnique.mockResolvedValue({
      ...lead,
      client_id: partnerClientId,
    });
    prisma.event.findUnique.mockResolvedValue({
      ...event,
    });
    prisma.eventParticipant.findMany.mockResolvedValue([
      { client_id: clientId },
      { client_id: partnerClientId },
    ]);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-2" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-2" });
    prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.appointment.create.mockResolvedValue({
      ...baseAppointment,
      client_id: partnerClientId,
      lead: {
        ...baseAppointment.lead,
        client_id: partnerClientId,
      },
      event: {
        ...event,
      },
    });
    prisma.appointment.findFirst.mockResolvedValue({
      ...baseAppointment,
      client_id: partnerClientId,
      lead: {
        ...baseAppointment.lead,
        client_id: partnerClientId,
      },
      event: {
        ...event,
      },
    });

    const result = await service.create({
      lead_id: leadId,
      event_id: eventId,
      scheduled_at: "2026-04-24T14:00:00-03:00",
    });

    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: partnerClientId,
          event_id: eventId,
          lead_id: leadId,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ lead_id: leadId, event_id: eventId }),
    );
  });

  it("confirma appointment e atualiza status do lead", async () => {
    const confirmedAt = new Date("2026-04-20T15:10:00.000Z");
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
    prisma.appointment.update.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.confirmed,
      confirmed_at: confirmedAt,
    });

    const result = await service.confirm(appointmentId, {
      notes: "Cliente confirmou pelo WhatsApp",
    });

    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appointmentId },
        data: expect.objectContaining({
          status: AppointmentStatus.confirmed,
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: {
        confirmation_status: ConfirmationStatus.confirmed,
        checkin_token: expect.any(String),
        confirmation_date: expect.any(Date),
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        confirmed: true,
        appointment_id: appointmentId,
        lead_id: leadId,
        status: AppointmentStatus.confirmed,
      }),
    );
  });

  it("envia QR Code de forma auditavel e idempotente", async () => {
    const appointment = {
      ...baseAppointment,
      conversation_id: "66666666-6666-4666-8666-666666666666",
      lead: {
        ...baseAppointment.lead,
        name: "Cliente Teste",
        first_name: "Cliente",
        phone: "+5511999999999",
        checkin_token: "0123456789abcdef01234567",
      },
      event: {
        ...event,
        name: "Evento Teste",
        location: "Sao Paulo",
      },
    };
    prisma.appointment.findUnique.mockResolvedValue(appointment);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-qr" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-qr" });
    prisma.message.create.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      created_at: new Date("2026-04-20T12:05:00.000Z"),
    });

    const result = await service.sendCheckinNotification(
      appointmentId,
      "qr-appointment-1",
    );

    expect(meta.sendClientWhatsappMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        to: "+5511999999999",
        mimeType: "image/png",
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversation_id: appointment.conversation_id,
          sender_type: "system",
          external_id: "wamid-checkin-1",
          media_id: "media-checkin-1",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sent: true,
        appointment_id: appointmentId,
        wamid: "wamid-checkin-1",
      }),
    );
  });

  it("reproduz o resultado do envio sem disparar QR novamente", async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      lead: {
        ...baseAppointment.lead,
        phone: "+5511999999999",
        checkin_token: "0123456789abcdef01234567",
      },
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: createHash("sha256")
        .update(
          JSON.stringify({
            appointment_id: appointmentId,
            lead_id: leadId,
            event_id: eventId,
            conversation_id: null,
          }),
        )
        .digest("hex"),
      response: {
        sent: true,
        appointment_id: appointmentId,
        wamid: "wamid-existing",
      },
    });

    const result = await service.sendCheckinNotification(
      appointmentId,
      "qr-appointment-1",
    );

    expect(meta.sendClientWhatsappMediaMessage).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        sent: true,
        idempotent_replay: true,
        wamid: "wamid-existing",
      }),
    );
  });

  it("remarca criando novo registro e marcando o antigo como rescheduled", async () => {
    const nextScheduledAt = new Date("2026-04-26T17:00:00.000Z");
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.confirmed,
    });
    prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.appointment.update.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.rescheduled,
    });
    prisma.appointment.create.mockResolvedValue({
      ...baseAppointment,
      id: rescheduledAppointmentId,
      scheduled_at: nextScheduledAt,
      status: AppointmentStatus.scheduled,
      rescheduled_from_appointment_id: appointmentId,
    });
    prisma.appointment.findFirst.mockResolvedValue({
      ...baseAppointment,
      id: rescheduledAppointmentId,
      scheduled_at: nextScheduledAt,
      status: AppointmentStatus.scheduled,
      rescheduled_from_appointment_id: appointmentId,
    });

    const result = await service.reschedule(appointmentId, {
      scheduled_at: "2026-04-26T14:00:00-03:00",
      notes: "Remarcado a pedido do cliente",
    });

    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appointmentId },
        data: expect.objectContaining({
          status: AppointmentStatus.rescheduled,
        }),
      }),
    );
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rescheduled_from_appointment_id: appointmentId,
          status: AppointmentStatus.scheduled,
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { store_visit_datetime: nextScheduledAt },
    });
    expect(result).toEqual(
      expect.objectContaining({
        rescheduled: true,
        from_appointment_id: appointmentId,
        to_appointment_id: rescheduledAppointmentId,
      }),
    );
  });

  it("cancela appointment e limpa Lead.store_visit_datetime quando nao ha outro ativo", async () => {
    const cancelledAt = new Date("2026-04-20T15:15:00.000Z");
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.confirmed,
      confirmed_at: new Date("2026-04-20T15:10:00.000Z"),
    });
    prisma.appointment.update.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.cancelled,
      cancelled_at: cancelledAt,
    });
    prisma.appointment.findFirst.mockResolvedValue(null);

    const result = await service.cancel(appointmentId, {
      reason: "Cliente desistiu do horario",
    });

    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appointmentId },
        data: expect.objectContaining({
          status: AppointmentStatus.cancelled,
          cancelled_at: expect.any(Date),
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { store_visit_datetime: null },
    });
    expect(result).toEqual(
      expect.objectContaining({
        cancelled: true,
        appointment_id: appointmentId,
        lead_id: leadId,
        status: AppointmentStatus.cancelled,
      }),
    );
  });

  it("bloqueia criacao duplicada de appointment ativo", async () => {
    prisma.lead.findUnique.mockResolvedValue(lead);
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.count.mockResolvedValueOnce(1);

    await expect(
      service.create({
        lead_id: leadId,
        event_id: eventId,
        scheduled_at: "2026-04-24T14:00:00-03:00",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("retorna replay idempotente na criacao quando a chave ja tem resposta", async () => {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          lead_id: leadId,
          event_id: eventId,
          conversation_id: null,
          scheduled_at: "2026-04-24T14:00:00-03:00",
          timezone: "America/Sao_Paulo",
          channel: null,
          source: null,
          created_by_type: null,
          created_by_id: null,
          notes: null,
        }),
      )
      .digest("hex");

    prisma.lead.findUnique.mockResolvedValue(lead);
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: requestHash,
      response: {
        id: appointmentId,
        client_id: clientId,
        lead_id: leadId,
        event_id: eventId,
        idempotent_replay: false,
      },
    });

    const result = await service.create(
      {
        lead_id: leadId,
        event_id: eventId,
        scheduled_at: "2026-04-24T14:00:00-03:00",
      },
      "idem-create-1",
    );

    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: appointmentId,
        lead_id: leadId,
        event_id: eventId,
        idempotent_replay: true,
      }),
    );
  });

  it("move o lead para etapa AGENDADO quando existir no pipeline", async () => {
    const leadWithCrm = {
      ...lead,
      crm_pipeline_id: "66666666-6666-4666-8666-666666666666",
      crm_stage_id: "77777777-7777-4777-8777-777777777777",
    };
    prisma.lead.findUnique.mockResolvedValue(leadWithCrm);
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.appointment.create.mockResolvedValue({
      ...baseAppointment,
      lead: {
        ...baseAppointment.lead,
        crm_pipeline_id: leadWithCrm.crm_pipeline_id,
        crm_stage_id: leadWithCrm.crm_stage_id,
      },
    });
    prisma.appointment.findFirst.mockResolvedValue(baseAppointment);
    prisma.user.findUnique.mockResolvedValue({ id: "actor-user-id" });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      code: "AGENDADO",
      name: "Agendado",
    });
    (configService.get as jest.Mock).mockReturnValue("actor-user-id");

    await service.create({
      lead_id: leadId,
      event_id: eventId,
      scheduled_at: "2026-04-24T14:00:00-03:00",
    });

    expect(prisma.crmHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: leadId,
          changed_by_user_id: "actor-user-id",
        }),
      }),
    );
  });

  // ─── confirm → move CRM para CONFIRMADO ───────────────────────────────────

  it("move o lead para etapa CONFIRMADO ao confirmar agendamento", async () => {
    const leadWithCrm = {
      ...baseAppointment.lead,
      crm_pipeline_id: "66666666-6666-4666-8666-666666666666",
      crm_stage_id: "77777777-7777-4777-8777-777777777777",
    };
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      lead: leadWithCrm,
    });
    prisma.appointment.update.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.confirmed,
      confirmed_at: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "actor-user-id" });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: "99999999-9999-4999-8999-999999999999",
      code: "CONFIRMADO",
      name: "Confirmado",
    });
    (configService.get as jest.Mock).mockReturnValue("actor-user-id");

    await service.confirm(appointmentId, { notes: "Confirmou pelo WhatsApp" });

    expect(prisma.crmHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: leadId,
          to_stage_id: "99999999-9999-4999-8999-999999999999",
        }),
      }),
    );
  });

  // ─── noShow ───────────────────────────────────────────────────────────────

  it("registra no-show e move lead para etapa NO_SHOW no CRM", async () => {
    const noShowAt = new Date("2026-04-24T20:00:00.000Z");
    const leadWithCrm = {
      ...baseAppointment.lead,
      crm_pipeline_id: "66666666-6666-4666-8666-666666666666",
      crm_stage_id: "99999999-9999-4999-8999-999999999999",
    };
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.confirmed,
      lead: leadWithCrm,
    });
    prisma.appointment.update.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.no_show,
      no_show_at: noShowAt,
    });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: "actor-user-id" });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      code: "NO_SHOW",
      name: "No-show",
    });
    (configService.get as jest.Mock).mockReturnValue("actor-user-id");

    const result = await service.noShow(appointmentId, {
      reason: "Nao apareceu",
    });

    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appointmentId },
        data: expect.objectContaining({ status: AppointmentStatus.no_show }),
      }),
    );
    expect(prisma.crmHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: leadId,
          to_stage_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        no_show: true,
        appointment_id: appointmentId,
        lead_id: leadId,
        status: AppointmentStatus.no_show,
      }),
    );
  });

  it("bloqueia no-show quando appointment ja esta cancelado", async () => {
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.cancelled,
    });

    await expect(service.noShow(appointmentId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
