import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  ConversationChannel,
  EventStatus,
  Prisma,
  SenderType,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import type { RunNoShowRescueDto } from "../integration/dto/run-no-show-rescue.dto";

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

type CredentialDeliveryOptions = {
  allowIncompleteCredential?: boolean;
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

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

  async runNoShowRescue(dto: RunNoShowRescueDto) {
    const start = new Date(`${dto.target_date}T03:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException("target_date invalida");
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const todayInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (dto.target_date >= todayInSaoPaulo) {
      throw new BadRequestException(
        "O resgate so pode processar datas anteriores ao dia atual",
      );
    }

    const templateName = dto.template_name ?? "resgate_nao_comparecido_01";
    const clientCodeBase = dto.client_id
      .replace(/-/g, "")
      .toUpperCase()
      .slice(0, 16);
    const confirmationStage = await this.prisma.crmStage.findFirst({
      where: {
        client_id: dto.client_id,
        code: `${clientCodeBase}_ENVIAR_CONFIRMACAO`,
      },
      select: { id: true },
    });
    // O resgate diário começa exclusivamente na coluna "Presença agendada".
    // Leads que já avançaram para confirmação, reagendamento ou outra etapa
    // não devem receber esse template novamente.
    const scheduledStage = await this.prisma.crmStage.findFirst({
      where: {
        client_id: dto.client_id,
        code: { endsWith: "_PRESENCA_AGENDADA" },
      },
      select: { id: true },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        client_id: dto.client_id,
        ...(dto.event_id ? { event_id: dto.event_id } : {}),
        scheduled_at: { gte: start, lt: end },
        lead: { deleted_at: null },
      },
      include: {
        lead: true,
        event: { select: { id: true, name: true, event_end_date: true } },
      },
      orderBy: { created_at: "desc" },
    });

    const grouped = new Map<string, typeof appointments>();
    for (const appointment of appointments) {
      const key = `${appointment.event_id}:${appointment.lead_id}`;
      const group = grouped.get(key) ?? [];
      group.push(appointment);
      grouped.set(key, group);
    }

    const candidates = [...grouped.values()]
      .filter((group) => {
        const lead = group[0].lead;
        const hasTrustedActiveAppointment = group.some(
          (appointment) =>
            appointment.channel === AppointmentChannel.whatsapp &&
            (appointment.status === AppointmentStatus.scheduled ||
              appointment.status === AppointmentStatus.confirmed),
        );
        const attended =
          group.some(
            (appointment) =>
              appointment.status === AppointmentStatus.completed ||
              Boolean(appointment.completed_at),
          ) ||
          lead.confirmation_status === ConfirmationStatus.checked_in ||
          lead.confirmation_status === ConfirmationStatus.closed;
        const visitMatches =
          lead.store_visit_datetime != null &&
          lead.store_visit_datetime >= start &&
          lead.store_visit_datetime < end;
        const alreadyInConfirmationStage =
          confirmationStage != null &&
          lead.crm_stage_id === confirmationStage.id;
        const eventContinuesNextDay =
          group[0].event.event_end_date != null &&
          group[0].event.event_end_date >= end;
        return Boolean(
          scheduledStage != null &&
          lead.crm_stage_id === scheduledStage.id &&
          hasTrustedActiveAppointment &&
          !attended &&
          visitMatches &&
          !alreadyInConfirmationStage &&
          eventContinuesNextDay &&
          lead.phone,
        );
      })
      .map((group) => group[0]);

    const results: Array<Record<string, unknown>> = [];
    for (const appointment of candidates) {
      const dispatchKey = `no-show-rescue:${appointment.event_id}:${dto.target_date}:${appointment.lead_id}:${templateName}`;
      const existing = await this.prisma.dispatchEvent.findUnique({
        where: {
          client_id_dispatch_key: {
            client_id: appointment.client_id,
            dispatch_key: dispatchKey,
          },
        },
        select: { status: true, provider_message_id: true },
      });
      if (
        existing &&
        ["sent", "delivered", "read", "replied"].includes(existing.status)
      ) {
        results.push({
          lead_id: appointment.lead_id,
          lead_name: appointment.lead.name,
          status: "already_sent",
          provider_message_id: existing.provider_message_id,
        });
        continue;
      }
      if (dto.dry_run) {
        results.push({
          lead_id: appointment.lead_id,
          lead_name: appointment.lead.name,
          status: "eligible",
        });
        continue;
      }

      await this.dispatchTracking.upsert(appointment.client_id, {
        lead_id: appointment.lead_id,
        event_id: appointment.event_id,
        appointment_id: appointment.id,
        dispatch_key: dispatchKey,
        workflow_key: "daily-no-show-rescue",
        dispatch_type: "no_show_rescue",
        channel: "whatsapp",
        provider: "meta",
        template_name: templateName,
        status: "queued",
        occurred_at: new Date().toISOString(),
        metadata: { target_date: dto.target_date },
      });

      try {
        const providerMessageId =
          await this.metaService.sendClientWhatsappTemplate({
            clientId: appointment.client_id,
            to: appointment.lead.phone!,
            templateName,
            language: "pt_BR",
            parameters: [],
          });
        await this.dispatchTracking.upsert(appointment.client_id, {
          lead_id: appointment.lead_id,
          event_id: appointment.event_id,
          appointment_id: appointment.id,
          dispatch_key: dispatchKey,
          workflow_key: "daily-no-show-rescue",
          dispatch_type: "no_show_rescue",
          channel: "whatsapp",
          provider: "meta",
          provider_message_id: providerMessageId ?? undefined,
          template_name: templateName,
          status: "sent",
          occurred_at: new Date().toISOString(),
          metadata: { target_date: dto.target_date },
        });
        await this.prisma.$transaction(async (tx) => {
          await this.syncCrmStage(
            tx,
            appointment.lead,
            null,
            ["ENVIAR_CONFIRMACAO"],
            `Template ${templateName} enviado pelo resgate automatico de ausentes`,
            true,
          );
        });
        results.push({
          lead_id: appointment.lead_id,
          lead_name: appointment.lead.name,
          status: "sent",
          provider_message_id: providerMessageId,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.dispatchTracking.upsert(appointment.client_id, {
          lead_id: appointment.lead_id,
          event_id: appointment.event_id,
          appointment_id: appointment.id,
          dispatch_key: dispatchKey,
          workflow_key: "daily-no-show-rescue",
          dispatch_type: "no_show_rescue",
          channel: "whatsapp",
          provider: "meta",
          template_name: templateName,
          status: "failed",
          occurred_at: new Date().toISOString(),
          failure_reason: reason,
          metadata: { target_date: dto.target_date },
        });
        results.push({
          lead_id: appointment.lead_id,
          lead_name: appointment.lead.name,
          status: "failed",
          reason,
        });
      }
    }

    return {
      target_date: dto.target_date,
      client_id: dto.client_id,
      event_id: dto.event_id ?? null,
      template_name: templateName,
      dry_run: dto.dry_run ?? false,
      eligible: candidates.length,
      sent: results.filter((result) => result.status === "sent").length,
      already_sent: results.filter((result) => result.status === "already_sent")
        .length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
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
      // A atribuição é telemetria posterior ao commit. Não deve aumentar o
      // tempo percebido pelo vendedor nem impedir a resposta já persistida.
      void this.dispatchTracking
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

    // O e-mail é um canal complementar. Ausência de endereço ou falha do
    // provedor nunca pode desfazer o agendamento nem interromper o workflow do
    // WhatsApp depois que a data já foi reconciliada com sucesso.
    let email: {
      sent: boolean;
      idempotent_replay: boolean;
      reason?: string;
      [key: string]: unknown;
    };
    if (!lead.email?.trim()) {
      email = {
        sent: false,
        idempotent_replay: false,
        reason: "Lead sem e-mail cadastrado",
      };
    } else {
      try {
        email = await this.sendEventCredentialEmailForAutomation(
          lead.id,
          dto.dispatch_key,
        );
      } catch (error) {
        email = {
          sent: false,
          idempotent_replay: false,
          reason:
            error instanceof Error
              ? error.message
              : "Falha desconhecida ao enviar e-mail",
        };
      }
    }

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

  async sendCheckinNotification(
    id: string,
    idempotencyKey?: string,
    options: CredentialDeliveryOptions = {},
  ) {
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

    if (!options.allowIncompleteCredential) {
      this.assertCredentialReady(appointment);
    }

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
        const conversationId =
          await this.resolveCredentialConversation(appointment);
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
        const message = await this.prisma.message.create({
          data: {
            conversation_id: conversationId,
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
          where: { id: conversationId },
          data: { last_message_at: message.created_at },
        });
        this.realtimeEvents.emitNewMessage(appointment.client_id, {
          conversation_id: conversationId,
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
            conversation_id: conversationId,
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

        return {
          sent: true,
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          event_id: appointment.event_id,
          conversation_id: conversationId,
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

  private async resolveCredentialConversation(appointment: {
    id: string;
    client_id: string;
    lead_id: string;
    conversation_id: string | null;
  }) {
    if (appointment.conversation_id) {
      return appointment.conversation_id;
    }

    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        client_id: appointment.client_id,
        lead_id: appointment.lead_id,
        channel: ConversationChannel.whatsapp,
      },
      select: { id: true },
      orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
    });
    const conversation =
      existingConversation ??
      (await this.prisma.conversation.create({
        data: {
          client_id: appointment.client_id,
          lead_id: appointment.lead_id,
          channel: ConversationChannel.whatsapp,
        },
        select: { id: true },
      }));

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { conversation_id: conversation.id },
    });

    return conversation.id;
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

    if (!result.idempotent_replay) {
      void this.sendCheckinNotification(
        result.id,
        `vendor-credential:${result.id}`,
        { allowIncompleteCredential: true },
      ).catch((error: unknown) => {
        this.logger.error(
          `Falha ao entregar credencial do agendamento ${result.id}: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`,
        );
      });
    }

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

  async rescheduleForManager(
    user: AuthenticatedUser,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
  ) {
    if (user.role !== Role.GESTOR) {
      throw new BadRequestException(
        "Apenas gestor pode reagendar visitas pelo painel",
      );
    }

    await this.getAppointmentOrFail(appointmentId);

    return this.reschedule(appointmentId, dto);
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

    const dispatchKey = `appointment-welcome-email:${appointment.id}`;
    try {
      const sent = await this.mail.sendAppointmentWelcome({
        to: lead.email,
        leadName: lead.name,
        eventName: event.name,
        eventLocation: event.location,
        scheduledAt: appointment.scheduled_at,
        timezone: appointment.timezone,
        vendorName: vendor?.name ?? null,
        vendorAvatarUrl: vendor?.avatar_url ?? null,
        clientName: client?.company_name ?? event.name,
        checkinToken: lead.checkin_token
          ? decryptCheckinToken(lead.checkin_token, this.checkinVoucherSecret())
          : lead.id,
      });
      await this.prisma.dispatchEvent.upsert({
        where: {
          client_id_dispatch_key: {
            client_id: appointment.client_id,
            dispatch_key: dispatchKey,
          },
        },
        create: {
          client_id: appointment.client_id,
          event_id: appointment.event_id,
          lead_id: appointment.lead_id,
          appointment_id: appointment.id,
          dispatch_key: dispatchKey,
          workflow_key: "appointment-welcome",
          dispatch_type: "appointment_scheduled_email",
          channel: "email",
          provider: "resend",
          provider_message_id: sent?.providerMessageId ?? null,
          status: "sent",
          sent_at: new Date(),
          metadata: { recipient: lead.email, subject: sent?.subject },
        },
        update: {
          provider_message_id: sent?.providerMessageId ?? null,
          status: "sent",
          sent_at: new Date(),
          failed_at: null,
          failure_reason: null,
          metadata: { recipient: lead.email, subject: sent?.subject },
        },
      });
    } catch (error) {
      await this.prisma.dispatchEvent.upsert({
        where: {
          client_id_dispatch_key: {
            client_id: appointment.client_id,
            dispatch_key: dispatchKey,
          },
        },
        create: {
          client_id: appointment.client_id,
          event_id: appointment.event_id,
          lead_id: appointment.lead_id,
          appointment_id: appointment.id,
          dispatch_key: dispatchKey,
          workflow_key: "appointment-welcome",
          dispatch_type: "appointment_scheduled_email",
          channel: "email",
          provider: "resend",
          status: "failed",
          failed_at: new Date(),
          failure_reason: (error as Error).message.slice(0, 2000),
          metadata: { recipient: lead.email },
        },
        update: {
          status: "failed",
          failed_at: new Date(),
          failure_reason: (error as Error).message.slice(0, 2000),
          metadata: { recipient: lead.email },
        },
      });
      throw error;
    }
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
        checkinToken: decryptCheckinToken(
          checkinToken,
          this.checkinVoucherSecret(),
        ),
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

    const scheduledAt = new Date(dto.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("Data de reagendamento invalida");
    }

    const eventDays = Array.isArray(appointment.event.event_days)
      ? appointment.event.event_days
      : [];
    const validEventDay = eventDays.some((day) => {
      if (!day || typeof day !== "object" || Array.isArray(day)) return false;
      const start = (day as Record<string, unknown>).start;
      if (typeof start !== "string") return false;
      const parsedStart = new Date(start);
      return (
        !Number.isNaN(parsedStart.getTime()) &&
        parsedStart.getTime() === scheduledAt.getTime()
      );
    });

    if (eventDays.length > 0 && !validEventDay) {
      throw new BadRequestException(
        "Data escolhida nao pertence aos dias cadastrados do evento",
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
          : targetStage.code.endsWith("_PRE_AGENDADO")
            ? ConfirmationStatus.pending
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
    const suffixes = ["PRE_AGENDADO", "PRESENCA_AGENDADA", "PRE_AGENDAMENTO"];

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
