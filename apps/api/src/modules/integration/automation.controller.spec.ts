import { AutomationController } from "./automation.controller";

describe("AutomationController", () => {
  const appointments = {
    sendEventCredentialEmailForAutomation: jest.fn(),
    deliverCredentialForLead: jest.fn(),
  };
  const controller = new AutomationController(appointments as never);

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
});
