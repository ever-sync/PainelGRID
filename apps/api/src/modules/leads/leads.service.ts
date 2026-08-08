import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AppointmentStatus,
  ConfirmationStatus,
  Lead,
  LeadSource,
  Prisma,
} from "@prisma/client";
import { readSheet } from "read-excel-file/node";
import {
  looksLikeJwtCompact,
  signCheckinVoucher,
  verifyCheckinVoucher,
} from "../../common/checkin-voucher.util";
import {
  encryptCheckinToken,
  decryptCheckinToken,
  generateRawCheckinToken,
} from "../../common/utils/crypto.util";
import { normalizeBrazilianPhone, phoneDigits } from "../../common/phone.util";
import { generateQrPngBuffer } from "../../common/qrcode.util";
import { Role } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ClientsService } from "../clients/clients.service";
import { ClientWebhookService } from "../crm/client-webhook.service";
import { LeadTimelineService } from "../lead-timeline/lead-timeline.service";
import type { MetaLeadWhatsappTemplateParameterKey } from "../meta/dto/upsert-meta-lead-routing.dto";
import { MetaService } from "../meta/meta.service";
import { resolveConfirmationStatusForStage } from "../clients/client-settings";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { clientIdToStageCode } from "../crm/default-crm-pipeline";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ScoreEventsService } from "../score-events/score-events.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { FacebookLeadPayloadDto } from "./dto/facebook-lead-payload.dto";
import { CloseAttendanceDto } from "./dto/close-attendance.dto";
import { FindLeadsQueryDto } from "./dto/find-leads-query.dto";
import { ImportLeadsDto } from "./dto/import-leads.dto";
import { IntegrationPatchLeadDto } from "./dto/integration-patch-lead.dto";
import { ReconcileLeadsDto } from "./dto/reconcile-leads.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { RedisService } from "../../config/redis.service";
import {
  buildLeadPhoneCandidates,
  isLeadEmailUniqueViolation,
  isLeadExternalRefUniqueViolation,
  isLeadPhoneUniqueViolation,
} from "./lead-identity.util";

// Otimização: carregamos apenas o último appointment + somente os campos
// realmente consumidos por `toResponse` (evita transferir colunas grandes
// como `notes`, `metadata` e o registro inteiro de `sale`).
const leadSelect = {
  id: true,
  client_id: true,
  name: true,
  email: true,
  phone: true,
  source: true,
  tags: true,
  crm_pipeline_id: true,
  crm_stage_id: true,
  event_interest_id: true,
  confirmation_status: true,
  confirmation_date: true,
  store_visit_datetime: true,
  team_id: true,
  assigned_vendor_id: true,
  registered_by_id: true,
  attendant_type: true,
  attendant_user_id: true,
  sold_by_vendor_id: true,
  campaign_id: true,
  notes: true,
  vehicle_plate: true,
  vehicle_brand: true,
  vehicle_model: true,
  vehicle_year: true,
  vehicle_fipe_value: true,
  companions: true,
  description: true,
  first_name: true,
  last_name: true,
  birth_date: true,
  facebook_lead_id: true,
  facebook_form_id: true,
  facebook_ad_id: true,
  facebook_ad_name: true,
  facebook_ad_set_id: true,
  facebook_ad_set_name: true,
  facebook_campaign_id: true,
  facebook_campaign_name: true,
  preferred_contact_channel: true,
  source_created_at: true,
  source_payload: true,
  external_ref: true,
  deleted_at: true,
  checkin_token: true,
  cpf: true,
  wristband_number: true,
  created_at: true,
  updated_at: true,
  crm_stage: { select: { id: true, code: true, name: true } },
  crm_pipeline: { select: { id: true, code: true } },
  event_interest: { select: { id: true, name: true } },
  registered_by: { select: { name: true } },
  conversation_states: {
    select: {
      handoff_required: true,
    },
  },
  conversations: {
    select: {
      id: true,
    },
    take: 1,
    orderBy: { last_message_at: "desc" },
  },
  appointments: {
    orderBy: { scheduled_at: "desc" },
    take: 1,
    select: {
      id: true,
      event_id: true,
      scheduled_at: true,
      status: true,
      created_by_type: true,
      created_by_id: true,
      completed_at: true,
      sale: { select: { id: true, vendor_id: true } },
    },
  },
} as const satisfies Prisma.LeadSelect;

type LeadWithRelations = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

type FacebookLeadMetadata = {
  externalRef: string;
  facebookLeadId: string;
  facebookFormId: string | null;
  facebookAdId: string | null;
  facebookAdName: string | null;
  facebookAdSetId: string | null;
  facebookAdSetName: string | null;
  facebookCampaignId: string | null;
  facebookCampaignName: string | null;
  facebookCreativeId: string | null;
  preferredContactChannel: string | null;
  sourceCreatedAt: Date | null;
  sourcePayload: Prisma.InputJsonValue;
};

type AutomaticFacebookRouting = {
  formId: string;
  formName: string;
  metaConnectionId: string;
  clientId: string;
  eventId: string;
  eventName: string;
  eventDate: Date;
  eventLocation: string | null;
  clientName: string;
  pipelineId: string;
  pipelineCode: string;
  callStage: { id: string; code: string; name: string };
  whatsappStage: { id: string; code: string; name: string };
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappTemplateParameterKeys: MetaLeadWhatsappTemplateParameterKey[];
  clientSettings: unknown;
};

type AutomaticFacebookPreparedLead = {
  payload: FacebookLeadPayloadDto;
  routing: AutomaticFacebookRouting;
  channel: "ligacao" | "whatsapp";
  targetStage: { id: string; code: string; name: string };
  mappedStatus: ConfirmationStatus | null;
  metadata: FacebookLeadMetadata;
};

type AutomaticFacebookTransactionItem = {
  lead: LeadWithRelations;
  alreadyExisted: boolean;
  stageMoved: boolean;
  fromStageId: string | null;
  fromStageCode: string | null;
  shouldDispatchWhatsapp: boolean;
  prepared: AutomaticFacebookPreparedLead;
};

type AutomaticWhatsappDispatchResult = {
  status: "not_requested" | "skipped" | "sent" | "failed";
  reason?:
    | "channel_ligacao"
    | "duplicate_delivery"
    | "phone_missing"
    | "template_not_configured"
    | "provider_error";
  template_name?: string;
  template_language?: string;
  message_id?: string | null;
  chat_recorded?: boolean;
};

const AUTOMATIC_WHATSAPP_TEMPLATE_PARAMETER_KEYS = new Set<string>([
  "lead_name",
  "event_name",
  "company_name",
  "event_date",
  "event_location",
]);

