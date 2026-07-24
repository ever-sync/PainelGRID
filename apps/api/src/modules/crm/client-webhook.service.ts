import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { WebhookDispatchService } from './webhook-dispatch.service';

/**
 * Serviço utilitário para disparar webhooks para a URL n8n configurada no cliente.
 * Todas as chamadas são fire-and-forget: erros são logados como warning
 * e nunca propagados para o fluxo principal da requisição.
 */
@Injectable()
export class ClientWebhookService {
  private readonly logger = new Logger(ClientWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatch: WebhookDispatchService,
  ) {}

  /**
   * Cria um WebhookEvent para o cliente e enfileira o disparo.
   * Se o cliente não tiver webhook_url_n8n configurado, o evento é gravado
   * com destination_url = 'internal://n8n-not-configured' e marcado como enviado
   * automaticamente pelo processor (sem chamada HTTP).
   */
  async dispatch(
    clientId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: { webhook_url_n8n: true },
      });

      const destinationUrl = client?.webhook_url_n8n?.trim() || 'internal://n8n-not-configured';

      const event = await this.prisma.webhookEvent.create({
        data: {
          client_id: clientId,
          event_type: eventType,
          destination_url: destinationUrl,
          payload: payload as Prisma.InputJsonValue,
        },
      });

      await this.webhookDispatch.enqueue(event.id);
    } catch (error) {
      this.logger.warn(
        `Falha ao disparar webhook ${eventType} para cliente ${clientId}: ${(error as Error).message}`,
      );
    }
  }
}
