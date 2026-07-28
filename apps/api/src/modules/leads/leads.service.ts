import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus, ConfirmationStatus, Lead, Prisma } from '@prisma/client';
import { readSheet } from 'read-excel-file/node';
import {
  looksLikeJwtCompact,
  signCheckinVoucher,
  verifyCheckinVoucher,
} from '../../common/checkin-voucher.util';
import {
  encryptCheckinToken,
  decryptCheckinToken,
  generateRawCheckinToken,
} from '../../common/utils/crypto.util';
import { normalizeBrazilianPhone, phoneDigits } from '../../common/phone.util';
import { generateQrPngBuffer } from '../../common/qrcode.util';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { ClientWebhookService } from '../crm/client-webhook.service';
import { LeadTimelineService } from '../lead-timeline/lead-timeline.service';
import { MetaService } from '../meta/meta.service';
import { resolveConfirmationStatusForStage } from '../clients/client-settings';
import { clientIdToStageCode } from '../crm/default-crm-pipeline';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ScoreEventsService } from '../score-events/score-events.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CloseAttendanceDto } from './dto/close-attendance.dto';
import { FindLeadsQueryDto } from './dto/find-leads-query.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { IntegrationPatchLeadDto } from './dto/integration-patch-lead.dto';
import { ReconcileLeadsDto } from './dto/reconcile-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { RedisService } from '../../config/redis.service';
import {
  buildLeadPhoneCandidates,
  isLeadEmailUniqueViolation,
  isLeadPhoneUniqueViolation,
} from './lead-identity.util';

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
  attendant_type: true,
  attendant_user_id: true,
  sold_by_vendor_id: true,
  campaign_id: true,
  notes: true,
  vehicle_plate: true,
  vehicle_model: true,
  vehicle_year: true,
  companions: true,
  description: true,
  first_name: true,
  last_name: true,
  birth_date: true,
  facebook_lead_id: true,
  checkin_token: true,
  cpf: true,
  wristband_number: true,
  created_at: true,
  updated_at: true,
  crm_stage: { select: { id: true, code: true, name: true } },
  crm_pipeline: { select: { id: true, code: true } },
  event_interest: { select: { id: true, name: true } },
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
    orderBy: { last_message_at: 'desc' },
  },
  appointments: {
    orderBy: { scheduled_at: 'desc' },
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
  ) {}

  private checkinVoucherSecret(): string {
    const dedicated = this.config.get<string>('LEADFLOW_CHECKIN_VOUCHER_SECRET')?.trim();
    if (dedicated) {
      return dedicated;
    }
    return this.config.get<string>('JWT_SECRET', 'leadflow_access_secret');
  }

  private async findLeadByEmail(clientId: string, email?: string | null, excludeLeadId?: string) {
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
        ...(eventId
          ? { AND: [eventScope, exactPhoneScope] }
          : exactPhoneScope),
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
        throw new NotFoundException('Cursor de paginacao invalido');
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
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: leadSelect,
      take: take + 1,
    });

    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map((row) => this.toResponse(row)),
      page_info: {
        take,
        next_cursor: nextCursor,
        has_next_page: hasNextPage,
      },
    };
  }

  async exportCsv(user: AuthenticatedUser, query: FindLeadsQueryDto) {
    const where = await this.buildListWhere(user, query);
    const rows = await this.prisma.lead.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: leadSelect,
      take: 5_000,
    });

    const header = [
      'id',
      'client_id',
      'name',
      'email',
      'phone',
      'source',
      'crm_stage_code',
      'confirmation_status',
      'tags',
      'event_interest_name',
      'notes',
      'created_at',
    ];

    const lines = rows.map((row) =>
      [
        row.id,
        row.client_id,
        row.name,
        row.email ?? '',
        row.phone ?? '',
        row.source,
        row.crm_stage?.code ?? '',
        row.confirmation_status,
        (row.tags ?? []).join('|'),
        row.event_interest?.name ?? '',
        row.notes ?? '',
        row.created_at.toISOString(),
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
  }

  async importCsv(
    user: AuthenticatedUser,
    dto: ImportLeadsDto,
    file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo CSV ou XLSX obrigatorio.');
    }

    const targetClientId = await this.resolveImportClientId(user, dto.client_id);
    const rows = await this.parseImportRows(file);
    if (rows.length === 0) {
      throw new BadRequestException('Arquivo vazio.');
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const indexes = {
      name: header.indexOf('name'),
      email: header.indexOf('email'),
      phone: header.indexOf('phone'),
      source: header.indexOf('source'),
      tags: header.indexOf('tags'),
      notes: header.indexOf('notes'),
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
        source: Lead['source'];
        tags: string[];
        notes: string | null;
      };
      line: number;
    };

    const validRows: ImportRow[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const line = i + 1;
      const name = (row[indexes.name] ?? '').trim();
      if (!name) {
        skipped += 1;
        continue;
      }

      const sourceRaw = (row[indexes.source] ?? 'manual').trim();
      const source = this.normalizeSource(sourceRaw);
      if (!source) {
        skipped += 1;
        errors.push(`linha ${line}: source invalido (${sourceRaw})`);
        continue;
      }

      const email = (row[indexes.email] ?? '').trim().toLowerCase() || null;
      const phone = normalizeBrazilianPhone((row[indexes.phone] ?? '').trim()) || null;
      const notes = (row[indexes.notes] ?? '').trim() || null;
      const tags = (row[indexes.tags] ?? '')
        .split('|')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20);

      validRows.push({
        data: { client_id: targetClientId, name, email, phone, source, tags, notes },
        line,
      });
    }

    // Bulk phone dedup: uma query para todos os telefones de uma vez
    const phonesToCheck = validRows.map((r) => r.data.phone).filter((p): p is string => !!p);
    const existingPhones = new Set<string>();
    if (phonesToCheck.length > 0) {
      const existing = await this.prisma.lead.findMany({
        where: { client_id: targetClientId, deleted_at: null, phone: { in: phonesToCheck } },
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
        action: 'created',
        source: 'import',
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
      throw new NotFoundException('Lead nao encontrado');
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
        throw new BadRequestException('Gestor deve informar client_id para validar telefone');
      }
      await this.clientsService.assertGestorOwnsClient(user.sub, requestedClientId);
      clientId = requestedClientId;
    } else {
      clientId = user.client_id ?? null;
      if (!clientId) {
        throw new BadRequestException('Telefone deve ser validado em um cliente específico');
      }
      if (requestedClientId && requestedClientId !== clientId) {
        throw new ForbiddenException('client_id invalido');
      }
    }

    if (eventId) {
      await this.assertEventExistsForClient(clientId, eventId);
    }

    const existing = await this.findLeadByPhone(clientId, normalized, undefined, eventId);
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
    const normalizedPhone = dto.phone?.trim() ? normalizeBrazilianPhone(dto.phone.trim()) : null;

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
            ? 'Telefone ja cadastrado neste evento'
            : 'Telefone ja cadastrado para este cliente',
        );
      }
    }

    if (dto.email) {
      const emailNorm = dto.email.toLowerCase().trim();
      const existingByEmail = await this.prisma.lead.findFirst({
        where: { client_id: targetClientId, email: emailNorm, deleted_at: null },
      });
      if (existingByEmail) {
        throw new BadRequestException('E-mail ja cadastrado para este cliente');
      }
    }

    let defaultStageId = dto.crm_stage_id;
    let defaultPipelineId = dto.crm_pipeline_id;
    if (assignedVendorId && !defaultStageId && !defaultPipelineId) {
      const presencaAgendada = await this.prisma.crmStage.findFirst({
        where: {
          client_id: targetClientId,
          code: clientIdToStageCode(targetClientId, 'PRESENCA_AGENDADA'),
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
      await this.assertEventExistsForClient(targetClientId, dto.event_interest_id);
    }

    const resolvedStatus = await this.resolveStatusForStageAssignment(
      targetClientId,
      defaultStageId,
      dto.confirmation_status,
    );
    const confirmationStatus =
      resolvedStatus ??
      (assignedVendorId ? ConfirmationStatus.scheduled : ConfirmationStatus.pending);

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
            ? 'Telefone ja cadastrado neste evento'
            : 'Telefone ja cadastrado para este cliente',
        );
      }
      throw error;
    }

    const response = this.toResponse(lead);

    void this.clientWebhook.dispatch(lead.client_id, 'lead.created', {
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
      action: 'created',
      updated_at: lead.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: lead.client_id,
      leadId: lead.id,
      eventType: 'created',
      origin: 'crm',
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
      throw new NotFoundException('Lead nao encontrado');
    }

    await this.assertLeadAccess(user, lead);
    const targetClientId =
      user.role !== Role.VENDEDOR && user.role !== Role.RECEPCAO
        ? await this.resolveLeadTargetClientId(lead, dto)
        : lead.client_id;
    const nextPhone = dto.phone !== undefined ? dto.phone?.trim() : undefined;
    if (nextPhone) {
      const normalizedPhone = normalizeBrazilianPhone(nextPhone);
      const existingByPhone = await this.findLeadByPhone(targetClientId, normalizedPhone, lead.id);
      if (existingByPhone) {
        throw new BadRequestException('Telefone ja cadastrado para este cliente');
      }
    }

    const nextStageId = dto.crm_stage_id;
    if (user.role === Role.VENDEDOR && nextStageId != null && nextStageId !== lead.crm_stage_id) {
      if (!lead.crm_pipeline_id) {
        throw new BadRequestException('Lead sem pipeline CRM para trocar etapa');
      }

      const targetStage = await this.prisma.crmStage.findFirst({
        where: {
          id: nextStageId,
          client_id: lead.client_id,
          pipeline_id: lead.crm_pipeline_id,
        },
      });

      if (!targetStage) {
        throw new BadRequestException('Etapa invalida para este lead');
      }

      this.assertVendedorPatch(dto);
      const data = this.buildUpdateData(user, dto);
      const client = await this.prisma.client.findUnique({
        where: { id: lead.client_id },
        select: { settings: true },
      });
      const mappedStatus = resolveConfirmationStatusForStage(client?.settings, targetStage.id);
      if (mappedStatus) {
        data.confirmation_status = mappedStatus;
      }
      const nextStatus =
        (data.confirmation_status as ConfirmationStatus | undefined) ?? lead.confirmation_status;
      const confirming = this.isConfirmingTransitionToStatus(lead, nextStatus);
      this.mergeCheckinTokenIfConfirmingStatus(lead, nextStatus, data);
      const historyNotes =
        mappedStatus != null
          ? dto.notes?.trim()
            ? `${dto.notes.trim()}\nStatus automático atualizado pela etapa do CRM`
            : 'Status automático atualizado pela etapa do CRM'
          : dto.notes?.trim() || null;

      const { response, updated } = await this.prisma.$transaction(async (tx) => {
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
      });

      if (updated.vehicle_plate && updated.vehicle_plate !== lead.vehicle_plate) {
        void this.triggerFipeLookup(updated.id, updated.vehicle_plate, updated.notes);
      }

      void this.clientWebhook.dispatch(updated.client_id, 'lead.updated', {
        lead_id: lead.id,
        client_id: updated.client_id,
        updated_fields: Object.keys(dto),
        updated_at: new Date().toISOString(),
      });
      this.realtimeEvents.emitLeadUpdated(updated.client_id, {
        client_id: updated.client_id,
        lead_id: lead.id,
        action: 'updated',
        updated_at: new Date().toISOString(),
      });

      if (confirming) {
        void this.notifyCheckinViaWhatsapp(updated);
      }

      return response;
    }

    const data = this.buildUpdateData(user, dto);
    if (user.role !== Role.VENDEDOR && user.role !== Role.RECEPCAO) {
      await this.syncLeadVendorBinding(lead, dto, data);
    }
    const stageWasChanged = nextStageId != null && nextStageId !== lead.crm_stage_id;
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
            ? { pipeline_id: dto.crm_pipeline_id ?? lead.crm_pipeline_id ?? undefined }
            : {}),
        },
        select: { id: true, client_id: true, pipeline_id: true },
      });

      if (!targetStage) {
        throw new BadRequestException('Etapa invalida para este lead');
      }

      const client = await this.prisma.client.findUnique({
        where: { id: targetClientId },
        select: { settings: true },
      });
      const mappedStatus = resolveConfirmationStatusForStage(client?.settings, targetStage.id);
      if (mappedStatus) {
        data.confirmation_status = mappedStatus;
        stageChangedWithAutoStatus = true;
      }
    }

    const nextStatus =
      (data.confirmation_status as ConfirmationStatus | undefined) ?? lead.confirmation_status;
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
                    : 'Status automático atualizado pela etapa do CRM'
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
      void this.triggerFipeLookup(updated.id, updated.vehicle_plate, updated.notes);
    }

    const response = this.toResponse(updated);

    void this.clientWebhook.dispatch(updated.client_id, 'lead.updated', {
      lead_id: lead.id,
      client_id: updated.client_id,
      updated_fields: Object.keys(dto),
      updated_at: new Date().toISOString(),
    });
    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: lead.id,
      action: 'updated',
      updated_at: new Date().toISOString(),
    });
    if (lead.confirmation_status !== updated.confirmation_status) {
      void this.leadTimeline.record({
        clientId: updated.client_id,
        leadId: lead.id,
        eventType: 'status_changed',
        origin: 'crm',
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
        eventType: updated.assigned_vendor_id ? 'assigned' : 'unassigned',
        origin: 'crm',
        fromValue: lead.assigned_vendor_id,
        toValue: updated.assigned_vendor_id,
        actorId: user.sub,
        actorLabel: user.name ?? null,
      });
    }

    if (confirming) {
      void this.notifyCheckinViaWhatsapp(updated);
    }

    return response;
  }

  async assignToMe(user: AuthenticatedUser, id: string) {
    if (user.role !== Role.VENDEDOR || !user.client_id) {
      throw new ForbiddenException('Apenas vendedor pode assumir lead');
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
      throw new NotFoundException('Lead nao encontrado');
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
          : 'Lead ja atribuido a outro vendedor',
      );
    }

    const vendorBinding = await this.resolveVendorBinding(user.sub, lead.event_interest_id);

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
      action: 'assigned_to_vendor',
      updated_at: updated.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: updated.client_id,
      leadId: updated.id,
      eventType: 'assigned',
      origin: 'vendor',
      fromValue: lead.assigned_vendor_id,
      toValue: user.sub,
      actorId: user.sub,
      actorLabel: user.name ?? null,
    });

    return this.toResponse(updated as LeadWithRelations);
  }

  async lookupByCpfOrPhone(user: AuthenticatedUser, queryStr: string) {
    if (!queryStr || queryStr.trim().length < 3) return [];
    const cleanDigits = queryStr.replace(/\D/g, '');
    const term = queryStr.trim();

    const where: Prisma.LeadWhereInput = {
      deleted_at: null,
      OR: [
        { cpf: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
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
      orderBy: { updated_at: 'desc' },
    });

    return rows.map((row) => this.toResponse(row as LeadWithRelations));
  }

  async closeAttendance(user: AuthenticatedUser, id: string, dto: CloseAttendanceDto) {
    const wristbandNumber = dto?.wristband_number?.trim() || null;
    const cpf = dto?.cpf?.trim();
    const phone = dto?.phone?.trim();

    if (!cpf) {
      throw new BadRequestException('CPF é obrigatório.');
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
      throw new NotFoundException('Lead nao encontrado ou sem permissao');
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

    if (requiresWristband && !wristbandNumber) {
      throw new BadRequestException('Número da pulseira é obrigatório para este evento.');
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
      const idBase = lead.client_id.replace(/-/g, '').toUpperCase().slice(0, 16);
      const stage = await this.prisma.crmStage.findFirst({
        where: {
          client_id: lead.client_id,
          pipeline_id: pipelineId,
          code: { in: [`${idBase}_ATENDIMENTO_ENCERRADO`, `${idBase}_ENCERRADO`] },
        },
        select: { id: true },
      });
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
        wristband_number: wristbandNumber,
        cpf,
        phone,
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
          notes: `Atendimento encerrado. Pulseira: ${wristbandNumber}, CPF: ${cpf}`,
        },
      });
    }

    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: updated.id,
      action: 'attendance_closed',
      updated_at: updated.updated_at.toISOString(),
    });

    void this.leadTimeline.record({
      clientId: updated.client_id,
      leadId: updated.id,
      eventType: 'status_changed',
      origin: 'vendor',
      fromValue: lead.confirmation_status,
      toValue: 'closed',
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
      throw new NotFoundException('Lead nao encontrado');
    }

    await this.assertLeadAccess(user, lead);

    await this.prisma.lead.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    this.realtimeEvents.emitLeadUpdated(lead.client_id, {
      client_id: lead.client_id,
      lead_id: lead.id,
      action: 'deleted',
      updated_at: new Date().toISOString(),
    });

    return { deleted: true };
  }

  async patchLeadForIntegration(leadId: string, dto: IntegrationPatchLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deleted_at: null },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    const asUpdate = dto as unknown as UpdateLeadDto;
    const nextPhone = asUpdate.phone?.trim();
    if (nextPhone) {
      const normalizedPhone = normalizeBrazilianPhone(nextPhone);
      const existingByPhone = await this.findLeadByPhone(lead.client_id, normalizedPhone, lead.id);
      if (existingByPhone) {
        throw new BadRequestException('Telefone ja cadastrado para este cliente');
      }
    }
    const data = this.buildGestorUpdateData(asUpdate);
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
    this.mergeCheckinTokenIfConfirming(lead, asUpdate, data);

    const updated = (await this.prisma.lead.update({
      where: { id: leadId },
      data,
      select: leadSelect,
    })) as LeadWithRelations;

    if (updated.vehicle_plate && updated.vehicle_plate !== lead.vehicle_plate) {
      void this.triggerFipeLookup(updated.id, updated.vehicle_plate, updated.notes);
    }

    const response = this.toResponse(updated);

    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: lead.id,
      action: 'updated',
      source: 'integration',
      updated_at: new Date().toISOString(),
    });

    if (confirming) {
      void this.notifyCheckinViaWhatsapp(updated);
    }

    return response;
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
      let digits = (raw ?? '').replace(/\D/g, '');
      if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
      return digits.length >= 11 ? digits.slice(-11) : digits.slice(-10);
    };

    const keep = new Set(dto.keep_phones.map(toKey).filter((key) => key.length >= 10));

    const leads = await this.prisma.lead.findMany({
      where: { client_id: dto.client_id, deleted_at: null },
      select: { id: true, phone: true, source: true },
    });

    const orphanIds = leads
      .filter((lead) => {
        if (lead.source === 'manual') return false;
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
      throw new BadRequestException('client_id obrigatorio para integracao');
    }

    const where: Prisma.LeadWhereInput = { deleted_at: null, client_id: query.client_id };
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);

    if (query.source) where.source = query.source;
    if (query.confirmation_status) where.confirmation_status = query.confirmation_status;
    if (query.event_id) where.event_interest_id = query.event_id;
    if (query.crm_stage_id) where.crm_stage_id = query.crm_stage_id;
    if (query.crm_stage_code || query.crm_stage_name) {
      where.crm_stage = {
        ...(query.crm_stage_code ? { code: query.crm_stage_code } : {}),
        ...(query.crm_stage_name ? { name: { contains: query.crm_stage_name, mode: 'insensitive' } } : {}),
      };
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      // Normaliza o termo se parecer um telefone (somente dígitos)
      const normalizedPhone = /^\d+$/.test(term) ? normalizeBrazilianPhone(term) : null;
      // Extrai apenas os dígitos locais para busca parcial (ex.: "981092776")
      const digits = /^\d+$/.test(term) ? phoneDigits(term) : null;

      const phoneConditions: Prisma.LeadWhereInput[] = [
        { phone: { contains: term, mode: 'insensitive' } },
        ...(normalizedPhone
          ? [{ phone: { contains: normalizedPhone, mode: 'insensitive' as const } }]
          : []),
        ...(digits && digits.length >= 8
          ? [{ phone: { contains: digits, mode: 'insensitive' as const } }]
          : []),
      ];

      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...phoneConditions,
      ];
    }
    if (query.created_after) where.created_at = { gte: new Date(query.created_after) };
    if (query.updated_after) where.updated_at = { gte: new Date(query.updated_after) };

    let cursorRow: { id: string; created_at: Date } | null = null;
    if (query.cursor) {
      cursorRow = await this.prisma.lead.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true, created_at: true },
      });
      if (!cursorRow) throw new NotFoundException('Cursor de paginacao invalido');
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
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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

  /** Cria lead sem exigir contexto JWT — autenticação já validada pelo IntegrationKeyGuard.
   *
   * Deduplicação automática: se já existir um lead ativo com o mesmo telefone
   * ou e-mail para o mesmo cliente, retorna o lead existente com
   * `already_existed: true` sem criar duplicata nem disparar webhook.
   */
  async createForIntegration(dto: CreateLeadDto) {
    this.assertPipelineStageConsistency(dto.crm_pipeline_id, dto.crm_stage_id);

    if (dto.crm_stage_id) {
      await this.assertCrmStageExistsForClient(dto.client_id, dto.crm_stage_id);
    }
    if (dto.event_interest_id) {
      await this.assertEventExistsForClient(dto.client_id, dto.event_interest_id);
    }
    // Normaliza o telefone para formato padrão (XX) XXXXX-XXXX antes de salvar
    const phone = dto.phone?.trim() ? normalizeBrazilianPhone(dto.phone.trim()) : null;
    const email = dto.email?.toLowerCase().trim() ?? null;

    // ── Deduplicação por telefone e/ou e-mail ────────────────────────────────
    // Compara também pelos dígitos locais para encontrar números em formatos diferentes
    const dedupeOr: Prisma.LeadWhereInput[] = [];
    if (phone) {
      const existingByPhone = await this.findLeadByPhone(dto.client_id, phone);
      if (existingByPhone) {
        return this.mergeExistingLeadOnIntegration(existingByPhone, dto);
      }
      const digits = phoneDigits(phone);
      dedupeOr.push({ phone });
      if (digits.length >= 10) {
        dedupeOr.push({ phone: { contains: digits.slice(-10), mode: 'insensitive' } });
      }
    }
    if (email) dedupeOr.push({ email });

    if (dedupeOr.length > 0) {
      const existing = await this.prisma.lead.findFirst({
        where: { client_id: dto.client_id, deleted_at: null, OR: dedupeOr },
        select: leadSelect,
      });

      if (existing) {
        return this.mergeExistingLeadOnIntegration(existing as LeadWithRelations, dto);
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
        },
        select: leadSelect,
      })) as LeadWithRelations;
    } catch (error) {
      if (isLeadPhoneUniqueViolation(error)) {
        const existingByPhone = phone ? await this.findLeadByPhone(dto.client_id, phone) : null;
        if (existingByPhone) {
          return { ...this.toResponse(existingByPhone), already_existed: true };
        }
        throw new BadRequestException('Telefone ja cadastrado para este cliente');
      }
      if (isLeadEmailUniqueViolation(error)) {
        const existingByEmail = email ? await this.findLeadByEmail(dto.client_id, email) : null;
        if (existingByEmail) {
          return { ...this.toResponse(existingByEmail), already_existed: true };
        }
        throw new BadRequestException('E-mail ja cadastrado para este cliente');
      }
      throw error;
    }

    this.realtimeEvents.emitLeadUpdated(lead.client_id, {
      client_id: lead.client_id,
      lead_id: lead.id,
      action: 'created',
      source: 'integration',
      updated_at: lead.updated_at.toISOString(),
    });
    void this.leadTimeline.record({
      clientId: lead.client_id,
      leadId: lead.id,
      eventType: 'created',
      origin: 'integration',
      actorLabel: 'Integração',
    });

    return { ...this.toResponse(lead), already_existed: false };
  }

  /** Quando o lead já existe na deduplicação do createForIntegration, atualiza
   *  event/pipeline/stage se o request trouxer valores e o lead ainda não tiver. */
  private async mergeExistingLeadOnIntegration(
    existing: LeadWithRelations,
    dto: CreateLeadDto,
  ): Promise<ReturnType<typeof this.toResponse> & { already_existed: true }> {
    const patch: Prisma.LeadUncheckedUpdateInput = {};

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

  async getFipeDataPublic(plate: string) {
    const normalized = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!normalized || normalized.length < 7) {
      throw new BadRequestException('Informe uma placa válida com pelo menos 7 caracteres. Ex: ABC1D23');
    }

    const token = process.env.APIBRASIL_TOKEN;
    const deviceId = process.env.APIBRASIL_DEVICE;
    if (!token || !deviceId) {
      throw new BadRequestException(
        'A API de consulta de placas não está configurada no servidor. Adicione APIBRASIL_TOKEN e APIBRASIL_DEVICE no arquivo .env.',
      );
    }

    const fipe = await this.fetchFipeDataByPlate(normalized);
    if (!fipe) {
      throw new NotFoundException('Veículo não encontrado para esta placa ou erro na APIBrasil.');
    }
    return fipe;
  }

  async checkInByToken(user: AuthenticatedUser, token: string) {
    const allowedRoles = [Role.RECEPCAO, Role.VENDEDOR, Role.GESTOR] as string[];
    if (!allowedRoles.includes(user.role) || !user.client_id) {
      throw new ForbiddenException(
        'Apenas recepção, vendedor ou gestor podem validar convite por token',
      );
    }

    const normalized = token.trim();
    let checkinToken = normalized;
    let voucherClientId: string | null = null;

    if (looksLikeJwtCompact(normalized)) {
      const claims = verifyCheckinVoucher(this.checkinVoucherSecret(), normalized);
      if (!claims) {
        throw new NotFoundException('Convite invalido ou expirado');
      }
      checkinToken = claims.t;
      voucherClientId = claims.cid;
    }

    if (voucherClientId && voucherClientId !== user.client_id) {
      throw new NotFoundException('Convite invalido ou lead nao pertence a esta empresa');
    }

    const encryptedToken = encryptCheckinToken(checkinToken, this.checkinVoucherSecret());

    const lead = await this.prisma.lead.findFirst({
      where: {
        checkin_token: { in: [checkinToken, encryptedToken] },
        deleted_at: null,
        client_id: user.client_id,
      },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Convite invalido ou lead nao pertence a esta empresa');
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
      const idBase = lead.client_id.replace(/-/g, '').toUpperCase().slice(0, 16);
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
          notes: 'Lead chegou à loja — check-in realizado por token/voucher',
        },
      });
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        lead_id: lead.id,
        client_id: lead.client_id,
        status: { in: [AppointmentStatus.scheduled, AppointmentStatus.confirmed] },
      },
      orderBy: { created_at: 'desc' },
    });

    if (appointment) {
      const completedAt = new Date();
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
              kind: 'checked_in',
              earned_at: completedAt,
            });
          }
        }
      });
    }

    this.realtimeEvents.emitLeadCheckin(updated.client_id, {
      lead_id: updated.id,
      confirmation_status: updated.confirmation_status,
      checked_in_at: new Date().toISOString(),
    });
    this.realtimeEvents.emitLeadUpdated(updated.client_id, {
      client_id: updated.client_id,
      lead_id: updated.id,
      action: 'checkin',
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
      throw new NotFoundException('Lead nao encontrado');
    }

    await this.assertLeadAccess(user, lead);

    if (!lead.assigned_vendor_id) {
      throw new BadRequestException('Lead nao tem vendedor vinculado');
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
      vendor_name: vendor?.name || 'Vendedor',
      team_name: vendor?.sales_team_memberships?.[0]?.team?.name || null,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.client.set(
        `vendor_call:${lead.client_id}:${lead.id}`,
        JSON.stringify(callPayload),
        'EX',
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
    const handoffRequired = lead.conversation_states?.some((cs) => cs.handoff_required) ?? false;
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
      registered_by_id: null,
      registered_by_name: null,
      campaign_id: lead.campaign_id,
      attendant_type: lead.attendant_type,
      attendant_user_id: lead.attendant_user_id,
      sold_by_vendor_id: lead.sold_by_vendor_id,
      notes: lead.notes,
      vehicle_plate: lead.vehicle_plate,
      vehicle_model: lead.vehicle_model,
      vehicle_year: lead.vehicle_year,
      companions: lead.companions,
      description: lead.description,
      first_name: lead.first_name,
      last_name: lead.last_name,
      birth_date: lead.birth_date,
      facebook_lead_id: lead.facebook_lead_id,
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
            decryptCheckinToken(lead.checkin_token, this.checkinVoucherSecret()),
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
    lead: Pick<LeadWithRelations, 'confirmation_status'>,
    dto: UpdateLeadDto,
  ): boolean {
    const isTarget =
      dto.confirmation_status === ConfirmationStatus.confirmed ||
      dto.confirmation_status === ConfirmationStatus.scheduled;
    const isDifferent = lead.confirmation_status !== dto.confirmation_status;
    return isTarget && isDifferent;
  }

  private isConfirmingTransitionToStatus(
    lead: Pick<LeadWithRelations, 'confirmation_status'>,
    nextStatus: ConfirmationStatus | null | undefined,
  ): boolean {
    const isTarget =
      nextStatus === ConfirmationStatus.confirmed ||
      nextStatus === ConfirmationStatus.scheduled;
    const isDifferent = lead.confirmation_status !== nextStatus;
    return isTarget && isDifferent;
  }

  private mergeCheckinTokenIfConfirming(
    lead: Pick<LeadWithRelations, 'checkin_token' | 'confirmation_status'>,
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
    lead: Pick<LeadWithRelations, 'checkin_token' | 'confirmation_status'>,
    nextStatus: ConfirmationStatus | null | undefined,
    data: Prisma.LeadUncheckedUpdateInput,
  ) {
    if (!this.isConfirmingTransitionToStatus(lead, nextStatus) || lead.checkin_token) {
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
  private async notifyCheckinViaWhatsapp(lead: LeadWithRelations): Promise<void> {
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

      const decrypted = decryptCheckinToken(lead.checkin_token, this.checkinVoucherSecret());

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
        errorCorrectionLevel: 'M',
      });
      const caption = this.buildCheckinWhatsappCaption(lead, event, voucher);

      await this.metaService.sendClientWhatsappMediaMessage({
        clientId: lead.client_id,
        to: lead.phone,
        fileBuffer: qrPng,
        filename: `checkin-${lead.id}.png`,
        mimeType: 'image/png',
        caption,
      });

      this.logger.log('Check-in QR enviado via WhatsApp');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falha ao enviar QR Code de check-in via WhatsApp lead=${lead.id} client=${lead.client_id}: ${message}`,
      );
    }
  }

  private buildCheckinWhatsappCaption(
    lead: LeadWithRelations,
    event: { id: string; name: string; event_date: Date; location: string | null } | null,
    voucher?: string,
  ): string {
    const firstName = lead.name?.trim().split(/\s+/)[0] ?? '';
    const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';

    const lines: string[] = [];
    lines.push(greeting);
    lines.push('Sua presença foi confirmada com sucesso.');
    lines.push('');

    if (event) {
      lines.push(`*${event.name}*`);
      lines.push(`Data: ${this.formatEventDateBR(event.event_date)}`);
      if (event.location?.trim()) {
        lines.push(`Local: ${event.location.trim()}`);
      }
      lines.push('');
    }

    lines.push('Apresente este QR Code na recepção para fazer seu check-in.');
    const inviteUrl = voucher ? this.buildPublicInviteUrl(voucher) : null;
    if (inviteUrl) {
      lines.push('Se preferir, abra seu convite por este link:');
      lines.push(inviteUrl);
    }
    lines.push('');
    lines.push('Te esperamos!');

    return lines.join('\n');
  }

  private formatEventDateBR(date: Date): string {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  private buildPublicInviteUrl(voucher: string): string | null {
    const raw = this.config.get<string>('FRONTEND_URL')?.split(',')[0]?.trim();
    if (!raw) return null;
    try {
      const base = new URL(raw).origin;
      return `${base}/convite?v=${encodeURIComponent(voucher)}`;
    } catch {
      const base = raw.replace(/\/+$/, '');
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
    return resolveConfirmationStatusForStage(client?.settings, stageId) ?? undefined;
  }

  private buildGestorUpdateData(dto: UpdateLeadDto): Prisma.LeadUncheckedUpdateInput {
    const data: Prisma.LeadUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.email !== undefined) {
      data.email = dto.email ? dto.email.toLowerCase().trim() : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim() ? normalizeBrazilianPhone(dto.phone.trim()) : null;
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
        await this.clientsService.assertGestorOwnsClient(user.sub, query.client_id);
        where.client_id = query.client_id;
      } else {
        where.client = { gestor_id: user.sub };
      }
    } else if (user.role === Role.CLIENTE) {
      if (!user.client_id) {
        throw new ForbiddenException('Usuario sem empresa vinculada');
      }
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException('client_id invalido');
      }
      where.client_id = user.client_id;
    } else if (user.role === Role.VENDEDOR) {
      if (!user.client_id) {
        throw new ForbiddenException('Usuario sem empresa vinculada');
      }
      where.client_id = user.client_id;
      where.assigned_vendor_id = user.sub;
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException('client_id invalido');
      }
    } else if (user.role === Role.RECEPCAO) {
      if (!user.client_id) {
        throw new ForbiddenException('Usuario sem empresa vinculada');
      }
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException('client_id invalido');
      }
      where.client_id = user.client_id;
    } else {
      throw new ForbiddenException('Sem permissao');
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
        ...(query.crm_stage_name ? { name: { contains: query.crm_stage_name, mode: 'insensitive' } } : {}),
      };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
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

  private async assertCanWriteClient(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }

    if (
      (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) &&
      user.client_id === clientId
    ) {
      return;
    }

    throw new ForbiddenException('Sem permissao para criar lead neste cliente');
  }

  private async assertLeadAccess(
    user: AuthenticatedUser,
    lead: Pick<LeadWithRelations, 'client_id' | 'assigned_vendor_id'>,
  ) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, lead.client_id);
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

    throw new ForbiddenException('Sem permissao para este lead');
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
    const allowed: (keyof UpdateLeadDto)[] = ['confirmation_status'];
    const keys = Object.keys(dto) as (keyof UpdateLeadDto)[];
    const bad = keys.filter((k) => dto[k] !== undefined && !allowed.includes(k));
    if (bad.length > 0) {
      throw new BadRequestException('Recepcao so pode atualizar confirmation_status');
    }
  }

  private assertVendedorPatch(dto: UpdateLeadDto) {
    const allowed: (keyof UpdateLeadDto)[] = [
      'notes',
      'store_visit_datetime',
      'crm_stage_id',
      'vehicle_plate',
      'vehicle_model',
      'vehicle_year',
      'companions',
      'description',
      'first_name',
      'last_name',
      'birth_date',
    ];
    const keys = Object.keys(dto) as (keyof UpdateLeadDto)[];
    const bad = keys.filter((k) => dto[k] !== undefined && !allowed.includes(k));
    if (bad.length > 0) {
      throw new BadRequestException(
        'Vendedor so pode atualizar notas, confirmacao, visita, etapa do CRM, placa, modelo, ano, acompanhantes, descricao, nome, sobrenome e data de nascimento',
      );
    }
  }

  private escapeCsv(value: unknown) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
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
      if (ch === ',') {
        row.push(cell);
        cell = '';
        continue;
      }
      if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      if (ch === '\r') {
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
    const lowerName = (file.originalname ?? '').toLowerCase();
    const mime = (file.mimetype ?? '').toLowerCase();
    const isXlsx =
      lowerName.endsWith('.xlsx') ||
      mime.includes('spreadsheetml') ||
      mime.includes('application/vnd.ms-excel');

    if (isXlsx) {
      if (
        file.buffer.length < 4 ||
        file.buffer[0] !== 0x50 ||
        file.buffer[1] !== 0x4b ||
        file.buffer[2] !== 0x03 ||
        file.buffer[3] !== 0x04
      ) {
        throw new BadRequestException('Arquivo XLSX invalido.');
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
          cell instanceof Date ? cell.toISOString() : String(cell ?? ''),
        ),
      );
    }

    const text = file.buffer.toString('utf8');
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

  private normalizeSource(value: string): Lead['source'] | null {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'manual' ||
      normalized === 'facebook_ads' ||
      normalized === 'whatsapp' ||
      normalized === 'form_page' ||
      normalized === 'import_excel'
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
        'crm_pipeline_id e crm_stage_id devem ser fornecidos juntos ou ambos omitidos',
      );
    }
  }

  private async assertCrmStageExistsForClient(clientId: string, stageId: string) {
    const stage = await this.prisma.crmStage.findFirst({
      where: { id: stageId, client_id: clientId },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException('Etapa de CRM invalida para este cliente');
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
      throw new BadRequestException('Evento nao encontrado para este cliente');
    }
  }

  private async resolveVendorBinding(vendorId: string, eventId?: string | null) {
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
      throw new BadRequestException('Vendedor invalido ou sem empresa vinculada');
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
      throw new BadRequestException('Vendedor precisa estar vinculado a um time deste evento');
    }

    return { clientId: vendor.client_id, teamId: membership.team_id };
  }

  private async syncLeadVendorBinding(
    lead: Pick<LeadWithRelations, 'client_id' | 'event_interest_id' | 'assigned_vendor_id'>,
    dto: UpdateLeadDto,
    data: Prisma.LeadUncheckedUpdateInput,
  ) {
    const nextAssignedVendorId =
      dto.assigned_vendor_id !== undefined ? dto.assigned_vendor_id : lead.assigned_vendor_id;
    const nextEventId =
      dto.event_interest_id !== undefined ? dto.event_interest_id : lead.event_interest_id;

    if (nextAssignedVendorId) {
      const binding = await this.resolveVendorBinding(nextAssignedVendorId, nextEventId);
      if (binding.clientId !== lead.client_id) {
        throw new BadRequestException('Lead so pode ser atribuido a vendedor da mesma empresa');
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

    if (dto.assigned_vendor_id === null || dto.event_interest_id !== undefined) {
      data.team_id = null;
    }
  }

  private async resolveLeadTargetClientId(
    lead: Pick<LeadWithRelations, 'client_id'>,
    dto: UpdateLeadDto,
  ) {
    void dto;
    return lead.client_id;
  }

  private async resolveImportClientId(user: AuthenticatedUser, clientId?: string) {
    if (user.role === Role.GESTOR) {
      if (!clientId) {
        throw new BadRequestException('Gestor deve informar client_id para importacao.');
      }
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return clientId;
    }

    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR) {
      if (!user.client_id) {
        throw new ForbiddenException('Usuario sem empresa vinculada');
      }
      if (clientId && clientId !== user.client_id) {
        throw new ForbiddenException('client_id invalido');
      }
      return user.client_id;
    }

    throw new ForbiddenException('Sem permissao para importar leads');
  }

  private async fetchFipeDataByPlate(plate: string): Promise<{ brand: string; model: string; modelYear: string; value: string } | null> {
    const token = process.env.APIBRASIL_TOKEN;
    const deviceId = process.env.APIBRASIL_DEVICE;
    
    if (token && deviceId) {
      try {
        const response = await fetch(`https://placa.apibrasil.com.br/api/v1/placa/${plate}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Device-Id': deviceId,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const rawValuePayload: unknown = await response.json();
          const raw = this.toUnknownRecord(rawValuePayload);
          // Suporta tanto respostas no nível raiz quanto objetos aninhados (dados, veiculo, result, response, fipe)
          const data =
            ['dados', 'veiculo', 'result', 'response', 'fipe']
              .map((key) => this.toUnknownRecord(raw[key]))
              .find((value) => Object.keys(value).length > 0) ?? raw;
          
          const brand =
            this.firstDefined(data, ['brand', 'marca']) ??
            this.firstDefined(raw, ['brand', 'marca']);
          const model =
            this.firstDefined(data, ['model', 'modelo']) ??
            this.firstDefined(raw, ['model', 'modelo']);
          const modelYear =
            this.firstDefined(data, ['modelYear', 'anoModelo', 'ano_modelo', 'year', 'ano']) ??
            this.firstDefined(raw, ['anoModelo', 'ano']);
          const rawValue =
            this.firstDefined(data, ['fipeValue', 'fipe_valor', 'valor', 'value']) ??
            this.firstDefined(raw, ['fipeValue', 'valor']);

          if (brand && model) {
            let formattedValue = 'N/A';
            if (typeof rawValue === 'number') {
              formattedValue = `R$ ${rawValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            } else if (rawValue) {
              formattedValue = String(rawValue).startsWith('R$') ? String(rawValue) : `R$ ${rawValue}`;
            }

            return {
              brand: String(brand).toUpperCase(),
              model: String(model),
              modelYear: modelYear ? String(modelYear) : 'N/A',
              value: formattedValue,
            };
          } else {
            this.logger.warn('APIBRASIL retornou resposta sem marca/modelo');
          }
        } else {
          this.logger.error(`APIBRASIL falhou com HTTP ${response.status}`);
        }
      } catch (err: unknown) {
        this.logger.error(`Erro ao consultar placa na APIBrasil: ${this.errorMessage(err)}`);
      }
    } else {
      this.logger.warn('APIBRASIL_TOKEN ou APIBRASIL_DEVICE ausentes');
    }
    
    return null;
  }

  private async triggerFipeLookup(leadId: string, plate: string, currentNotes: string | null) {
    try {
      const normalized = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (!normalized || normalized.length < 7) return;

      const fipe = await this.fetchFipeDataByPlate(normalized);
      if (!fipe) return;

      const cleanNotes = currentNotes
        ? currentNotes.replace(/\n\n--- 🚗 Avaliação FIPE [\s\S]*?-----------------------------------\n/g, '').trim()
        : '';

      const fipeBlock = `\n\n--- 🚗 Avaliação FIPE (Automática) ---\nModelo: ${fipe.brand} ${fipe.model}\nAno: ${fipe.modelYear}\nValor FIPE estimado: ${fipe.value}\nPlaca: ${normalized}\n-----------------------------------\n`;
      const updatedNotes = (cleanNotes + fipeBlock).trim();

      const existing = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { vehicle_model: true, vehicle_year: true },
      });

      const updated = await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          notes: updatedNotes,
          vehicle_model: existing?.vehicle_model || `${fipe.brand} ${fipe.model}`.trim().slice(0, 100),
          vehicle_year: existing?.vehicle_year || String(fipe.modelYear).slice(0, 50),
        },
        select: leadSelect,
      });

      this.realtimeEvents.emitLeadUpdated(updated.client_id, {
        client_id: updated.client_id,
        lead_id: leadId,
        action: 'updated',
        updated_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        `Erro ao atualizar notas com FIPE do lead ${leadId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private toUnknownRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private firstDefined(
    record: Record<string, unknown>,
    keys: string[],
  ): unknown {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
