import { Injectable } from "@nestjs/common";
import { normalizeBrazilianPhone, phoneDigits } from "../../common/phone.util";
import { PrismaService } from "../../config/prisma.service";

export type WhatsappContextResolution = Awaited<
  ReturnType<WhatsappContextResolverService["resolve"]>
>;

@Injectable()
export class WhatsappContextResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(args: {
    phoneNumberId: string;
    customerPhone: string;
    providerMessageId?: string;
  }) {
    const phoneNumberId = args.phoneNumberId.trim();
    const candidates = this.phoneCandidates(args.customerPhone);
    if (!phoneNumberId || candidates.length === 0) {
      return this.denied("invalid_input");
    }

    const assets = await this.prisma.metaAssetSelection.findMany({
      where: {
        phone_number_id: phoneNumberId,
        meta_connection: { status: "connected" },
      },
      select: {
        meta_connection_id: true,
        meta_connection: { select: { client_id: true } },
      },
    });
    const clientIds = [
      ...new Set(assets.map((asset) => asset.meta_connection.client_id)),
    ];
    if (clientIds.length === 0) {
      return this.denied("phone_number_not_mapped");
    }

    const dispatch = args.providerMessageId
      ? await this.findDispatch({
          clientIds,
          phoneCandidates: candidates,
          providerMessageId: args.providerMessageId.trim(),
        })
      : null;
    const selectedDispatch =
      dispatch ??
      (await this.findDispatch({
        clientIds,
        phoneCandidates: candidates,
      }));

    if (selectedDispatch) {
      return this.buildAuthorized(
        selectedDispatch.client_id,
        selectedDispatch.lead_id,
        selectedDispatch.event_id ?? selectedDispatch.lead.event_interest_id,
        selectedDispatch.conversation_id,
        selectedDispatch.id,
        dispatch ? "provider_message_context" : "latest_template_dispatch",
        phoneNumberId,
      );
    }

    // Compatibilidade para conversas antigas, anteriores ao rastreamento de
    // disparos. Só aceitamos quando existe exatamente um contexto possível.
    const legacyLeads = await this.prisma.lead.findMany({
      where: {
        client_id: { in: clientIds },
        phone: { in: candidates },
        event_interest_id: { not: null },
        deleted_at: null,
      },
      select: { id: true, client_id: true, event_interest_id: true },
      orderBy: { updated_at: "desc" },
      take: 3,
    });
    const uniqueContexts = new Map(
      legacyLeads.map((lead) => [
        `${lead.client_id}:${lead.event_interest_id}`,
        lead,
      ]),
    );
    if (uniqueContexts.size !== 1) {
      return this.denied(
        uniqueContexts.size > 1 ? "ambiguous_context" : "context_not_found",
      );
    }
    const legacyLead = [...uniqueContexts.values()][0];
    return this.buildAuthorized(
      legacyLead.client_id,
      legacyLead.id,
      legacyLead.event_interest_id,
      null,
      null,
      "single_existing_lead",
      phoneNumberId,
    );
  }

  private async findDispatch(args: {
    clientIds: string[];
    phoneCandidates: string[];
    providerMessageId?: string;
  }) {
    return this.prisma.dispatchEvent.findFirst({
      where: {
        client_id: { in: args.clientIds },
        channel: "whatsapp",
        status: { not: "failed" },
        ...(args.providerMessageId
          ? { provider_message_id: args.providerMessageId }
          : { sent_at: { not: null } }),
        lead: {
          phone: { in: args.phoneCandidates },
          deleted_at: null,
        },
      },
      select: {
        id: true,
        client_id: true,
        lead_id: true,
        event_id: true,
        conversation_id: true,
        lead: { select: { event_interest_id: true } },
      },
      orderBy: [{ sent_at: "desc" }, { created_at: "desc" }],
    });
  }

  private async buildAuthorized(
    clientId: string,
    leadId: string,
    eventId: string | null,
    conversationId: string | null,
    dispatchId: string | null,
    routingReason: string,
    phoneNumberId: string,
  ) {
    if (!eventId) return this.denied("event_not_found");

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, client_id: clientId, deleted_at: null },
      select: {
        id: true,
        client_id: true,
        name: true,
        first_name: true,
        last_name: true,
        phone: true,
        email: true,
        facebook_form_id: true,
        event_interest_id: true,
        crm_pipeline_id: true,
        crm_stage_id: true,
        preferred_contact_channel: true,
      },
    });
    if (!lead || lead.event_interest_id !== eventId) {
      return this.denied("lead_event_mismatch");
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: "active",
        OR: [
          { client_id: clientId },
          { participants: { some: { client_id: clientId } } },
        ],
      },
      select: {
        id: true,
        client_id: true,
        name: true,
        description: true,
        event_type: true,
        event_date: true,
        event_end_date: true,
        event_days: true,
        location: true,
        status: true,
      },
    });
    if (!event) return this.denied("event_not_active");

    const conversation = conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: conversationId,
            client_id: clientId,
            lead_id: leadId,
            channel: "whatsapp",
          },
          select: { id: true, last_message_at: true },
        })
      : await this.prisma.conversation.findFirst({
          where: { client_id: clientId, lead_id: leadId, channel: "whatsapp" },
          orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
          select: { id: true, last_message_at: true },
        });

    const [client, pipeline, stage] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, company_name: true },
      }),
      lead.crm_pipeline_id
        ? this.prisma.crmPipeline.findFirst({
            where: { id: lead.crm_pipeline_id, client_id: clientId },
            select: { id: true, code: true, name: true },
          })
        : null,
      lead.crm_stage_id
        ? this.prisma.crmStage.findFirst({
            where: {
              id: lead.crm_stage_id,
              client_id: clientId,
              ...(lead.crm_pipeline_id
                ? { pipeline_id: lead.crm_pipeline_id }
                : {}),
            },
            select: { id: true, code: true, name: true },
          })
        : null,
    ]);
    if (!client) return this.denied("client_not_found");

    return {
      authorized: true as const,
      routing_reason: routingReason,
      phone_number_id: phoneNumberId,
      dispatch_id: dispatchId,
      lead,
      client,
      event,
      conversation,
      pipeline,
      stage,
    };
  }

  private phoneCandidates(value: string) {
    const normalized = normalizeBrazilianPhone(value);
    const digits = phoneDigits(value);
    const values = new Set<string>([value.trim(), normalized]);
    if (digits) {
      values.add(digits);
      values.add(`+${digits}`);
      if (digits.length >= 11) values.add(`+55${digits.slice(-11)}`);
    }
    return [...values].filter(Boolean);
  }

  private denied(reason: string) {
    return { authorized: false as const, reason };
  }
}
