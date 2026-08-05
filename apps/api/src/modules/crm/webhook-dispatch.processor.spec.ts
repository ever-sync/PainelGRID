import type { Job } from "bullmq";
import type { PrismaService } from "../../config/prisma.service";
import { WebhookDispatchProcessor } from "./webhook-dispatch.processor";
import type { WebhookDispatchService } from "./webhook-dispatch.service";

describe("WebhookDispatchProcessor", () => {
  const processor = new WebhookDispatchProcessor(
    {} as PrismaService,
    {} as WebhookDispatchService,
  );

  it.each([
    ["dispatch", "handleDispatch"],
    ["cleanup-idempotency", "handleCleanupIdempotency"],
  ] as const)(
    "roteia o job %s para o handler correto",
    async (name, handler) => {
      const spy = jest.spyOn(processor, handler).mockResolvedValue(undefined);
      const job = { name, data: {} } as Job;

      await processor.process(job);

      expect(spy).toHaveBeenCalledWith(job);
    },
  );

  it("rejeita nomes de job desconhecidos", async () => {
    await expect(
      processor.process({ name: "desconhecido", data: {} } as Job),
    ).rejects.toThrow("Job de webhook desconhecido: desconhecido");
  });
});
