import { AutomationController } from "./automation.controller";

describe("AutomationController", () => {
  const appointments = {
    sendEventCredentialEmailForAutomation: jest.fn(),
    deliverCredentialForLead: jest.fn(),
    reconcileScheduledLeadForAutomation: jest.fn(),
  };
  const leads = {
    countInitialTemplateQueue: jest.fn(),
    dispatchNextInitialWhatsappTemplate: jest.fn(),
  };
  const controller = new AutomationController(
    appointments as never,
    leads as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("encaminha a entrega completa da credencial com chave idempotente", async () => {
    appointments.deliverCredentialForLead.mockResolvedValue({ sent: true });

    await expect(
      controller.sendCredentialDelivery({
        lead_id: "88c544ca-5c68-48c8-be28-bb63fa2bcfa3",
        dispatch_key: "credential-delivery-test",
      }),
    ).resolves.toEqual({ sent: true });
    expect(appointments.deliverCredentialForLead).toHaveBeenCalledWith(
      "88c544ca-5c68-48c8-be28-bb63fa2bcfa3",
      "credential-delivery-test",
    );
  });

  it("consulta a fila sem realizar disparos", async () => {
    leads.countInitialTemplateQueue.mockResolvedValue({ pending: 12 });

    await expect(controller.initialTemplateStatus()).resolves.toEqual({
      pending: 12,
    });
    expect(leads.countInitialTemplateQueue).toHaveBeenCalledTimes(1);
  });

  it("reconcilia o agendamento e o e-mail em uma única operação", async () => {
    const payload = {
      lead_id: "88c544ca-5c68-48c8-be28-bb63fa2bcfa3",
      scheduled_at: "2026-08-15T12:00:00.000Z",
      dispatch_key: "scheduled-reconciliation-test",
    };
    appointments.reconcileScheduledLeadForAutomation.mockResolvedValue({
      appointment: { id: "68b40080-d71c-4a42-8ceb-4b56942d6031" },
      email: { sent: true },
    });

    await expect(controller.reconcileScheduledLead(payload)).resolves.toEqual({
      appointment: { id: "68b40080-d71c-4a42-8ceb-4b56942d6031" },
      email: { sent: true },
    });
    expect(
      appointments.reconcileScheduledLeadForAutomation,
    ).toHaveBeenCalledWith(payload);
  });

  it("processa somente o próximo item da fila", async () => {
    leads.dispatchNextInitialWhatsappTemplate.mockResolvedValue({
      processed: true,
    });

    await expect(controller.dispatchNextInitialTemplate()).resolves.toEqual({
      processed: true,
    });
    expect(leads.dispatchNextInitialWhatsappTemplate).toHaveBeenCalledTimes(1);
  });
});
