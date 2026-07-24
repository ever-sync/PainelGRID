import { Injectable, Logger } from '@nestjs/common';
import { LeadTimelineEventType, LeadTimelineOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

export interface RecordTimelineParams {
  clientId: string;
  leadId: string;
  eventType: LeadTimelineEventType;
  origin?: LeadTimelineOrigin;
  fromStageId?: string | null;
  toStageId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

@Injectable()
export class LeadTimelineService {
  private readonly logger = new Logger(LeadTimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ponto unico de escrita da linha do tempo. Resiliente: uma falha de log
   * NUNCA pode quebrar a operacao principal (move, update, etc.).
   */
  async record(params: RecordTimelineParams): Promise<void> {
    try {
      await this.prisma.leadTimeline.create({
        data: {
          client_id: params.clientId,
          lead_id: params.leadId,
          event_type: params.eventType,
          origin: params.origin ?? LeadTimelineOrigin.system,
          from_stage_id: params.fromStageId ?? null,
          to_stage_id: params.toStageId ?? null,
          from_value: params.fromValue ?? null,
          to_value: params.toValue ?? null,
          actor_id: params.actorId ?? null,
          actor_label: params.actorLabel ?? null,
          notes: params.notes ?? null,
          ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
          ...(params.occurredAt ? { occurred_at: params.occurredAt } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar timeline do lead: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Mapeia a `source` dos moves/integracoes para a origem da timeline. */
  originFromSource(source?: string | null): LeadTimelineOrigin {
    switch ((source ?? '').toLowerCase()) {
      case 'n8n':
      case 'webhook':
        return LeadTimelineOrigin.n8n;
      case 'integration':
        return LeadTimelineOrigin.integration;
      case 'whatsapp':
        return LeadTimelineOrigin.whatsapp;
      case 'automation':
      case 'auto':
        return LeadTimelineOrigin.automation;
      default:
        return LeadTimelineOrigin.crm;
    }
  }

  async listForLead(leadId: string) {
    return this.prisma.leadTimeline.findMany({
      where: { lead_id: leadId },
      orderBy: [{ occurred_at: 'asc' }, { created_at: 'asc' }],
    });
  }
}
