import { PayloadTooLargeException } from "@nestjs/common";
import { MetaController } from "./meta.controller";

describe("MetaController", () => {
  const service = {
    verifyWebhook: jest.fn(),
    receiveWebhook: jest.fn(),
  };

  const configService = {
    get: jest.fn().mockReturnValue("http://localhost:5173"),
  };

  const controller = new MetaController(
    service as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates webhook verification", async () => {
    service.verifyWebhook.mockResolvedValue("ok");
    const result = await controller.verifyWebhook(
      "subscribe",
      "token",
      "challenge",
    );
    expect(service.verifyWebhook).toHaveBeenCalledWith(
      "subscribe",
      "token",
      "challenge",
    );
    expect(result).toBe("ok");
  });

  it("delegates webhook receive with signature and rawBody", async () => {
    service.receiveWebhook.mockResolvedValue({ received: true });
    const payload = { object: "page" };
    const request = { rawBody: Buffer.from("payload") };

    const result = await controller.receiveWebhook(
      payload,
      "sha256=abc",
      request as never,
    );

    expect(service.receiveWebhook).toHaveBeenCalledWith(
      payload,
      "sha256=abc",
      request.rawBody,
    );
    expect(result).toEqual({ received: true });
  });

  it("rejeita webhook sem corpo bruto para verificacao da assinatura", () => {
    expect(() =>
      controller.receiveWebhook({ object: "page" }, "sha256=abc", undefined),
    ).toThrow(PayloadTooLargeException);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
  });

  it("rejeita webhook acima de 1 MiB", () => {
    const request = { rawBody: Buffer.alloc(1024 * 1024 + 1) };
    expect(() =>
      controller.receiveWebhook(
        { object: "page" },
        "sha256=abc",
        request as never,
      ),
    ).toThrow(PayloadTooLargeException);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
  });

  it("rejeita parametros excessivos no handshake", () => {
    expect(() =>
      controller.verifyWebhook("subscribe", "x".repeat(513), "challenge"),
    ).toThrow(PayloadTooLargeException);
    expect(service.verifyWebhook).not.toHaveBeenCalled();
  });
});
