import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../config/prisma.service';
import { WebhookDispatchService } from './webhook-dispatch.service';

type WebhookDispatchJob = {
  webhookEventId: string;
};

type IdempotencyCleanupJob = {
  olderThanHours: number;
};

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

@Processor('webhook-dispatch')
export class WebhookDispatchProcessor {
  private readonly logger = new Logger(WebhookDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatchService: WebhookDispatchService,
  ) {}

  @Process('dispatch')
  async handleDispatch(job: Job<WebhookDispatchJob>) {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: job.data.webhookEventId },
    });
    if (!webhookEvent || webhookEvent.sent_at) {
      return;
    }

    try {
      if (webhookEvent.destination_url.startsWith('internal://')) {
        await this.prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            sent_at: new Date(),
            http_status: 204,
            next_retry_at: null,
          },
        });
        return;
      }

      const response = await fetch(webhookEvent.destination_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(webhookEvent.payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          sent_at: new Date(),
          http_status: response.status,
          next_retry_at: null,
        },
      });
    } catch (error) {
      const nextRetries = webhookEvent.retries + 1;
      const canRetry = nextRetries <= webhookEvent.max_retries;
      const delayMs = RETRY_DELAYS_MS[Math.min(webhookEvent.retries, RETRY_DELAYS_MS.length - 1)];
      const nextRetryAt = canRetry ? new Date(Date.now() + delayMs) : null;

      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          retries: nextRetries,
          http_status: null,
          next_retry_at: nextRetryAt,
        },
      });

      if (canRetry) {
        await this.webhookDispatchService.enqueue(webhookEvent.id, delayMs);
      } else {
        this.logger.error(
          `Webhook ${webhookEvent.id} excedeu limite de tentativas`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  @Process('cleanup-idempotency')
  async handleCleanupIdempotency(job: Job<IdempotencyCleanupJob>) {
    const olderThanHours = job.data.olderThanHours ?? 48;
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await this.prisma.apiIdempotencyRequest.deleteMany({
      where: { created_at: { lt: cutoff } },
    });

    this.logger.log(
      `Idempotency cleanup: ${result.count} registros removidos (>${olderThanHours}h)`,
    );
  }
}
