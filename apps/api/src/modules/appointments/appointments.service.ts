import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  EventStatus,
  Prisma,
  SenderType,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { generateQrPngBuffer } from "../../common/qrcode.util";
import {
  decryptCheckinToken,
  encryptCheckinToken,
  generateRawCheckinToken,
} from "../../common/utils/crypto.util";
import { PrismaService } from "../../config/prisma.service";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { ClientWebhookService } from "../crm/client-webhook.service";
import { MailService } from "../../mail/mail.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ScoreEventsService } from "../score-events/score-events.service";
import { MetaService } from "../meta/meta.service";
import { resolveConfirmationStatusForStage } from "../clients/client-settings";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { ConfirmAppointmentDto } from "./dto/confirm-appointment.dto";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { NoShowAppointmentDto } from "./dto/no-show-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";
import type { ReconcileScheduledLeadDto } from "../integration/dto/reconcile-scheduled-lead.dto";

const ACTIVE_APPOINTMENT_STATUSES = [
  AppointmentStatus.proposed,
  AppointmentStatus.scheduled,
  AppointmentStatus.confirmed,
] satisfies AppointmentStatus[];

const CAPACITY_APPOINTMENT_STATUSES = [
  AppointmentStatus.scheduled,
  AppointmentStatus.confirmed,
  AppointmentStatus.completed,
] satisfies AppointmentStatus[];

type TransactionClient = {
  apiIdempotencyRequest: PrismaService["apiIdempotencyRequest"];
  appointment: PrismaService["appointment"];
  client: PrismaService["client"];
  crmHistory: PrismaService["crmHistory"];
  crmPipeline: PrismaService["crmPipeline"];
  crmStage: PrismaService["crmStage"];
  lead: PrismaService["lead"];
  user: PrismaService["user"];
  scoreEvent: PrismaService["scoreEvent"];
};

