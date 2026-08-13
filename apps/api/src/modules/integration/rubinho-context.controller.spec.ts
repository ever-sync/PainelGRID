import { RubinhoContextController } from "./rubinho-context.controller";

describe("RubinhoContextController", () => {
  const resolver = { resolve: jest.fn() };
  const dispatchTracking = { markReplyByProviderMessageId: jest.fn() };
  let controller: RubinhoContextController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RubinhoContextController(
      resolver as never,
      dispatchTracking as never,
    );
  });

  it("confirma a resposta quando o n8n envia o context.id do template", async () => {
    resolver.resolve.mockResolvedValue({
      authorized: true,
      dispatch_id: "dispatch-1",
    });
    dispatchTracking.markReplyByProviderMessageId.mockResolvedValue(1);

    await controller.resolve({
      phone_number_id: "phone-number-1",
      customer_phone: "5511999999999",
      provider_message_id: "wamid-template-1",
    });

    expect(dispatchTracking.markReplyByProviderMessageId).toHaveBeenCalledWith(
      "wamid-template-1",
      expect.any(Date),
    );
  });

  it("nao marca resposta quando o contexto nao foi autorizado", async () => {
    resolver.resolve.mockResolvedValue({
      authorized: false,
      reason: "context_not_found",
    });

    await controller.resolve({
      phone_number_id: "phone-number-1",
      customer_phone: "5511999999999",
      provider_message_id: "wamid-template-1",
    });

    expect(
      dispatchTracking.markReplyByProviderMessageId,
    ).not.toHaveBeenCalled();
  });
});
