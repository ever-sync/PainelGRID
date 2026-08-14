import {
  AppointmentActorType,
  AppointmentStatus,
  ConfirmationStatus,
  SaleType,
} from "@prisma/client";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "../../common/types";
import { SalesService } from "./sales.service";

describe("SalesService", () => {
  const clientId = "22222222-2222-4222-8222-222222222222";
  const vendorId = "33333333-3333-4333-8333-333333333333";
  const leadId = "44444444-4444-4444-8444-444444444444";
  const appointmentId = "55555555-5555-4555-8555-555555555555";
  const saleId = "66666666-6666-4666-8666-666666666666";
  const teamId = "77777777-7777-4777-8777-777777777777";
  const soldAt = new Date("2026-04-28T13:00:00.000Z");

  const user = {
    sub: vendorId,
    role: Role.VENDEDOR,
    client_id: clientId,
  };

  const baseAppointment = {
    id: appointmentId,
    client_id: clientId,
    lead_id: leadId,
    event_id: "88888888-8888-4888-8888-888888888888",
    created_by_type: AppointmentActorType.user,
    created_by_id: vendorId,
    status: AppointmentStatus.scheduled,
    completed_at: null,
    sale: null,
    lead: {
      id: leadId,
      crm_pipeline_id: null,
      crm_stage_id: null,
      confirmation_status: ConfirmationStatus.pending,
      confirmation_date: null,
      assigned_vendor_id: vendorId,
    },
  };

  const sale = {
    id: saleId,
    client_id: clientId,
    lead_id: leadId,
    appointment_id: appointmentId,
    team_id: teamId,
    vendor_id: vendorId,
    type: SaleType.NOVO,
    model: "Onix",
    value: { toFixed: () => "120000.00" },
    sold_at: soldAt,
    notes: null,
    created_at: soldAt,
    updated_at: soldAt,
  };

  let prisma: any;
  let scoreEvents: { awardWithTx: jest.Mock };
  let service: SalesService;

  beforeEach(() => {
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          allow_vendor_create_sale: true,
          allow_reception_create_sale: false,
        }),
      },
      appointment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sale: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      salesTeamMember: {
        findFirst: jest.fn(),
      },
      lead: {
        update: jest.fn(),
      },
      crmStage: {
        findFirst: jest.fn(),
      },
      crmHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
    };
    scoreEvents = { awardWithTx: jest.fn() };
    service = new SalesService(
      prisma,
      scoreEvents as any,
      { emitLeadUpdated: jest.fn() } as any,
      { markConversion: jest.fn().mockResolvedValue(null) } as any,
    );
  });

  it("bloqueia venda pela recepção quando o evento não permite", async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
    prisma.event.findUnique.mockResolvedValue({
      allow_vendor_create_sale: true,
      allow_reception_create_sale: false,
    });

    await expect(
      service.create({ ...user, role: Role.RECEPCAO } as any, {
        appointment_id: appointmentId,
        type: SaleType.NOVO,
        product: "Onix",
        value: "120000",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it("permite venda pela recepção quando o evento está liberado", async () => {
    prisma.event.findUnique.mockResolvedValue({
      allow_vendor_create_sale: true,
      allow_reception_create_sale: true,
    });
    prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
    prisma.salesTeamMember.findFirst.mockResolvedValue({
      team_id: teamId,
      user: { client_id: clientId },
    });
    prisma.sale.create.mockResolvedValue({ ...sale, order_number: null });

    const result = await service.create(
      { ...user, sub: "reception-user", role: Role.RECEPCAO } as any,
      {
        appointment_id: appointmentId,
        type: SaleType.NOVO,
        product: "Onix",
        value: "120000",
      },
    );

    expect(result).toEqual(expect.objectContaining({ vendor_id: vendorId }));
  });

  it("permite venda sem check-in e soma compareceu mais vendeu", async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
    prisma.salesTeamMember.findFirst.mockResolvedValue({
      team_id: teamId,
      user: {
        client_id: clientId,
      },
    });
    prisma.sale.create.mockResolvedValue(sale);

    const result = await service.create(user as any, {
      appointment_id: appointmentId,
      type: SaleType.NOVO,
      product: "Onix",
      value: "R$ 120.000,00",
      sold_at: soldAt.toISOString(),
    });

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.completed,
        completed_at: soldAt,
      },
    });
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: {
        confirmation_status: ConfirmationStatus.checked_in,
        confirmation_date: soldAt,
      },
    });
    expect(scoreEvents.awardWithTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ kind: "checked_in", earned_at: soldAt }),
    );
    expect(scoreEvents.awardWithTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        kind: "sold",
        sale_id: saleId,
        earned_at: soldAt,
      }),
    );
    expect(prisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          team_id: teamId,
          vendor_id: vendorId,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: saleId, value: "120000.00" }),
    );
  });

  it("bloqueia venda para status sem agendamento ativo", async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.cancelled,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({
      team_id: teamId,
      user: {
        client_id: clientId,
      },
    });

    await expect(
      service.create(user as any, {
        appointment_id: appointmentId,
        type: SaleType.NOVO,
        product: "Onix",
        value: "120000",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lista todas as vendas vinculadas ao evento para o gestor", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: baseAppointment.event_id });
    prisma.sale.findMany.mockResolvedValue([
      {
        ...sale,
        order_number: "PED-123",
        lead: { id: leadId, name: "Cliente Teste", phone: "11999999999" },
        vendor: { id: vendorId, name: "Vendedor Teste" },
        sales_team: { id: teamId, name: "Equipe Teste" },
        appointment: {
          id: appointmentId,
          scheduled_at: soldAt,
          status: AppointmentStatus.completed,
          event: { id: baseAppointment.event_id, name: "Evento Teste" },
        },
      },
    ]);

    const result = await service.listByEvent(
      { ...user, role: Role.GESTOR } as any,
      baseAppointment.event_id,
    );

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appointment: { event_id: baseAppointment.event_id } },
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: saleId,
        order_number: "PED-123",
        vendor: { id: vendorId, name: "Vendedor Teste" },
        team: { id: teamId, name: "Equipe Teste" },
      }),
    );
  });
});
