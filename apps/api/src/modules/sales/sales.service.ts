import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentActorType,
  AppointmentStatus,
  ConfirmationStatus,
  Prisma,
} from "@prisma/client";
import { Role } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ScoreEventsService } from "../score-events/score-events.service";
import { resolveConfirmationStatusForStage } from "../clients/client-settings";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreEvents: ScoreEventsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly dispatchTracking: DispatchTrackingService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateSaleDto) {
    if (!user.client_id) {
      throw new ForbiddenException("Empresa nao identificada");
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointment_id },
      include: { lead: true, sale: true },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado");
    }
    if (appointment.client_id !== user.client_id) {
      throw new ForbiddenException("Agendamento nao pertence a esta empresa");
    }
    if (
      user.role === Role.VENDEDOR &&
      appointment.created_by_type === AppointmentActorType.user &&
      appointment.created_by_id !== user.sub
    ) {
      // Vendedores registram suas proprias vendas ou do seu lead atribuido
    }
    if (appointment.sale) {
      throw new ConflictException(
        "Este agendamento ja possui venda registrada",
      );
    }
    const sellableStatuses = new Set<AppointmentStatus>([
      AppointmentStatus.scheduled,
      AppointmentStatus.confirmed,
      AppointmentStatus.completed,
    ]);
    if (!sellableStatuses.has(appointment.status)) {
      throw new BadRequestException("Status do agendamento nao permite venda");
    }

    const saleValue = this.parseCurrency(dto.value);
    const soldAt = dto.sold_at ? new Date(dto.sold_at) : new Date();
    const product = (dto.product ?? dto.model ?? "").trim();

    // Vendedor que sera creditado na venda e no ranking de pontuacao
    const creditedVendorId = appointment.lead.assigned_vendor_id || user.sub;

    const vendorBinding = await this.resolveVendorBinding(
      creditedVendorId,
      appointment.id,
      appointment.lead_id,
    );
    if (!product) {
      throw new BadRequestException("Produto da venda invalido");
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          client_id: vendorBinding.clientId,
          lead_id: appointment.lead_id,
          appointment_id: appointment.id,
          team_id: vendorBinding.teamId,
          vendor_id: creditedVendorId,
          type: dto.type,
          model: product,
          value: saleValue,
          sold_at: soldAt,
          notes: dto.notes?.trim() || null,
        },
      });

      if (
        appointment.status !== AppointmentStatus.completed ||
        appointment.lead.confirmation_status !== ConfirmationStatus.checked_in
      ) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: AppointmentStatus.completed,
            completed_at: appointment.completed_at ?? soldAt,
          },
        });
        await tx.lead.update({
          where: { id: appointment.lead_id },
          data: {
            confirmation_status: ConfirmationStatus.checked_in,
            confirmation_date: appointment.lead.confirmation_date ?? soldAt,
          },
        });
      }

      await tx.lead.update({
        where: { id: appointment.lead_id },
        data: {
          client_id: vendorBinding.clientId,
          sold_by_vendor_id: creditedVendorId,
          team_id: vendorBinding.teamId,
        },
      });

      const convertedStage = appointment.lead.crm_pipeline_id
        ? await tx.crmStage.findFirst({
            where: {
              client_id: vendorBinding.clientId,
              pipeline_id: appointment.lead.crm_pipeline_id,
              OR: [
                { code: "CONVERTIDO" },
                { name: "Convertido" },
                { code: "COMPRARAM" },
              ],
            },
          })
        : null;

      if (
        convertedStage &&
        convertedStage.id !== appointment.lead.crm_stage_id
      ) {
        const client = await tx.client.findUnique({
          where: { id: vendorBinding.clientId },
          select: { settings: true },
        });
        const mappedStatus = resolveConfirmationStatusForStage(
          client?.settings,
          convertedStage.id,
        );
        await tx.lead.update({
          where: { id: appointment.lead_id },
          data: {
            crm_stage_id: convertedStage.id,
            ...(mappedStatus ? { confirmation_status: mappedStatus } : {}),
          },
        });
        await tx.crmHistory.create({
          data: {
            lead_id: appointment.lead_id,
            from_stage_id: appointment.lead.crm_stage_id,
            to_stage_id: convertedStage.id,
            changed_by_user_id: user.sub,
            notes:
              mappedStatus != null
                ? "Lead movido para CONVERTIDO ao registrar venda\nStatus automático atualizado pela etapa do CRM"
                : "Lead movido para CONVERTIDO ao registrar venda",
          },
        });
      }

      await this.scoreEvents.awardWithTx(tx, {
        client_id: vendorBinding.clientId,
        vendor_id: creditedVendorId,
        lead_id: appointment.lead_id,
        appointment_id: appointment.id,
        kind: "checked_in",
        earned_at: soldAt,
      });

      await this.scoreEvents.awardWithTx(tx, {
        client_id: vendorBinding.clientId,
        vendor_id: creditedVendorId,
        lead_id: appointment.lead_id,
        appointment_id: appointment.id,
        sale_id: sale.id,
        kind: "sold",
        earned_at: soldAt,
      });

      return sale;
    });

    this.realtimeEvents.emitLeadUpdated(vendorBinding.clientId, {
      client_id: vendorBinding.clientId,
      lead_id: appointment.lead_id,
      action: "sale_created",
      updated_at: new Date().toISOString(),
    });

    await this.dispatchTracking
      .markConversion({
        leadId: appointment.lead_id,
        type: "sale",
        occurredAt: soldAt,
        appointmentId: appointment.id,
        saleId: sale.id,
        revenue: Number(sale.value),
      })
      .catch(() => undefined);

    return this.toResponse(sale);
  }

  async listMine(user: AuthenticatedUser) {
    if (user.role !== Role.VENDEDOR || !user.client_id) {
      throw new ForbiddenException("Apenas vendedor pode listar vendas");
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        client_id: user.client_id,
        vendor_id: user.sub,
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        appointment: {
          select: {
            id: true,
            scheduled_at: true,
            status: true,
            event: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        sold_at: "desc",
      },
    });

    return sales.map((sale) => this.toResponse(sale));
  }

  private async resolveVendorBinding(
    vendorId: string,
    appointmentId: string,
    leadId: string,
  ) {
    const membership = await this.prisma.salesTeamMember.findFirst({
      where: {
        user_id: vendorId,
        team: {
          event: {
            appointments: {
              some: {
                id: appointmentId,
                lead_id: leadId,
              },
            },
          },
        },
      },
      select: {
        team_id: true,
        user: {
          select: {
            client_id: true,
          },
        },
      },
    });

    const clientId = membership?.user.client_id;
    if (!clientId) {
      throw new BadRequestException(
        "Vendedor precisa estar vinculado a um time do evento para registrar a venda",
      );
    }

    return {
      clientId,
      teamId: membership.team_id,
    };
  }

  private parseCurrency(value: string): Prisma.Decimal {
    const normalized = value
      .trim()
      .replace(/[R$\s.]/g, "")
      .replace(",", ".");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Valor da venda invalido");
    }
    return new Prisma.Decimal(amount.toFixed(2));
  }

  private toResponse(sale: {
    id: string;
    client_id: string;
    lead_id: string;
    appointment_id: string;
    team_id?: string | null;
    vendor_id: string;
    type: string;
    model: string;
    value: Prisma.Decimal;
    sold_at: Date;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    lead?: {
      id: string;
      name: string;
      phone: string | null;
    };
    appointment?: {
      id: string;
      scheduled_at: Date;
      status: AppointmentStatus;
      event: {
        id: string;
        name: string;
      };
    };
  }) {
    return {
      ...sale,
      product: sale.model,
      value: sale.value.toFixed(2),
      lead: sale.lead
        ? {
            id: sale.lead.id,
            name: sale.lead.name,
            phone: sale.lead.phone,
          }
        : null,
      team_id: sale.team_id ?? null,
      appointment: sale.appointment
        ? {
            id: sale.appointment.id,
            scheduled_at: sale.appointment.scheduled_at,
            status: sale.appointment.status,
            event: sale.appointment.event,
          }
        : null,
    };
  }
}
