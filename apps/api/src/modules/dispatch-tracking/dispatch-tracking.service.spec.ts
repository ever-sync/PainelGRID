import { NotFoundException } from "@nestjs/common";
import { DispatchTrackingService } from "./dispatch-tracking.service";

describe("DispatchTrackingService", () => {
  const prisma = {
    lead: { findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
    appointment: { findFirst: jest.fn() },
    sale: { findFirst: jest.fn() },
    dispatchEvent: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const clientsService = {
    assertGestorOwnsClient: jest.fn(),
  };
  let service: DispatchTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DispatchTrackingService(
      prisma as never,
      clientsService as never,
    );
  });

  it("registra envio idempotente por cliente e chave", async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      event_interest_id: null,
    });
    prisma.dispatchEvent.upsert.mockResolvedValue({ id: "dispatch-1" });

    await service.upsert("22222222-2222-4222-8222-222222222222", {
      lead_id: "11111111-1111-4111-8111-111111111111",
      dispatch_key: "followup:lead-1:2026-08-07",
      workflow_key: "followup-one-hour",
      dispatch_type: "reactivation",
      channel: "whatsapp",
      provider: "meta",
      provider_message_id: "wamid-1",
      status: "sent",
    });

    expect(prisma.dispatchEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          client_id_dispatch_key: {
            client_id: "22222222-2222-4222-8222-222222222222",
            dispatch_key: "followup:lead-1:2026-08-07",
          },
        },
        create: expect.objectContaining({
          status: "sent",
          sent_at: expect.any(Date),
        }),
      }),
    );
  });

  it("rejeita disparo para lead fora do cliente", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    await expect(
      service.upsert("22222222-2222-4222-8222-222222222222", {
        lead_id: "11111111-1111-4111-8111-111111111111",
        dispatch_key: "unsafe",
        workflow_key: "workflow",
        dispatch_type: "template",
        channel: "whatsapp",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marca entrega pelo wamid sem alterar o horário original de envio", async () => {
    prisma.dispatchEvent.updateMany.mockResolvedValue({ count: 1 });
    const deliveredAt = new Date("2026-08-07T12:00:00.000Z");

    await service.markProviderStatus({
      providerMessageId: "wamid-1",
      status: "delivered",
      occurredAt: deliveredAt,
    });

    expect(prisma.dispatchEvent.updateMany).toHaveBeenCalledWith({
      where: { provider_message_id: "wamid-1" },
      data: {
        status: "delivered",
        delivered_at: deliveredAt,
      },
    });
  });

  it("marca resposta confirmada no disparo exato pelo context.id", async () => {
    prisma.dispatchEvent.updateMany.mockResolvedValue({ count: 1 });
    const repliedAt = new Date("2026-08-13T12:00:00.000Z");

    await expect(
      service.markReplyByProviderMessageId("wamid-template-1", repliedAt),
    ).resolves.toBe(1);

    expect(prisma.dispatchEvent.updateMany).toHaveBeenCalledWith({
      where: {
        provider_message_id: "wamid-template-1",
        sent_at: { not: null, lte: repliedAt },
        replied_at: null,
        status: { not: "failed" },
      },
      data: {
        status: "replied",
        replied_at: repliedAt,
      },
    });
  });
});