type AppointmentRecord = Prisma.AppointmentGetPayload<{
  include: {
    lead: true;
    event: true;
    conversation: true;
  };
}>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly scoreEvents: ScoreEventsService,
    private readonly clientWebhook: ClientWebhookService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mail: MailService,
    private readonly metaService: MetaService,
    private readonly dispatchTracking: DispatchTrackingService,
  ) {}

  private checkinVoucherSecret(): string {
    const dedicated = this.configService
      .get<string>("LEADFLOW_CHECKIN_VOUCHER_SECRET")
      ?.trim();
    if (dedicated) {
      return dedicated;
    }
    return this.configService.get<string>(
      "JWT_SECRET",
      "leadflow_access_secret",
    );
  }

  async create(dto: CreateAppointmentDto, idempotencyKey?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.lead_id },
    });

    if (!lead || lead.deleted_at) {
      throw new NotFoundException("Lead nao encontrado");
    }

    const event = await this.prisma.event.findUnique({
      where: { id: dto.event_id },
    });

    if (!event) {
      throw new NotFoundException("Evento nao encontrado");
    }

    const participantIds = await this.prisma.eventParticipant.findMany({
      where: { event_id: event.id },
      select: { client_id: true },
    });
    this.assertLeadMatchesEvent(
      lead.client_id,
      participantIds.map((participant) => participant.client_id),
    );
    this.assertEventStatusAllowed(event.status);

    if (dto.conversation_id) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: dto.conversation_id },
      });

      if (!conversation) {
        throw new NotFoundException("Conversa nao encontrada");
      }

      if (
        conversation.client_id !== lead.client_id ||
        conversation.lead_id !== lead.id
      ) {
        throw new BadRequestException("Conversa invalida para este lead");
      }
    }

    const endpoint = "agent.appointments.create";
    const requestHash = this.createRequestHash({
      lead_id: dto.lead_id,
      event_id: dto.event_id,
      conversation_id: dto.conversation_id ?? null,
      scheduled_at: dto.scheduled_at,
      timezone: dto.timezone?.trim() || "America/Sao_Paulo",
      channel: dto.channel ?? null,
      source: dto.source ?? null,
      created_by_type: dto.created_by_type ?? null,
      created_by_id: dto.created_by_id ?? null,
      notes: this.normalizeNullableString(dto.notes),
    });

    const result = await this.runIdempotentAction(
      lead.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      () => this.createInternal(lead, event, dto),
    );

    if (!result.idempotent_replay) {
      await this.dispatchTracking
        .markConversion({
          leadId: dto.lead_id,
          type: "appointment",
          occurredAt: new Date(),
          appointmentId: result.id,
        })
        .catch(() => undefined);
      void this.clientWebhook.dispatch(lead.client_id, "appointment.created", {
        appointment_id: result.id,
        lead_id: dto.lead_id,
        event_id: dto.event_id,
        client_id: lead.client_id,
        scheduled_at: dto.scheduled_at,
        channel: dto.channel ?? null,
        source: dto.source ?? null,
        created_at: new Date().toISOString(),
      });
    }

    return result;
  }

  async reconcileScheduledLeadForAutomation(dto: ReconcileScheduledLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.lead_id, deleted_at: null },
      include: { event_interest: true },
    });
    if (!lead?.event_interest) {
      throw new NotFoundException("Lead sem evento vinculado");
    }

    const scheduledAt = new Date(dto.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("Data de agendamento invalida");
    }

    const eventStarts = Array.isArray(lead.event_interest.event_days)
      ? lead.event_interest.event_days
          .map((day) => {
            if (!day || typeof day !== "object" || !("start" in day)) {
              return null;
            }
            const value = (day as { start?: unknown }).start;
            return typeof value === "string" ? new Date(value) : null;
          })
          .filter(
            (value): value is Date =>
              value instanceof Date && !Number.isNaN(value.getTime()),
          )
      : [];
    if (
      eventStarts.length > 0 &&
      !eventStarts.some((start) => start.getTime() === scheduledAt.getTime())
    ) {
      throw new BadRequestException(
        "Data escolhida nao pertence aos dias configurados do evento",
      );
    }

    let appointment: AppointmentRecord | null =
      await this.prisma.appointment.findFirst({
        where: {
          lead_id: lead.id,
          event_id: lead.event_interest.id,
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
        },
        include: { lead: true, event: true, conversation: true },
        orderBy: { created_at: "desc" },
      });

    let idempotentReplay = true;
    if (!appointment) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { lead_id: lead.id, client_id: lead.client_id },
        orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
        select: { id: true },
      });
      const created = await this.create(
        {
          lead_id: lead.id,
          event_id: lead.event_interest.id,
          conversation_id: conversation?.id ?? null,
          scheduled_at: scheduledAt.toISOString(),
          timezone: "America/Sao_Paulo",
          channel: AppointmentChannel.whatsapp,
          source: AppointmentSource.n8n_ai_agent,
          created_by_type: AppointmentActorType.external_agent,
          notes: "Agendamento reconciliado por auditoria do Rubinho",
        },
        `scheduled-reconciliation:${lead.id}:${scheduledAt.toISOString()}`,
      );
      appointment = await this.prisma.appointment.findUnique({
        where: { id: created.id },
        include: { lead: true, event: true, conversation: true },
      });
      idempotentReplay = created.idempotent_replay;
    }

    if (!appointment) {
      throw new NotFoundException(
        "Agendamento nao encontrado apos reconciliacao",
      );
    }

    const email = await this.sendEventCredentialEmailForAutomation(
      lead.id,
      dto.dispatch_key,
    );

    return {
      reconciled: true,
      idempotent_replay: idempotentReplay,
      appointment: this.toAppointmentResponse(appointment),
      email,
    };
  }

  async confirm(
    id: string,
    dto: ConfirmAppointmentDto,
    idempotencyKey?: string,
  ) {
    const appointment = await this.getAppointmentOrFail(id);
    const endpoint = "agent.appointments.confirm";
    const requestHash = this.createRequestHash({
      id,
      source: dto.source ?? null,
      notes: this.normalizeNullableString(dto.notes),
    });

    const result = await this.runIdempotentAction(
      appointment.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      () => this.confirmInternal(appointment, dto),
    );

    if (!result.idempotent_replay && result.confirmed) {
      void this.clientWebhook.dispatch(
        appointment.client_id,
        "appointment.confirmed",
        {
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          client_id: appointment.client_id,
          confirmed_at: result.confirmed_at as string,
        },
      );
    }

    return result;
  }

  async sendCheckinNotification(id: string, idempotencyKey?: string) {
    const appointment = await this.getAppointmentOrFail(id);
    if (
      appointment.status !== AppointmentStatus.scheduled &&
      appointment.status !== AppointmentStatus.confirmed
    ) {
      throw new BadRequestException(
        "Status do appointment nao permite envio da credencial",
      );
    }
    if (!appointment.lead.phone) {
      throw new BadRequestException(
        "Lead sem telefone para envio da credencial",
      );
    }

    this.assertCredentialReady(appointment);

    if (!appointment.lead.checkin_token) {
      const encryptedToken = encryptCheckinToken(
        generateRawCheckinToken(),
        this.checkinVoucherSecret(),
      );
      await this.prisma.lead.update({
        where: { id: appointment.lead_id },
        data: { checkin_token: encryptedToken },
      });
      appointment.lead.checkin_token = encryptedToken;
    }

    const endpoint = "agent.appointments.checkin-notification";
    const requestHash = this.createRequestHash({
      appointment_id: appointment.id,
      lead_id: appointment.lead_id,
      event_id: appointment.event_id,
      conversation_id: appointment.conversation_id ?? null,
    });

    return this.runIdempotentAction(
      appointment.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      async () => {
        let emailDelivery:
          | { sent: boolean; idempotent_replay: boolean; reason?: string }
          | undefined;

        if (appointment.lead.email) {
          try {
            const result = await this.sendEventCredentialEmailForAutomation(
              appointment.lead_id,
              `lead-scheduled-email:${appointment.lead_id}:${appointment.scheduled_at.toISOString()}`,
            );
            emailDelivery = {
              sent: result.sent || result.idempotent_replay,
              idempotent_replay: result.idempotent_replay,
            };
          } catch (error) {
            emailDelivery = {
              sent: false,
              idempotent_replay: false,
              reason:
                error instanceof Error
                  ? error.message
                  : "Falha desconhecida ao enviar e-mail",
            };
          }
        }

        const token = decryptCheckinToken(
          appointment.lead.checkin_token!,
          this.checkinVoucherSecret(),
        );
        const qrPng = await generateQrPngBuffer(token, {
          size: 720,
          margin: 4,
          errorCorrectionLevel: "M",
        });
        const caption = this.buildCheckinCaption(
          appointment,
          emailDelivery?.sent === true,
        );
        const sent = await this.metaService.sendClientWhatsappMediaMessage({
          clientId: appointment.client_id,
          to: appointment.lead.phone!,
          fileBuffer: qrPng,
          filename: `checkin-${appointment.lead_id}.png`,
          mimeType: "image/png",
          caption,
        });

        let messageId: string | null = null;
        if (appointment.conversation_id) {
          const message = await this.prisma.message.create({
            data: {
              conversation_id: appointment.conversation_id,
              sender_type: SenderType.system,
              content: caption,
              external_id: sent.wamid,
              author_type: "automation",
              origin: "credential_qrcode",
              workflow_key: "appointment-credential",
              media_id: sent.mediaId,
              media_url: sent.mediaUrl,
            },
          });
          messageId = message.id;
          await this.prisma.conversation.update({
            where: { id: appointment.conversation_id },
            data: { last_message_at: message.created_at },
          });
          this.realtimeEvents.emitNewMessage(appointment.client_id, {
            conversation_id: appointment.conversation_id,
            message_id: message.id,
            sender_type: SenderType.system,
            sender_id: null,
            content: caption,
            media_id: sent.mediaId,
            media_url: sent.mediaUrl,
            created_at: message.created_at,
          });
          void this.clientWebhook.dispatch(
            appointment.client_id,
            "conversation.message.sent",
            {
              message_id: message.id,
              conversation_id: appointment.conversation_id,
              lead_id: appointment.lead_id,
              sender_type: SenderType.system,
              sender_id: null,
              content: caption,
              channel: "whatsapp",
              media_id: sent.mediaId,
              media_url: sent.mediaUrl,
              created_at: message.created_at.toISOString(),
            },
          );
        }

        return {
          sent: true,
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          event_id: appointment.event_id,
          conversation_id: appointment.conversation_id,
          message_id: messageId,
          wamid: sent.wamid,
          media_id: sent.mediaId,
          email: emailDelivery ?? {
            sent: false,
            idempotent_replay: false,
            reason: "Lead sem e-mail cadastrado",
          },
          idempotent_replay: false,
        };
      },
    );
  }

  async deliverCredentialForLead(leadId: string, idempotencyKey?: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        lead_id: leadId,
        status: {
          in: [AppointmentStatus.scheduled, AppointmentStatus.confirmed],
        },
      },
      select: { id: true },
      orderBy: { scheduled_at: "desc" },
    });
    if (!appointment) {
      throw new NotFoundException("Agendamento ativo do lead nao encontrado");
    }
    return this.sendCheckinNotification(appointment.id, idempotencyKey);
  }

  private assertCredentialReady(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
  ) {
    const missing: string[] = [];
    const structuredName = [
      appointment.lead.first_name?.trim(),
      appointment.lead.last_name?.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const legacyName = appointment.lead.name?.trim() || "";
    const fullName =
      structuredName.split(/\s+/).filter(Boolean).length >= 2
        ? structuredName
        : legacyName;
    if (fullName.split(/\s+/).filter(Boolean).length < 2) {
      missing.push("nome completo");
    }

    const companions = appointment.lead.companions?.trim() ?? "";
    if (!companions) {
      missing.push("acompanhantes");
    } else {
      const count = Number(companions.match(/^\d+/)?.[0] ?? NaN);
      const noCompanions =
        count === 0 || /^sem acompanhantes?$/i.test(companions);
      if (!noCompanions && Number.isInteger(count) && count > 0) {
        const names = companions.split(":").slice(1).join(":").trim();
        if (!names) missing.push("nome dos acompanhantes");
      }
    }

    const description = appointment.lead.description?.trim().toLowerCase();
    if (!description?.startsWith("carro na troca:")) {
      missing.push("resposta sobre carro na troca");
    } else if (description.startsWith("carro na troca: sim")) {
      if (!appointment.lead.vehicle_plate?.trim()) {
        missing.push("placa do veículo");
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Credencial ainda nao pode ser enviada. Campos pendentes: ${missing.join(", ")}`,
      );
    }
  }

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    idempotencyKey?: string,
  ) {
    const appointment = await this.getAppointmentOrFail(id);
    const endpoint = "agent.appointments.reschedule";
    const requestHash = this.createRequestHash({
      id,
      scheduled_at: dto.scheduled_at,
      timezone: dto.timezone?.trim() || appointment.timezone,
      notes: this.normalizeNullableString(dto.notes),
    });

    const result = await this.runIdempotentAction(
      appointment.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      () => this.rescheduleInternal(appointment, dto),
    );

    if (!result.idempotent_replay && result.rescheduled) {
      void this.clientWebhook.dispatch(
        appointment.client_id,
        "appointment.rescheduled",
        {
          from_appointment_id: appointment.id,
          to_appointment_id: result.to_appointment_id as string,
          lead_id: appointment.lead_id,
          client_id: appointment.client_id,
          new_scheduled_at: dto.scheduled_at,
          rescheduled_at: new Date().toISOString(),
        },
      );
    }

    return result;
  }

  async noShow(id: string, dto: NoShowAppointmentDto, idempotencyKey?: string) {
    const appointment = await this.getAppointmentOrFail(id);
    const endpoint = "agent.appointments.no_show";
    const requestHash = this.createRequestHash({
      id,
      reason: this.normalizeNullableString(dto.reason),
    });

    const result = await this.runIdempotentAction(
      appointment.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      () => this.noShowInternal(appointment, dto),
    );

    if (!result.idempotent_replay && result.no_show) {
      void this.clientWebhook.dispatch(
        appointment.client_id,
        "appointment.no_show",
        {
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          client_id: appointment.client_id,
          reason: dto.reason ?? null,
          no_show_at: result.no_show_at as string,
        },
      );
    }

    return result;
  }

  async cancel(id: string, dto: CancelAppointmentDto, idempotencyKey?: string) {
    const appointment = await this.getAppointmentOrFail(id);
    const endpoint = "agent.appointments.cancel";
    const requestHash = this.createRequestHash({
      id,
      reason: this.normalizeNullableString(dto.reason),
      source: dto.source ?? null,
    });

    const result = await this.runIdempotentAction(
      appointment.client_id,
      endpoint,
      requestHash,
      idempotencyKey,
      () => this.cancelInternal(appointment, dto),
    );

    if (!result.idempotent_replay && result.cancelled) {
      void this.clientWebhook.dispatch(
        appointment.client_id,
        "appointment.cancelled",
        {
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          client_id: appointment.client_id,
          reason: dto.reason ?? null,
          cancelled_at: result.cancelled_at as string,
        },
      );
    }

    return result;
  }

  async createForVendor(user: AuthenticatedUser, dto: CreateAppointmentDto) {
    if (user.role !== Role.VENDEDOR || !user.client_id) {
      throw new BadRequestException(
        "Apenas vendedor pode criar agendamento pelo painel",
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.lead_id,
        client_id: user.client_id,
        assigned_vendor_id: user.sub,
        deleted_at: null,
      },
    });
    if (!lead) {
      throw new NotFoundException("Lead nao encontrado para este vendedor");
    }

    const payload: CreateAppointmentDto = {
      ...dto,
      source: AppointmentSource.vendedor,
      channel: dto.channel ?? AppointmentChannel.manual,
      created_by_type: AppointmentActorType.user,
      created_by_id: user.sub,
    };

    const result = await this.create(payload);
    return { ...result, score_awarded: true };
  }

  async checkInByReception(user: AuthenticatedUser, appointmentId: string) {
    if (user.role !== Role.RECEPCAO || !user.client_id) {
      throw new BadRequestException("Apenas recepcao pode confirmar presenca");
    }

    const appointment = await this.getAppointmentOrFail(appointmentId);
    if (appointment.client_id !== user.client_id) {
      throw new BadRequestException("Agendamento nao pertence a esta empresa");
    }

    return this.checkInAppointment(appointment);
  }

  private async createInternal(
    lead: Awaited<ReturnType<PrismaService["lead"]["findUnique"]>>,
    event: Awaited<ReturnType<PrismaService["event"]["findUnique"]>>,
    dto: CreateAppointmentDto,
  ) {
    if (!lead || !event) {
      throw new NotFoundException("Lead ou evento nao encontrado");
    }

    await this.assertNoDuplicateActiveAppointment(lead.id, event.id);
    await this.assertEventHasCapacity(event.id, event.capacity);

    const isVendorCreated = dto.source === AppointmentSource.vendedor;

    const appointment = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.appointment.create({
          data: {
            client_id: lead.client_id,
            lead_id: lead.id,
            event_id: event.id,
            conversation_id: dto.conversation_id ?? null,
            scheduled_at: new Date(dto.scheduled_at),
            timezone: dto.timezone?.trim() || "America/Sao_Paulo",
            channel: dto.channel,
            source: dto.source,
            created_by_type: dto.created_by_type,
            created_by_id: dto.created_by_id ?? null,
            notes: this.normalizeNullableString(dto.notes),
          },
          include: {
            lead: true,
            event: true,
            conversation: true,
          },
        });

        await this.syncLeadStoreVisitDatetime(tx, lead.id);
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            ...(isVendorCreated
              ? {}
              : { confirmation_status: ConfirmationStatus.scheduled }),
            checkin_token:
              lead.checkin_token ??
              encryptCheckinToken(
                generateRawCheckinToken(),
                this.checkinVoucherSecret(),
              ),
            event_interest_id: event.id,
            attendant_type: dto.created_by_type ?? null,
            attendant_user_id:
              dto.created_by_type === AppointmentActorType.user
                ? (dto.created_by_id ?? null)
                : null,
          },
        });
        await this.syncCrmOnAppointmentCreated(
          tx,
          lead,
          created.created_by_id,
          dto.source,
        );
        await this.awardScheduledIfVendor(tx, created);

        return created;
      },
      { timeout: 15000, maxWait: 10000 },
    );

    this.emitLeadUpdated(
      appointment.client_id,
      appointment.lead_id,
      "appointment_created",
    );

    if (isVendorCreated) {
      void this.sendAppointmentWelcomeEmail(appointment).catch(() => undefined);
    }

    return {
      ...this.toAppointmentResponse(appointment),
      idempotent_replay: false,
    };
  }

  private async sendAppointmentWelcomeEmail(
    appointment: AppointmentRecord,
  ): Promise<void> {
    const lead = appointment.lead;
    const event = appointment.event;
    if (!lead.email) return;

    const vendorUserId =
      appointment.created_by_type === AppointmentActorType.user &&
      appointment.created_by_id
        ? appointment.created_by_id
        : lead.assigned_vendor_id;

    const [vendor, client] = await Promise.all([
      vendorUserId
        ? this.prisma.user.findUnique({
            where: { id: vendorUserId },
            select: { name: true, avatar_url: true },
          })
        : Promise.resolve(null),
      this.prisma.client.findUnique({
        where: { id: event.client_id },
        select: { company_name: true },
      }),
    ]);

    await this.mail.sendAppointmentWelcome({
      to: lead.email,
      leadName: lead.name,
      eventName: event.name,
      eventLocation: event.location,
      scheduledAt: appointment.scheduled_at,
      timezone: appointment.timezone,
      vendorName: vendor?.name ?? null,
      vendorAvatarUrl: vendor?.avatar_url ?? null,
      clientName: client?.company_name ?? event.name,
      checkinToken: lead.checkin_token || lead.id,
    });
  }

  async sendEventCredentialEmailForAutomation(
    leadId: string,
    dispatchKey: string,
  ) {
    const previous = await this.prisma.leadTimeline.findFirst({
      where: {
        lead_id: leadId,
        metadata: { path: ["dispatch_key"], equals: dispatchKey },
      },
      select: { id: true, occurred_at: true },
    });
    if (previous) {
      return {
        sent: false,
        idempotent_replay: true,
        timeline_id: previous.id,
        sent_at: previous.occurred_at,
      };
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        lead_id: leadId,
        status: {
          in: [AppointmentStatus.scheduled, AppointmentStatus.confirmed],
        },
      },
      include: { lead: true, event: true, conversation: true },
      orderBy: { scheduled_at: "desc" },
    });

    let timelineContext: {
      clientId: string;
      leadId: string;
      appointmentId: string | null;
      eventId: string;
    };

    if (appointment) {
      if (appointment.event.status !== EventStatus.active) {
        throw new BadRequestException("Evento nao esta ativo");
      }
      if (!appointment.lead.email) {
        throw new BadRequestException("Lead sem e-mail cadastrado");
      }
      await this.sendAppointmentWelcomeEmail(appointment);
      timelineContext = {
        clientId: appointment.client_id,
        leadId: appointment.lead_id,
        appointmentId: appointment.id,
        eventId: appointment.event_id,
      };
    } else {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, deleted_at: null },
        include: { event_interest: true },
      });
      if (!lead?.event_interest || !lead.store_visit_datetime) {
        throw new NotFoundException(
          "Lead agendado sem evento ou data para envio da credencial",
        );
      }
      if (lead.event_interest.status !== EventStatus.active) {
        throw new BadRequestException("Evento nao esta ativo");
      }
      if (!lead.email) {
        throw new BadRequestException("Lead sem e-mail cadastrado");
      }

      let checkinToken = lead.checkin_token;
      if (!checkinToken) {
        checkinToken = encryptCheckinToken(
          generateRawCheckinToken(),
          this.checkinVoucherSecret(),
        );
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { checkin_token: checkinToken },
        });
      }

      const [vendor, client] = await Promise.all([
        lead.assigned_vendor_id
          ? this.prisma.user.findUnique({
              where: { id: lead.assigned_vendor_id },
              select: { name: true, avatar_url: true },
            })
          : Promise.resolve(null),
        this.prisma.client.findUnique({
          where: { id: lead.client_id },
          select: { company_name: true },
        }),
      ]);

      await this.mail.sendAppointmentWelcome({
        to: lead.email,
        leadName:
          [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
          lead.name,
        eventName: lead.event_interest.name,
        eventLocation: lead.event_interest.location,
        scheduledAt: lead.store_visit_datetime,
        timezone: "America/Sao_Paulo",
        vendorName: vendor?.name ?? null,
        vendorAvatarUrl: vendor?.avatar_url ?? null,
        clientName: client?.company_name ?? lead.event_interest.name,
        checkinToken,
      });
      timelineContext = {
        clientId: lead.client_id,
        leadId: lead.id,
        appointmentId: null,
        eventId: lead.event_interest.id,
      };
    }

    const timeline = await this.prisma.leadTimeline.create({
      data: {
        client_id: timelineContext.clientId,
        lead_id: timelineContext.leadId,
        event_type: "message",
        origin: "n8n",
        actor_label: "Disparos multiempresa",
        notes: "Credencial do evento enviada por e-mail",
        metadata: {
          dispatch_key: dispatchKey,
          dispatch_type: "credencial-email",
          channel: "email",
          appointment_id: timelineContext.appointmentId,
          event_id: timelineContext.eventId,
        },
      },
      select: { id: true, occurred_at: true },
    });

    return {
      sent: true,
      idempotent_replay: false,
      timeline_id: timeline.id,
      sent_at: timeline.occurred_at,
    };
  }

  private async confirmInternal(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
    dto: ConfirmAppointmentDto,
  ) {
    if (appointment.status === AppointmentStatus.confirmed) {
      return {
        confirmed: false,
        reason: "already_confirmed",
        appointment_id: appointment.id,
        lead_id: appointment.lead_id,
        status: appointment.status,
        confirmed_at: this.toIsoString(appointment.confirmed_at),
        idempotent_replay: false,
      };
    }

    if (
      appointment.status !== AppointmentStatus.proposed &&
      appointment.status !== AppointmentStatus.scheduled
    ) {
      throw new BadRequestException(
        "Status do appointment nao permite confirmacao",
      );
    }

    const confirmedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.confirmed,
          confirmed_at: confirmedAt,
          notes: this.mergeNotes(appointment.notes, dto.notes),
        },
      });

      await tx.lead.update({
        where: { id: appointment.lead_id },
        data: {
          confirmation_status: ConfirmationStatus.confirmed,
          checkin_token:
            appointment.lead.checkin_token ??
            encryptCheckinToken(
              generateRawCheckinToken(),
              this.checkinVoucherSecret(),
            ),
          confirmation_date: appointment.lead.confirmation_date ?? confirmedAt,
        },
      });

      await this.syncCrmOnAppointmentConfirmed(
        tx,
        appointment.lead,
        appointment.created_by_id,
      );

      return updatedAppointment;
    });

    this.emitLeadUpdated(
      appointment.client_id,
      appointment.lead_id,
      "appointment_confirmed",
    );

    return {
      confirmed: true,
      appointment_id: updated.id,
      lead_id: updated.lead_id,
      status: updated.status,
      confirmed_at: this.toIsoString(updated.confirmed_at),
      idempotent_replay: false,
    };
  }

  private async rescheduleInternal(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
    dto: RescheduleAppointmentDto,
  ) {
    if (!this.isActiveAppointmentStatus(appointment.status)) {
      throw new BadRequestException(
        "Status do appointment nao permite remarcacao",
      );
    }

    await this.assertNoDuplicateActiveAppointment(
      appointment.lead_id,
      appointment.event_id,
      appointment.id,
    );
    await this.assertEventHasCapacity(
      appointment.event_id,
      appointment.event.capacity,
      appointment.id,
    );

    const scheduledAt = new Date(dto.scheduled_at);
    const newAppointment = await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.rescheduled,
          notes: this.mergeNotes(
            appointment.notes,
            `Rescheduled to ${scheduledAt.toISOString()}`,
          ),
        },
      });

      const created = await tx.appointment.create({
        data: {
          client_id: appointment.client_id,
          lead_id: appointment.lead_id,
          event_id: appointment.event_id,
          conversation_id: appointment.conversation_id,
          scheduled_at: scheduledAt,
          timezone: dto.timezone?.trim() || appointment.timezone,
          status: AppointmentStatus.scheduled,
          channel: appointment.channel,
          source: appointment.source,
          created_by_type: appointment.created_by_type,
          created_by_id: appointment.created_by_id,
          rescheduled_from_appointment_id: appointment.id,
          notes: this.mergeNotes(appointment.notes, dto.notes),
        },
        include: {
          lead: true,
          event: true,
          conversation: true,
        },
      });

      await this.syncLeadStoreVisitDatetime(tx, appointment.lead_id);
      await tx.lead.update({
        where: { id: appointment.lead_id },
        data: {
          confirmation_status: ConfirmationStatus.scheduled,
          checkin_token:
            appointment.lead.checkin_token ??
            encryptCheckinToken(
              generateRawCheckinToken(),
              this.checkinVoucherSecret(),
            ),
        },
      });
      await this.syncCrmStage(
        tx,
        appointment.lead,
        appointment.created_by_id,
        ["PRESENCA_REAGENDADA"],
        "Lead reagendou o dia da visita",
      );
      return created;
    });

    this.emitLeadUpdated(
      newAppointment.client_id,
      newAppointment.lead_id,
      "appointment_rescheduled",
    );

    return {
      rescheduled: true,
      from_appointment_id: appointment.id,
      to_appointment_id: newAppointment.id,
      lead_id: newAppointment.lead_id,
      scheduled_at: this.toIsoString(newAppointment.scheduled_at),
      idempotent_replay: false,
    };
  }

  private async cancelInternal(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
    dto: CancelAppointmentDto,
  ) {
    if (appointment.status === AppointmentStatus.cancelled) {
      return {
        cancelled: false,
        reason: "already_cancelled",
        appointment_id: appointment.id,
        lead_id: appointment.lead_id,
        status: appointment.status,
        cancelled_at: this.toIsoString(appointment.cancelled_at),
        idempotent_replay: false,
      };
    }

    if (!this.isActiveAppointmentStatus(appointment.status)) {
      throw new BadRequestException(
        "Status do appointment nao permite cancelamento",
      );
    }

    const cancelledAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.cancelled,
          cancelled_at: cancelledAt,
          notes: this.mergeNotes(
            appointment.notes,
            dto.reason ? `Cancel reason: ${dto.reason}` : undefined,
          ),
        },
      });

      await this.syncLeadStoreVisitDatetime(tx, appointment.lead_id);
      await tx.lead.update({
        where: { id: appointment.lead_id },
        data: {
          confirmation_status: ConfirmationStatus.cancelled,
        },
      });
      await this.syncCrmStage(
        tx,
        appointment.lead,
        appointment.created_by_id,
        ["PRESENCA_CANCELADA"],
        dto.reason
          ? `Lead cancelou o agendamento: ${dto.reason}`
          : "Lead cancelou o agendamento",
      );
      return updatedAppointment;
    });

    this.emitLeadUpdated(
      updated.client_id,
      updated.lead_id,
      "appointment_cancelled",
    );

    return {
      cancelled: true,
      appointment_id: updated.id,
      lead_id: updated.lead_id,
      status: updated.status,
      cancelled_at: this.toIsoString(updated.cancelled_at),
      idempotent_replay: false,
    };
  }

  private async checkInAppointment(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
  ) {
    if (appointment.status === AppointmentStatus.completed) {
      return {
        checked_in: false,
        reason: "already_checked_in",
        appointment_id: appointment.id,
        lead_id: appointment.lead_id,
        status: appointment.status,
        completed_at: this.toIsoString(appointment.completed_at),
      };
    }

    if (
      appointment.status !== AppointmentStatus.scheduled &&
      appointment.status !== AppointmentStatus.confirmed
    ) {
      throw new BadRequestException(
        "Status do appointment nao permite check-in",
      );
    }

    const completedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.completed,
          completed_at: completedAt,
        },
        include: {
          lead: true,
          event: true,
          conversation: true,
        },
      });

      await tx.lead.update({
        where: { id: appointment.lead_id },
        data: {
          confirmation_status: ConfirmationStatus.checked_in,
          confirmation_date: appointment.lead.confirmation_date ?? completedAt,
        },
      });

      await this.syncCrmStage(
        tx,
        appointment.lead,
        appointment.created_by_id,
        ["PRESENCA_CONFIRMADA"],
        "Lead chegou à loja — check-in realizado",
      );
      await this.awardCheckedInIfVendor(tx, updatedAppointment);

      return updatedAppointment;
    });

    this.emitLeadUpdated(
      updated.client_id,
      updated.lead_id,
      "appointment_checked_in",
    );

    return {
      checked_in: true,
      appointment_id: updated.id,
      lead_id: updated.lead_id,
      status: updated.status,
      completed_at: this.toIsoString(updated.completed_at),
    };
  }

  private async getAppointmentOrFail(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        lead: true,
        event: true,
        conversation: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment nao encontrado");
    }

    return appointment;
  }

  private buildCheckinCaption(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
    emailSent = false,
  ) {
    const firstName =
      appointment.lead.first_name?.trim() ||
      appointment.lead.name?.trim().split(/\s+/)[0] ||
      "";
    const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
    const scheduledAt = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: appointment.timezone || "America/Sao_Paulo",
    }).format(appointment.scheduled_at);
    return [
      greeting,
      "Este é o seu QR Code de credenciamento.",
      "",
      `*${appointment.event.name}*`,
      `Agendamento: ${scheduledAt}`,
      ...(appointment.event.location?.trim()
        ? [`Local: ${appointment.event.location.trim()}`]
        : []),
      "",
      "Apresente este QR Code na recepção para fazer seu check-in.",
      ...(emailSent
        ? ["Também enviamos uma cópia da credencial para o seu e-mail."]
        : []),
      "Te esperamos!",
    ].join("\n");
  }

  private async awardScheduledIfVendor(
    tx: TransactionClient,
    appointment: AppointmentRecord,
  ) {
    if (
      appointment.status !== AppointmentStatus.scheduled &&
      appointment.status !== AppointmentStatus.confirmed
    ) {
      return;
    }
    if (
      appointment.created_by_type !== AppointmentActorType.user ||
      !appointment.created_by_id
    ) {
      return;
    }

    const vendor = await tx.user.findFirst({
      where: {
        id: appointment.created_by_id,
        role: Role.VENDEDOR,
        client_id: appointment.client_id,
      },
    });
    if (!vendor) return;

    await this.scoreEvents.awardWithTx(tx, {
      client_id: appointment.client_id,
      vendor_id: vendor.id,
      lead_id: appointment.lead_id,
      appointment_id: appointment.id,
      kind: "scheduled",
      earned_at: appointment.created_at,
    });
  }

  private async awardCheckedInIfVendor(
    tx: TransactionClient,
    appointment: AppointmentRecord,
  ) {
    if (
      appointment.created_by_type !== AppointmentActorType.user ||
      !appointment.created_by_id
    ) {
      return;
    }

    const vendor = await tx.user.findFirst({
      where: {
        id: appointment.created_by_id,
        role: Role.VENDEDOR,
        client_id: appointment.client_id,
      },
    });
    if (!vendor) return;

    await this.scoreEvents.awardWithTx(tx, {
      client_id: appointment.client_id,
      vendor_id: vendor.id,
      lead_id: appointment.lead_id,
      appointment_id: appointment.id,
      kind: "checked_in",
      earned_at: appointment.completed_at ?? new Date(),
    });
  }

  private async assertNoDuplicateActiveAppointment(
    leadId: string,
    eventId: string,
    excludeAppointmentId?: string,
  ) {
    const duplicates = await this.prisma.appointment.count({
      where: {
        lead_id: leadId,
        event_id: eventId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        ...(excludeAppointmentId
          ? {
              id: { not: excludeAppointmentId },
            }
          : {}),
      },
    });

    if (duplicates > 0) {
      throw new ConflictException(
        "Ja existe appointment ativo para este lead e evento",
      );
    }
  }

  private async assertEventHasCapacity(
    eventId: string,
    capacity: number | null,
    excludeAppointmentId?: string,
  ) {
    if (capacity == null) {
      return;
    }

    const occupied = await this.prisma.appointment.count({
      where: {
        event_id: eventId,
        status: { in: [...CAPACITY_APPOINTMENT_STATUSES] },
        ...(excludeAppointmentId
          ? {
              id: { not: excludeAppointmentId },
            }
          : {}),
      },
    });

    if (occupied >= capacity) {
      throw new ConflictException(
        "Evento sem disponibilidade para este agendamento",
      );
    }
  }

  private assertLeadMatchesEvent(
    leadClientId: string,
    participantClientIds: string[],
  ) {
    if (!participantClientIds.includes(leadClientId)) {
      throw new BadRequestException(
        "Lead e evento pertencem a clientes diferentes",
      );
    }
  }

  private assertEventStatusAllowed(status: EventStatus) {
    if (status !== EventStatus.active && status !== EventStatus.draft) {
      throw new BadRequestException("Evento nao permite novos appointments");
    }
  }

  private async syncLeadStoreVisitDatetime(
    tx: TransactionClient,
    leadId: string,
  ) {
    const activeAppointment = await tx.appointment.findFirst({
      where: {
        lead_id: leadId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      },
      orderBy: [{ created_at: "desc" }],
    });

    await tx.lead.update({
      where: { id: leadId },
      data: {
        store_visit_datetime: activeAppointment?.scheduled_at ?? null,
      },
    });
  }

  /**
   * Move o lead para a primeira etapa CRM encontrada na lista de candidatos
   * (code ou name). Sem pipeline → silencioso. Sem actor → silencioso.
   */
  private async syncCrmStage(
    tx: TransactionClient,
    lead: NonNullable<Awaited<ReturnType<PrismaService["lead"]["findUnique"]>>>,
    actorId: string | null | undefined,
    suffixes: string[],
    historyNote: string,
    skipStatusUpdate = false,
  ) {
    let pipelineId = lead.crm_pipeline_id;
    if (!pipelineId) {
      const activePipeline = await tx.crmPipeline.findFirst({
        where: { client_id: lead.client_id },
        select: { id: true },
      });
      if (!activePipeline) return;
      pipelineId = activePipeline.id;
    }
    const resolvedPipelineId: string = pipelineId;

    const resolvedActorId =
      actorId?.trim() ||
      this.configService
        .get<string>("LEADFLOW_INTEGRATION_ACTOR_USER_ID")
        ?.trim();
    if (!resolvedActorId) return;

    const actor = await tx.user.findUnique({ where: { id: resolvedActorId } });
    if (!actor) return;

    const idBase = lead.client_id.replace(/-/g, "").toUpperCase().slice(0, 16);

    let targetStage: Awaited<ReturnType<typeof tx.crmStage.findFirst>> = null;
    for (const suffix of suffixes) {
      const code = `${idBase}_${suffix}`;
      const found = await tx.crmStage.findFirst({
        where: {
          client_id: lead.client_id,
          pipeline_id: resolvedPipelineId,
          code,
        },
      });
      if (found) {
        targetStage = found;
        break;
      }
    }

    if (!targetStage || targetStage.id === lead.crm_stage_id) return;

    const client = await tx.client.findUnique({
      where: { id: lead.client_id },
      select: { settings: true },
    });
    const mappedStatus = skipStatusUpdate
      ? null
      : (resolveConfirmationStatusForStage(client?.settings, targetStage.id) ??
        (targetStage.code.endsWith("_PRESENCA_AGENDADA")
          ? ConfirmationStatus.scheduled
          : null));
    const notesWithStatus =
      mappedStatus != null
        ? `${historyNote}\nStatus automático atualizado pela etapa do CRM`
        : historyNote;

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        crm_pipeline_id: resolvedPipelineId,
        crm_stage_id: targetStage.id,
        ...(mappedStatus ? { confirmation_status: mappedStatus } : {}),
      },
    });

    await tx.crmHistory.create({
      data: {
        lead_id: lead.id,
        from_stage_id: lead.crm_stage_id,
        to_stage_id: targetStage.id,
        changed_by_user_id: resolvedActorId,
        notes: notesWithStatus,
      },
    });
  }

  /** Move lead para etapa CONFIRMADO ao confirmar agendamento. */
  private async syncCrmOnAppointmentConfirmed(
    tx: TransactionClient,
    lead: NonNullable<Awaited<ReturnType<PrismaService["lead"]["findUnique"]>>>,
    actorId: string | null | undefined,
  ) {
    return this.syncCrmStage(
      tx,
      lead,
      actorId,
      ["AGENDADOS_CONFIRMADOS"],
      "Lead confirmou visita à loja",
    );
  }

  private async syncCrmOnAppointmentCreated(
    tx: TransactionClient,
    lead: NonNullable<Awaited<ReturnType<PrismaService["lead"]["findUnique"]>>>,
    createdById?: string | null,
    source?: AppointmentSource | null,
  ) {
    const isVendor = source === AppointmentSource.vendedor;
    const suffixes = ["PRESENCA_AGENDADA", "PRE_AGENDAMENTO"];

    return this.syncCrmStage(
      tx,
      lead,
      createdById,
      suffixes,
      isVendor
        ? "Lead movido para etapa PRESENCA_AGENDADA ao criar agendamento pelo vendedor"
        : "Lead movido para etapa PRESENCA_AGENDADA ao criar agendamento",
      isVendor,
    );
  }

  private async noShowInternal(
    appointment: Awaited<
      ReturnType<AppointmentsService["getAppointmentOrFail"]>
    >,
    dto: NoShowAppointmentDto,
  ) {
    if (appointment.status === AppointmentStatus.no_show) {
      return {
        no_show: false,
        reason: "already_no_show",
        appointment_id: appointment.id,
        lead_id: appointment.lead_id,
        status: appointment.status,
        no_show_at: this.toIsoString(appointment.no_show_at),
        idempotent_replay: false,
      };
    }

    if (
      appointment.status !== AppointmentStatus.scheduled &&
      appointment.status !== AppointmentStatus.confirmed
    ) {
      throw new BadRequestException(
        "Status do appointment nao permite registrar no-show",
      );
    }

    const noShowAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.no_show,
          no_show_at: noShowAt,
          notes: this.mergeNotes(
            appointment.notes,
            dto.reason ? `No-show: ${dto.reason}` : "No-show registrado",
          ),
        },
      });

      await this.syncLeadStoreVisitDatetime(tx, appointment.lead_id);
      await this.syncCrmStage(
        tx,
        appointment.lead,
        appointment.created_by_id,
        ["LEAD_AUSENTE"],
        "Lead nao compareceu — no-show registrado",
      );

      return updatedAppointment;
    });

    return {
      no_show: true,
      appointment_id: updated.id,
      lead_id: updated.lead_id,
      status: updated.status,
      no_show_at: this.toIsoString(updated.no_show_at),
      idempotent_replay: false,
    };
  }

  private isActiveAppointmentStatus(status: AppointmentStatus) {
    return ACTIVE_APPOINTMENT_STATUSES.some(
      (activeStatus) => activeStatus === status,
    );
  }

  private emitLeadUpdated(clientId: string, leadId: string, action: string) {
    this.realtimeEvents.emitLeadUpdated(clientId, {
      client_id: clientId,
      lead_id: leadId,
      action,
      updated_at: new Date().toISOString(),
    });
  }

  private toAppointmentResponse(appointment: AppointmentRecord) {
    return {
      id: appointment.id,
      client_id: appointment.client_id,
      lead_id: appointment.lead_id,
      event_id: appointment.event_id,
      conversation_id: appointment.conversation_id,
      scheduled_at: this.toIsoString(appointment.scheduled_at),
      timezone: appointment.timezone,
      status: appointment.status,
      channel: appointment.channel,
      source: appointment.source,
      created_by_type: appointment.created_by_type,
      created_by_id: appointment.created_by_id,
      confirmed_at: this.toIsoString(appointment.confirmed_at),
      cancelled_at: this.toIsoString(appointment.cancelled_at),
      completed_at: this.toIsoString(appointment.completed_at),
      no_show_at: this.toIsoString(appointment.no_show_at),
      rescheduled_from_appointment_id:
        appointment.rescheduled_from_appointment_id,
      notes: appointment.notes,
      created_at: this.toIsoString(appointment.created_at),
      updated_at: this.toIsoString(appointment.updated_at),
    };
  }

  private normalizeNullableString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private mergeNotes(current: string | null, extra?: string | null) {
    const next = this.normalizeNullableString(extra);
    if (!current && !next) {
      return null;
    }
    if (!current) {
      return next;
    }
    if (!next) {
      return current;
    }
    return `${current}\n${next}`;
  }

  private toIsoString(value: Date | null) {
    return value ? value.toISOString() : null;
  }

  private normalizeIdempotencyKey(value?: string) {
    return value?.trim() || null;
  }

  private createRequestHash(payload: Record<string, unknown>) {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private async runIdempotentAction<T extends Record<string, unknown>>(
    clientId: string,
    endpoint: string,
    requestHash: string,
    idempotencyKey: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    let reservedIdempotencyKey = false;

    if (normalizedIdempotencyKey) {
      const existingRequest =
        await this.prisma.apiIdempotencyRequest.findUnique({
          where: {
            client_id_endpoint_idempotency_key: {
              client_id: clientId,
              endpoint,
              idempotency_key: normalizedIdempotencyKey,
            },
          },
        });

      if (existingRequest) {
        if (existingRequest.request_hash !== requestHash) {
          throw new ConflictException(
            "Idempotency-Key ja foi utilizado com payload diferente",
          );
        }

        if (existingRequest.response) {
          return {
            ...(existingRequest.response as T),
            idempotent_replay: true,
          };
        }

        throw new ConflictException(
          "Requisicao com este Idempotency-Key ainda esta em processamento",
        );
      }

      await this.prisma.apiIdempotencyRequest.create({
        data: {
          client_id: clientId,
          endpoint,
          idempotency_key: normalizedIdempotencyKey,
          request_hash: requestHash,
        },
      });
      reservedIdempotencyKey = true;
    }

    try {
      const response = await action();

      if (normalizedIdempotencyKey) {
        await this.persistIdempotencyResponse(
          clientId,
          endpoint,
          normalizedIdempotencyKey,
          requestHash,
          response,
        );
      }

      return response;
    } catch (error) {
      if (normalizedIdempotencyKey && reservedIdempotencyKey) {
        await this.clearIdempotencyReservation(
          clientId,
          endpoint,
          normalizedIdempotencyKey,
        );
      }

      throw error;
    }
  }

  private async persistIdempotencyResponse(
    clientId: string,
    endpoint: string,
    idempotencyKey: string,
    requestHash: string,
    response: Record<string, unknown>,
  ) {
    await this.prisma.apiIdempotencyRequest.upsert({
      where: {
        client_id_endpoint_idempotency_key: {
          client_id: clientId,
          endpoint,
          idempotency_key: idempotencyKey,
        },
      },
      create: {
        client_id: clientId,
        endpoint,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        response: response as Prisma.InputJsonValue,
      },
      update: {
        request_hash: requestHash,
        response: response as Prisma.InputJsonValue,
      },
    });
  }

  private async clearIdempotencyReservation(
    clientId: string,
    endpoint: string,
    idempotencyKey: string,
  ) {
    await this.prisma.apiIdempotencyRequest
      .delete({
        where: {
          client_id_endpoint_idempotency_key: {
            client_id: clientId,
            endpoint,
            idempotency_key: idempotencyKey,
          },
        },
      })
      .catch(() => undefined);
  }
}
