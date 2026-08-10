import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { UpsertDispatchDto } from "./dto/upsert-dispatch.dto";
import { AuthenticatedUser } from "../auth/auth.types";
import { Role } from "../../common/types";
import { ClientsService } from "../clients/clients.service";
import { ForbiddenException } from "@nestjs/common";

type DispatchStatus = NonNullable<UpsertDispatchDto["status"]>;

@Injectable()
export class DispatchTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertPanelAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE && user.client_id === clientId) return;
    throw new ForbiddenException(
      "Sem permissão para os disparos deste cliente",
    );
  }

  async listEmailHistory(
    user: AuthenticatedUser,
    clientId: string,
    filters: {
      eventId?: string;
      status?: string;
      origin?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    await this.assertPanelAccess(user, clientId);
    const createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
    return this.prisma.dispatchEvent.findMany({
      where: {
        client_id: clientId,
        channel: "email",
        ...(filters.eventId ? { event_id: filters.eventId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.origin ? { dispatch_type: filters.origin } : {}),
        ...(Object.keys(createdAt).length ? { created_at: createdAt } : {}),
      },
      select: {
        id: true,
        created_at: true,
        sent_at: true,
        failed_at: true,
        dispatch_type: true,
        workflow_key: true,
        status: true,
        provider: true,
        provider_message_id: true,
        failure_reason: true,
        metadata: true,
        lead: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 500,
    });
  }

  async upsert(clientId: string, dto: UpsertDispatchDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.lead_id, client_id: clientId, deleted_at: null },
      select: { id: true, event_interest_id: true },
    });
    if (!lead) throw new NotFoundException("Lead não pertence ao cliente");

    await this.assertRelatedEntities(clientId, dto);
    const occurredAt = dto.occurred_at ? new Date(dto.occurred_at) : new Date();
    const status = dto.status ?? "queued";
    const milestones = this.statusMilestones(status, occurredAt);

    return this.prisma.dispatchEvent.upsert({
      where: {
        client_id_dispatch_key: {
          client_id: clientId,
          dispatch_key: dto.dispatch_key.trim(),
        },
      },
      create: {
        client_id: clientId,
        lead_id: dto.lead_id,
        event_id: dto.event_id ?? lead.event_interest_id,
        conversation_id: dto.conversation_id,
        message_id: dto.message_id,
        appointment_id: dto.appointment_id,
        sale_id: dto.sale_id,
        dispatch_key: dto.dispatch_key.trim(),
        workflow_key: dto.workflow_key.trim(),
        dispatch_type: dto.dispatch_type.trim(),
        channel: dto.channel.trim().toLowerCase(),
        provider: dto.provider?.trim(),
        provider_message_id: dto.provider_message_id?.trim(),
        template_name: dto.template_name?.trim(),
        status,
        scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
        conversion_type: dto.conversion_type?.trim(),
        revenue: dto.revenue,
        failure_code: dto.failure_code?.trim(),
        failure_reason: dto.failure_reason?.trim(),
        metadata: this.json(dto.metadata),
        ...milestones,
      },
      update: {
        ...(dto.event_id ? { event_id: dto.event_id } : {}),
        ...(dto.conversation_id
          ? { conversation_id: dto.conversation_id }
          : {}),
        ...(dto.message_id ? { message_id: dto.message_id } : {}),
        ...(dto.appointment_id ? { appointment_id: dto.appointment_id } : {}),
        ...(dto.sale_id ? { sale_id: dto.sale_id } : {}),
        workflow_key: dto.workflow_key.trim(),
        dispatch_type: dto.dispatch_type.trim(),
        channel: dto.channel.trim().toLowerCase(),
        ...(dto.provider ? { provider: dto.provider.trim() } : {}),
        ...(dto.provider_message_id
          ? { provider_message_id: dto.provider_message_id.trim() }
          : {}),
        ...(dto.template_name
          ? { template_name: dto.template_name.trim() }
          : {}),
        status,
        ...(dto.scheduled_at
          ? { scheduled_at: new Date(dto.scheduled_at) }
          : {}),
        ...(dto.conversion_type
          ? { conversion_type: dto.conversion_type.trim() }
          : {}),
        ...(dto.revenue !== undefined ? { revenue: dto.revenue } : {}),
        ...(dto.failure_code ? { failure_code: dto.failure_code.trim() } : {}),
        ...(dto.failure_reason
          ? { failure_reason: dto.failure_reason.trim() }
          : {}),
        ...(dto.metadata ? { metadata: this.json(dto.metadata) } : {}),
        ...milestones,
      },
    });
  }

  async markProviderStatus(params: {
    providerMessageId: string;
    status: DispatchStatus;
    occurredAt?: Date;
    failureCode?: string;
    failureReason?: string;
    metadata?: Record<string, unknown>;
  }) {
    const occurredAt = params.occurredAt ?? new Date();
    const rows = await this.prisma.dispatchEvent.updateMany({
      where: { provider_message_id: params.providerMessageId },
      data: {
        status: params.status,
        ...this.providerMilestones(params.status, occurredAt),
        ...(params.failureCode ? { failure_code: params.failureCode } : {}),
        ...(params.failureReason
          ? { failure_reason: params.failureReason }
          : {}),
        ...(params.metadata ? { metadata: this.json(params.metadata) } : {}),
      },
    });
    return rows.count;
  }

  async markReply(leadId: string, occurredAt: Date, messageId?: string) {
    const latest = await this.prisma.dispatchEvent.findFirst({
      where: {
        lead_id: leadId,
        sent_at: { not: null, lte: occurredAt },
        replied_at: null,
        status: { not: "failed" },
      },
      orderBy: { sent_at: "desc" },
      select: { id: true },
    });
    if (!latest) return null;
    return this.prisma.dispatchEvent.update({
      where: { id: latest.id },
      data: {
        status: "replied",
        replied_at: occurredAt,
        metadata: messageId
          ? this.json({ reply_message_id: messageId })
          : undefined,
      },
    });
  }

  async markConversion(params: {
    leadId: string;
    type: "appointment" | "check_in" | "sale";
    occurredAt: Date;
    appointmentId?: string;
    saleId?: string;
    revenue?: number;
  }) {
    const latest = await this.prisma.dispatchEvent.findFirst({
      where: {
        lead_id: params.leadId,
        sent_at: { not: null, lte: params.occurredAt },
        status: { not: "failed" },
      },
      orderBy: { sent_at: "desc" },
      select: { id: true },
    });
    if (!latest) return null;
    return this.prisma.dispatchEvent.update({
      where: { id: latest.id },
      data: {
        status: "converted",
        converted_at: params.occurredAt,
        conversion_type: params.type,
        ...(params.appointmentId
          ? { appointment_id: params.appointmentId }
          : {}),
        ...(params.saleId ? { sale_id: params.saleId } : {}),
        ...(params.revenue !== undefined ? { revenue: params.revenue } : {}),
      },
    });
  }

  async list(clientId: string, query: { eventId?: string; leadId?: string }) {
    return this.prisma.dispatchEvent.findMany({
      where: {
        client_id: clientId,
        ...(query.eventId ? { event_id: query.eventId } : {}),
        ...(query.leadId ? { lead_id: query.leadId } : {}),
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
  }

  private statusMilestones(status: DispatchStatus, occurredAt: Date) {
    switch (status) {
      case "sent":
        return { sent_at: occurredAt };
      case "delivered":
        return { sent_at: occurredAt, delivered_at: occurredAt };
      case "read":
        return {
          sent_at: occurredAt,
          delivered_at: occurredAt,
          read_at: occurredAt,
        };
      case "replied":
        return { replied_at: occurredAt };
      case "failed":
        return { failed_at: occurredAt };
      case "converted":
        return { converted_at: occurredAt };
      default:
        return {};
    }
  }

  private providerMilestones(status: DispatchStatus, occurredAt: Date) {
    switch (status) {
      case "sent":
        return { sent_at: occurredAt };
      case "delivered":
        return { delivered_at: occurredAt };
      case "read":
        return { read_at: occurredAt };
      case "failed":
        return { failed_at: occurredAt };
      default:
        return {};
    }
  }

  private async assertRelatedEntities(
    clientId: string,
    dto: UpsertDispatchDto,
  ) {
    const checks = await Promise.all([
      dto.event_id
        ? this.prisma.event.findFirst({
            where: {
              id: dto.event_id,
              OR: [
                { client_id: clientId },
                { participants: { some: { client_id: clientId } } },
              ],
            },
            select: { id: true },
          })
        : true,
      dto.conversation_id
        ? this.prisma.conversation.findFirst({
            where: {
              id: dto.conversation_id,
              client_id: clientId,
              lead_id: dto.lead_id,
            },
            select: { id: true },
          })
        : true,
      dto.appointment_id
        ? this.prisma.appointment.findFirst({
            where: {
              id: dto.appointment_id,
              client_id: clientId,
              lead_id: dto.lead_id,
            },
            select: { id: true },
          })
        : true,
      dto.sale_id
        ? this.prisma.sale.findFirst({
            where: {
              id: dto.sale_id,
              client_id: clientId,
              lead_id: dto.lead_id,
            },
            select: { id: true },
          })
        : true,
    ]);
    if (checks.some((value) => !value)) {
      throw new BadRequestException(
        "Relacionamento do disparo fora do escopo do cliente ou lead",
      );
    }
  }

  private json(value?: Record<string, unknown>): Prisma.InputJsonValue {
    return (value ?? {}) as Prisma.InputJsonValue;
  }
}