const CHECKIN_VOUCHER_TTL_SEC = 90 * 24 * 60 * 60;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_COLUMNS = 100;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly config: ConfigService,
    private readonly scoreEvents: ScoreEventsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly clientWebhook: ClientWebhookService,
    private readonly metaService: MetaService,
    private readonly leadTimeline: LeadTimelineService,
    private readonly redis: RedisService,
    private readonly dispatchTracking: DispatchTrackingService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  private checkinVoucherSecret(): string {
    const dedicated = this.config
      .get<string>("LEADFLOW_CHECKIN_VOUCHER_SECRET")
      ?.trim();
    if (dedicated) {
      return dedicated;
    }
    return this.config.get<string>("JWT_SECRET", "leadflow_access_secret");
  }

  private async findLeadByEmail(
    clientId: string,
    email?: string | null,
    excludeLeadId?: string,
  ) {
    const normalized = email?.toLowerCase().trim();
    if (!normalized) {
      return null;
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        client_id: clientId,
        email: normalized,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      },
      select: leadSelect,
    });

    return lead as LeadWithRelations | null;
  }

  private async findLeadByPhone(
    clientId: string,
    phone?: string | null,
    excludeLeadId?: string,
    eventId?: string,
  ) {
    const candidateSet = buildLeadPhoneCandidates(phone);
    if (!candidateSet) {
      return null;
    }
    const eventScope: Prisma.LeadWhereInput = {
      OR: [
        { event_interest_id: eventId },
        { appointments: { some: { event_id: eventId } } },
      ],
    };
    const exactPhoneScope: Prisma.LeadWhereInput = {
      OR: candidateSet.candidates.map((candidate) => ({ phone: candidate })),
    };

    const exact = await this.prisma.lead.findFirst({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        ...(eventId ? { AND: [eventScope, exactPhoneScope] } : exactPhoneScope),
      },
      select: leadSelect,
    });
    if (exact) {
      return exact as LeadWithRelations;
    }

    if (!candidateSet.digits) {
      return null;
    }

    const suffixCandidates = new Set<string>();
    if (candidateSet.digits.length >= 10) {
      suffixCandidates.add(candidateSet.digits.slice(-10));
    }
    if (candidateSet.digits.length >= 11) {
      suffixCandidates.add(candidateSet.digits.slice(-11));
    }
    if (candidateSet.digits.length >= 12) {
      suffixCandidates.add(candidateSet.digits.slice(-12));
    }

    if (suffixCandidates.size > 0) {
      const suffixPhoneScope: Prisma.LeadWhereInput = {
        OR: Array.from(suffixCandidates).map((suffix) => ({
          phone: { endsWith: suffix },
        })),
      };
      const bySuffix = await this.prisma.lead.findFirst({
        where: {
          client_id: clientId,
          deleted_at: null,
          ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
          ...(eventId
            ? { AND: [eventScope, suffixPhoneScope] }
            : suffixPhoneScope),
        },
        select: leadSelect,
      });
      if (bySuffix) {
        return bySuffix as LeadWithRelations;
      }
    }

    const normalizedDigitsMatch = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT l.id
      FROM leads l
      WHERE l.client_id = ${clientId}::uuid
        AND l.deleted_at IS NULL
        AND l.phone IS NOT NULL
        ${excludeLeadId ? Prisma.sql`AND l.id <> ${excludeLeadId}::uuid` : Prisma.empty}
        ${
          eventId
            ? Prisma.sql`
                AND (
                  l.event_interest_id = ${eventId}::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM appointments a
                    WHERE a.lead_id = l.id
                      AND a.event_id = ${eventId}::uuid
                  )
                )
              `
            : Prisma.empty
        }
        AND (
          CASE
            WHEN LEFT(REGEXP_REPLACE(l.phone, '\D', '', 'g'), 2) = '55'
             AND LENGTH(REGEXP_REPLACE(l.phone, '\D', '', 'g')) IN (12, 13)
            THEN SUBSTRING(REGEXP_REPLACE(l.phone, '\D', '', 'g') FROM 3)
            ELSE REGEXP_REPLACE(l.phone, '\D', '', 'g')
          END
        ) = ${candidateSet.digits}
      ORDER BY l.updated_at DESC
      LIMIT 1
    `;

    const matchedId = normalizedDigitsMatch[0]?.id;
    if (!matchedId) {
      return null;
    }

    const fullLead = await this.prisma.lead.findFirst({
      where: { id: matchedId, deleted_at: null },
      select: leadSelect,
    });

    return fullLead as LeadWithRelations | null;
  }

  async findAll(user: AuthenticatedUser, query: FindLeadsQueryDto) {
    const where = await this.buildListWhere(user, query);
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);

    let cursorRow: { id: string; created_at: Date } | null = null;
    if (query.cursor) {
      cursorRow = await this.prisma.lead.findFirst({
        where: {
          ...where,
          id: query.cursor,
        },
        select: { id: true, created_at: true },
      });
      if (!cursorRow) {
        throw new NotFoundException("Cursor de paginacao invalido");
      }
    }

    const rows = await this.prisma.lead.findMany({
      where: cursorRow
        ? {
            ...where,
            OR: [
              { created_at: { lt: cursorRow.created_at } },
              { created_at: cursorRow.created_at, id: { lt: cursorRow.id } },
            ],
          }
        : where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: leadSelect,
      take: take + 1,
    });

    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

    const stageSince = await this.stageSinceByLead(page);

    return {
      items: page.map((row) => ({
        ...this.toResponse(row),
        crm_stage_since: (
          stageSince.get(row.id) ?? row.created_at
        ).toISOString(),
      })),
      page_info: {
        take,
        next_cursor: nextCursor,
        has_next_page: hasNextPage,
      },
    };
  }

  /**
   * Quando cada lead entrou na etapa em que esta hoje, para o painel mostrar
   * "parado ha X dias". Uma unica query por pagina: agrupa o historico por
   * (lead, etapa de destino) e pega a entrada mais recente na etapa atual.
   * Lead sem historic da etapa atual cai no `created_at` de quem chama.
   */
  private async stageSinceByLead(
    leads: Array<{ id: string; crm_stage_id: string | null }>,
  ) {
    const stageByLeadId = new Map<string, string>();
    for (const lead of leads) {
      if (lead.crm_stage_id) stageByLeadId.set(lead.id, lead.crm_stage_id);
    }
    const result = new Map<string, Date>();
    if (stageByLeadId.size === 0) return result;

    const groups = await this.prisma.crmHistory.groupBy({
      by: ["lead_id", "to_stage_id"],
      where: { lead_id: { in: Array.from(stageByLeadId.keys()) } },
      _max: { created_at: true },
    });

    for (const group of groups) {
      if (stageByLeadId.get(group.lead_id) !== group.to_stage_id) continue;
      const enteredAt = group._max.created_at;
      if (enteredAt) result.set(group.lead_id, enteredAt);
    }

    return result;
  }

  async exportCsv(user: AuthenticatedUser, query: FindLeadsQueryDto) {
    const where = await this.buildListWhere(user, query);
    const rows = await this.prisma.lead.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: leadSelect,
      take: 5_000,
    });

    const header = [
      "id",
      "client_id",
      "name",
      "email",
      "phone",
      "source",
      "crm_stage_code",
      "confirmation_status",
      "tags",
      "event_interest_name",
      "notes",
      "created_at",
    ];

    const lines = rows.map((row) =>
      [
        row.id,
        row.client_id,
        row.name,
        row.email ?? "",
        row.phone ?? "",
        row.source,
        row.crm_stage?.code ?? "",
        row.confirmation_status,
        (row.tags ?? []).join("|"),
        row.event_interest?.name ?? "",
        row.notes ?? "",
        row.created_at.toISOString(),
      ]
        .map((value) => this.escapeCsv(value))
        .join(","),
    );

    return [header.join(","), ...lines].join("\n");
  }

  async importCsv(
    user: AuthenticatedUser,
    dto: ImportLeadsDto,
    file:
      { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Arquivo CSV ou XLSX obrigatorio.");
    }

    const targetClientId = await this.resolveImportClientId(
      user,
      dto.client_id,
    );
    const rows = await this.parseImportRows(file);
    if (rows.length === 0) {
      throw new BadRequestException("Arquivo vazio.");
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const indexes = {
      name: header.indexOf("name"),
      email: header.indexOf("email"),
      phone: header.indexOf("phone"),
      source: header.indexOf("source"),
      tags: header.indexOf("tags"),
      notes: header.indexOf("notes"),
    };

    if (indexes.name < 0) {
      throw new BadRequestException('CSV precisa conter a coluna "name".');
    }

    let skipped = 0;
    const errors: string[] = [];

    type ImportRow = {
      data: {
        client_id: string;
        name: string;
        email: string | null;
        phone: string | null;
        source: Lead["source"];
        tags: string[];
        notes: string | null;
      };
      line: number;
    };

    const validRows: ImportRow[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const line = i + 1;
      const name = (row[indexes.name] ?? "").trim();
      if (!name) {
        skipped += 1;
        continue;
      }

      const sourceRaw = (row[indexes.source] ?? "manual").trim();
      const source = this.normalizeSource(sourceRaw);
      if (!source) {
        skipped += 1;
        errors.push(`linha ${line}: source invalido (${sourceRaw})`);
        continue;
      }

      const email = (row[indexes.email] ?? "").trim().toLowerCase() || null;
      const phone =
        normalizeBrazilianPhone((row[indexes.phone] ?? "").trim()) || null;
      const notes = (row[indexes.notes] ?? "").trim() || null;
      const tags = (row[indexes.tags] ?? "")
        .split("|")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20);

      validRows.push({
        data: {
          client_id: targetClientId,
          name,
          email,
          phone,
          source,
          tags,
          notes,
        },
        line,
      });
    }

    // Bulk phone dedup: uma query para todos os telefones de uma vez
    const phonesToCheck = validRows
      .map((r) => r.data.phone)
      .filter((p): p is string => !!p);
    const existingPhones = new Set<string>();
    if (phonesToCheck.length > 0) {
      const existing = await this.prisma.lead.findMany({
        where: {
          client_id: targetClientId,
          deleted_at: null,
          phone: { in: phonesToCheck },
        },
        select: { phone: true },
      });
      for (const l of existing) {
        if (l.phone) existingPhones.add(l.phone);
      }
    }

    const toCreate = validRows.filter(({ data, line }) => {
      if (data.phone && existingPhones.has(data.phone)) {
        skipped += 1;
        errors.push(`linha ${line}: telefone ja cadastrado (${data.phone})`);
        return false;
      }
      return true;
    });

    let created = 0;
    if (toCreate.length > 0) {
      const result = await this.prisma.lead.createMany({
        data: toCreate.map((r) => r.data),
        skipDuplicates: true,
      });
      created = result.count;
      skipped += toCreate.length - result.count;
    }

    if (created > 0) {
      this.realtimeEvents.emitLeadUpdated(targetClientId, {
        client_id: targetClientId,
        action: "created",
        source: "import",
        imported: created,
        updated_at: new Date().toISOString(),
      });
    }

    return {
      imported: created,
      skipped,
      errors: errors.slice(0, 30),
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    await this.assertLeadAccess(user, lead);
    return this.toResponse(lead);
  }

  async checkPhone(
    user: AuthenticatedUser,
    phone: string,
    requestedClientId?: string,
    eventId?: string,
  ) {
    const normalized = normalizeBrazilianPhone(phone.trim());
    let clientId: string | null = null;
    if (user.role === Role.GESTOR) {
      if (!requestedClientId) {
        throw new BadRequestException(
          "Gestor deve informar client_id para validar telefone",
        );
      }
      await this.clientsService.assertGestorOwnsClient(
        user.sub,
        requestedClientId,
      );
      clientId = requestedClientId;
    } else {
      clientId = user.client_id ?? null;
      if (!clientId) {
        throw new BadRequestException(
          "Telefone deve ser validado em um cliente específico",
        );
      }
      if (requestedClientId && requestedClientId !== clientId) {
        throw new ForbiddenException("client_id invalido");
      }
    }

    if (eventId) {
      await this.assertEventExistsForClient(clientId, eventId);
    }

    const existing = await this.findLeadByPhone(
      clientId,
      normalized,
      undefined,
      eventId,
    );
    if (!existing) {
      return { exists: false };
    }

    const owner = existing.assigned_vendor_id
      ? await this.prisma.user.findFirst({
          where: {
            id: existing.assigned_vendor_id,
            client_id: existing.client_id,
            role: Role.VENDEDOR,
          },
          select: { id: true, name: true },
        })
      : null;

    return {
      exists: true,
      lead: {
        id: existing.id,
        name: existing.name,
        assigned_vendor_id: existing.assigned_vendor_id,
        assigned_vendor_name: owner?.name ?? null,
      },
    };
  }

  async create(user: AuthenticatedUser, dto: CreateLeadDto) {
    const assignedVendorId = user.role === Role.VENDEDOR ? user.sub : undefined;
    const vendorBinding = assignedVendorId
      ? await this.resolveVendorBinding(assignedVendorId, dto.event_interest_id)
      : null;
    const targetClientId = vendorBinding?.clientId ?? dto.client_id;

    await this.assertCanWriteClient(user, targetClientId);
    const normalizedPhone = dto.phone?.trim()
      ? normalizeBrazilianPhone(dto.phone.trim())
      : null;

    if (normalizedPhone) {
      const existingByPhone = await this.findLeadByPhone(
        targetClientId,
        normalizedPhone,
        undefined,
        dto.event_interest_id,
      );
      if (existingByPhone) {
        throw new BadRequestException(
          dto.event_interest_id
            ? "Telefone ja cadastrado neste evento"
            : "Telefone ja cadastrado para este cliente",
        );
      }
    }

    if (dto.email) {
      const emailNorm = dto.email.toLowerCase().trim();
      const existingByEmail = await this.prisma.lead.findFirst({
        where: {
          client_id: targetClientId,
          email: emailNorm,
          deleted_at: null,
        },
      });
      if (existingByEmail) {
        throw new BadRequestException("E-mail ja cadastrado para este cliente");
      }
    }

    let defaultStageId = dto.crm_stage_id;
    let defaultPipelineId = dto.crm_pipeline_id;
    if (assignedVendorId && !defaultStageId && !defaultPipelineId) {
      const presencaAgendada = await this.prisma.crmStage.findFirst({
        where: {
          client_id: targetClientId,
          code: clientIdToStageCode(targetClientId, "PRESENCA_AGENDADA"),
        },
        select: { id: true, pipeline_id: true },
      });
      if (presencaAgendada) {
        defaultStageId = presencaAgendada.id;
        defaultPipelineId = presencaAgendada.pipeline_id;
      }
    }

    this.assertPipelineStageConsistency(defaultPipelineId, defaultStageId);

    if (defaultStageId) {
      await this.assertCrmStageExistsForClient(targetClientId, defaultStageId);
    }
    if (dto.event_interest_id) {
      await this.assertEventExistsForClient(
        targetClientId,
        dto.event_interest_id,
      );
    }

    const resolvedStatus = await this.resolveStatusForStageAssignment(
      targetClientId,
      defaultStageId,
      dto.confirmation_status,
    );
    const confirmationStatus =
      resolvedStatus ??
      (assignedVendorId
        ? ConfirmationStatus.scheduled
        : ConfirmationStatus.pending);

    let lead: LeadWithRelations;
    try {
      lead = (await this.prisma.lead.create({
        data: {
          client_id: targetClientId,
          name: dto.name.trim(),
          email: dto.email?.toLowerCase().trim() ?? null,
          phone: normalizedPhone,
          source: dto.source,
          tags: dto.tags ?? [],
          event_interest_id: dto.event_interest_id ?? null,
          crm_pipeline_id: defaultPipelineId ?? null,
          crm_stage_id: defaultStageId ?? null,
          confirmation_status: confirmationStatus,
          assigned_vendor_id: assignedVendorId,
          registered_by_id: assignedVendorId ?? null,
          team_id: vendorBinding?.teamId ?? null,
          notes: dto.notes?.trim() ?? null,
          birth_date: dto.birth_date ? new Date(dto.birth_date) : null,
        },
        select: leadSelect,
      })) as LeadWithRelations;
    } catch (error) {
      if (isLeadPhoneUniqueViolation(error)) {
        throw new BadRequestException(
          dto.event_interest_id
            ? "Telefone ja cadastrado neste evento"
            : "Telefone ja cadastrado para este cliente",
        );
      }
      throw error;
    }

    const response = this.toResponse(lead);

    void this.clientWebhook.dispatch(lead.client_id, "lead.created", {
      lead_id: lead.id,
      client_id: lead.client_id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      crm_pipeline_id: lead.crm_pipeline_id,
      crm_stage_id: lead.crm_stage_id,
      assigned_vendor_id: lead.assigned_vendor_id,
      created_at: lead.created_at.toISOString(),
    });
    this.realtimeEvents.emitLeadUpdated(lead.client_id, {
      client_id: lead.client_id,
      lead_id: lead.id,
      action: "created",
      updated_at: lead.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: lead.client_id,
      leadId: lead.id,
      eventType: "created",
      origin: "crm",
      actorId: user.sub,
      actorLabel: user.name ?? null,
    });

    return response;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    await this.assertLeadAccess(user, lead);
    const targetClientId =
      user.role !== Role.VENDEDOR && user.role !== Role.RECEPCAO
        ? await this.resolveLeadTargetClientId(lead, dto)
        : lead.client_id;
    const nextPhone = dto.phone !== undefined ? dto.phone?.trim() : undefined;
    if (nextPhone) {
      const normalizedPhone = normalizeBrazilianPhone(nextPhone);
      const existingByPhone = await this.findLeadByPhone(
        targetClientId,
        normalizedPhone,
        lead.id,
      );
      if (existingByPhone) {
        throw new BadRequestException(
          "Telefone ja cadastrado para este cliente",
        );
      }
    }

    const nextStageId = dto.crm_stage_id;
    if (
      user.role === Role.VENDEDOR &&
      nextStageId != null &&
      nextStageId !== lead.crm_stage_id
    ) {
      if (!lead.crm_pipeline_id) {
        throw new BadRequestException(
          "Lead sem pipeline CRM para trocar etapa",
        );
      }

      const targetStage = await this.prisma.crmStage.findFirst({
        where: {
          id: nextStageId,
          client_id: lead.client_id,
          pipeline_id: lead.crm_pipeline_id,
        },
      });

      if (!targetStage) {
        throw new BadRequestException("Etapa invalida para este lead");
      }

      this.assertVendedorPatch(dto);
      const data = this.buildUpdateData(user, dto);
      const client = await this.prisma.client.findUnique({
        where: { id: lead.client_id },
        select: { settings: true },
      });
      const mappedStatus = resolveConfirmationStatusForStage(
        client?.settings,
        targetStage.id,
      );
      if (mappedStatus) {
        data.confirmation_status = mappedStatus;
      }
      const nextStatus =
        (data.confirmation_status as ConfirmationStatus | undefined) ??
        lead.confirmation_status;
      const confirming = this.isConfirmingTransitionToStatus(lead, nextStatus);
      this.mergeCheckinTokenIfConfirmingStatus(lead, nextStatus, data);
      const historyNotes =
        mappedStatus != null
          ? dto.notes?.trim()
            ? `${dto.notes.trim()}\nStatus automático atualizado pela etapa do CRM`
            : "Status automático atualizado pela etapa do CRM"
          : dto.notes?.trim() || null;

      const { response, updated } = await this.prisma.$transaction(
        async (tx) => {
          const updatedRow = (await tx.lead.update({
            where: { id },
            data,
            select: leadSelect,
          })) as LeadWithRelations;

          await tx.crmHistory.create({
            data: {
              lead_id: lead.id,
              from_stage_id: lead.crm_stage_id,
              to_stage_id: targetStage.id,
              changed_by_user_id: user.sub,
              notes: historyNotes,
            },
          });

          return { response: this.toResponse(updatedRow), updated: updatedRow };
        },
      );

      if (
        updated.vehicle_plate &&
        updated.vehicle_plate !== lead.vehicle_plate
      ) {
        void this.triggerFipeLookup(
          updated.id,
          updated.vehicle_plate,
          updated.notes,
        );
      }

      void this.clientWebhook.dispatch(updated.client_id, "lead.updated", {
        lead_id: lead.id,
        client_id: updated.client_id,
        updated_fields: Object.keys(dto),
        updated_at: new Date().toISOString(),
      });
      this.realtimeEvents.emitLeadUpdated(updated.client_id, {
        client_id: updated.client_id,
        lead_id: lead.id,
        action: "updated",
        updated_at: new Date().toISOString(),
      });

      this.notifyCredentialEmailWhenScheduled(
        lead.confirmation_status,
        updated,
      );

      if (confirming) {
        void this.notifyCheckinViaWhatsapp(updated);
      }

      return response;
    }

    const data = this.buildUpdateData(user, dto);
    if (user.role !== Role.VENDEDOR && user.role !== Role.RECEPCAO) {
      await this.syncLeadVendorBinding(lead, dto, data);
    }
    const stageWasChanged =
      nextStageId != null && nextStageId !== lead.crm_stage_id;
    let stageChangedWithAutoStatus = false;
    let targetStage: {
      id: string;
      client_id: string;
      pipeline_id: string;
    } | null = null;

    if (stageWasChanged) {
      targetStage = await this.prisma.crmStage.findFirst({
        where: {
          id: nextStageId,
          client_id: targetClientId,
          ...(dto.crm_pipeline_id || lead.crm_pipeline_id
            ? {
                pipeline_id:
                  dto.crm_pipeline_id ?? lead.crm_pipeline_id ?? undefined,
              }
            : {}),
        },
        select: { id: true, client_id: true, pipeline_id: true },
      });

      if (!targetStage) {
        throw new BadRequestException("Etapa invalida para este lead");
      }

      const client = await this.prisma.client.findUnique({
        where: { id: targetClientId },
        select: { settings: true },
      });
      const mappedStatus = resolveConfirmationStatusForStage(
        client?.settings,
        targetStage.id,
      );
      if (mappedStatus) {
        data.confirmation_status = mappedStatus;
        stageChangedWithAutoStatus = true;
      }
    }

    const nextStatus =
      (data.confirmation_status as ConfirmationStatus | undefined) ??
      lead.confirmation_status;
    const confirming = this.isConfirmingTransitionToStatus(lead, nextStatus);
    this.mergeCheckinTokenIfConfirmingStatus(lead, nextStatus, data);

    const updated =
      stageWasChanged && targetStage
        ? ((await this.prisma.$transaction(async (tx) => {
            const updatedRow = (await tx.lead.update({
              where: { id },
              data,
              select: leadSelect,
            })) as LeadWithRelations;

            await tx.crmHistory.create({
              data: {
                lead_id: lead.id,
                from_stage_id: lead.crm_stage_id,
                to_stage_id: targetStage.id,
                changed_by_user_id: user.sub,
                notes: stageChangedWithAutoStatus
                  ? dto.notes?.trim()
                    ? `${dto.notes.trim()}\nStatus automático atualizado pela etapa do CRM`
                    : "Status automático atualizado pela etapa do CRM"
                  : dto.notes?.trim() || null,
              },
            });

            return updatedRow;
          })) as LeadWithRelations)
        : ((await this.prisma.lead.update({
            where: { id },
            data,
            select: leadSelect,
          })) as LeadWithRelations);

    if (updated.vehicle_plate && updated.vehicle_plate !== lead.vehicle_plate) {
      void this.triggerFipeLookup(
        updated.id,
        updated.vehicle_plate,
        updated.notes,
      );
    }

    const response = this.toResponse(updated);

    void this.clientWebhook.dispatch(updated.client_id, "lead.updated", {
      lead_id: lead.id,
      client_id: updated.client_id,
      updated_fields: Object.keys(dto),
      updated_at: new Date().toISOString(),
    });
    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: lead.id,
      action: "updated",
      updated_at: new Date().toISOString(),
    });
    if (lead.confirmation_status !== updated.confirmation_status) {
      void this.leadTimeline.record({
        clientId: updated.client_id,
        leadId: lead.id,
        eventType: "status_changed",
        origin: "crm",
        fromValue: lead.confirmation_status,
        toValue: updated.confirmation_status,
        actorId: user.sub,
        actorLabel: user.name ?? null,
      });
    }
    if (lead.assigned_vendor_id !== updated.assigned_vendor_id) {
      void this.leadTimeline.record({
        clientId: updated.client_id,
        leadId: lead.id,
        eventType: updated.assigned_vendor_id ? "assigned" : "unassigned",
        origin: "crm",
        fromValue: lead.assigned_vendor_id,
        toValue: updated.assigned_vendor_id,
        actorId: user.sub,
        actorLabel: user.name ?? null,
      });
    }

    this.notifyCredentialEmailWhenScheduled(lead.confirmation_status, updated);

    if (confirming) {
      void this.notifyCheckinViaWhatsapp(updated);
    }

    return response;
  }

  async assignToMe(user: AuthenticatedUser, id: string) {
    if (user.role !== Role.VENDEDOR || !user.client_id) {
      throw new ForbiddenException("Apenas vendedor pode assumir lead");
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        client_id: user.client_id,
        deleted_at: null,
      },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    if (lead.assigned_vendor_id === user.sub) {
      return this.toResponse(lead as LeadWithRelations);
    }

    if (lead.assigned_vendor_id) {
      const owner = await this.prisma.user.findFirst({
        where: {
          id: lead.assigned_vendor_id,
          client_id: user.client_id,
          role: Role.VENDEDOR,
        },
        select: { name: true },
      });
      throw new BadRequestException(
        owner?.name
          ? `Lead ja atribuido ao vendedor ${owner.name}`
          : "Lead ja atribuido a outro vendedor",
      );
    }

    const vendorBinding = await this.resolveVendorBinding(
      user.sub,
      lead.event_interest_id,
    );

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        assigned_vendor_id: user.sub,
        team_id: vendorBinding.teamId,
      },
      select: leadSelect,
    });

    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: updated.id,
      action: "assigned_to_vendor",
      updated_at: updated.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: updated.client_id,
      leadId: updated.id,
      eventType: "assigned",
      origin: "vendor",
      fromValue: lead.assigned_vendor_id,
      toValue: user.sub,
      actorId: user.sub,
      actorLabel: user.name ?? null,
    });

    return this.toResponse(updated as LeadWithRelations);
  }

  async lookupByCpfOrPhone(user: AuthenticatedUser, queryStr: string) {
    if (!queryStr || queryStr.trim().length < 3) return [];
    const cleanDigits = queryStr.replace(/\D/g, "");
    const term = queryStr.trim();

    const where: Prisma.LeadWhereInput = {
      deleted_at: null,
      OR: [
        { cpf: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
        ...(cleanDigits.length >= 3
          ? [
              { cpf: { contains: cleanDigits } },
              { phone: { contains: cleanDigits } },
            ]
          : []),
      ],
    };

    if (user.role === Role.VENDEDOR) {
      if (user.client_id) where.client_id = user.client_id;
    } else if (user.client_id) {
      where.client_id = user.client_id;
    }

    const rows = await this.prisma.lead.findMany({
      where,
      take: 10,
      select: leadSelect,
      orderBy: { updated_at: "desc" },
    });

    return rows.map((row) => this.toResponse(row as LeadWithRelations));
  }

  async closeAttendance(
    user: AuthenticatedUser,
    id: string,
    dto: CloseAttendanceDto,
  ) {
    const isVendor = user.role === Role.VENDEDOR;
    const wristbandNumber = dto?.wristband_number?.trim();
    const cpf = dto?.cpf?.trim();
    const phone = dto?.phone?.trim();

    if (!isVendor && !cpf) {
      throw new BadRequestException("CPF é obrigatório.");
    }

    const where: Prisma.LeadWhereInput = {
      id,
      deleted_at: null,
    };
    if (user.role === Role.VENDEDOR) {
      if (user.client_id) where.client_id = user.client_id;
      where.assigned_vendor_id = user.sub;
    } else if (user.client_id) {
      where.client_id = user.client_id;
    }

    const lead = await this.prisma.lead.findFirst({
      where,
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado ou sem permissao");
    }

    let requiresWristband = false;
    if (lead.event_interest_id) {
      const evt = await this.prisma.event.findUnique({
        where: { id: lead.event_interest_id },
        select: { require_wristband: true },
      });
      if (evt?.require_wristband) {
        requiresWristband = true;
      }
    }

    if (!isVendor && requiresWristband && !wristbandNumber) {
      throw new BadRequestException(
        "Número da pulseira é obrigatório para este evento.",
      );
    }

    let pipelineId = lead.crm_pipeline_id;
    if (!pipelineId) {
      const activePipeline = await this.prisma.crmPipeline.findFirst({
        where: { client_id: lead.client_id },
        select: { id: true },
      });
      pipelineId = activePipeline?.id ?? null;
    }

    let targetStageId = lead.crm_stage_id;
    if (pipelineId) {
      const idBase = lead.client_id
        .replace(/-/g, "")
        .toUpperCase()
        .slice(0, 16);
      const preferredCode = dto.sold
        ? `${idBase}_COMPRARAM`
        : `${idBase}_ATENDIMENTO_ENCERRADO`;
      const fallbackCodes = dto.sold
        ? [`${idBase}_VENDIDO`, `${idBase}_CONVERTIDO`]
        : [`${idBase}_ATENDIMENTO_FINALIZADO`, `${idBase}_ENCERRADO`];
      const preferredStage = await this.prisma.crmStage.findFirst({
        where: {
          client_id: lead.client_id,
          pipeline_id: pipelineId,
          code: preferredCode,
        },
        select: { id: true },
      });
      const stage =
        preferredStage ??
        (await this.prisma.crmStage.findFirst({
          where: {
            client_id: lead.client_id,
            pipeline_id: pipelineId,
            code: { in: fallbackCodes },
          },
          select: { id: true },
        }));
      if (stage) {
        targetStageId = stage.id;
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        confirmation_status: ConfirmationStatus.closed,
        crm_pipeline_id: pipelineId,
        crm_stage_id: targetStageId,
        ...(wristbandNumber ? { wristband_number: wristbandNumber } : {}),
        ...(cpf ? { cpf } : {}),
        ...(phone ? { phone } : {}),
        ...(dto.sold ? { sold_by_vendor_id: user.sub } : {}),
      },
      select: leadSelect,
    });

    if (targetStageId && targetStageId !== lead.crm_stage_id) {
      await this.prisma.crmHistory.create({
        data: {
          lead_id: lead.id,
          from_stage_id: lead.crm_stage_id,
          to_stage_id: targetStageId,
          changed_by_user_id: user.sub,
          notes: `${
            dto.sold
              ? "Atendimento encerrado com venda"
              : "Atendimento encerrado sem venda"
          }${wristbandNumber ? `. Pulseira: ${wristbandNumber}` : ""}${cpf ? `, CPF: ${cpf}` : ""}${
            dto.attendance_duration_seconds != null
              ? `. Duração do atendimento: ${Math.floor(dto.attendance_duration_seconds / 60)}m ${dto.attendance_duration_seconds % 60}s (${dto.attendance_duration_seconds}s)`
              : ""
          }`,
        },
      });
    }

    if (dto.sold) {
      const targetVendorId = lead.assigned_vendor_id || user.sub;
      await this.scoreEvents
        .award({
          client_id: lead.client_id,
          vendor_id: targetVendorId,
          lead_id: lead.id,
          kind: "sold",
          earned_at: new Date(),
        })
        .catch((err) => {
          this.logger.warn(
            `Erro ao pontuar venda para o vendedor: ${(err as Error).message}`,
          );
        });
    }

    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: updated.id,
      action: "attendance_closed",
      updated_at: updated.updated_at.toISOString(),
    });

    void this.leadTimeline.record({
      clientId: updated.client_id,
      leadId: updated.id,
      eventType: "status_changed",
      origin: "vendor",
      fromValue: lead.confirmation_status,
      toValue: "closed",
      actorId: user.sub,
      actorLabel: user.name ?? null,
    });

    return this.toResponse(updated as LeadWithRelations);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    await this.assertLeadAccess(user, lead);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const [conversations, appointments] = await Promise.all([
        tx.conversation.findMany({
          where: { lead_id: id },
          select: { id: true },
        }),
        tx.appointment.findMany({
          where: { lead_id: id },
          select: { id: true },
        }),
      ]);
      const conversationIds = conversations.map((item) => item.id);
      const appointmentIds = appointments.map((item) => item.id);

      // O Rubinho legado usa uma tabela do LangChain sem FK para o lead. A
      // sessao ja foi gravada historicamente pelo telefone, pelo UUID do lead
      // ou pelo UUID da conversa; por isso a memoria precisa ser removida
      // explicitamente antes do lead desaparecer.
      const [n8nHistoryTable] = await tx.$queryRaw<
        Array<{ exists: boolean }>
      >(Prisma.sql`
        SELECT to_regclass('agent_chat_history') IS NOT NULL AS exists
      `);
      const n8nAgentMemory = n8nHistoryTable?.exists
        ? await tx.$executeRaw(Prisma.sql`
            DELETE FROM agent_chat_history
            WHERE session_id = ${id}
              OR session_id = ANY(${conversationIds}::text[])
              OR (
                ${lead.phone ?? null}::text IS NOT NULL
                AND length(regexp_replace(${lead.phone ?? ""}, '[^0-9]', '', 'g')) >= 10
                AND right(regexp_replace(session_id, '[^0-9]', '', 'g'), 11) =
                  right(regexp_replace(${lead.phone ?? ""}, '[^0-9]', '', 'g'), 11)
              )
          `)
        : 0;

      // A cadeia de reagendamento possui uma FK para outro appointment. Ela
      // precisa ser solta antes de remover os appointments do lead.
      if (appointmentIds.length > 0) {
        await tx.appointment.updateMany({
          where: {
            rescheduled_from_appointment_id: { in: appointmentIds },
          },
          data: { rescheduled_from_appointment_id: null },
        });
      }

      const counts = {
        n8n_agent_memory: Number(n8nAgentMemory),
        operational_issues: (
          await tx.operationalIssue.deleteMany({
            where: {
              OR: [
                { lead_id: id },
                ...(conversationIds.length > 0
                  ? [{ conversation_id: { in: conversationIds } }]
                  : []),
              ],
            },
          })
        ).count,
        dispatch_events: (
          await tx.dispatchEvent.deleteMany({ where: { lead_id: id } })
        ).count,
        score_events: (
          await tx.scoreEvent.deleteMany({ where: { lead_id: id } })
        ).count,
        sales: (await tx.sale.deleteMany({ where: { lead_id: id } })).count,
        appointments: (
          await tx.appointment.deleteMany({ where: { lead_id: id } })
        ).count,
        messages:
          conversationIds.length > 0
            ? (
                await tx.message.deleteMany({
                  where: { conversation_id: { in: conversationIds } },
                })
              ).count
            : 0,
        conversation_states: (
          await tx.conversationState.deleteMany({ where: { lead_id: id } })
        ).count,
        agent_action_logs: (
          await tx.agentActionLog.deleteMany({ where: { lead_id: id } })
        ).count,
        whatsapp_attribution_events: (
          await tx.whatsAppAttributionEvent.deleteMany({
            where: {
              OR: [
                { lead_id: id },
                ...(conversationIds.length > 0
                  ? [{ conversation_id: { in: conversationIds } }]
                  : []),
              ],
            },
          })
        ).count,
        conversations: (
          await tx.conversation.deleteMany({ where: { lead_id: id } })
        ).count,
        crm_history: (
          await tx.crmHistory.deleteMany({ where: { lead_id: id } })
        ).count,
        lead_timeline: (
          await tx.leadTimeline.deleteMany({ where: { lead_id: id } })
        ).count,
        meta_lead_imports: (
          await tx.metaLeadImport.deleteMany({ where: { lead_id: id } })
        ).count,
      };

      await tx.lead.delete({ where: { id } });
      return counts;
    });

    this.realtimeEvents.emitLeadUpdated(lead.client_id, {
      client_id: lead.client_id,
      lead_id: lead.id,
      action: "deleted",
      updated_at: new Date().toISOString(),
    });

    return { deleted: true, hard_deleted: true, related_records: deleted };
  }

  async patchLeadForIntegration(leadId: string, dto: IntegrationPatchLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    // O node HTTP do n8n pode enviar todos os parâmetros da ferramenta, inclusive
    // os que o agente não preencheu. Strings vazias não representam uma correção
    // válida e não podem apagar dados já coletados.
    const sanitizedDto = { ...dto } as Record<string, unknown>;
    for (const key of [
      "name",
      "email",
      "phone",
      "notes",
      "vehicle_plate",
      "vehicle_model",
      "vehicle_year",
      "companions",
      "description",
      "first_name",
      "last_name",
      "birth_date",
      "store_visit_datetime",
    ]) {
      if (typeof sanitizedDto[key] === "string" && !sanitizedDto[key].trim()) {
        delete sanitizedDto[key];
      }
    }
    const asUpdate = sanitizedDto as UpdateLeadDto;
    const nextPhone = asUpdate.phone?.trim();
    if (nextPhone) {
      const normalizedPhone = normalizeBrazilianPhone(nextPhone);
      const existingByPhone = await this.findLeadByPhone(
        lead.client_id,
        normalizedPhone,
        lead.id,
      );
      if (existingByPhone) {
        throw new BadRequestException(
          "Telefone ja cadastrado para este cliente",
        );
      }
    }
    const data = this.buildGestorUpdateData(asUpdate);
    const scheduleSilentlyFromFirstDate =
      !lead.store_visit_datetime && Boolean(asUpdate.store_visit_datetime);
    let automaticScheduledStage: { id: string; pipeline_id: string } | null =
      null;

    if (scheduleSilentlyFromFirstDate) {
      automaticScheduledStage = await this.prisma.crmStage.findFirst({
        where: {
          client_id: lead.client_id,
          code: clientIdToStageCode(lead.client_id, "PRESENCA_AGENDADA"),
        },
        select: { id: true, pipeline_id: true },
      });
      if (!automaticScheduledStage) {
        throw new BadRequestException(
          "Etapa PRESENCA_AGENDADA nao configurada para o cliente",
        );
      }

      data.crm_stage_id = automaticScheduledStage.id;
      data.crm_pipeline_id = automaticScheduledStage.pipeline_id;
      data.confirmation_status = ConfirmationStatus.scheduled;
      data.tags = Array.from(new Set([...(lead.tags ?? []), "agendado"]));
    }
    if (
      asUpdate.crm_stage_id != null &&
      asUpdate.crm_stage_id !== lead.crm_stage_id &&
      asUpdate.confirmation_status == null
    ) {
      const status = await this.resolveStatusForStageAssignment(
        lead.client_id,
        asUpdate.crm_stage_id,
        null,
      );
      if (status) data.confirmation_status = status;
    }
    await this.syncLeadVendorBinding(lead, asUpdate, data);
    const confirming = this.isConfirmingTransition(lead, asUpdate);
    if (confirming) {
      this.assertLeadReadyForConfirmation({
        ...lead,
        ...data,
      } as unknown as Pick<
        LeadWithRelations,
        | "name"
        | "first_name"
        | "last_name"
        | "phone"
        | "event_interest_id"
        | "store_visit_datetime"
        | "companions"
        | "description"
        | "vehicle_plate"
        | "vehicle_model"
        | "vehicle_year"
      >);
    }
    this.mergeCheckinTokenIfConfirming(lead, asUpdate, data);

    let updated = (await this.prisma.lead.update({
      where: { id: leadId },
      data,
      select: leadSelect,
    })) as LeadWithRelations;

    if (updated.vehicle_plate && updated.vehicle_plate !== lead.vehicle_plate) {
      await this.triggerFipeLookup(
        updated.id,
        updated.vehicle_plate,
        updated.notes,
      );
      const enriched = await this.prisma.lead.findUnique({
        where: { id: updated.id },
        select: leadSelect,
      });
      if (enriched) updated = enriched as LeadWithRelations;
    }

    const response = this.toResponse(updated);

    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: lead.id,
      action: "updated",
      source: "integration",
      updated_at: new Date().toISOString(),
    });

    if (automaticScheduledStage) {
      void this.leadTimeline.record({
        clientId: updated.client_id,
        leadId: updated.id,
        eventType: "stage_moved",
        origin: "automation",
        fromStageId: lead.crm_stage_id,
        toStageId: automaticScheduledStage.id,
        fromValue: lead.crm_stage?.name ?? null,
        toValue: updated.crm_stage?.name ?? "Presenca agendada",
        actorLabel: "Rubinho",
        notes: "Movimentacao silenciosa apos escolha da data",
      });
      void this.leadTimeline.record({
        clientId: updated.client_id,
        leadId: updated.id,
        eventType: "status_changed",
        origin: "automation",
        fromValue: lead.confirmation_status,
        toValue: ConfirmationStatus.scheduled,
        actorLabel: "Rubinho",
        notes: "Status atualizado automaticamente apos escolha da data",
      });
    }

    this.notifyCredentialEmailWhenScheduled(lead.confirmation_status, updated);

    if (confirming) {
      void this.notifyCheckinViaWhatsapp(updated);
    }

    return response;
  }

  private assertLeadReadyForConfirmation(
    lead: Pick<
      LeadWithRelations,
      | "name"
      | "first_name"
      | "last_name"
      | "phone"
      | "event_interest_id"
      | "store_visit_datetime"
      | "companions"
      | "description"
      | "vehicle_plate"
      | "vehicle_model"
      | "vehicle_year"
    >,
  ) {
    const missing: string[] = [];
    const structuredName = [lead.first_name?.trim(), lead.last_name?.trim()]
      .filter(Boolean)
      .join(" ");
    const legacyName = lead.name?.trim() || "";
    const fullName =
      structuredName.split(/\s+/).filter(Boolean).length >= 2
        ? structuredName
        : legacyName;
    if (fullName.split(/\s+/).filter(Boolean).length < 2) {
      missing.push("nome completo");
    }
    if (!lead.phone?.trim()) missing.push("telefone");
    if (!lead.event_interest_id) missing.push("evento");
    if (!lead.store_visit_datetime) missing.push("data da visita");
    if (!lead.companions?.trim()) missing.push("acompanhantes");

    const description = lead.description?.trim().toLowerCase() ?? "";
    if (!description.startsWith("carro na troca:")) {
      missing.push("resposta sobre carro na troca");
    } else if (description.includes("carro na troca: sim")) {
      if (!lead.vehicle_plate?.trim()) missing.push("placa do veículo");
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Nao e possivel confirmar o lead. Campos obrigatorios pendentes: ${missing.join(", ")}`,
      );
    }
  }

  /** Lista leads sem exigir contexto JWT — autenticação já validada pelo IntegrationKeyGuard. */
  /**
   * Reconcilia os leads de um cliente com a fonte externa (ex.: Bitrix).
   * Arquiva (soft-delete) leads ativos cujo telefone não está em `keep_phones`.
   * Preserva leads de origem `manual` e leads sem telefone matchável.
   * Comparação por dígitos (remove +55 e usa os últimos 10/11).
   */
  async reconcileLeadsForIntegration(dto: ReconcileLeadsDto) {
    const toKey = (raw: string | null | undefined): string => {
      let digits = (raw ?? "").replace(/\D/g, "");
      if (digits.startsWith("55") && digits.length > 11)
        digits = digits.slice(2);
      return digits.length >= 11 ? digits.slice(-11) : digits.slice(-10);
    };

    const keep = new Set(
      dto.keep_phones.map(toKey).filter((key) => key.length >= 10),
    );

    const leads = await this.prisma.lead.findMany({
      where: { client_id: dto.client_id, deleted_at: null },
      select: { id: true, phone: true, source: true },
    });

    const orphanIds = leads
      .filter((lead) => {
        if (lead.source === "manual") return false;
        const key = toKey(lead.phone);
        if (key.length < 10) return false; // sem telefone matchável → preserva
        return !keep.has(key);
      })
      .map((lead) => lead.id);

    if (dto.dry_run) {
      return {
        dry_run: true,
        total_active: leads.length,
        would_archive: orphanIds.length,
        kept: leads.length - orphanIds.length,
      };
    }

    if (orphanIds.length > 0) {
      await this.prisma.lead.updateMany({
        where: { id: { in: orphanIds } },
        data: { deleted_at: new Date() },
      });
    }

    return {
      dry_run: false,
      total_active: leads.length,
      archived: orphanIds.length,
      kept: leads.length - orphanIds.length,
    };
  }

  async findAllForIntegration(query: FindLeadsQueryDto) {
    if (!query.client_id) {
      throw new BadRequestException("client_id obrigatorio para integracao");
    }

    const where: Prisma.LeadWhereInput = {
      deleted_at: null,
      client_id: query.client_id,
    };
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);

    if (query.source) where.source = query.source;
    if (query.confirmation_status)
      where.confirmation_status = query.confirmation_status;
    if (query.event_id) where.event_interest_id = query.event_id;
    if (query.crm_stage_id) where.crm_stage_id = query.crm_stage_id;
    if (query.crm_stage_code || query.crm_stage_name) {
      where.crm_stage = {
        ...(query.crm_stage_code ? { code: query.crm_stage_code } : {}),
        ...(query.crm_stage_name
          ? { name: { contains: query.crm_stage_name, mode: "insensitive" } }
          : {}),
      };
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      // Normaliza o termo se parecer um telefone (somente dígitos)
      const normalizedPhone = /^\d+$/.test(term)
        ? normalizeBrazilianPhone(term)
        : null;
      // Extrai apenas os dígitos locais para busca parcial (ex.: "981092776")
      const digits = /^\d+$/.test(term) ? phoneDigits(term) : null;

      const phoneConditions: Prisma.LeadWhereInput[] = [
        { phone: { contains: term, mode: "insensitive" } },
        ...(normalizedPhone
          ? [
              {
                phone: {
                  contains: normalizedPhone,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
        ...(digits && digits.length >= 8
          ? [{ phone: { contains: digits, mode: "insensitive" as const } }]
          : []),
      ];

      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        ...phoneConditions,
      ];
    }
    if (query.created_after)
      where.created_at = { gte: new Date(query.created_after) };
    if (query.updated_after)
      where.updated_at = { gte: new Date(query.updated_after) };

    let cursorRow: { id: string; created_at: Date } | null = null;
    if (query.cursor) {
      cursorRow = await this.prisma.lead.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true, created_at: true },
      });
      if (!cursorRow)
        throw new NotFoundException("Cursor de paginacao invalido");
    }

    const rows = await this.prisma.lead.findMany({
      where: cursorRow
        ? {
            ...where,
            OR: [
              { created_at: { lt: cursorRow.created_at } },
              { created_at: cursorRow.created_at, id: { lt: cursorRow.id } },
            ],
          }
        : where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: leadSelect,
      take: take + 1,
    });

    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map((row) => this.toResponse(row)),
      page_info: { take, next_cursor: nextCursor, has_next_page: hasNextPage },
    };
  }

  async createFacebookLeadsForIntegration(
    clientId: string,
    payloads: FacebookLeadPayloadDto[],
  ) {
    if (payloads.length === 0) {
      throw new BadRequestException("Envie ao menos um lead do Facebook");
    }
    if (payloads.length > 100) {
      throw new BadRequestException(
        "Cada lote pode conter no maximo 100 leads",
      );
    }

    const validatedForms = await this.validateFacebookFormsForClient(
      clientId,
      payloads,
    );
    const items: Array<
      ReturnType<typeof this.toResponse> & { already_existed: boolean }
    > = [];

    for (const payload of payloads) {
      const metadata: FacebookLeadMetadata = {
        externalRef: payload.lead_id,
        facebookLeadId: payload.lead_id,
        facebookFormId: payload.formulario_id || null,
        facebookAdId: payload.anuncio_id || null,
        facebookAdName: payload.anuncio || null,
        facebookAdSetId: payload.conjunto_id || null,
        facebookAdSetName: payload.conjunto || null,
        facebookCampaignId: payload.campanha_id || null,
        facebookCampaignName: payload.campanha || null,
        facebookCreativeId: payload.criativo_id || null,
        preferredContactChannel: payload.preferencia_atendimento || null,
        sourceCreatedAt: payload.criado_em ? new Date(payload.criado_em) : null,
        sourcePayload: JSON.parse(
          JSON.stringify(payload),
        ) as Prisma.InputJsonValue,
      };

      const result = await this.createForIntegration(
        {
          client_id: clientId,
          name: payload.nome,
          email: payload.email || undefined,
          phone: payload.telefone || undefined,
          source: LeadSource.facebook_ads,
        },
        metadata,
      );
      items.push(result);
    }

    const alreadyExisted = items.filter((item) => item.already_existed).length;
    return {
      received: payloads.length,
      created: payloads.length - alreadyExisted,
      already_existed: alreadyExisted,
      validated_forms: validatedForms,
      items,
    };
  }

  /**
   * Entrada global para webhooks Meta. O cliente nunca vem do request: ele e
   * resolvido exclusivamente pelo formulario selecionado no painel do gestor.
   *
   * Toda a resolucao acontece antes da primeira escrita. Depois disso, o lote
   * inteiro e criado/atualizado dentro de uma unica transacao, incluindo o
   * vinculo ao evento, pipeline, etapa e o historico CRM.
   */
  async createFacebookLeadsAutomatically(payloads: FacebookLeadPayloadDto[]) {
    if (payloads.length === 0) {
      throw new BadRequestException("Envie ao menos um lead do Facebook");
    }
    if (payloads.length > 100) {
      throw new BadRequestException(
        "Cada lote pode conter no maximo 100 leads",
      );
    }

    const formIds = [
      ...new Set(payloads.map((payload) => payload.formulario_id.trim())),
    ];
    const selectedForms = await this.prisma.metaAssetSelection.findMany({
      where: {
        form_id: { in: formIds },
        meta_connection: { status: "connected" },
      },
      select: {
        form_id: true,
        form_name: true,
        meta_connection: {
          select: { id: true, client_id: true },
        },
      },
    });

    const selectionsByForm = new Map<
      string,
      Array<{
        clientId: string;
        formName: string | null;
        metaConnectionId: string;
      }>
    >();
    for (const selection of selectedForms) {
      if (!selection.form_id) continue;
      const entries = selectionsByForm.get(selection.form_id) ?? [];
      if (
        !entries.some(
          (entry) => entry.clientId === selection.meta_connection.client_id,
        )
      ) {
        entries.push({
          clientId: selection.meta_connection.client_id,
          formName: selection.form_name,
          metaConnectionId: selection.meta_connection.id,
        });
      }
      selectionsByForm.set(selection.form_id, entries);
    }

    const unknownFormIds = formIds.filter(
      (formId) => !selectionsByForm.has(formId),
    );
    if (unknownFormIds.length > 0) {
      for (const formId of unknownFormIds) {
        await this.recordOperationalIssue({
          type: "UNKNOWN_FORM",
          severity: "critical",
          title: "Formulário Meta desconhecido",
          message: `O formulário ${formId} não está vinculado a nenhum cliente ativo.`,
          fingerprint: `unknown-form:${formId}`,
          metadata: { form_id: formId },
        });
      }
      throw new ForbiddenException(
        `Formulario Meta nao vinculado a nenhum cliente ativo: ${unknownFormIds.join(", ")}`,
      );
    }

    const ambiguousFormIds = formIds.filter(
      (formId) => (selectionsByForm.get(formId)?.length ?? 0) > 1,
    );
    if (ambiguousFormIds.length > 0) {
      throw new ConflictException(
        `Formulario Meta vinculado a mais de um cliente: ${ambiguousFormIds.join(", ")}`,
      );
    }

    const resolvedSelections = formIds.map((formId) => {
      const selection = selectionsByForm.get(formId)![0];
      return {
        id: formId,
        name: selection.formName ?? formId,
        client_id: selection.clientId,
        meta_connection_id: selection.metaConnectionId,
      };
    });

    const routingRows = await this.prisma.metaLeadRoutingRule.findMany({
      where: { form_id: { in: formIds } },
      select: {
        form_id: true,
        form_name: true,
        client_id: true,
        event_id: true,
        crm_pipeline_id: true,
        call_stage_id: true,
        whatsapp_stage_id: true,
        whatsapp_template_name: true,
        whatsapp_template_language: true,
        whatsapp_template_parameter_keys: true,
        client: { select: { settings: true, company_name: true } },
        event: {
          select: {
            name: true,
            event_date: true,
            location: true,
            participants: { select: { client_id: true } },
          },
        },
        crm_pipeline: {
          select: { client_id: true, code: true, is_active: true },
        },
        call_stage: {
          select: {
            id: true,
            client_id: true,
            pipeline_id: true,
            code: true,
            name: true,
          },
        },
        whatsapp_stage: {
          select: {
            id: true,
            client_id: true,
            pipeline_id: true,
            code: true,
            name: true,
          },
        },
      },
    });
    const routingRowByForm = new Map(
      routingRows.map((rule) => [rule.form_id, rule]),
    );
    const missingRoutingFormIds = formIds.filter(
      (formId) => !routingRowByForm.has(formId),
    );
    if (missingRoutingFormIds.length > 0) {
      throw new UnprocessableEntityException(
        `Formulario Meta sem mapeamento de evento e etapas: ${missingRoutingFormIds.join(", ")}`,
      );
    }

    const selectionByForm = new Map(
      resolvedSelections.map((form) => [form.id, form]),
    );
    const routingByForm = new Map<string, AutomaticFacebookRouting>();
    for (const formId of formIds) {
      const selection = selectionByForm.get(formId)!;
      const rule = routingRowByForm.get(formId)!;
      const eventBelongsToClient = rule.event.participants.some(
        (participant) => participant.client_id === rule.client_id,
      );
      const pipelineIsValid =
        rule.crm_pipeline.is_active &&
        rule.crm_pipeline.client_id === rule.client_id;
      const callStageIsValid =
        rule.call_stage_id === rule.call_stage.id &&
        rule.call_stage.client_id === rule.client_id &&
        rule.call_stage.pipeline_id === rule.crm_pipeline_id;
      const whatsappStageIsValid =
        rule.whatsapp_stage_id === rule.whatsapp_stage.id &&
        rule.whatsapp_stage.client_id === rule.client_id &&
        rule.whatsapp_stage.pipeline_id === rule.crm_pipeline_id;

      if (
        rule.client_id !== selection.client_id ||
        !eventBelongsToClient ||
        !pipelineIsValid ||
        !callStageIsValid ||
        !whatsappStageIsValid
      ) {
        throw new ConflictException(
          `Mapeamento Meta inconsistente para o formulario: ${formId}`,
        );
      }

      routingByForm.set(formId, {
        formId,
        formName: rule.form_name ?? selection.name,
        metaConnectionId: selection.meta_connection_id,
        clientId: rule.client_id,
        clientName: rule.client.company_name,
        eventId: rule.event_id,
        eventName: rule.event.name,
        eventDate: rule.event.event_date,
        eventLocation: rule.event.location,
        pipelineId: rule.crm_pipeline_id,
        pipelineCode: rule.crm_pipeline.code,
        callStage: {
          id: rule.call_stage.id,
          code: rule.call_stage.code,
          name: rule.call_stage.name,
        },
        whatsappStage: {
          id: rule.whatsapp_stage.id,
          code: rule.whatsapp_stage.code,
          name: rule.whatsapp_stage.name,
        },
        whatsappTemplateName: rule.whatsapp_template_name,
        whatsappTemplateLanguage: rule.whatsapp_template_language,
        whatsappTemplateParameterKeys:
          rule.whatsapp_template_parameter_keys.filter(
            (key): key is MetaLeadWhatsappTemplateParameterKey =>
              AUTOMATIC_WHATSAPP_TEMPLATE_PARAMETER_KEYS.has(key),
          ),
        clientSettings: rule.client.settings,
      });
    }

    // O payload normalizado do n8n historicamente nao trazia o conjunto. A
    // hierarquia ja sincronizada da Meta permite completar anúncio -> conjunto
    // -> campanha antes da transacao, sem depender de uma nova chamada Graph.
    const metaConnectionIds = [
      ...new Set([...routingByForm.values()].map((r) => r.metaConnectionId)),
    ];
    const adIds = [
      ...new Set(
        payloads.map((payload) => payload.anuncio_id?.trim()).filter(Boolean),
      ),
    ] as string[];
    const knownAds =
      adIds.length > 0
        ? await this.prisma.metaAd.findMany({
            where: {
              meta_connection_id: { in: metaConnectionIds },
              meta_ad_id: { in: adIds },
            },
            select: {
              meta_connection_id: true,
              meta_ad_id: true,
              meta_ad_set_id: true,
              meta_campaign_id: true,
              meta_creative_id: true,
              name: true,
            },
          })
        : [];
    const adKey = (connectionId: string, entityId: string) =>
      `${connectionId}:${entityId}`;
    const knownAdById = new Map(
      knownAds.map((ad) => [adKey(ad.meta_connection_id, ad.meta_ad_id), ad]),
    );
    const adSetIds = [
      ...new Set([
        ...knownAds.map((ad) => ad.meta_ad_set_id).filter(Boolean),
        ...payloads
          .map((payload) => payload.conjunto_id?.trim())
          .filter(Boolean),
      ]),
    ] as string[];
    const knownAdSets =
      adSetIds.length > 0
        ? await this.prisma.metaAdSet.findMany({
            where: {
              meta_connection_id: { in: metaConnectionIds },
              meta_ad_set_id: { in: adSetIds },
            },
            select: {
              meta_connection_id: true,
              meta_ad_set_id: true,
              meta_campaign_id: true,
              name: true,
            },
          })
        : [];
    const knownAdSetById = new Map(
      knownAdSets.map((adSet) => [
        adKey(adSet.meta_connection_id, adSet.meta_ad_set_id),
        adSet,
      ]),
    );
    const campaignIds = [
      ...new Set([
        ...knownAds.map((ad) => ad.meta_campaign_id).filter(Boolean),
        ...knownAdSets.map((adSet) => adSet.meta_campaign_id).filter(Boolean),
        ...payloads
          .map((payload) => payload.campanha_id?.trim())
          .filter(Boolean),
      ]),
    ] as string[];
    const knownCampaigns =
      campaignIds.length > 0
        ? await this.prisma.metaCampaign.findMany({
            where: {
              meta_connection_id: { in: metaConnectionIds },
              meta_campaign_id: { in: campaignIds },
            },
            select: {
              meta_connection_id: true,
              meta_campaign_id: true,
              name: true,
            },
          })
        : [];
    const knownCampaignById = new Map(
      knownCampaigns.map((campaign) => [
        adKey(campaign.meta_connection_id, campaign.meta_campaign_id),
        campaign,
      ]),
    );

    // Canal, datas e metadados sao validados antes de abrir a transacao. Um
    // item invalido nunca deixa os itens anteriores gravados parcialmente.
    const prepared = payloads.map((payload): AutomaticFacebookPreparedLead => {
      const routing = routingByForm.get(payload.formulario_id.trim())!;
      const channel = this.normalizeFacebookContactChannel(
        payload.preferencia_atendimento,
      );
      const targetStage =
        channel === "ligacao" ? routing.callStage : routing.whatsappStage;
      const knownAd = payload.anuncio_id
        ? knownAdById.get(adKey(routing.metaConnectionId, payload.anuncio_id))
        : undefined;
      const facebookAdSetId =
        payload.conjunto_id || knownAd?.meta_ad_set_id || null;
      const knownAdSet = facebookAdSetId
        ? knownAdSetById.get(adKey(routing.metaConnectionId, facebookAdSetId))
        : undefined;
      const facebookCampaignId =
        payload.campanha_id ||
        knownAd?.meta_campaign_id ||
        knownAdSet?.meta_campaign_id ||
        null;
      const knownCampaign = facebookCampaignId
        ? knownCampaignById.get(
            adKey(routing.metaConnectionId, facebookCampaignId),
          )
        : undefined;
      const sourceCreatedAt = payload.criado_em
        ? new Date(payload.criado_em)
        : null;
      if (sourceCreatedAt && Number.isNaN(sourceCreatedAt.getTime())) {
        throw new BadRequestException(
          `criado_em invalido para o lead Meta: ${payload.lead_id}`,
        );
      }

      return {
        payload,
        routing,
        channel,
        targetStage,
        mappedStatus: resolveConfirmationStatusForStage(
          routing.clientSettings,
          targetStage.id,
        ),
        metadata: {
          externalRef: payload.lead_id,
          facebookLeadId: payload.lead_id,
          facebookFormId: payload.formulario_id,
          facebookAdId: payload.anuncio_id || null,
          facebookAdName: payload.anuncio || knownAd?.name || null,
          facebookAdSetId,
          facebookAdSetName: payload.conjunto || knownAdSet?.name || null,
          facebookCampaignId,
          facebookCampaignName: payload.campanha || knownCampaign?.name || null,
          facebookCreativeId:
            payload.criativo_id || knownAd?.meta_creative_id || null,
          preferredContactChannel: channel,
          sourceCreatedAt,
          sourcePayload: JSON.parse(
            JSON.stringify(payload),
          ) as Prisma.InputJsonValue,
        },
      };
    });

    const integrationActorId = this.config
      .get<string>("LEADFLOW_INTEGRATION_ACTOR_USER_ID")
      ?.trim();
    if (!integrationActorId) {
      throw new InternalServerErrorException(
        "Integracao externa nao configurada (LEADFLOW_INTEGRATION_ACTOR_USER_ID)",
      );
    }
    const integrationActor = await this.prisma.user.findUnique({
      where: { id: integrationActorId },
      select: { id: true },
    });
    if (!integrationActor) {
      throw new InternalServerErrorException(
        "Usuario tecnico da integracao nao encontrado",
      );
    }

    const runTransaction = () =>
      this.prisma.$transaction(async (tx) => {
        const transactionItems: AutomaticFacebookTransactionItem[] = [];
        for (const item of prepared) {
          transactionItems.push(
            await this.upsertAutomaticFacebookLeadWithRouting(
              tx,
              item,
              integrationActor.id,
            ),
          );
        }
        return transactionItems;
      });

    let transactionItems: AutomaticFacebookTransactionItem[];
    try {
      transactionItems = await runTransaction();
    } catch (error) {
      // Uma entrega concorrente pode ganhar a restricao unica entre o lookup e
      // o create. A primeira transacao e revertida por inteiro; uma repeticao
      // passa pela deduplicacao e continua atomica.
      if (
        isLeadPhoneUniqueViolation(error) ||
        isLeadEmailUniqueViolation(error) ||
        isLeadExternalRefUniqueViolation(error)
      ) {
        transactionItems = await runTransaction();
      } else {
        throw error;
      }
    }

    for (const item of transactionItems) {
      const { lead, prepared: preparedItem } = item;
      this.realtimeEvents.emitLeadUpdated(lead.client_id, {
        client_id: lead.client_id,
        lead_id: lead.id,
        action: item.alreadyExisted ? "updated" : "created",
        source: "facebook_lead_ads",
        updated_at: lead.updated_at.toISOString(),
      });
      if (!item.alreadyExisted) {
        void this.leadTimeline.record({
          clientId: lead.client_id,
          leadId: lead.id,
          eventType: "created",
          origin: "integration",
          actorId: integrationActor.id,
          actorLabel: "Integração Meta",
          metadata: {
            form_id: preparedItem.routing.formId,
            event_id: preparedItem.routing.eventId,
            channel: preparedItem.channel,
          },
        });
      }
      if (item.stageMoved) {
        void this.leadTimeline.record({
          clientId: lead.client_id,
          leadId: lead.id,
          eventType: "stage_moved",
          origin: "integration",
          fromStageId: item.fromStageId,
          toStageId: preparedItem.targetStage.id,
          fromValue: item.fromStageCode,
          toValue: preparedItem.targetStage.code,
          actorId: integrationActor.id,
          actorLabel: "Integração Meta",
          notes: "Roteamento automático pelo formulário Meta",
        });
      }
    }

    const whatsappDispatches = await Promise.all(
      transactionItems.map((item) =>
        this.dispatchAutomaticWhatsappTemplate(item),
      ),
    );

    const created = transactionItems.filter(
      (item) => !item.alreadyExisted,
    ).length;
    const alreadyExisted = transactionItems.length - created;
    const items = transactionItems.map((item, index) => ({
      ...this.toResponse(item.lead),
      already_existed: item.alreadyExisted,
      routing_applied: {
        form_id: item.prepared.routing.formId,
        event_id: item.prepared.routing.eventId,
        event_name: item.prepared.routing.eventName,
        crm_pipeline_id: item.prepared.routing.pipelineId,
        crm_pipeline_code: item.prepared.routing.pipelineCode,
        crm_stage_id: item.prepared.targetStage.id,
        crm_stage_code: item.prepared.targetStage.code,
        channel: item.prepared.channel,
        stage_moved: item.stageMoved,
      },
      whatsapp_dispatch: whatsappDispatches[index],
    }));

    return {
      received: payloads.length,
      created,
      already_existed: alreadyExisted,
      transaction: "committed",
      resolved_forms: resolvedSelections.map((form) => {
        const routing = routingByForm.get(form.id)!;
        return {
          ...form,
          event_id: routing.eventId,
          event_name: routing.eventName,
          crm_pipeline_id: routing.pipelineId,
          crm_pipeline_code: routing.pipelineCode,
          call_stage_id: routing.callStage.id,
          whatsapp_stage_id: routing.whatsappStage.id,
          whatsapp_template_name: routing.whatsappTemplateName,
          whatsapp_template_language: routing.whatsappTemplateLanguage,
        };
      }),
      items,
    };
  }

  private normalizeFacebookContactChannel(
    value: string | null | undefined,
  ): "ligacao" | "whatsapp" {
    const normalized = String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

    if (normalized.includes("whatsapp")) return "whatsapp";
    if (normalized.includes("ligacao") || normalized.includes("telefone")) {
      return "ligacao";
    }
    throw new BadRequestException(
      `Canal de atendimento invalido: ${normalized || "vazio"}`,
    );
  }

  private async dispatchAutomaticWhatsappTemplate(
    item: AutomaticFacebookTransactionItem,
  ): Promise<AutomaticWhatsappDispatchResult> {
    const { lead, prepared, shouldDispatchWhatsapp } = item;
    const { routing } = prepared;

    if (prepared.channel !== "whatsapp") {
      return { status: "not_requested", reason: "channel_ligacao" };
    }
    if (!shouldDispatchWhatsapp) {
      return { status: "skipped", reason: "duplicate_delivery" };
    }
    if (!lead.phone) {
      return { status: "skipped", reason: "phone_missing" };
    }
    if (!routing.whatsappTemplateName || !routing.whatsappTemplateLanguage) {
      await this.recordOperationalIssue({
        type: "TEMPLATE_FAILED",
        severity: "warning",
        title: "Template WhatsApp não configurado",
        message: `O formulário ${routing.formId} recebeu um lead, mas não possui template configurado.`,
        fingerprint: `template-config:${routing.formId}`,
        clientId: routing.clientId,
        leadId: lead.id,
        metadata: { form_id: routing.formId },
      });
      return { status: "skipped", reason: "template_not_configured" };
    }

    const templateName = routing.whatsappTemplateName;
    const templateLanguage = routing.whatsappTemplateLanguage;
    try {
      const messageId = await this.metaService.sendClientWhatsappTemplate({
        clientId: routing.clientId,
        to: lead.phone,
        templateName,
        language: templateLanguage,
        parameters: routing.whatsappTemplateParameterKeys.map((key) =>
          this.resolveAutomaticWhatsappTemplateParameter(key, item),
        ),
      });

      const chatRecord = await this.recordAutomaticWhatsappMessage(
        item,
        messageId,
      );
      const whatsappAsset = await this.prisma.metaAssetSelection.findFirst({
        where: {
          phone_number_id: { not: null },
          meta_connection: {
            client_id: routing.clientId,
            status: "connected",
          },
        },
        orderBy: [{ is_primary: "desc" }, { updated_at: "desc" }],
        select: { phone_number_id: true },
      });

      await this.dispatchTracking
        .upsert(lead.client_id, {
          lead_id: lead.id,
          event_id: routing.eventId,
          conversation_id: chatRecord.conversationId,
          message_id: chatRecord.messageId,
          dispatch_key: `meta-lead-template:${lead.facebook_lead_id ?? lead.id}:${templateName}`,
          workflow_key: "facebook-lead-auto-template",
          dispatch_type: "lead_welcome_template",
          channel: "whatsapp",
          provider: "meta",
          provider_message_id: messageId ?? undefined,
          template_name: templateName,
          status: "sent",
          occurred_at: new Date().toISOString(),
          metadata: {
            form_id: routing.formId,
            client_id: routing.clientId,
            event_id: routing.eventId,
            lead_id: lead.id,
            conversation_id: chatRecord.conversationId ?? null,
            phone_number_id: whatsappAsset?.phone_number_id ?? null,
            template_language: templateLanguage,
            chat_recorded: chatRecord.recorded,
          },
        })
        .catch((trackingError) => {
          this.logger.error(
            `Template enviado, mas o rastreamento falhou para o lead ${lead.id}: ${this.errorMessage(trackingError)}`,
          );
        });

      await this.leadTimeline.record({
        clientId: lead.client_id,
        leadId: lead.id,
        eventType: "message",
        origin: "whatsapp",
        actorLabel: "Integração Meta",
        notes: `Template WhatsApp enviado: ${templateName}`,
        metadata: {
          direction: "outbound",
          provider: "meta",
          template_name: templateName,
          template_language: templateLanguage,
          message_id: messageId,
          form_id: routing.formId,
        },
      });

      return {
        status: "sent",
        template_name: templateName,
        template_language: templateLanguage,
        message_id: messageId,
        chat_recorded: chatRecord.recorded,
      };
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      this.logger.warn(
        `Falha ao enviar template WhatsApp do formulario ${routing.formId} para o lead ${lead.id}: ${errorMessage}`,
      );
      await this.recordOperationalIssue({
        type: "TEMPLATE_FAILED",
        severity: "critical",
        title: "Falha no envio do template WhatsApp",
        message: errorMessage,
        fingerprint: `template-send:${lead.id}:${templateName}`,
        clientId: routing.clientId,
        leadId: lead.id,
        metadata: { form_id: routing.formId, template_name: templateName },
      });
      await this.dispatchTracking
        .upsert(lead.client_id, {
          lead_id: lead.id,
          event_id: routing.eventId,
          dispatch_key: `meta-lead-template:${lead.facebook_lead_id ?? lead.id}:${templateName}`,
          workflow_key: "facebook-lead-auto-template",
          dispatch_type: "lead_welcome_template",
          channel: "whatsapp",
          provider: "meta",
          template_name: templateName,
          status: "failed",
          occurred_at: new Date().toISOString(),
          failure_reason: errorMessage,
          metadata: {
            form_id: routing.formId,
            template_language: templateLanguage,
          },
        })
        .catch((trackingError) => {
          this.logger.error(
            `Falha ao registrar erro do disparo para o lead ${lead.id}: ${this.errorMessage(trackingError)}`,
          );
        });
      return {
        status: "failed",
        reason: "provider_error",
        template_name: templateName,
        template_language: templateLanguage,
        chat_recorded: false,
      };
    }
  }

  /**
   * O envio automatico usa a API da Meta diretamente. Para que o operador
   * tambem veja a mensagem no Chat do painel, espelhamos o envio na mesma
   * conversa WhatsApp usada pelos demais disparos.
   */
  private async recordAutomaticWhatsappMessage(
    item: AutomaticFacebookTransactionItem,
    messageId: string | null,
  ): Promise<{
    recorded: boolean;
    conversationId?: string;
    messageId?: string;
  }> {
    const { lead, prepared } = item;
    const templateName = prepared.routing.whatsappTemplateName;
    if (!messageId || !templateName) return { recorded: false };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let conversation = await tx.conversation.findFirst({
          where: {
            client_id: lead.client_id,
            lead_id: lead.id,
            channel: "whatsapp",
          },
          orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
        });
        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              client_id: lead.client_id,
              lead_id: lead.id,
              channel: "whatsapp",
            },
          });
        }

        const existingMessage = await tx.message.findUnique({
          where: { external_id: messageId },
          select: {
            id: true,
            conversation_id: true,
            content: true,
            media_id: true,
            media_url: true,
            created_at: true,
          },
        });
        if (existingMessage) {
          return { conversation, message: existingMessage, created: false };
        }

        const message = await tx.message.create({
          data: {
            conversation_id: conversation.id,
            sender_type: "user",
            sender_id: null,
            content: `Template WhatsApp enviado: ${templateName}`,
            external_id: messageId,
            author_type: "template",
            origin: "meta_template",
            workflow_key: "facebook-lead-auto-template",
            template_name: templateName,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { last_message_at: message.created_at },
        });
        return { conversation, message, created: true };
      });

      if (result.created) {
        this.realtimeEvents.emitNewMessage(lead.client_id, {
          conversation_id: result.conversation.id,
          message_id: result.message.id,
          sender_type: "user",
          sender_id: null,
          content: result.message.content,
          media_id: null,
          media_url: null,
          created_at: result.message.created_at,
        });
      }
      return {
        recorded: true,
        conversationId: result.conversation.id,
        messageId: result.message.id,
      };
    } catch (error) {
      this.logger.warn(
        `Template Meta enviado, mas nao foi espelhado no Chat para o lead ${lead.id}: ${this.errorMessage(error)}`,
      );
      return { recorded: false };
    }
  }

  private resolveAutomaticWhatsappTemplateParameter(
    key: MetaLeadWhatsappTemplateParameterKey,
    item: AutomaticFacebookTransactionItem,
  ): string {
    const { lead, prepared } = item;
    switch (key) {
      case "lead_name":
        return lead.name;
      case "event_name":
        return prepared.routing.eventName;
      case "company_name":
        return prepared.routing.clientName;
      case "event_date":
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(prepared.routing.eventDate);
      case "event_location":
        return prepared.routing.eventLocation?.trim() || "-";
    }
  }

  private async findActiveLeadByPhoneForAutomaticImport(
    tx: Prisma.TransactionClient,
    clientId: string,
    phone?: string | null,
    excludeLeadId?: string,
  ): Promise<LeadWithRelations | null> {
    const candidates = buildLeadPhoneCandidates(phone);
    if (!candidates) return null;

    const exact = await tx.lead.findFirst({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        OR: candidates.candidates.map((candidate) => ({ phone: candidate })),
      },
      select: leadSelect,
    });
    if (exact) return exact as LeadWithRelations;

    const suffixes = new Set<string>();
    if (candidates.digits.length >= 10)
      suffixes.add(candidates.digits.slice(-10));
    if (candidates.digits.length >= 11)
      suffixes.add(candidates.digits.slice(-11));
    if (candidates.digits.length >= 12)
      suffixes.add(candidates.digits.slice(-12));
    if (suffixes.size === 0) return null;

    const bySuffix = await tx.lead.findFirst({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        OR: Array.from(suffixes).map((suffix) => ({
          phone: { endsWith: suffix },
        })),
      },
      select: leadSelect,
    });
    return bySuffix as LeadWithRelations | null;
  }

  private async findActiveLeadByEmailForAutomaticImport(
    tx: Prisma.TransactionClient,
    clientId: string,
    email?: string | null,
    excludeLeadId?: string,
  ): Promise<LeadWithRelations | null> {
    const normalized = email?.toLowerCase().trim();
    if (!normalized) return null;
    const lead = await tx.lead.findFirst({
      where: {
        client_id: clientId,
        email: normalized,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      },
      select: leadSelect,
    });
    return lead as LeadWithRelations | null;
  }

  private async upsertAutomaticFacebookLeadWithRouting(
    tx: Prisma.TransactionClient,
    prepared: AutomaticFacebookPreparedLead,
    integrationActorId: string,
  ): Promise<AutomaticFacebookTransactionItem> {
    const { payload, routing, targetStage, metadata } = prepared;
    const phone = payload.telefone?.trim()
      ? normalizeBrazilianPhone(payload.telefone.trim())
      : null;
    const email = payload.email?.toLowerCase().trim() || null;

    let existing = await this.findActiveLeadByPhoneForAutomaticImport(
      tx,
      routing.clientId,
      phone,
    );
    if (!existing) {
      existing = (await tx.lead.findFirst({
        where: {
          client_id: routing.clientId,
          deleted_at: null,
          OR: [
            { external_ref: metadata.externalRef },
            { facebook_lead_id: metadata.facebookLeadId },
          ],
        },
        select: leadSelect,
      })) as LeadWithRelations | null;
    }
    if (!existing) {
      existing = await this.findActiveLeadByEmailForAutomaticImport(
        tx,
        routing.clientId,
        email,
      );
    }
    if (!existing) {
      const archived = (await tx.lead.findFirst({
        where: {
          client_id: routing.clientId,
          deleted_at: { not: null },
          OR: [
            { external_ref: metadata.externalRef },
            { facebook_lead_id: metadata.facebookLeadId },
          ],
        },
        select: leadSelect,
      })) as LeadWithRelations | null;
      if (archived) {
        existing =
          (await this.findActiveLeadByPhoneForAutomaticImport(
            tx,
            routing.clientId,
            phone ?? archived.phone,
            archived.id,
          )) ??
          (await this.findActiveLeadByEmailForAutomaticImport(
            tx,
            routing.clientId,
            email ?? archived.email,
            archived.id,
          )) ??
          archived;
      }
    }

    if (!existing) {
      const lead = (await tx.lead.create({
        data: {
          client_id: routing.clientId,
          name: payload.nome.trim(),
          email,
          phone,
          source: LeadSource.facebook_ads,
          event_interest_id: routing.eventId,
          crm_pipeline_id: routing.pipelineId,
          crm_stage_id: targetStage.id,
          ...(prepared.mappedStatus
            ? { confirmation_status: prepared.mappedStatus }
            : {}),
          external_ref: metadata.externalRef,
          facebook_lead_id: metadata.facebookLeadId,
          facebook_form_id: metadata.facebookFormId,
          facebook_ad_id: metadata.facebookAdId,
          facebook_ad_name: metadata.facebookAdName,
          facebook_ad_set_id: metadata.facebookAdSetId,
          facebook_ad_set_name: metadata.facebookAdSetName,
          facebook_campaign_id: metadata.facebookCampaignId,
          facebook_campaign_name: metadata.facebookCampaignName,
          preferred_contact_channel: metadata.preferredContactChannel,
          source_created_at: metadata.sourceCreatedAt,
          source_payload: metadata.sourcePayload,
        },
        select: leadSelect,
      })) as LeadWithRelations;

      await tx.crmHistory.create({
        data: {
          lead_id: lead.id,
          from_stage_id: null,
          to_stage_id: targetStage.id,
          changed_by_user_id: integrationActorId,
          notes: `Lead Meta criado e roteado para ${targetStage.name}`,
        },
      });
      await this.upsertAutomaticFacebookAttribution(tx, lead.id, prepared);

      return {
        lead,
        alreadyExisted: false,
        stageMoved: true,
        fromStageId: null,
        fromStageCode: null,
        shouldDispatchWhatsapp: true,
        prepared,
      };
    }

    const patch: Prisma.LeadUncheckedUpdateInput = {};
    const sameDelivery =
      existing.external_ref === metadata.externalRef ||
      existing.facebook_lead_id === metadata.facebookLeadId;
    const shouldReplaceRouting = Boolean(existing.deleted_at) || !sameDelivery;
    const routingIsIncomplete =
      !existing.event_interest_id ||
      !existing.crm_pipeline_id ||
      !existing.crm_stage_id;
    const shouldApplyRouting = shouldReplaceRouting || routingIsIncomplete;

    if (existing.deleted_at) patch.deleted_at = null;
    if (email && !existing.email) {
      const emailOwner = await this.findActiveLeadByEmailForAutomaticImport(
        tx,
        routing.clientId,
        email,
        existing.id,
      );
      if (!emailOwner) patch.email = email;
    }
    if (shouldApplyRouting) {
      patch.event_interest_id = routing.eventId;
      patch.crm_pipeline_id = routing.pipelineId;
      patch.crm_stage_id = targetStage.id;
      if (prepared.mappedStatus) {
        patch.confirmation_status = prepared.mappedStatus;
      }
    }
    if (!existing.external_ref) patch.external_ref = metadata.externalRef;

    const incomingOccurredAt = metadata.sourceCreatedAt?.getTime() ?? null;
    const currentOccurredAt = existing.source_created_at?.getTime() ?? null;
    const isLatestAttribution =
      incomingOccurredAt === null ||
      currentOccurredAt === null ||
      incomingOccurredAt >= currentOccurredAt;
    if (isLatestAttribution) {
      patch.facebook_lead_id = metadata.facebookLeadId;
      patch.facebook_form_id = metadata.facebookFormId;
      patch.facebook_ad_id = metadata.facebookAdId;
      patch.facebook_ad_name = metadata.facebookAdName;
      patch.facebook_ad_set_id = metadata.facebookAdSetId;
      patch.facebook_ad_set_name = metadata.facebookAdSetName;
      patch.facebook_campaign_id = metadata.facebookCampaignId;
      patch.facebook_campaign_name = metadata.facebookCampaignName;
      patch.preferred_contact_channel = metadata.preferredContactChannel;
      patch.source_created_at = metadata.sourceCreatedAt;
      patch.source_payload = metadata.sourcePayload;
    }

    const fromStageId = existing.crm_stage_id;
    const fromStageCode = existing.crm_stage?.code ?? null;
    const stageMoved = shouldApplyRouting && fromStageId !== targetStage.id;
    const lead =
      Object.keys(patch).length > 0
        ? ((await tx.lead.update({
            where: { id: existing.id },
            data: patch,
            select: leadSelect,
          })) as LeadWithRelations)
        : existing;

    if (stageMoved) {
      await tx.crmHistory.create({
        data: {
          lead_id: existing.id,
          from_stage_id: fromStageId,
          to_stage_id: targetStage.id,
          changed_by_user_id: integrationActorId,
          notes: `Lead Meta roteado para ${targetStage.name}`,
        },
      });
    }
    await this.upsertAutomaticFacebookAttribution(tx, lead.id, prepared);

    return {
      lead,
      alreadyExisted: true,
      stageMoved,
      fromStageId,
      fromStageCode,
      shouldDispatchWhatsapp: shouldApplyRouting,
      prepared,
    };
  }

  private async upsertAutomaticFacebookAttribution(
    tx: Prisma.TransactionClient,
    leadId: string,
    prepared: AutomaticFacebookPreparedLead,
  ) {
    const { routing, metadata } = prepared;
    const attribution = {
      client_id: routing.clientId,
      lead_id: leadId,
      event_id: routing.eventId,
      meta_form_id: metadata.facebookFormId,
      meta_campaign_id: metadata.facebookCampaignId,
      meta_campaign_name: metadata.facebookCampaignName,
      meta_ad_set_id: metadata.facebookAdSetId,
      meta_ad_set_name: metadata.facebookAdSetName,
      meta_ad_id: metadata.facebookAdId,
      meta_ad_name: metadata.facebookAdName,
      meta_creative_id: metadata.facebookCreativeId,
      preferred_contact_channel: metadata.preferredContactChannel,
      source_created_at: metadata.sourceCreatedAt,
      raw_payload: metadata.sourcePayload,
    };

    await tx.metaLeadImport.upsert({
      where: {
        meta_connection_id_meta_lead_id: {
          meta_connection_id: routing.metaConnectionId,
          meta_lead_id: metadata.facebookLeadId,
        },
      },
      create: {
        ...attribution,
        meta_connection_id: routing.metaConnectionId,
        meta_lead_id: metadata.facebookLeadId,
      },
      update: attribution,
    });
  }

  /**
   * Usa a selecao salva no painel do cliente como fonte de verdade. A credencial
   * continua definindo o tenant e um formulario de outro cliente nunca e aceito,
   * mesmo que todos os webhooks da Meta cheguem ao mesmo fluxo do n8n.
   */
  private async validateFacebookFormsForClient(
    clientId: string,
    payloads: FacebookLeadPayloadDto[],
  ) {
    const formIds = [
      ...new Set(payloads.map((payload) => payload.formulario_id.trim())),
    ];
    const selectedForms = await this.prisma.metaAssetSelection.findMany({
      where: {
        form_id: { in: formIds },
        meta_connection: {
          client_id: clientId,
          status: "connected",
        },
      },
      select: {
        form_id: true,
        form_name: true,
      },
    });

    const selectedById = new Map(
      selectedForms
        .filter((form): form is typeof form & { form_id: string } =>
          Boolean(form.form_id),
        )
        .map((form) => [form.form_id, form]),
    );
    const unlinkedFormIds = formIds.filter(
      (formId) => !selectedById.has(formId),
    );

    if (unlinkedFormIds.length > 0) {
      throw new ForbiddenException(
        `Formulario Meta nao vinculado ao cliente desta integracao: ${unlinkedFormIds.join(", ")}`,
      );
    }

    return formIds.map((formId) => ({
      id: formId,
      name: selectedById.get(formId)?.form_name ?? formId,
    }));
  }

  /** Cria lead sem exigir contexto JWT — autenticação já validada pelo IntegrationKeyGuard.
   *
   * Deduplicação automática: se já existir um lead ativo com o mesmo telefone
   * ou e-mail para o mesmo cliente, retorna o lead existente com
   * `already_existed: true` sem criar duplicata nem disparar webhook.
   */
  async createForIntegration(
    dto: CreateLeadDto,
    facebookMetadata?: FacebookLeadMetadata,
  ) {
    this.assertPipelineStageConsistency(dto.crm_pipeline_id, dto.crm_stage_id);

    if (dto.crm_stage_id) {
      await this.assertCrmStageExistsForClient(dto.client_id, dto.crm_stage_id);
    }
    if (dto.event_interest_id) {
      await this.assertEventExistsForClient(
        dto.client_id,
        dto.event_interest_id,
      );
    }
    // Normaliza o telefone para formato padrão (XX) XXXXX-XXXX antes de salvar
    const phone = dto.phone?.trim()
      ? normalizeBrazilianPhone(dto.phone.trim())
      : null;
    const email = dto.email?.toLowerCase().trim() ?? null;

    // ── Deduplicação por telefone e/ou e-mail ────────────────────────────────
    // Compara também pelos dígitos locais para encontrar números em formatos diferentes
    const dedupeOr: Prisma.LeadWhereInput[] = [];
    if (phone) {
      const existingByPhone = await this.findLeadByPhone(dto.client_id, phone);
      if (existingByPhone) {
        return this.mergeExistingLeadOnIntegration(
          existingByPhone,
          dto,
          facebookMetadata,
        );
      }
      const digits = phoneDigits(phone);
      dedupeOr.push({ phone });
      if (digits.length >= 10) {
        dedupeOr.push({
          phone: { contains: digits.slice(-10), mode: "insensitive" },
        });
      }
    }

    // O telefone ativo e a identidade principal deste fluxo. O mesmo lead pode
    // preencher mais de um formulario da Meta e receber lead_ids diferentes;
    // por isso o identificador externo so vem depois da busca por telefone.
    if (facebookMetadata) {
      const existingByExternalRef = await this.prisma.lead.findFirst({
        where: {
          client_id: dto.client_id,
          deleted_at: null,
          OR: [
            { external_ref: facebookMetadata.externalRef },
            { facebook_lead_id: facebookMetadata.facebookLeadId },
          ],
        },
        select: leadSelect,
      });
      if (existingByExternalRef) {
        return this.mergeExistingLeadOnIntegration(
          existingByExternalRef as LeadWithRelations,
          dto,
          facebookMetadata,
        );
      }
    }

    if (email) dedupeOr.push({ email });

    if (dedupeOr.length > 0) {
      const existing = await this.prisma.lead.findFirst({
        where: { client_id: dto.client_id, deleted_at: null, OR: dedupeOr },
        select: leadSelect,
      });

      if (existing) {
        return this.mergeExistingLeadOnIntegration(
          existing as LeadWithRelations,
          dto,
          facebookMetadata,
        );
      }
    }

    // Somente reativa um cadastro arquivado depois de esgotar telefone e e-mail
    // ativos. Isso evita tentar restaurar uma duplicata antiga quando a mesma
    // pessoa ja possui um cadastro ativo no cliente.
    if (facebookMetadata) {
      const archivedByExternalRef = await this.prisma.lead.findFirst({
        where: {
          client_id: dto.client_id,
          deleted_at: { not: null },
          OR: [
            { external_ref: facebookMetadata.externalRef },
            { facebook_lead_id: facebookMetadata.facebookLeadId },
          ],
        },
        select: leadSelect,
      });
      if (archivedByExternalRef) {
        return this.mergeExistingLeadOnIntegration(
          archivedByExternalRef as LeadWithRelations,
          dto,
          facebookMetadata,
        );
      }
    }

    // ── Criação do novo lead ─────────────────────────────────────────────────
    const confirmationStatus = await this.resolveStatusForStageAssignment(
      dto.client_id,
      dto.crm_stage_id,
      dto.confirmation_status,
    );

    let lead: LeadWithRelations;
    try {
      lead = (await this.prisma.lead.create({
        data: {
          client_id: dto.client_id,
          name: dto.name.trim(),
          email,
          phone,
          source: dto.source,
          tags: dto.tags ?? [],
          event_interest_id: dto.event_interest_id ?? null,
          crm_pipeline_id: dto.crm_pipeline_id ?? null,
          crm_stage_id: dto.crm_stage_id ?? null,
          confirmation_status: confirmationStatus,
          notes: dto.notes?.trim() ?? null,
          birth_date: dto.birth_date ? new Date(dto.birth_date) : null,
          vehicle_plate: dto.vehicle_plate?.trim() ?? null,
          vehicle_model: dto.vehicle_model?.trim() ?? null,
          vehicle_year: dto.vehicle_year?.trim() ?? null,
          ...(facebookMetadata
            ? {
                external_ref: facebookMetadata.externalRef,
                facebook_lead_id: facebookMetadata.facebookLeadId,
                facebook_form_id: facebookMetadata.facebookFormId,
                facebook_ad_id: facebookMetadata.facebookAdId,
                facebook_ad_name: facebookMetadata.facebookAdName,
                facebook_ad_set_id: facebookMetadata.facebookAdSetId,
                facebook_ad_set_name: facebookMetadata.facebookAdSetName,
                facebook_campaign_id: facebookMetadata.facebookCampaignId,
                facebook_campaign_name: facebookMetadata.facebookCampaignName,
                preferred_contact_channel:
                  facebookMetadata.preferredContactChannel,
                source_created_at: facebookMetadata.sourceCreatedAt,
                source_payload: facebookMetadata.sourcePayload,
              }
            : {}),
        },
        select: leadSelect,
      })) as LeadWithRelations;
    } catch (error) {
      if (facebookMetadata && isLeadExternalRefUniqueViolation(error)) {
        const existingByExternalRef = await this.prisma.lead.findFirst({
          where: {
            client_id: dto.client_id,
            external_ref: facebookMetadata.externalRef,
          },
          select: leadSelect,
        });
        if (existingByExternalRef) {
          return this.mergeExistingLeadOnIntegration(
            existingByExternalRef as LeadWithRelations,
            dto,
            facebookMetadata,
          );
        }
      }
      if (isLeadPhoneUniqueViolation(error)) {
        const existingByPhone = phone
          ? await this.findLeadByPhone(dto.client_id, phone)
          : null;
        if (existingByPhone) {
          return this.mergeExistingLeadOnIntegration(
            existingByPhone,
            dto,
            facebookMetadata,
          );
        }
        throw new BadRequestException(
          "Telefone ja cadastrado para este cliente",
        );
      }
      if (isLeadEmailUniqueViolation(error)) {
        const existingByEmail = email
          ? await this.findLeadByEmail(dto.client_id, email)
          : null;
        if (existingByEmail) {
          return this.mergeExistingLeadOnIntegration(
            existingByEmail,
            dto,
            facebookMetadata,
          );
        }
        throw new BadRequestException("E-mail ja cadastrado para este cliente");
      }
      throw error;
    }

    this.realtimeEvents.emitLeadUpdated(lead.client_id, {
      client_id: lead.client_id,
      lead_id: lead.id,
      action: "created",
      source: "integration",
      updated_at: lead.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: lead.client_id,
      leadId: lead.id,
      eventType: "created",
      origin: "integration",
      actorLabel: "Integração",
    });

    return { ...this.toResponse(lead), already_existed: false };
  }

  /** Quando o lead já existe na deduplicação do createForIntegration, atualiza
   *  event/pipeline/stage se o request trouxer valores e o lead ainda não tiver. */
  private async mergeExistingLeadOnIntegration(
    existing: LeadWithRelations,
    dto: CreateLeadDto,
    facebookMetadata?: FacebookLeadMetadata,
  ): Promise<ReturnType<typeof this.toResponse> & { already_existed: true }> {
    const patch: Prisma.LeadUncheckedUpdateInput = {};

    // Uma nova entrega valida do Facebook deve reativar o cadastro encontrado
    // pelo identificador externo. Sem isso, o endpoint devolvia um lead
    // arquivado que as demais rotas (listagem/PATCH) corretamente ignoravam.
    if (existing.deleted_at) {
      const activeByPhone = await this.findLeadByPhone(
        existing.client_id,
        dto.phone ?? existing.phone,
        existing.id,
      );
      if (activeByPhone) {
        return this.mergeExistingLeadOnIntegration(
          activeByPhone,
          dto,
          facebookMetadata,
        );
      }

      const activeByEmail = await this.findLeadByEmail(
        existing.client_id,
        dto.email ?? existing.email,
        existing.id,
      );
      if (activeByEmail) {
        return this.mergeExistingLeadOnIntegration(
          activeByEmail,
          dto,
          facebookMetadata,
        );
      }

      patch.deleted_at = null;
    }
    if (dto.email && !existing.email) {
      const normalizedEmail = dto.email.toLowerCase().trim();
      const activeEmailOwner = await this.findLeadByEmail(
        existing.client_id,
        normalizedEmail,
        existing.id,
      );
      if (!activeEmailOwner) {
        patch.email = normalizedEmail;
      }
    }

    if (dto.event_interest_id && !existing.event_interest_id) {
      patch.event_interest_id = dto.event_interest_id;
    }
    if (dto.crm_pipeline_id && !existing.crm_pipeline_id) {
      patch.crm_pipeline_id = dto.crm_pipeline_id;
    }
    if (dto.crm_stage_id && !existing.crm_stage_id) {
      patch.crm_stage_id = dto.crm_stage_id;
      const status = await this.resolveStatusForStageAssignment(
        existing.client_id,
        dto.crm_stage_id,
        dto.confirmation_status,
      );
      if (status) patch.confirmation_status = status;
    }
    if (dto.birth_date && !existing.birth_date) {
      patch.birth_date = new Date(dto.birth_date);
    }
    if (dto.vehicle_plate && !existing.vehicle_plate) {
      patch.vehicle_plate = dto.vehicle_plate;
    }
    if (dto.vehicle_model && !existing.vehicle_model) {
      patch.vehicle_model = dto.vehicle_model;
    }
    if (dto.vehicle_year && !existing.vehicle_year) {
      patch.vehicle_year = dto.vehicle_year;
    }

    if (facebookMetadata) {
      if (!existing.external_ref) {
        patch.external_ref = facebookMetadata.externalRef;
      }

      const incomingOccurredAt =
        facebookMetadata.sourceCreatedAt?.getTime() ?? null;
      const currentOccurredAt = existing.source_created_at?.getTime() ?? null;
      const isLatestAttribution =
        incomingOccurredAt === null ||
        currentOccurredAt === null ||
        incomingOccurredAt >= currentOccurredAt;

      if (isLatestAttribution) {
        patch.facebook_lead_id = facebookMetadata.facebookLeadId;
        if (facebookMetadata.facebookFormId) {
          patch.facebook_form_id = facebookMetadata.facebookFormId;
        }
        if (facebookMetadata.facebookAdId) {
          patch.facebook_ad_id = facebookMetadata.facebookAdId;
        }
        if (facebookMetadata.facebookAdName) {
          patch.facebook_ad_name = facebookMetadata.facebookAdName;
        }
        if (facebookMetadata.facebookAdSetId) {
          patch.facebook_ad_set_id = facebookMetadata.facebookAdSetId;
        }
        if (facebookMetadata.facebookAdSetName) {
          patch.facebook_ad_set_name = facebookMetadata.facebookAdSetName;
        }
        if (facebookMetadata.facebookCampaignId) {
          patch.facebook_campaign_id = facebookMetadata.facebookCampaignId;
        }
        if (facebookMetadata.facebookCampaignName) {
          patch.facebook_campaign_name = facebookMetadata.facebookCampaignName;
        }
        if (facebookMetadata.preferredContactChannel) {
          patch.preferred_contact_channel =
            facebookMetadata.preferredContactChannel;
        }
        if (facebookMetadata.sourceCreatedAt) {
          patch.source_created_at = facebookMetadata.sourceCreatedAt;
        }
        patch.source_payload = facebookMetadata.sourcePayload;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ...this.toResponse(existing), already_existed: true };
    }

    const updated = (await this.prisma.lead.update({
      where: { id: existing.id },
      data: patch,
      select: leadSelect,
    })) as LeadWithRelations;

    return { ...this.toResponse(updated), already_existed: true };
  }

  async getFipeDataPublic(
    plate: string,
    user?: AuthenticatedUser,
    eventId?: string,
  ) {
    if (user?.role === Role.VENDEDOR) {
      if (!user.client_id || !eventId) {
        throw new ForbiddenException(
          "Consulta FIPE não permitida para o vendedor neste evento.",
        );
      }
      const allowedEvent = await this.prisma.event.findFirst({
        where: {
          id: eventId,
          participants: { some: { client_id: user.client_id } },
          allow_vendor_fipe: true,
        },
        select: { id: true },
      });
      if (!allowedEvent) {
        throw new ForbiddenException(
          "Consulta FIPE não permitida para o vendedor neste evento.",
        );
      }
    }

    const normalized = plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!normalized || normalized.length < 7) {
      throw new BadRequestException(
        "Informe uma placa válida com pelo menos 7 caracteres. Ex: ABC1D23",
      );
    }

    const token = process.env.APIBRASIL_TOKEN;
    if (!token) {
      throw new BadRequestException(
        "A API de consulta de placas não está configurada no servidor. Adicione APIBRASIL_TOKEN no ambiente da API.",
      );
    }

    const fipe = await this.fetchFipeDataByPlate(normalized);
    if (!fipe) {
      throw new NotFoundException(
        "Veículo não encontrado para esta placa ou erro na APIBrasil.",
      );
    }
    return fipe;
  }

  async checkInByToken(user: AuthenticatedUser, token: string) {
    const checkedInAt = new Date();
    const allowedRoles = [
      Role.RECEPCAO,
      Role.VENDEDOR,
      Role.GESTOR,
    ] as string[];
    if (!allowedRoles.includes(user.role) || !user.client_id) {
      throw new ForbiddenException(
        "Apenas recepção, vendedor ou gestor podem validar convite por token",
      );
    }

    const normalized = token.trim();
    let checkinToken = normalized;
    let voucherClientId: string | null = null;

    if (looksLikeJwtCompact(normalized)) {
      const claims = verifyCheckinVoucher(
        this.checkinVoucherSecret(),
        normalized,
      );
      if (!claims) {
        throw new NotFoundException("Convite invalido ou expirado");
      }
      checkinToken = claims.t;
      voucherClientId = claims.cid;
    }

    if (voucherClientId && voucherClientId !== user.client_id) {
      throw new NotFoundException(
        "Convite invalido ou lead nao pertence a esta empresa",
      );
    }

    const encryptedToken = encryptCheckinToken(
      checkinToken,
      this.checkinVoucherSecret(),
    );

    const lead = await this.prisma.lead.findFirst({
      where: {
        checkin_token: { in: [checkinToken, encryptedToken] },
        deleted_at: null,
        client_id: user.client_id,
      },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException(
        "Convite invalido ou lead nao pertence a esta empresa",
      );
    }

    if (user.role === Role.VENDEDOR) {
      const eventId =
        lead.event_interest_id ?? lead.appointments[0]?.event_id ?? null;
      const allowedEvent = eventId
        ? await this.prisma.event.findFirst({
            where: {
              id: eventId,
              participants: { some: { client_id: user.client_id } },
              allow_vendor_checkin: true,
            },
            select: { id: true },
          })
        : null;
      if (!allowedEvent) {
        throw new ForbiddenException(
          "Check-in não permitido para o vendedor neste evento.",
        );
      }
    }

    let pipelineId = lead.crm_pipeline_id;
    if (!pipelineId) {
      const activePipeline = await this.prisma.crmPipeline.findFirst({
        where: { client_id: lead.client_id },
        select: { id: true },
      });
      pipelineId = activePipeline?.id ?? null;
    }

    let targetStageId: string | undefined = undefined;
    if (pipelineId) {
      const idBase = lead.client_id
        .replace(/-/g, "")
        .toUpperCase()
        .slice(0, 16);
      const codes = [`${idBase}_PRESENCA_CONFIRMADA`];
      const targetStage = await this.prisma.crmStage.findFirst({
        where: {
          client_id: lead.client_id,
          pipeline_id: pipelineId,
          code: { in: codes },
        },
        select: { id: true },
      });
      if (targetStage) {
        targetStageId = targetStage.id;
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        confirmation_status: ConfirmationStatus.checked_in,
        ...(targetStageId
          ? {
              crm_pipeline_id: pipelineId,
              crm_stage_id: targetStageId,
            }
          : {}),
      },
      select: leadSelect,
    });

    if (targetStageId && targetStageId !== lead.crm_stage_id) {
      await this.prisma.crmHistory.create({
        data: {
          lead_id: lead.id,
          from_stage_id: lead.crm_stage_id,
          to_stage_id: targetStageId,
          changed_by_user_id: user.sub,
          notes: "Lead chegou à loja — check-in realizado por token/voucher",
        },
      });
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        lead_id: lead.id,
        client_id: lead.client_id,
        status: {
          in: [AppointmentStatus.scheduled, AppointmentStatus.confirmed],
        },
      },
      orderBy: { created_at: "desc" },
    });

    if (appointment) {
      const completedAt = checkedInAt;
      await this.prisma.$transaction(async (tx) => {
        const updatedAppointment = await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: AppointmentStatus.completed,
            completed_at: completedAt,
          },
        });

        if (updatedAppointment.created_by_id) {
          const vendor = await tx.user.findFirst({
            where: {
              id: updatedAppointment.created_by_id,
              client_id: updatedAppointment.client_id,
              role: Role.VENDEDOR,
            },
          });
          if (vendor) {
            await this.scoreEvents.awardWithTx(tx, {
              client_id: updatedAppointment.client_id,
              vendor_id: vendor.id,
              lead_id: updatedAppointment.lead_id,
              appointment_id: updatedAppointment.id,
              kind: "checked_in",
              earned_at: completedAt,
            });
          }
        }
      });
    }

    void this.leadTimeline.record({
      clientId: updated.client_id,
      leadId: updated.id,
      eventType: "status_changed",
      origin: user.role === Role.VENDEDOR ? "vendor" : "gestor",
      fromValue: lead.confirmation_status,
      toValue: ConfirmationStatus.checked_in,
      actorId: user.sub,
      actorLabel: user.name ?? null,
      notes: "Check-in realizado por token/voucher",
      metadata: { action: "checkin", method: "token_voucher" },
      occurredAt: checkedInAt,
    });

    this.realtimeEvents.emitLeadCheckin(updated.client_id, {
      lead_id: updated.id,
      confirmation_status: updated.confirmation_status,
      checked_in_at: checkedInAt.toISOString(),
    });
    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: updated.id,
      action: "checkin",
      updated_at: updated.updated_at.toISOString(),
    });

    return this.toResponse(updated);
  }
  async callVendor(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    await this.assertLeadAccess(user, lead);

    if (!lead.assigned_vendor_id) {
      throw new BadRequestException("Lead nao tem vendedor vinculado");
    }

    const vendor = await this.prisma.user.findFirst({
      where: { id: lead.assigned_vendor_id },
      select: {
        name: true,
        sales_team_memberships: {
          select: { team: { select: { name: true } } },
          take: 1,
        },
      },
    });

    const callPayload = {
      id: `${lead.id}-${Date.now()}`,
      lead_id: lead.id,
      lead_name: lead.name,
      vendor_id: lead.assigned_vendor_id,
      vendor_name: vendor?.name || "Vendedor",
      team_name: vendor?.sales_team_memberships?.[0]?.team?.name || null,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.client.set(
        `vendor_call:${lead.client_id}:${lead.id}`,
        JSON.stringify(callPayload),
        "EX",
        120, // 2 minutos
      );
    } catch (err: unknown) {
      this.logger.error(
        `Falha ao salvar chamada de vendedor no Redis: ${this.errorMessage(err)}`,
      );
    }

    this.realtimeEvents.emitVendorCalled(lead.client_id, callPayload);

    return { success: true };
  }

  private toResponse(lead: LeadWithRelations) {
    const handoffRequired =
      lead.conversation_states?.some((cs) => cs.handoff_required) ?? false;
    const conversationId = lead.conversations?.[0]?.id ?? null;
    return {
      id: lead.id,
      client_id: lead.client_id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      tags: lead.tags,
      crm_pipeline_id: lead.crm_pipeline_id,
      crm_stage_id: lead.crm_stage_id,
      crm_stage_code: lead.crm_stage?.code ?? null,
      crm_stage_name: lead.crm_stage?.name ?? null,
      event_interest_id: lead.event_interest_id,
      event_interest_name: lead.event_interest?.name ?? null,
      event_id: lead.event_interest_id,
      team_id: lead.team_id,
      confirmation_status: lead.confirmation_status,
      confirmation_date: lead.confirmation_date,
      store_visit_datetime: lead.store_visit_datetime,
      assigned_vendor_id: lead.assigned_vendor_id,
      registered_by_id: lead.registered_by_id,
      registered_by_name: lead.registered_by?.name ?? null,
      campaign_id: lead.campaign_id,
      attendant_type: lead.attendant_type,
      attendant_user_id: lead.attendant_user_id,
      sold_by_vendor_id: lead.sold_by_vendor_id,
      notes: lead.notes,
      vehicle_plate: lead.vehicle_plate,
      vehicle_brand: lead.vehicle_brand,
      vehicle_model: lead.vehicle_model,
      vehicle_year: lead.vehicle_year,
      vehicle_fipe_value: lead.vehicle_fipe_value,
      companions: lead.companions,
      description: lead.description,
      first_name: lead.first_name,
      last_name: lead.last_name,
      birth_date: lead.birth_date,
      facebook_lead_id: lead.facebook_lead_id,
      facebook_form_id: lead.facebook_form_id,
      facebook_ad_id: lead.facebook_ad_id,
      facebook_ad_name: lead.facebook_ad_name,
      facebook_ad_set_id: lead.facebook_ad_set_id,
      facebook_ad_set_name: lead.facebook_ad_set_name,
      facebook_campaign_id: lead.facebook_campaign_id,
      facebook_campaign_name: lead.facebook_campaign_name,
      preferred_contact_channel: lead.preferred_contact_channel,
      source_created_at: lead.source_created_at,
      source_payload: lead.source_payload,
      cpf: lead.cpf ?? null,
      wristband_number: lead.wristband_number ?? null,
      crm_pipeline_code: lead.crm_pipeline?.code ?? null,
      checkin_token: lead.checkin_token
        ? decryptCheckinToken(lead.checkin_token, this.checkinVoucherSecret())
        : null,
      handoff_required: handoffRequired,
      conversation_id: conversationId,
      checkin_voucher: lead.checkin_token
        ? signCheckinVoucher(
            this.checkinVoucherSecret(),
            lead.id,
            lead.client_id,
            decryptCheckinToken(
              lead.checkin_token,
              this.checkinVoucherSecret(),
            ),
            CHECKIN_VOUCHER_TTL_SEC,
          )
        : null,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      active_appointment: lead.appointments[0]
        ? {
            id: lead.appointments[0].id,
            event_id: lead.appointments[0].event_id,
            scheduled_at: lead.appointments[0].scheduled_at,
            status: lead.appointments[0].status,
            created_by_type: lead.appointments[0].created_by_type,
            created_by_id: lead.appointments[0].created_by_id,
            completed_at: lead.appointments[0].completed_at,
            sale_id: lead.appointments[0].sale?.id ?? null,
            sale_vendor_id: lead.appointments[0].sale?.vendor_id ?? null,
          }
        : null,
    };
  }

  private isConfirmingTransition(
    lead: Pick<LeadWithRelations, "confirmation_status">,
    dto: UpdateLeadDto,
  ): boolean {
    const isTarget =
      dto.confirmation_status === ConfirmationStatus.confirmed ||
      dto.confirmation_status === ConfirmationStatus.scheduled;
    const isDifferent = lead.confirmation_status !== dto.confirmation_status;
    return isTarget && isDifferent;
  }

  private isConfirmingTransitionToStatus(
    lead: Pick<LeadWithRelations, "confirmation_status">,
    nextStatus: ConfirmationStatus | null | undefined,
  ): boolean {
    const isTarget =
      nextStatus === ConfirmationStatus.confirmed ||
      nextStatus === ConfirmationStatus.scheduled;
    const isDifferent = lead.confirmation_status !== nextStatus;
    return isTarget && isDifferent;
  }

  private mergeCheckinTokenIfConfirming(
    lead: Pick<LeadWithRelations, "checkin_token" | "confirmation_status">,
    dto: UpdateLeadDto,
    data: Prisma.LeadUncheckedUpdateInput,
  ) {
    if (!this.isConfirmingTransition(lead, dto) || lead.checkin_token) {
      return;
    }
    const raw = generateRawCheckinToken();
    data.checkin_token = encryptCheckinToken(raw, this.checkinVoucherSecret());
  }

  private mergeCheckinTokenIfConfirmingStatus(
    lead: Pick<LeadWithRelations, "checkin_token" | "confirmation_status">,
    nextStatus: ConfirmationStatus | null | undefined,
    data: Prisma.LeadUncheckedUpdateInput,
  ) {
    if (
      !this.isConfirmingTransitionToStatus(lead, nextStatus) ||
      lead.checkin_token
    ) {
      return;
    }
    const raw = generateRawCheckinToken();
    data.checkin_token = encryptCheckinToken(raw, this.checkinVoucherSecret());
  }

  /**
   * Envia o QR Code de check-in com os dados do evento via WhatsApp para o lead.
   * Chamado em "fire-and-forget" após o lead transicionar para `confirmed`.
   * Falhas não interrompem o fluxo principal — são apenas logadas.
   */
  private async notifyCheckinViaWhatsapp(
    lead: LeadWithRelations,
  ): Promise<void> {
    if (!lead.phone || !lead.checkin_token) {
      return;
    }

    try {
      const event = lead.event_interest_id
        ? await this.prisma.event.findFirst({
            where: { id: lead.event_interest_id, client_id: lead.client_id },
            select: {
              id: true,
              name: true,
              event_date: true,
              location: true,
            },
          })
        : null;

      const decrypted = decryptCheckinToken(
        lead.checkin_token,
        this.checkinVoucherSecret(),
      );

      const voucher = signCheckinVoucher(
        this.checkinVoucherSecret(),
        lead.id,
        lead.client_id,
        decrypted,
        CHECKIN_VOUCHER_TTL_SEC,
      );

      const qrPng = await generateQrPngBuffer(decrypted, {
        size: 720,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      const caption = this.buildCheckinWhatsappCaption(lead, event, voucher);

      await this.metaService.sendClientWhatsappMediaMessage({
        clientId: lead.client_id,
        to: lead.phone,
        fileBuffer: qrPng,
        filename: `checkin-${lead.id}.png`,
        mimeType: "image/png",
        caption,
      });

      this.logger.log("Check-in QR enviado via WhatsApp");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falha ao enviar QR Code de check-in via WhatsApp lead=${lead.id} client=${lead.client_id}: ${message}`,
      );
      await this.recordOperationalIssue({
        type: "QR_NOT_DELIVERED",
        severity: "critical",
        title: "QR Code não entregue",
        message,
        fingerprint: `qrcode:${lead.id}`,
        clientId: lead.client_id,
        leadId: lead.id,
        eventId: lead.event_interest_id,
      });
    }
  }

  private notifyCredentialEmailWhenScheduled(
    previousStatus: ConfirmationStatus,
    lead: LeadWithRelations,
  ): void {
    if (
      previousStatus === ConfirmationStatus.scheduled ||
      lead.confirmation_status !== ConfirmationStatus.scheduled ||
      !lead.email
    ) {
      return;
    }

    const scheduledKey = lead.store_visit_datetime
      ? lead.store_visit_datetime.toISOString()
      : "sem-data";
    void this.appointmentsService
      .sendEventCredentialEmailForAutomation(
        lead.id,
        `lead-scheduled-email:${lead.id}:${scheduledKey}`,
      )
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Falha ao enviar credencial por e-mail lead=${lead.id} client=${lead.client_id}: ${message}`,
        );
        await this.recordOperationalIssue({
          type: "CREDENTIAL_EMAIL_NOT_DELIVERED",
          severity: "warning",
          title: "Credencial não entregue por e-mail",
          message,
          fingerprint: `credential-email:${lead.id}:${scheduledKey}`,
          clientId: lead.client_id,
          leadId: lead.id,
          eventId: lead.event_interest_id,
        });
      });
  }

  private buildCheckinWhatsappCaption(
    lead: LeadWithRelations,
    event: {
      id: string;
      name: string;
      event_date: Date;
      location: string | null;
    } | null,
    voucher?: string,
  ): string {
    const firstName = lead.name?.trim().split(/\s+/)[0] ?? "";
    const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";

    const lines: string[] = [];
    lines.push(greeting);
    lines.push("Sua presença foi confirmada com sucesso.");
    lines.push("");

    if (event) {
      lines.push(`*${event.name}*`);
      lines.push(`Data: ${this.formatEventDateBR(event.event_date)}`);
      if (event.location?.trim()) {
        lines.push(`Local: ${event.location.trim()}`);
      }
      lines.push("");
    }

    lines.push("Apresente este QR Code na recepção para fazer seu check-in.");
    const inviteUrl = voucher ? this.buildPublicInviteUrl(voucher) : null;
    if (inviteUrl) {
      lines.push("Se preferir, abra seu convite por este link:");
      lines.push(inviteUrl);
    }
    lines.push("");
    lines.push("Te esperamos!");

    return lines.join("\n");
  }

  private formatEventDateBR(date: Date): string {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  private buildPublicInviteUrl(voucher: string): string | null {
    const raw = this.config.get<string>("FRONTEND_URL")?.split(",")[0]?.trim();
    if (!raw) return null;
    try {
      const base = new URL(raw).origin;
      return `${base}/convite?v=${encodeURIComponent(voucher)}`;
    } catch {
      const base = raw.replace(/\/+$/, "");
      return `${base}/convite?v=${encodeURIComponent(voucher)}`;
    }
  }

  /**
   * Resolve o confirmation_status ao colocar um lead numa etapa fora do fluxo de
   * "move" (criação, integração, dedupe). Respeita um status explícito do request;
   * caso contrário aplica a regra de automação (crm_stage_status_rules) do cliente.
   * Retorna undefined quando não há etapa ou regra — preservando o default/atual.
   */
  private async resolveStatusForStageAssignment(
    clientId: string,
    stageId: string | null | undefined,
    explicitStatus?: ConfirmationStatus | null,
  ): Promise<ConfirmationStatus | undefined> {
    if (explicitStatus) return explicitStatus;
    if (!stageId) return undefined;
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { settings: true },
    });
    return (
      resolveConfirmationStatusForStage(client?.settings, stageId) ?? undefined
    );
  }

  private buildGestorUpdateData(
    dto: UpdateLeadDto,
  ): Prisma.LeadUncheckedUpdateInput {
    const data: Prisma.LeadUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.email !== undefined) {
      data.email = dto.email ? dto.email.toLowerCase().trim() : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim()
        ? normalizeBrazilianPhone(dto.phone.trim())
        : null;
    }
    if (dto.source !== undefined) {
      data.source = dto.source;
    }
    if (dto.tags !== undefined) {
      data.tags = dto.tags;
    }
    if (dto.event_interest_id !== undefined) {
      data.event_interest_id = dto.event_interest_id;
    }
    if (dto.crm_pipeline_id !== undefined) {
      data.crm_pipeline_id = dto.crm_pipeline_id;
    }
    if (dto.crm_stage_id !== undefined) {
      data.crm_stage_id = dto.crm_stage_id;
    }
    if (dto.confirmation_status !== undefined) {
      data.confirmation_status = dto.confirmation_status;
    }
    if (dto.assigned_vendor_id !== undefined) {
      data.assigned_vendor_id = dto.assigned_vendor_id;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }
    if (dto.store_visit_datetime !== undefined) {
      data.store_visit_datetime = dto.store_visit_datetime
        ? new Date(dto.store_visit_datetime)
        : null;
    }
    if (dto.vehicle_plate !== undefined) {
      data.vehicle_plate = dto.vehicle_plate;
    }
    if (dto.vehicle_model !== undefined) {
      data.vehicle_model = dto.vehicle_model;
    }
    if (dto.vehicle_year !== undefined) {
      data.vehicle_year = dto.vehicle_year;
    }
    if (dto.companions !== undefined) {
      data.companions = dto.companions;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.first_name !== undefined) {
      data.first_name = dto.first_name;
    }
    if (dto.last_name !== undefined) {
      data.last_name = dto.last_name;
    }
    if (dto.birth_date !== undefined) {
      data.birth_date = dto.birth_date ? new Date(dto.birth_date) : null;
    }
    return data;
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    query: FindLeadsQueryDto,
  ): Promise<Prisma.LeadWhereInput> {
    const where: Prisma.LeadWhereInput = { deleted_at: null };

    if (user.role === Role.GESTOR) {
      if (query.client_id) {
        await this.clientsService.assertGestorOwnsClient(
          user.sub,
          query.client_id,
        );
        where.client_id = query.client_id;
      }
      // Gestor e papel global: sem client_id na query, ve leads de todas as empresas.
    } else if (user.role === Role.CLIENTE) {
      if (!user.client_id) {
        throw new ForbiddenException("Usuario sem empresa vinculada");
      }
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException("client_id invalido");
      }
      where.client_id = user.client_id;
    } else if (user.role === Role.VENDEDOR) {
      if (!user.client_id) {
        throw new ForbiddenException("Usuario sem empresa vinculada");
      }
      where.client_id = user.client_id;
      where.assigned_vendor_id = user.sub;
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException("client_id invalido");
      }
    } else if (user.role === Role.RECEPCAO) {
      if (!user.client_id) {
        throw new ForbiddenException("Usuario sem empresa vinculada");
      }
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException("client_id invalido");
      }
      where.client_id = user.client_id;
    } else {
      throw new ForbiddenException("Sem permissao");
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.confirmation_status) {
      where.confirmation_status = query.confirmation_status;
    }

    if (query.event_id) {
      where.event_interest_id = query.event_id;
    }

    if (query.unassigned_only) {
      where.assigned_vendor_id = null;
    }

    if (query.crm_stage_id) {
      where.crm_stage_id = query.crm_stage_id;
    }

    if (query.crm_stage_code || query.crm_stage_name) {
      where.crm_stage = {
        ...(query.crm_stage_code ? { code: query.crm_stage_code } : {}),
        ...(query.crm_stage_name
          ? { name: { contains: query.crm_stage_name, mode: "insensitive" } }
          : {}),
      };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ];
    }

    if (query.created_after) {
      where.created_at = { gte: new Date(query.created_after) };
    }

    if (query.updated_after) {
      where.updated_at = { gte: new Date(query.updated_after) };
    }

    return where;
  }

  private async assertCanWriteClient(
    user: AuthenticatedUser,
    clientId: string,
  ) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }

    if (
      (user.role === Role.CLIENTE ||
        user.role === Role.VENDEDOR ||
        user.role === Role.RECEPCAO) &&
      user.client_id === clientId
    ) {
      return;
    }

    throw new ForbiddenException("Sem permissao para criar lead neste cliente");
  }

  private async assertLeadAccess(
    user: AuthenticatedUser,
    lead: Pick<LeadWithRelations, "client_id" | "assigned_vendor_id">,
  ) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(
        user.sub,
        lead.client_id,
      );
      return;
    }

    if (user.role === Role.CLIENTE && user.client_id === lead.client_id) {
      return;
    }

    if (
      user.role === Role.VENDEDOR &&
      user.client_id === lead.client_id &&
      lead.assigned_vendor_id === user.sub
    ) {
      return;
    }

    if (user.role === Role.RECEPCAO && user.client_id === lead.client_id) {
      return;
    }

    throw new ForbiddenException("Sem permissao para este lead");
  }

  private buildUpdateData(
    user: AuthenticatedUser,
    dto: UpdateLeadDto,
  ): Prisma.LeadUncheckedUpdateInput {
    if (user.role === Role.RECEPCAO) {
      this.assertRecepcaoPatch(dto);
      const data: Prisma.LeadUncheckedUpdateInput = {};
      if (dto.confirmation_status !== undefined) {
        data.confirmation_status = dto.confirmation_status;
      }
      return data;
    }

    if (user.role === Role.VENDEDOR) {
      this.assertVendedorPatch(dto);
      const data: Prisma.LeadUncheckedUpdateInput = {};
      if (dto.notes !== undefined) {
        data.notes = dto.notes;
      }
      if (dto.store_visit_datetime !== undefined) {
        data.store_visit_datetime = dto.store_visit_datetime
          ? new Date(dto.store_visit_datetime)
          : null;
      }
      if (dto.crm_stage_id !== undefined) {
        data.crm_stage_id = dto.crm_stage_id;
      }
      if (dto.vehicle_plate !== undefined) {
        data.vehicle_plate = dto.vehicle_plate;
      }
      if (dto.vehicle_model !== undefined) {
        data.vehicle_model = dto.vehicle_model;
      }
      if (dto.vehicle_year !== undefined) {
        data.vehicle_year = dto.vehicle_year;
      }
      if (dto.companions !== undefined) {
        data.companions = dto.companions;
      }
      if (dto.description !== undefined) {
        data.description = dto.description;
      }
      if (dto.first_name !== undefined) {
        data.first_name = dto.first_name;
      }
      if (dto.last_name !== undefined) {
        data.last_name = dto.last_name;
      }
      if (dto.birth_date !== undefined) {
        data.birth_date = dto.birth_date ? new Date(dto.birth_date) : null;
      }
      return data;
    }

    return this.buildGestorUpdateData(dto);
  }

  private assertRecepcaoPatch(dto: UpdateLeadDto) {
    const allowed: (keyof UpdateLeadDto)[] = ["confirmation_status"];
    const keys = Object.keys(dto) as (keyof UpdateLeadDto)[];
    const bad = keys.filter(
      (k) => dto[k] !== undefined && !allowed.includes(k),
    );
    if (bad.length > 0) {
      throw new BadRequestException(
        "Recepcao so pode atualizar confirmation_status",
      );
    }
  }

  private assertVendedorPatch(dto: UpdateLeadDto) {
    const allowed: (keyof UpdateLeadDto)[] = [
      "notes",
      "store_visit_datetime",
      "crm_stage_id",
      "vehicle_plate",
      "vehicle_model",
      "vehicle_year",
      "companions",
      "description",
      "first_name",
      "last_name",
      "birth_date",
    ];
    const keys = Object.keys(dto) as (keyof UpdateLeadDto)[];
    const bad = keys.filter(
      (k) => dto[k] !== undefined && !allowed.includes(k),
    );
    if (bad.length > 0) {
      throw new BadRequestException(
        "Vendedor so pode atualizar notas, confirmacao, visita, etapa do CRM, placa, modelo, ano, acompanhantes, descricao, nome, sobrenome e data de nascimento",
      );
    }
  }

  private escapeCsv(value: unknown) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
          continue;
        }
        if (ch === '"') {
          inQuotes = false;
          continue;
        }
        cell += ch;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        row.push(cell);
        cell = "";
        continue;
      }
      if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter((r) => r.some((value) => value.trim().length > 0));
  }

  private async parseImportRows(file: {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
  }): Promise<string[][]> {
    const lowerName = (file.originalname ?? "").toLowerCase();
    const mime = (file.mimetype ?? "").toLowerCase();
    const isXlsx =
      lowerName.endsWith(".xlsx") ||
      mime.includes("spreadsheetml") ||
      mime.includes("application/vnd.ms-excel");

    if (isXlsx) {
      if (
        file.buffer.length < 4 ||
        file.buffer[0] !== 0x50 ||
        file.buffer[1] !== 0x4b ||
        file.buffer[2] !== 0x03 ||
        file.buffer[3] !== 0x04
      ) {
        throw new BadRequestException("Arquivo XLSX invalido.");
      }
      const sheet = await readSheet(file.buffer);
      if (sheet.length > MAX_IMPORT_ROWS + 1) {
        throw new BadRequestException(
          `A planilha excede o limite de ${MAX_IMPORT_ROWS} linhas.`,
        );
      }
      if (sheet.some((row) => row.length > MAX_IMPORT_COLUMNS)) {
        throw new BadRequestException(
          `A planilha excede o limite de ${MAX_IMPORT_COLUMNS} colunas.`,
        );
      }
      return sheet.map((row) =>
        row.map((cell) =>
          cell instanceof Date ? cell.toISOString() : String(cell ?? ""),
        ),
      );
    }

    const text = file.buffer.toString("utf8");
    const rows = this.parseCsv(text);
    if (rows.length > MAX_IMPORT_ROWS + 1) {
      throw new BadRequestException(
        `O CSV excede o limite de ${MAX_IMPORT_ROWS} linhas.`,
      );
    }
    if (rows.some((row) => row.length > MAX_IMPORT_COLUMNS)) {
      throw new BadRequestException(
        `O CSV excede o limite de ${MAX_IMPORT_COLUMNS} colunas.`,
      );
    }
    return rows;
  }

  private normalizeSource(value: string): Lead["source"] | null {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "manual" ||
      normalized === "facebook_ads" ||
      normalized === "whatsapp" ||
      normalized === "form_page" ||
      normalized === "import_excel"
    ) {
      return normalized;
    }
    return null;
  }

  private assertPipelineStageConsistency(
    pipelineId: string | null | undefined,
    stageId: string | null | undefined,
  ) {
    const hasPipeline = Boolean(pipelineId);
    const hasStage = Boolean(stageId);
    if (hasPipeline !== hasStage) {
      throw new BadRequestException(
        "crm_pipeline_id e crm_stage_id devem ser fornecidos juntos ou ambos omitidos",
      );
    }
  }

  private async assertCrmStageExistsForClient(
    clientId: string,
    stageId: string,
  ) {
    const stage = await this.prisma.crmStage.findFirst({
      where: { id: stageId, client_id: clientId },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException("Etapa de CRM invalida para este cliente");
    }
  }

  private async assertEventExistsForClient(clientId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        participants: {
          some: { client_id: clientId },
        },
      },
      select: { id: true },
    });
    if (!event) {
      await this.recordOperationalIssue({
        type: "EVENT_NOT_FOUND",
        severity: "critical",
        title: "Evento não encontrado",
        message: `O evento ${eventId} não existe ou não está vinculado ao cliente.`,
        fingerprint: `event:${clientId}:${eventId}`,
        clientId,
        eventId,
      });
      throw new BadRequestException("Evento nao encontrado para este cliente");
    }
  }

  private async recordOperationalIssue(input: {
    type: string;
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    fingerprint: string;
    clientId?: string | null;
    leadId?: string | null;
    conversationId?: string | null;
    eventId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.operationalIssue.upsert({
        where: { fingerprint: input.fingerprint },
        create: {
          type: input.type,
          severity: input.severity,
          title: input.title,
          message: input.message,
          source: "api",
          fingerprint: input.fingerprint,
          client_id: input.clientId ?? null,
          lead_id: input.leadId ?? null,
          conversation_id: input.conversationId ?? null,
          event_id: input.eventId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          status: "open",
          severity: input.severity,
          message: input.message,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          last_seen_at: new Date(),
          resolved_at: null,
          resolved_by: null,
          occurrence_count: { increment: 1 },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar exceção operacional: ${this.errorMessage(error)}`,
      );
    }
  }

  private async resolveVendorBinding(
    vendorId: string,
    eventId?: string | null,
  ) {
    const vendor = await this.prisma.user.findFirst({
      where: {
        id: vendorId,
        role: Role.VENDEDOR,
        is_active: true,
      },
      select: {
        id: true,
        client_id: true,
      },
    });

    if (!vendor?.client_id) {
      throw new BadRequestException(
        "Vendedor invalido ou sem empresa vinculada",
      );
    }

    if (!eventId) {
      return { clientId: vendor.client_id, teamId: null };
    }

    const membership = await this.prisma.salesTeamMember.findFirst({
      where: {
        user_id: vendorId,
        team: {
          event_id: eventId,
        },
      },
      select: {
        team_id: true,
      },
    });

    if (!membership) {
      throw new BadRequestException(
        "Vendedor precisa estar vinculado a um time deste evento",
      );
    }

    return { clientId: vendor.client_id, teamId: membership.team_id };
  }

  private async syncLeadVendorBinding(
    lead: Pick<
      LeadWithRelations,
      "client_id" | "event_interest_id" | "assigned_vendor_id"
    >,
    dto: UpdateLeadDto,
    data: Prisma.LeadUncheckedUpdateInput,
  ) {
    const nextAssignedVendorId =
      dto.assigned_vendor_id !== undefined
        ? dto.assigned_vendor_id
        : lead.assigned_vendor_id;
    const nextEventId =
      dto.event_interest_id !== undefined
        ? dto.event_interest_id
        : lead.event_interest_id;

    if (nextAssignedVendorId) {
      const binding = await this.resolveVendorBinding(
        nextAssignedVendorId,
        nextEventId,
      );
      if (binding.clientId !== lead.client_id) {
        throw new BadRequestException(
          "Lead so pode ser atribuido a vendedor da mesma empresa",
        );
      }
      if (nextEventId) {
        await this.assertEventExistsForClient(lead.client_id, nextEventId);
      }
      data.team_id = binding.teamId;
      return;
    }

    if (nextEventId) {
      await this.assertEventExistsForClient(lead.client_id, nextEventId);
    }

    if (
      dto.assigned_vendor_id === null ||
      dto.event_interest_id !== undefined
    ) {
      data.team_id = null;
    }
  }

  private async resolveLeadTargetClientId(
    lead: Pick<LeadWithRelations, "client_id">,
    dto: UpdateLeadDto,
  ) {
    void dto;
    return lead.client_id;
  }

  private async resolveImportClientId(
    user: AuthenticatedUser,
    clientId?: string,
  ) {
    if (user.role === Role.GESTOR) {
      if (!clientId) {
        throw new BadRequestException(
          "Gestor deve informar client_id para importacao.",
        );
      }
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return clientId;
    }

    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR) {
      if (!user.client_id) {
        throw new ForbiddenException("Usuario sem empresa vinculada");
      }
      if (clientId && clientId !== user.client_id) {
        throw new ForbiddenException("client_id invalido");
      }
      return user.client_id;
    }

    throw new ForbiddenException("Sem permissao para importar leads");
  }

  private async fetchFipeDataByPlate(plate: string): Promise<{
    brand: string;
    model: string;
    modelYear: string;
    value: string;
  } | null> {
    const token = process.env.APIBRASIL_TOKEN;
    // A APIBrasil documenta `DeviceToken` junto do Bearer. Enviamos apenas se
    // estiver configurado: as chaves antigas funcionam so com o Bearer, e
    // mandar o header vazio quebraria quem ja esta em producao.
    const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN?.trim();

    if (token) {
      try {
        const response = await fetch(
          "https://gateway.apibrasil.io/api/v2/vehicles/dados",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...(deviceToken ? { DeviceToken: deviceToken } : {}),
            },
            body: JSON.stringify({ placa: plate }),
            signal: AbortSignal.timeout(15_000),
          },
        );

        if (response.ok) {
          const rawValuePayload: unknown = await response.json();
          const raw = this.toUnknownRecord(rawValuePayload);
          // Suporta tanto respostas no nível raiz quanto objetos aninhados usados
          // pelas versões atuais e legadas da APIBrasil.
          const data =
            ["data", "dados", "veiculo", "result", "response", "fipe"]
              .map((key) => this.toUnknownRecord(raw[key]))
              .find((value) => Object.keys(value).length > 0) ?? raw;

          const brand =
            this.firstDefined(data, ["brand", "marca"]) ??
            this.firstDefined(raw, ["brand", "marca"]);
          const model =
            this.firstDefined(data, ["model", "modelo"]) ??
            this.firstDefined(raw, ["model", "modelo"]);
          const modelYear =
            this.firstDefined(data, [
              "modelYear",
              "anoModelo",
              "ano_modelo",
              "year",
              "ano",
            ]) ?? this.firstDefined(raw, ["anoModelo", "ano"]);
          const rawValue =
            this.firstDefined(data, [
              "fipeValue",
              "fipe_valor",
              "valorFipe",
              "valor_fipe",
              "valor",
              "value",
            ]) ??
            this.firstDefined(raw, [
              "fipeValue",
              "fipe_valor",
              "valorFipe",
              "valor_fipe",
              "valor",
            ]);

          if (brand && model) {
            let formattedValue = "N/A";
            if (typeof rawValue === "number") {
              formattedValue = `R$ ${rawValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            } else if (rawValue) {
              formattedValue = String(rawValue).startsWith("R$")
                ? String(rawValue)
                : `R$ ${rawValue}`;
            }

            return {
              brand: String(brand).toUpperCase(),
              model: String(model),
              modelYear: modelYear ? String(modelYear) : "N/A",
              value: formattedValue,
            };
          } else {
            this.logger.warn("APIBRASIL retornou resposta sem marca/modelo");
          }
        } else {
          const details = await response.text().catch(() => "");
          this.logger.error(
            `APIBRASIL falhou com HTTP ${response.status}: ${details.slice(0, 300)}`,
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `Erro ao consultar placa na APIBrasil: ${this.errorMessage(err)}`,
        );
      }
    } else {
      this.logger.warn("APIBRASIL_TOKEN ausente");
    }

    return null;
  }

  private async triggerFipeLookup(
    leadId: string,
    plate: string,
    currentNotes: string | null,
  ) {
    try {
      const normalized = plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (!normalized || normalized.length < 7) return;

      const fipe = await this.fetchFipeDataByPlate(normalized);
      if (!fipe) {
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: { client_id: true },
        });
        await this.recordOperationalIssue({
          type: "FIPE_FAILED",
          severity: "warning",
          title: "Falha na consulta FIPE",
          message: `A placa ${normalized} não retornou dados pela APIBrasil.`,
          fingerprint: `fipe:${leadId}:${normalized}`,
          clientId: lead?.client_id,
          leadId,
          metadata: { plate: normalized },
        });
        return;
      }

      const cleanNotes = currentNotes
        ? currentNotes
            .replace(
              /\n\n--- 🚗 Avaliação FIPE [\s\S]*?-----------------------------------\n/g,
              "",
            )
            .trim()
        : "";

      const fipeBlock = `\n\n--- 🚗 Avaliação FIPE (Automática) ---\nModelo: ${fipe.brand} ${fipe.model}\nAno: ${fipe.modelYear}\nValor FIPE estimado: ${fipe.value}\nPlaca: ${normalized}\n-----------------------------------\n`;
      const updatedNotes = (cleanNotes + fipeBlock).trim();

      const existing = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          vehicle_brand: true,
          vehicle_model: true,
          vehicle_year: true,
          vehicle_fipe_value: true,
        },
      });

      const updated = await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          notes: updatedNotes,
          vehicle_brand:
            existing?.vehicle_brand || String(fipe.brand).slice(0, 100),
          vehicle_model:
            existing?.vehicle_model || String(fipe.model).slice(0, 100),
          vehicle_year:
            existing?.vehicle_year || String(fipe.modelYear).slice(0, 50),
          vehicle_fipe_value:
            existing?.vehicle_fipe_value || String(fipe.value).slice(0, 50),
        },
        select: leadSelect,
      });

      this.realtimeEvents.emitLeadUpdated(updated.client_id, {
        client_id: updated.client_id,
        lead_id: leadId,
        action: "updated",
        updated_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        `Erro ao atualizar notas com FIPE do lead ${leadId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private toUnknownRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private firstDefined(
    record: Record<string, unknown>,
    keys: string[],
  ): unknown {
    const entriesByLowerCase = new Map(
      Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
    );
    for (const key of keys) {
      const value = record[key] ?? entriesByLowerCase.get(key.toLowerCase());
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
