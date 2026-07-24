import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolveSafeWebhookDestination } from '../../common/outbound-url.util';
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
export class WebhookDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatchService: WebhookDispatchService,
  ) {
    super();
  }

  async process(job: Job<WebhookDispatchJob | IdempotencyCleanupJob, void, string>) {
    switch (job.name) {
      case 'dispatch':
        return this.handleDispatch(job as Job<WebhookDispatchJob>);
      case 'cleanup-idempotency':
        return this.handleCleanupIdempotency(job as Job<IdempotencyCleanupJob>);
      default:
        throw new Error(`Job de webhook desconhecido: ${job.name}`);
    }
  }

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

      const destination = await resolveSafeWebhookDestination(webhookEvent.destination_url);
      const status = await this.postPinnedWebhook(destination, webhookEvent.payload);

      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          sent_at: new Date(),
          http_status: status,
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

  private postPinnedWebhook(
    destination: Awaited<ReturnType<typeof resolveSafeWebhookDestination>>,
    payload: unknown,
  ): Promise<number> {
    const body = JSON.stringify(payload);
    const lookup: LookupFunction = (_hostname, _options, callback) => {
      callback(null, destination.address, destination.family);
    };

    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        destination.url,
        {
          method: 'POST',
          agent: false,
          lookup,
          servername: destination.url.hostname,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
        },
        (response) => {
          response.resume();
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          resolve(status);
        },
      );

      request.setTimeout(10_000, () => {
        request.destroy(new Error('Timeout ao enviar webhook'));
      });
      request.on('error', reject);
      request.end(body);
    });
  }

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
