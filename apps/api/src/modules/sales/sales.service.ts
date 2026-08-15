import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  Prisma,
} from "@prisma/client";
import { Role } from "../../common/types";
import { generateRatingToken } from "../../common/utils/crypto.util";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ScoreEventsService } from "../score-events/score-events.service";
import { resolveConfirmationStatusForStage } from "../clients/client-settings";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { CreateQuickSaleDto } from "./dto/create-quick-sale.dto";
import { UpdateSaleDto } from "./dto/update-sale.dto";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";
import { MetaService } from "../meta/meta.service";

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreEvents: ScoreEventsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly dispatchTracking: DispatchTrackingService,
    private readonly metaService: MetaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateSaleDto,
    options: { authorizedQuickSale?: boolean } = {},
  ) {
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
    const eventPermissions = await this.prisma.event.findUnique({
      where: { id: appointment.event_id },
      select: {
        allow_vendor_create_sale: true,
        allow_reception_create_sale: true,
      },
    });
    if (
      user.role === Role.VENDEDOR &&
      !options.authorizedQuickSale &&
      eventPermissions?.allow_vendor_create_sale === false
    ) {
      throw new ForbiddenException(
        "Registro de venda não permitido para este perfil no evento",
      );
    }
    if (
      user.role === Role.RECEPCAO &&
      eventPermissions?.allow_reception_create_sale !== true
    ) {
      throw new ForbiddenException(
        "Registro de venda não permitido para a recepção neste evento",
      );
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
          order_number: dto.order_number?.trim() || null,
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

    await this.sendSaleFeedbackWhatsapp({
      clientId: vendorBinding.clientId,
      vendorId: creditedVendorId,
      leadName: appointment.lead.name,
      leadPhone: appointment.lead.phone,
      saleId: sale.id,
    });

    return this.toResponse(sale);
  }

  private async sendSaleFeedbackWhatsapp(input: {
    clientId: string;
    vendorId: string;
    leadName: string;
    leadPhone: string | null;
    saleId: string;
  }): Promise<void> {
    if (!input.leadPhone?.trim()) {
      this.logger.warn(
        `Feedback da venda não enviado: lead sem telefone sale=${input.saleId}`,
      );
      return;
    }

    try {
      const vendor = await this.prisma.user.findFirst({
        where: {
          id: input.vendorId,
          client_id: input.clientId,
          role: Role.VENDEDOR,
        },
        select: { id: true, name: true, rating_token: true },
      });
      if (!vendor) {
        this.logger.warn(
          `Feedback da venda não enviado: vendedor não encontrado sale=${input.saleId}`,
        );
        return;
      }

      let ratingToken = vendor.rating_token;
      if (!ratingToken) {
        ratingToken = generateRatingToken();
        await this.prisma.user.update({
          where: { id: vendor.id },
          data: { rating_token: ratingToken },
        });
      }

      const configuredOrigin = this.config
        .get<string>("FRONTEND_URL")
        ?.split(",")[0]
        ?.trim();
      const publicOrigin = (
        configuredOrigin || "https://gpdevendas.app"
      ).replace(/\/$/, "");
      const feedbackUrl = `${publicOrigin}/avaliacao/${ratingToken}`;
      const firstName = input.leadName.trim().split(/\s+/)[0] || "cliente";
      const message =
        `Olá, ${firstName}! Obrigado pela sua compra. ` +
        `Conte como foi seu atendimento com ${vendor.name}:\n${feedbackUrl}`;

      await this.metaService.sendClientWhatsappMessage(
        input.clientId,
        input.leadPhone,
        message,
      );
      this.logger.log(
        `Feedback da venda enviado via WhatsApp sale=${input.saleId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falha ao enviar feedback da venda via WhatsApp sale=${input.saleId}: ${message}`,
      );
    }
  }

  async createQuickSale(user: AuthenticatedUser, dto: CreateQuickSaleDto) {
    if (
      user.role !== Role.GESTOR &&
      user.role !== Role.CLIENTE &&
      user.role !== Role.RECEPCAO
    ) {
      throw new ForbiddenException(
        "Apenas gestor, cliente ou recepção pode registrar venda rápida",
      );
    }
    if (
      (user.role === Role.CLIENTE || user.role === Role.RECEPCAO) &&
      user.client_id !== dto.client_id
    ) {
      throw new ForbiddenException("Empresa não permitida para este acesso");
    }

    const [client, event, vendor, vehicle] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: dto.client_id } }),
      this.prisma.event.findFirst({
        where: {
          id: dto.event_id,
          OR: [
            { client_id: dto.client_id },
            { participants: { some: { client_id: dto.client_id } } },
          ],
        },
      }),
      this.prisma.user.findFirst({
        where: {
          id: dto.vendor_id,
          client_id: dto.client_id,
          role: Role.VENDEDOR,
          is_active: true,
        },
      }),
      dto.vehicle_id
        ? this.prisma.vehicle.findFirst({
            where: { id: dto.vehicle_id, client_id: dto.client_id },
          })
        : Promise.resolve(null),
    ]);

    if (!client) throw new NotFoundException("Empresa não encontrada");
    if (!event) {
      throw new NotFoundException("Evento não encontrado para a empresa");
    }
    if (
      user.role === Role.RECEPCAO &&
      event.allow_reception_create_sale !== true
    ) {
      throw new ForbiddenException(
        "Registro de venda não permitido para a recepção neste evento",
      );
    }
    if (!vendor) {
      throw new NotFoundException("Vendedor não encontrado para a empresa");
    }
    if (dto.vehicle_id && !vehicle) {
      throw new NotFoundException("Veículo não encontrado para a empresa");
    }
    if (event.require_wristband && !dto.wristband_number?.trim()) {
      throw new BadRequestException(
        "Número da pulseira é obrigatório neste evento",
      );
    }

    const membership = await this.prisma.salesTeamMember.findFirst({
      where: { user_id: vendor.id, team: { event_id: event.id } },
      select: { team_id: true },
    });
    if (!membership) {
      throw new BadRequestException(
        "Vendedor precisa estar vinculado a um time do evento",
      );
    }

    const soldAt = new Date(dto.sold_at);
    const appointment = await this.prisma.$transaction(async (tx) => {
      let lead = dto.lead_id
        ? await tx.lead.findFirst({
            where: {
              id: dto.lead_id,
              client_id: dto.client_id,
              deleted_at: null,
            },
          })
        : null;

      if (dto.lead_id && !lead) {
        throw new NotFoundException("Cliente comprador não encontrado");
      }
      if (!lead) {
        const name = dto.lead_name?.trim();
        if (!name) {
          throw new BadRequestException("Nome do comprador é obrigatório");
        }
        lead = await tx.lead.create({
          data: {
            client_id: dto.client_id,
            name,
            email: dto.lead_email?.trim() || null,
            phone: dto.lead_phone?.trim() || null,
            source: "manual",
            event_interest_id: event.id,
            confirmation_status: ConfirmationStatus.checked_in,
            confirmation_date: soldAt,
            store_visit_datetime: soldAt,
            assigned_vendor_id: vendor.id,
            sold_by_vendor_id: vendor.id,
            team_id: membership.team_id,
            registered_by_id: user.sub,
            wristband_number: dto.wristband_number?.trim() || null,
          },
        });
      } else {
        lead = await tx.lead.update({
          where: { id: lead.id },
          data: {
            event_interest_id: event.id,
            assigned_vendor_id: vendor.id,
            team_id: membership.team_id,
            wristband_number: dto.wristband_number?.trim() || undefined,
          },
        });
      }

      const existing = await tx.appointment.findFirst({
        where: {
          lead_id: lead.id,
          event_id: event.id,
          sale: null,
          status: { in: ["scheduled", "confirmed", "completed"] },
        },
        orderBy: { created_at: "desc" },
      });
      if (existing) return existing;

      return tx.appointment.create({
        data: {
          client_id: dto.client_id,
          lead_id: lead.id,
          event_id: event.id,
          scheduled_at: soldAt,
          timezone: "America/Sao_Paulo",
          status: AppointmentStatus.completed,
          completed_at: soldAt,
          channel: AppointmentChannel.internal,
          source: AppointmentSource.gestor,
          created_by_type: AppointmentActorType.user,
          created_by_id: user.sub,
          notes: "Agendamento criado automaticamente pela venda rápida.",
        },
      });
    });

    const product = vehicle
      ? `${vehicle.brand} ${vehicle.model}`.trim()
      : dto.product?.trim();
    if (!product) {
      throw new BadRequestException("Selecione ou informe o veículo");
    }

    return this.create(
      {
        ...user,
        sub: vendor.id,
        role: Role.VENDEDOR,
        client_id: dto.client_id,
      },
      {
        appointment_id: appointment.id,
        type: dto.type,
        product,
        value: dto.value,
        sold_at: dto.sold_at,
        order_number: dto.order_number,
        notes: dto.notes,
      },
      { authorizedQuickSale: true },
    );
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

  async listByEvent(user: AuthenticatedUser, eventId: string) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException(
        "Apenas gestor pode listar vendas do evento",
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("Evento não encontrado");

    const sales = await this.prisma.sale.findMany({
      where: { appointment: { event_id: eventId } },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        vendor: { select: { id: true, name: true } },
        sales_team: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            scheduled_at: true,
            status: true,
            event: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sold_at: "desc" },
    });

    return sales.map((sale) => ({
      ...this.toResponse(sale),
      vendor: sale.vendor,
      team: sale.sales_team,
    }));
  }

  async listPendingByEvent(user: AuthenticatedUser, eventId: string) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException(
        "Apenas gestor pode listar vendas aguardando baixa",
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("Evento não encontrado");

    const rows = await this.prisma.vendorAttendance.findMany({
      where: {
        event_id: eventId,
        status: "finished",
        sold: true,
        lead: {
          sales: { none: { appointment: { event_id: eventId } } },
        },
      },
      select: {
        id: true,
        lead_id: true,
        vendor_id: true,
        finished_at: true,
        lead: { select: { name: true, phone: true, wristband_number: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { finished_at: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      lead_id: row.lead_id,
      lead_name: row.lead.name,
      lead_phone: row.lead.phone,
      wristband_number: row.lead.wristband_number,
      vendor_id: row.vendor_id,
      vendor_name: row.vendor.name,
      finished_at: row.finished_at?.toISOString() ?? null,
    }));
  }

  async update(user: AuthenticatedUser, saleId: string, dto: UpdateSaleDto) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException("Apenas gestor pode editar vendas");
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { appointment: { select: { event_id: true } } },
    });
    if (!sale) throw new NotFoundException("Venda não encontrada");

    const [lead, membership] = await Promise.all([
      this.prisma.lead.findFirst({
        where: { id: dto.lead_id, client_id: sale.client_id, deleted_at: null },
        select: { id: true },
      }),
      this.prisma.salesTeamMember.findFirst({
        where: {
          user_id: dto.vendor_id,
          team: { event_id: sale.appointment.event_id },
        },
        select: { team_id: true, user: { select: { client_id: true } } },
      }),
    ]);
    if (!lead) throw new NotFoundException("Comprador não encontrado");
    if (!membership || membership.user.client_id !== sale.client_id) {
      throw new BadRequestException("Vendedor não participa deste evento");
    }

    const soldAt = new Date(dto.sold_at);
    const product = dto.product.trim();
    if (!product) throw new BadRequestException("Produto da venda inválido");

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.sale.update({
        where: { id: saleId },
        data: {
          lead_id: dto.lead_id,
          vendor_id: dto.vendor_id,
          team_id: membership.team_id,
          type: dto.type,
          model: product,
          value: this.parseCurrency(dto.value),
          sold_at: soldAt,
          order_number: dto.order_number?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.appointment.update({
        where: { id: sale.appointment_id },
        data: { lead_id: dto.lead_id },
      });
      await tx.scoreEvent.updateMany({
        where: {
          appointment_id: sale.appointment_id,
          kind: { in: ["checked_in", "sold"] },
        },
        data: {
          client_id: sale.client_id,
          lead_id: dto.lead_id,
          vendor_id: dto.vendor_id,
          earned_at: soldAt,
        },
      });
      await tx.lead.update({
        where: { id: dto.lead_id },
        data: {
          assigned_vendor_id: dto.vendor_id,
          sold_by_vendor_id: dto.vendor_id,
          team_id: membership.team_id,
        },
      });
      if (sale.lead_id !== dto.lead_id) {
        const oldLeadStillSold = await tx.sale.count({
          where: { lead_id: sale.lead_id, id: { not: saleId } },
        });
        if (oldLeadStillSold === 0) {
          await tx.lead.update({
            where: { id: sale.lead_id },
            data: { sold_by_vendor_id: null },
          });
        }
      }
      return next;
    });

    this.realtimeEvents.emitLeadUpdated(sale.client_id, {
      client_id: sale.client_id,
      lead_id: dto.lead_id,
      action: "sale_updated",
      updated_at: new Date().toISOString(),
    });
    return this.toResponse(updated);
  }

  async remove(user: AuthenticatedUser, saleId: string) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException("Apenas gestor pode excluir vendas");
    }
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException("Venda não encontrada");

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.delete({ where: { id: saleId } });
      const remainingSales = await tx.sale.count({
        where: { lead_id: sale.lead_id },
      });
      if (remainingSales === 0) {
        await tx.lead.update({
          where: { id: sale.lead_id },
          data: { sold_by_vendor_id: null },
        });
      }
    });

    this.realtimeEvents.emitLeadUpdated(sale.client_id, {
      client_id: sale.client_id,
      lead_id: sale.lead_id,
      action: "sale_deleted",
      updated_at: new Date().toISOString(),
    });
    return { deleted: true };
  }

  async listBuyers(user: AuthenticatedUser, clientId: string, search?: string) {
    if (
      user.role !== Role.GESTOR &&
      user.role !== Role.CLIENTE &&
      user.role !== Role.RECEPCAO
    ) {
      throw new ForbiddenException("Sem permissão para buscar compradores");
    }
    if (
      (user.role === Role.CLIENTE || user.role === Role.RECEPCAO) &&
      user.client_id !== clientId
    ) {
      throw new ForbiddenException("Empresa não permitida para este acesso");
    }

    const query = search?.trim();
    return this.prisma.lead.findMany({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 50,
    });
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
    order_number: string | null;
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
