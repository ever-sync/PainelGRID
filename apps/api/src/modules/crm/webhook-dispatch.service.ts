import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { withTimeout } from "../../common/utils/with-timeout";

type WebhookDispatchJob = { webhookEventId: string };
type IdempotencyCleanupJob = { olderThanHours: number };
type AnyQueueJob = WebhookDispatchJob | IdempotencyCleanupJob;

@Injectable()
export class WebhookDispatchService implements OnModuleInit {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectQueue("webhook-dispatch") private readonly queue: Queue<AnyQueueJob>,
  ) {}

  onModuleInit() {
    withTimeout(
      this.queue.add(
        "cleanup-idempotency",
        { olderThanHours: 48 },
        {
          repeat: { pattern: "0 3 * * *" },
          removeOnComplete: true,
          removeOnFail: false,
          jobId: "cleanup-idempotency-daily",
        },
      ),
      5000,
      "Agendamento de cleanup de idempotencia",
    )
      .then(() =>
        this.logger.log("Cleanup diario de idempotencia agendado (cron 03:00)"),
      )
      .catch((err) =>
        this.logger.warn(
          `Nao foi possivel agendar cleanup de idempotencia: ${(err as Error).message}`,
        ),
      );
  }

  async enqueue(webhookEventId: string, delayMs = 0) {
    try {
      await this.queue.add(
        "dispatch",
        { webhookEventId },
        {
          delay: delayMs,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.debug(`Webhook enfileirado com delay de ${delayMs}ms`);
    } catch (err) {
      this.logger.warn(
        `Webhook nao enfileirado (Redis indisponivel): ${(err as Error).message}`,
      );
    }
  }
}
