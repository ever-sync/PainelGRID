import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  Lead,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { LeadTimelineService } from '../lead-timeline/lead-timeline.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ScoreEventsService } from '../score-events/score-events.service';
import { BulkMoveLeadsDto } from './dto/bulk-move-leads.dto';
import { CleanupIdempotencyDto } from './dto/cleanup-idempotency.dto';
import { CreatePipelineDto, CreatePipelineStageInputDto } from './dto/create-pipeline.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { FindPipelinesQueryDto } from './dto/find-pipelines-query.dto';
import { GetDashboardReportQueryDto } from './dto/get-dashboard-report-query.dto';
import { MoveLeadDto } from './dto/move-lead.dto';
import {
  clientIdToPipelineCode,
  clientIdToStageCode,
  getDefaultStageInputs,
  provisionDefaultCrmPipeline,
} from './default-crm-pipeline';
import { WebhookDispatchService } from './webhook-dispatch.service';
import { resolveConfirmationStatusForStage } from '../clients/client-settings';

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly webhookDispatch: WebhookDispatchService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly scoreEvents: ScoreEventsService,
    private readonly leadTimeline: LeadTimelineService,
  ) {}

  private confirmationStatusLabel(status: string) {
    if (status === 'pending') return 'Pendente';
    if (status === 'scheduled') return 'Agendado';
    if (status === 'confirmed') return 'Confirmado';
    if (status === 'cancelled') return 'Cancelado';
    if (status === 'checked_in') return 'Check-in';
    return status;
  }

  private appendAutoStatusNote(notes: string | null, status: string | null) {
    if (!status) return notes;
    const suffix = `Status automático atualizado para ${this.confirmationStatusLabel(status)} pela etapa do CRM`;
    return notes?.trim() ? `${notes.trim()}\n${suffix}` : suffix;
  }

  async getDashboardReport(query: GetDashboardReportQueryDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: query.client_id },
      select: { id: true, company_name: true, plan: true },
    });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    const [leads, stageGroups, sourceGroups] = await Promise.all([
      this.prisma.lead.findMany({
        where: { client_id: query.client_id, deleted_at: null },
        select: {
          id: true,
          name: true,
          source: true,
          tags: true,
          created_at: true,
          crm_stage: { select: { name: true } },
          campaign: { select: { name: true } },
          event_interest: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.lead.groupBy({
        by: ['crm_stage_id'],
        where: { client_id: query.client_id, deleted_at: null },
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { client_id: query.client_id, deleted_at: null },
        _count: { id: true },
      }),
    ]);

    const stageIds = stageGroups
      .map((g) => g.crm_stage_id)
      .filter((id): id is string => id !== null);

    const stageNames =
      stageIds.length > 0
        ? await this.prisma.crmStage.findMany({
            where: { id: { in: stageIds } },
            select: { id: true, name: true, display_order: true },
          })
        : [];
    const stageNameById = Object.fromEntries(stageNames.map((s) => [s.id, s.name]));

    const stageDistribution = stageGroups.map((g) => ({
      stage: g.crm_stage_id ? (stageNameById[g.crm_stage_id] ?? 'Sem etapa') : 'Sem etapa',
      count: g._count.id,
    }));

    const sourceDistribution = sourceGroups.map((g) => ({
      source: this.getLeadSourceLabel(g.source),
      count: g._count.id,
    }));

    const records = leads.map((lead) => {
      const campaignName =
        lead.campaign?.name || lead.event_interest?.name || `${client.company_name} · CRM`;
      const audience = this.classifyAudienceFromSource(lead.source);
      const primaryTag = lead.tags[0] ? lead.tags[0].replace(/_/g, ' ') : 'Padrao';
      const contentBase = this.getLeadSourceLabel(lead.source);
      const periodLabel = `${this.getWeekRangeLabel(lead.created_at)} - ${audience} - ${this.getSourceTermLabel(lead.source)}`;

      return {
        id: lead.id,
        nome: lead.name.trim(),
        campaign: campaignName,
        content: `${contentBase} - ${primaryTag}`,
        term: periodLabel,
        audience,
        stage: lead.crm_stage?.name ?? null,
      };
    });

    const campaignTotals = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.campaign] = (acc[record.campaign] ?? 0) + 1;
      return acc;
    }, {});

    const costs = Object.fromEntries(
      Object.entries(campaignTotals).map(([campaign, total]) => [
        campaign,
        { spend: 0, results: total },
      ]),
    );

    const total = leads.length;
    const convertedCount = stageDistribution.find((s) => s.stage === 'Convertido')?.count ?? 0;
    const conversionRate = total > 0 ? Number(((convertedCount / total) * 100).toFixed(1)) : 0;

    return {
      client: {
        id: client.id,
        company_name: client.company_name,
        plan: client.plan,
        status: 'active',
      },
      meta: {
        total,
        converted: convertedCount,
        conversion_rate: conversionRate,
        evento: client.company_name,
      },
      budget_total: 0,
      stage_distribution: stageDistribution,
      source_distribution: sourceDistribution,
      records,
      costs,
    };
  }

  async findPipelines(query: FindPipelinesQueryDto) {
    const pipelines = await this.prisma.crmPipeline.findMany({
      where: {
        client_id: query.client_id,
        ...(query.include_inactive ? {} : { is_active: true }),
      },
      include: {
        stages: {
          orderBy: { display_order: 'asc' },
        },
      },
      orderBy: [{ created_at: 'desc' }],
    });

    if (!query.client_id) {
      return pipelines;
    }

    const defaultCode = clientIdToPipelineCode(query.client_id);
    return pipelines.sort((left, right) => {
      if (left.code === defaultCode) return -1;
      if (right.code === defaultCode) return 1;
      return right.stages.length - left.stages.length;
    });
  }

  async findPipelineById(id: string) {
    const pipeline = await this.prisma.crmPipeline.findUnique({
      where: { id },
      include: {
        stages: { orderBy: { display_order: 'asc' } },
      },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline CRM nao encontrado');
    }

    return pipeline;
  }

  async findPipelineByCode(code: string) {
    const normalizedCode = this.normalizeCode(code);
    const pipeline = await this.prisma.crmPipeline.findUnique({
      where: { code: normalizedCode },
      include: {
        stages: { orderBy: { display_order: 'asc' } },
      },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline CRM nao encontrado para o codigo informado');
    }

    return pipeline;
  }

  async createPipeline(dto: CreatePipelineDto) {
    await this.ensureClientExists(dto.client_id);

    const stageInputs = this.buildStageInputs(dto.client_id, dto.stages);
    const explicitCodes = stageInputs
      .map((stage) => stage.code)
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizeCode(value));

    if (new Set(explicitCodes).size !== explicitCodes.length) {
      throw new BadRequestException('Existem codigos de etapa duplicados no payload');
    }

    const pipelineData: Prisma.CrmPipelineCreateInput = {
      code: dto.code
        ? await this.ensurePipelineCodeAvailable(dto.code)
        : await this.ensurePipelineCodeAvailable(clientIdToPipelineCode(dto.client_id)),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      is_active: dto.is_active ?? true,
      client: {
        connect: { id: dto.client_id },
      },
      stages: {
        create: await Promise.all(
          stageInputs.map(async (stage, index) => ({
            code: stage.code
              ? await this.ensureStageCodeAvailable(stage.code)
              : await this.generateUniqueStageCode(),
            name: stage.name.trim(),
            display_order: stage.display_order ?? index + 1,
            color: stage.color ?? '#6B7280',
            is_final_stage: stage.is_final_stage ?? false,
            client: {
              connect: { id: dto.client_id },
            },
          })),
        ),
      },
    };

    try {
      return await this.prisma.crmPipeline.create({
        data: pipelineData,
        include: {
          stages: {
            orderBy: { display_order: 'asc' },
          },
        },
      });
    } catch (error) {
      this.handlePrismaConflict(error);
    }
  }

  async findStagesByPipelineId(pipelineId: string, user?: AuthenticatedUser) {
    const pipeline = await this.ensurePipelineExists(pipelineId);
    if (user) {
      await this.assertUserCanAccessPipelineClient(user, pipeline.client_id);
    }

    return this.prisma.crmStage.findMany({
      where: { pipeline_id: pipelineId },
      orderBy: { display_order: 'asc' },
    });
  }

  async findStageByCode(code: string) {
    const normalizedCode = this.normalizeCode(code);
    const stage = await this.prisma.crmStage.findUnique({
      where: { code: normalizedCode },
      include: {
        pipeline: true,
      },
    });

    if (!stage) {
      throw new NotFoundException('Etapa CRM nao encontrada para o codigo informado');
    }

    return stage;
  }

  async createStage(pipelineId: string, dto: CreateStageDto) {
    const pipeline = await this.ensurePipelineExists(pipelineId);

    const nextDisplayOrder =
      dto.display_order ??
      (await this.prisma.crmStage.count({
        where: { pipeline_id: pipelineId },
      })) + 1;

    try {
      return await this.prisma.crmStage.create({
        data: {
          code: dto.code
            ? await this.ensureStageCodeAvailable(dto.code)
            : await this.generateUniqueStageCode(),
          name: dto.name.trim(),
          display_order: nextDisplayOrder,
          color: dto.color ?? '#6B7280',
          is_final_stage: dto.is_final_stage ?? false,
          client: {
            connect: { id: pipeline.client_id },
          },
          pipeline: {
            connect: { id: pipeline.id },
          },
        },
      });
    } catch (error) {
      this.handlePrismaConflict(error);
    }
  }

  async cleanupIdempotencyRequests(query: CleanupIdempotencyDto) {
    await this.ensureClientExists(query.client_id);

    const retentionHours = query.older_than_hours ?? 24;
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

    const deleted = await this.prisma.apiIdempotencyRequest.deleteMany({
      where: {
        client_id: query.client_id,
        created_at: { lt: cutoff },
      },
    });

    return {
      cleaned: true,
      client_id: query.client_id,
      older_than_hours: retentionHours,
      deleted_count: deleted.count,
      cutoff_iso: cutoff.toISOString(),
    };
  }

  async getLeadHistory(leadId: string, user: AuthenticatedUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, client_id: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    if (user.role === Role.GESTOR) {
      const ok = await this.prisma.client.count({
        where: { id: lead.client_id },
      });
      if (!ok) throw new ForbiddenException('Sem permissao para este lead');
    } else if (user.client_id !== lead.client_id) {
      throw new ForbiddenException('Sem permissao para este lead');
    }

    const history = await this.prisma.crmHistory.findMany({
      where: { lead_id: leadId },
      include: {
        from_stage: { select: { id: true, name: true, code: true, color: true } },
        to_stage: { select: { id: true, name: true, code: true, color: true } },
        changed_by: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    return history.map((item) => ({
      id: item.id,
      from_stage: item.from_stage
        ? {
            id: item.from_stage.id,
            name: item.from_stage.name,
            code: item.from_stage.code,
            color: item.from_stage.color,
          }
        : null,
      to_stage: {
        id: item.to_stage.id,
        name: item.to_stage.name,
        code: item.to_stage.code,
        color: item.to_stage.color,
      },
      changed_by: { id: item.changed_by.id, name: item.changed_by.name },
      notes: item.notes,
      created_at: item.created_at.toISOString(),
    }));
  }

  /** Contagem real de leads por etapa (crm_stage_id) — usada para os badges do
   * Kanban, independente de quantos cards ja carregaram no front. */
  async getLeadStageCounts(clientId: string, user?: AuthenticatedUser) {
    const where: Prisma.LeadWhereInput = { client_id: clientId, deleted_at: null };
    if (user?.role === Role.VENDEDOR) {
      where.assigned_vendor_id = user.sub;
    }

    const groups = await this.prisma.lead.groupBy({
      by: ['crm_stage_id'],
      where,
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const group of groups) {
      if (group.crm_stage_id) counts[group.crm_stage_id] = group._count._all;
    }
    return { counts };
  }

  async getLeadTimeline(leadId: string, user: AuthenticatedUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, client_id: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    if (user.role === Role.GESTOR) {
      const ok = await this.prisma.client.count({
        where: { id: lead.client_id },
      });
      if (!ok) throw new ForbiddenException('Sem permissao para este lead');
    } else if (user.client_id !== lead.client_id) {
      throw new ForbiddenException('Sem permissao para este lead');
    }

    const entries = await this.leadTimeline.listForLead(leadId);

    const stageIds = Array.from(
      new Set(
        entries
          .flatMap((entry) => [entry.from_stage_id, entry.to_stage_id])
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const actorIds = Array.from(
      new Set(
        entries.map((entry) => entry.actor_id).filter((value): value is string => Boolean(value)),
      ),
    );

    const [stages, actors] = await Promise.all([
      stageIds.length
        ? this.prisma.crmStage.findMany({
            where: { id: { in: stageIds } },
            select: { id: true, name: true, code: true, color: true },
          })
        : Promise.resolve([]),
      actorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));

    return entries.map((entry) => ({
      id: entry.id,
      event_type: entry.event_type,
      origin: entry.origin,
      from_stage: entry.from_stage_id ? (stageById.get(entry.from_stage_id) ?? null) : null,
      to_stage: entry.to_stage_id ? (stageById.get(entry.to_stage_id) ?? null) : null,
      from_value: entry.from_value,
      to_value: entry.to_value,
      actor: {
        id: entry.actor_id,
        name: entry.actor_id
          ? (actorNameById.get(entry.actor_id) ?? entry.actor_label ?? null)
          : (entry.actor_label ?? null),
      },
      notes: entry.notes,
      occurred_at: entry.occurred_at.toISOString(),
    }));
  }

  async bulkMoveLeads(dto: BulkMoveLeadsDto, movingUser: AuthenticatedUser) {
    const normalizedPipelineCode = this.normalizeCode(dto.pipeline_code);
    const normalizedStageCode = this.normalizeCode(dto.stage_code);

    const [targetPipeline, leads] = await Promise.all([
      this.prisma.crmPipeline.findFirst({
        where: { code: normalizedPipelineCode, is_active: true },
      }),
      this.prisma.lead.findMany({
        where: { id: { in: dto.lead_ids }, deleted_at: null },
        include: { client: true, crm_pipeline: true, crm_stage: true },
      }),
    ]);

    if (!targetPipeline) {
      throw new NotFoundException('Pipeline nao encontrado');
    }

    const targetStage = await this.prisma.crmStage.findFirst({
      where: {
        code: normalizedStageCode,
        pipeline_id: targetPipeline.id,
        client_id: targetPipeline.client_id,
      },
    });

    if (!targetStage) {
      throw new NotFoundException('Etapa nao encontrada no pipeline informado');
    }

    const notes = dto.notes?.trim() || null;
    const source = dto.source?.trim() || 'api';
    const destinationUrl = leads[0]?.client.webhook_url_n8n || 'internal://n8n-not-configured';

    const results: Array<{ lead_id: string; moved: boolean; reason?: string }> = [];

    for (const lead of leads) {
      await this.assertUserCanMoveLead(movingUser, lead).catch(() => {
        results.push({ lead_id: lead.id, moved: false, reason: 'forbidden' });
        return null;
      });

      const alreadyAtTarget =
        lead.crm_pipeline_id === targetPipeline.id && lead.crm_stage_id === targetStage.id;

      if (alreadyAtTarget) {
        results.push({ lead_id: lead.id, moved: false, reason: 'already_at_target' });
        continue;
      }

      if (lead.crm_stage?.is_final_stage && !dto.force) {
        results.push({ lead_id: lead.id, moved: false, reason: 'final_stage_locked' });
        continue;
      }

      if (lead.crm_stage && targetStage.display_order < lead.crm_stage.display_order) {
        this.logger.warn(
          `Bulk: movimento retrogrado ${lead.crm_stage.code} → ${targetStage.code}`,
        );
      }

      try {
        const mappedStatus = resolveConfirmationStatusForStage(
          lead.client.settings,
          targetStage.id,
        );
        const historyNotes = this.appendAutoStatusNote(notes, mappedStatus);
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              crm_pipeline: { connect: { id: targetPipeline.id } },
              crm_stage: { connect: { id: targetStage.id } },
              ...(mappedStatus ? { confirmation_status: mappedStatus } : {}),
            },
          });

          await this.reconcileAppointmentForStatus(tx, lead, mappedStatus);

          const history = await tx.crmHistory.create({
            data: {
              lead_id: lead.id,
              from_stage_id: lead.crm_stage_id,
              to_stage_id: targetStage.id,
              changed_by_user_id: movingUser.sub,
              notes: historyNotes,
            },
          });

          const webhookEvent = await tx.webhookEvent.create({
            data: {
              client_id: lead.client_id,
              event_type: 'lead.moved',
              destination_url: destinationUrl,
              payload: {
                source,
                lead_id: lead.id,
                from: {
                  pipeline_id: lead.crm_pipeline_id,
                  pipeline_code: lead.crm_pipeline?.code ?? null,
                  stage_id: lead.crm_stage_id,
                  stage_code: lead.crm_stage?.code ?? null,
                },
                to: {
                  pipeline_id: targetPipeline.id,
                  pipeline_code: targetPipeline.code,
                  stage_id: targetStage.id,
                  stage_code: targetStage.code,
                },
                changed_by_user_id: movingUser.sub,
                moved_at: new Date().toISOString(),
                notes,
              },
            },
          });

          return { history, webhookEvent };
        });

        this.logger.log(`Bulk: lead movido para ${targetStage.code}`);
        await this.webhookDispatch.enqueue(result.webhookEvent.id);
        this.realtimeEvents.emitStageChanged(lead.client_id, {
          lead_id: lead.id,
          from_stage_id: lead.crm_stage_id,
          to_stage_id: targetStage.id,
          pipeline_code: targetPipeline.code,
          stage_code: targetStage.code,
          moved_at: new Date().toISOString(),
        });
        void this.leadTimeline.record({
          clientId: lead.client_id,
          leadId: lead.id,
          eventType: 'stage_moved',
          origin: this.leadTimeline.originFromSource(source),
          fromStageId: lead.crm_stage_id,
          toStageId: targetStage.id,
          fromValue: lead.crm_stage?.code ?? null,
          toValue: targetStage.code,
          actorId: movingUser.sub,
          notes,
          metadata: { crm_history_id: result.history.id },
        });

        results.push({ lead_id: lead.id, moved: true });
      } catch {
        results.push({ lead_id: lead.id, moved: false, reason: 'error' });
      }
    }

    const notFoundIds = dto.lead_ids.filter((id) => !leads.find((l) => l.id === id));
    for (const id of notFoundIds) {
      results.push({ lead_id: id, moved: false, reason: 'not_found' });
    }

    const movedCount = results.filter((r) => r.moved).length;
    this.logger.log(
      `Bulk move finalizado: ${movedCount}/${dto.lead_ids.length} leads movidos para ${targetStage.code}`,
    );

    return {
      total: dto.lead_ids.length,
      moved: movedCount,
      skipped: dto.lead_ids.length - movedCount,
      pipeline_code: targetPipeline.code,
      stage_code: targetStage.code,
      results,
    };
  }

  async moveLeadByIntegration(leadId: string, dto: MoveLeadDto, idempotencyKey?: string) {
    const actorId = this.configService.get<string>('LEADFLOW_INTEGRATION_ACTOR_USER_ID')?.trim();
    if (!actorId) {
      throw new InternalServerErrorException(
        'Integracao externa nao configurada (LEADFLOW_INTEGRATION_ACTOR_USER_ID)',
      );
    }
    return this.moveLeadByCodes(
      leadId,
      { ...dto, source: dto.source?.trim() || 'integration' },
      actorId,
      idempotencyKey,
      undefined,
      true,
    );
  }

  /**
   * Endpoint simplificado para a IA: recebe apenas o sufixo da etapa
   * (ex: EM_CONTATO) e resolve automaticamente o pipeline_code e stage_code
   * a partir dos dados do lead.
   */
  async moveLeadBySuffix(leadId: string, stageSuffix: string, notes?: string, source?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { client_id: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    const pipelineCode = clientIdToPipelineCode(lead.client_id);
    const stageCode = clientIdToStageCode(lead.client_id, stageSuffix.toUpperCase().trim());

    this.logger.log(`Move por sufixo resolvido para a etapa ${stageCode}`);

    return this.moveLeadByIntegration(
      leadId,
      {
        pipeline_code: pipelineCode,
        stage_code: stageCode,
        notes,
        source: source || 'rubinho_ai',
      },
    );
  }

  async moveLeadByCodes(
    leadId: string,
    dto: MoveLeadDto,
    changedByUserId: string,
    idempotencyKey?: string,
    movingUser?: AuthenticatedUser,
    suppressWebhook = false,
  ) {
    const endpoint = 'crm.leads.move';
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    const normalizedPipelineCode = this.normalizeCode(dto.pipeline_code);
    const normalizedStageCode = this.normalizeCode(dto.stage_code);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: true,
        crm_pipeline: true,
        crm_stage: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    if (movingUser) {
      await this.assertUserCanMoveLead(movingUser, lead);
    }

    const changedBy = await this.prisma.user.findUnique({ where: { id: changedByUserId } });
    if (!changedBy) {
      throw new NotFoundException('Usuario responsavel pela movimentacao nao encontrado');
    }

    const targetPipeline = await this.prisma.crmPipeline.findFirst({
      where: {
        code: normalizedPipelineCode,
        client_id: lead.client_id,
        is_active: true,
      },
    });

    if (!targetPipeline) {
      throw new NotFoundException('Pipeline nao encontrado para este cliente');
    }

    const targetStage = await this.prisma.crmStage.findFirst({
      where: {
        code: normalizedStageCode,
        pipeline_id: targetPipeline.id,
        client_id: lead.client_id,
      },
    });

    if (!targetStage) {
      throw new NotFoundException('Etapa nao encontrada no pipeline informado');
    }

    this.assertValidStageTransition(lead.crm_stage, targetStage, dto.force);

    const notes = dto.notes?.trim() || null;
    const source = dto.source?.trim() || 'api';
    const requestHash = normalizedIdempotencyKey
      ? this.createMoveLeadRequestHash(
          lead.id,
          normalizedPipelineCode,
          normalizedStageCode,
          notes,
          source,
        )
      : null;
    let reservedIdempotencyKey = false;

    if (normalizedIdempotencyKey && requestHash) {
      const existingRequest = await this.prisma.apiIdempotencyRequest.findUnique({
        where: {
          client_id_endpoint_idempotency_key: {
            client_id: lead.client_id,
            endpoint,
            idempotency_key: normalizedIdempotencyKey,
          },
        },
      });

      if (existingRequest) {
        if (existingRequest.request_hash !== requestHash) {
          throw new ConflictException('Idempotency-Key ja foi utilizado com payload diferente');
        }

        if (existingRequest.response) {
          return {
            ...(existingRequest.response as Record<string, unknown>),
            idempotent_replay: true,
          };
        }

        throw new ConflictException(
          'Requisicao com este Idempotency-Key ainda esta em processamento',
        );
      }

      await this.prisma.apiIdempotencyRequest.create({
        data: {
          client_id: lead.client_id,
          endpoint,
          idempotency_key: normalizedIdempotencyKey,
          request_hash: requestHash,
        },
      });
      reservedIdempotencyKey = true;
    }

    const alreadyAtTarget =
      lead.crm_pipeline_id === targetPipeline.id && lead.crm_stage_id === targetStage.id;

    if (alreadyAtTarget) {
      const response = {
        moved: false,
        reason: 'lead_already_in_target_stage',
        lead_id: lead.id,
        pipeline_code: targetPipeline.code,
        stage_code: targetStage.code,
        idempotent_replay: false,
      };

      if (normalizedIdempotencyKey && requestHash) {
        await this.persistIdempotencyResponse(
          lead.client_id,
          endpoint,
          normalizedIdempotencyKey,
          requestHash,
          response,
        );
      }

      return response;
    }

    const shouldDispatchWebhook = !suppressWebhook && this.shouldDispatchExternalWebhook(source);
    const destinationUrl = lead.client.webhook_url_n8n || 'internal://n8n-not-configured';
    const mappedStatus = resolveConfirmationStatusForStage(lead.client.settings, targetStage.id);
    if (mappedStatus === ConfirmationStatus.scheduled || mappedStatus === ConfirmationStatus.confirmed) {
      this.assertLeadReadyForConfirmation(lead);
    }
    const historyNotes = this.appendAutoStatusNote(notes, mappedStatus);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const updatedLead = await tx.lead.update({
          where: { id: lead.id },
          data: {
            crm_pipeline: { connect: { id: targetPipeline.id } },
            crm_stage: { connect: { id: targetStage.id } },
            ...(mappedStatus ? { confirmation_status: mappedStatus } : {}),
          },
        });

        await this.reconcileAppointmentForStatus(tx, lead, mappedStatus);

        const history = await tx.crmHistory.create({
          data: {
            lead_id: lead.id,
            from_stage_id: lead.crm_stage_id,
            to_stage_id: targetStage.id,
            changed_by_user_id: changedByUserId,
            notes: historyNotes,
          },
        });

        const webhookEvent = shouldDispatchWebhook
          ? await tx.webhookEvent.create({
              data: {
                client_id: lead.client_id,
                event_type: 'lead.moved',
                destination_url: destinationUrl,
                payload: {
                  source,
                  lead_id: lead.id,
                  from: {
                    pipeline_id: lead.crm_pipeline_id,
                    pipeline_code: lead.crm_pipeline?.code ?? null,
                    stage_id: lead.crm_stage_id,
                    stage_code: lead.crm_stage?.code ?? null,
                  },
                  to: {
                    pipeline_id: targetPipeline.id,
                    pipeline_code: targetPipeline.code,
                    stage_id: targetStage.id,
                    stage_code: targetStage.code,
                  },
                  changed_by_user_id: changedByUserId,
                  moved_at: new Date().toISOString(),
                  notes,
                },
              },
            })
          : null;

        return { updatedLead, history, webhookEvent };
      });

      const response = {
        moved: true,
        lead_id: result.updatedLead.id,
        from_stage_id: lead.crm_stage_id,
        to_stage_id: targetStage.id,
        pipeline_code: targetPipeline.code,
        stage_code: targetStage.code,
        confirmation_status: result.updatedLead.confirmation_status,
        crm_history_id: result.history.id,
        webhook_event_id: result.webhookEvent?.id ?? null,
        idempotent_replay: false,
      };

      if (normalizedIdempotencyKey && requestHash) {
        await this.persistIdempotencyResponse(
          lead.client_id,
          endpoint,
          normalizedIdempotencyKey,
          requestHash,
          response,
        );
      }

      this.logger.log(
        `Lead movido de ${lead.crm_stage?.code ?? 'sem-etapa'} para ${targetStage.code}`,
      );
      void this.maybeAwardContactedScore(lead, targetStage, changedByUserId);
      if (result.webhookEvent) {
        await this.webhookDispatch.enqueue(result.webhookEvent.id);
      }
      this.realtimeEvents.emitStageChanged(lead.client_id, {
        lead_id: lead.id,
        from_stage_id: lead.crm_stage_id,
        to_stage_id: targetStage.id,
        pipeline_code: targetPipeline.code,
        stage_code: targetStage.code,
        moved_at: new Date().toISOString(),
      });
      this.realtimeEvents.emitLeadUpdated(lead.client_id, {
        client_id: lead.client_id,
        lead_id: lead.id,
        action: 'stage_changed',
        updated_at: new Date().toISOString(),
      });
      // `await`: o painel recarrega a timeline logo apos a resposta do move.
      // Se o registro fosse fire-and-forget, a movimentacao poderia nao
      // aparecer no historico recem-carregado. `record` nunca lanca.
      await this.leadTimeline.record({
        clientId: lead.client_id,
        leadId: lead.id,
        eventType: 'stage_moved',
        origin: this.leadTimeline.originFromSource(source),
        fromStageId: lead.crm_stage_id,
        toStageId: targetStage.id,
        fromValue: lead.crm_stage?.code ?? null,
        toValue: targetStage.code,
        actorId: changedByUserId,
        notes,
        metadata: { crm_history_id: result.history.id },
      });
      if (mappedStatus && mappedStatus !== lead.confirmation_status) {
        await this.leadTimeline.record({
          clientId: lead.client_id,
          leadId: lead.id,
          eventType: 'status_changed',
          origin: 'automation',
          fromValue: lead.confirmation_status,
          toValue: mappedStatus,
          notes: 'Status atualizado pela regra da etapa do CRM',
        });
      }

      return response;
    } catch (error) {
      if (normalizedIdempotencyKey && requestHash && reservedIdempotencyKey) {
        await this.clearIdempotencyReservation(lead.client_id, endpoint, normalizedIdempotencyKey);
      }

      throw error;
    }
  }

  private assertLeadReadyForConfirmation(
    lead: Pick<Lead, 'name' | 'phone' | 'event_interest_id' | 'store_visit_datetime' | 'companions' |
      'description' | 'vehicle_plate' | 'vehicle_model' | 'vehicle_year'>,
  ) {
    const missing: string[] = [];
    if (!lead.name?.trim()) missing.push('nome completo');
    if (!lead.phone?.trim()) missing.push('telefone');
    if (!lead.event_interest_id) missing.push('evento');
    if (!lead.store_visit_datetime) missing.push('data da visita');
    if (!lead.companions?.trim()) missing.push('acompanhantes');

    const description = lead.description?.trim().toLowerCase() ?? '';
    if (!description.startsWith('carro na troca:')) {
      missing.push('resposta sobre carro na troca');
    } else if (description.includes('carro na troca: sim')) {
      if (!lead.vehicle_plate?.trim()) missing.push('placa do veículo');
      if (!lead.vehicle_model?.trim()) missing.push('modelo do veículo');
      if (!lead.vehicle_year?.trim()) missing.push('ano do veículo');
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Nao e possivel mover o lead para etapa confirmada. Campos obrigatorios pendentes: ${missing.join(', ')}`,
      );
    }
  }

  private classifyAudienceFromSource(source: string) {
    if (source === 'facebook_ads' || source === 'form_page') {
      return 'Segmentado';
    }

    return 'Amplo';
  }

  private getLeadSourceLabel(source: string) {
    if (source === 'facebook_ads') return 'Facebook Ads';
    if (source === 'whatsapp') return 'WhatsApp';
    if (source === 'form_page') return 'Formulario';
    return 'Manual';
  }

  private getSourceTermLabel(source: string) {
    if (source === 'facebook_ads') return 'Campanha digital';
    if (source === 'whatsapp') return 'Base WhatsApp';
    if (source === 'form_page') return 'Landing page';
    return 'Captacao manual';
  }

  private getWeekRangeLabel(date: Date) {
    const day = date.getUTCDate();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const start = day <= 7 ? '01' : day <= 15 ? '08' : day <= 22 ? '16' : '23';
    const end = day <= 7 ? '07' : day <= 15 ? '15' : day <= 22 ? '22' : '30';

    return `${start} a ${end}/${month}`;
  }

  /** Garante o funil padrão de 18 etapas (Bitrix) para um cliente existente. */
  async ensureDefaultPipeline(clientId: string) {
    await this.ensureClientExists(clientId);
    return provisionDefaultCrmPipeline(this.prisma, clientId);
  }

  private buildStageInputs(
    clientId: string,
    stages?: CreatePipelineStageInputDto[],
  ): CreatePipelineStageInputDto[] {
    if (stages && stages.length > 0) {
      return stages;
    }

    return getDefaultStageInputs(clientId);
  }

  private async ensureClientExists(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    return client;
  }

  private async ensurePipelineExists(pipelineId: string) {
    const pipeline = await this.prisma.crmPipeline.findUnique({ where: { id: pipelineId } });

    if (!pipeline) {
      throw new NotFoundException('Pipeline CRM nao encontrado');
    }

    return pipeline;
  }

  private async assertUserCanAccessPipelineClient(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      const ok = await this.prisma.client.count({ where: { id: clientId } });
      if (!ok) {
        throw new ForbiddenException('Sem permissao para este pipeline');
      }
      return;
    }

    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) {
      if (user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissao para este pipeline');
      }
      return;
    }

    throw new ForbiddenException('Sem permissao para este pipeline');
  }

  private async assertUserCanMoveLead(user: AuthenticatedUser, lead: Lead) {
    if (user.role === Role.GESTOR) {
      const ok = await this.prisma.client.count({
        where: { id: lead.client_id },
      });
      if (!ok) {
        throw new ForbiddenException('Sem permissao para mover este lead');
      }
      return;
    }

    if (user.role === Role.CLIENTE) {
      if (user.client_id !== lead.client_id) {
        throw new ForbiddenException('Sem permissao para mover este lead');
      }
      return;
    }

    if (user.role === Role.VENDEDOR) {
      if (user.client_id !== lead.client_id || lead.assigned_vendor_id !== user.sub) {
        throw new ForbiddenException('Sem permissao para mover este lead');
      }
      return;
    }

    throw new ForbiddenException('Sem permissao para mover este lead');
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private normalizeIdempotencyKey(value?: string) {
    return value?.trim() || null;
  }

  private createMoveLeadRequestHash(
    leadId: string,
    pipelineCode: string,
    stageCode: string,
    notes: string | null,
    source: string,
  ) {
    return createHash('sha256')
      .update(JSON.stringify({ leadId, pipelineCode, stageCode, notes, source }))
      .digest('hex');
  }

  private shouldDispatchExternalWebhook(source: string) {
    const normalizedSource = source.trim().toLowerCase();
    return !['integration', 'n8n', 'webhook'].includes(normalizedSource);
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

  private async ensurePipelineCodeAvailable(code: string) {
    const normalizedCode = this.normalizeCode(code);
    const exists = await this.prisma.crmPipeline.findUnique({ where: { code: normalizedCode } });

    if (exists) {
      throw new ConflictException('Ja existe um pipeline com este codigo');
    }

    return normalizedCode;
  }

  private async ensureStageCodeAvailable(code: string) {
    const normalizedCode = this.normalizeCode(code);
    const exists = await this.prisma.crmStage.findUnique({ where: { code: normalizedCode } });

    if (exists) {
      throw new ConflictException('Ja existe uma etapa com este codigo');
    }

    return normalizedCode;
  }

  private async generateUniqueStageCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `STG-${randomBytes(4).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.crmStage.findUnique({ where: { code } });

      if (!exists) {
        return code;
      }
    }

    throw new InternalServerErrorException('Nao foi possivel gerar codigo unico de etapa');
  }

  private readonly CONTACTED_STAGE_NAMES = new Set([
    'contactado',
    'contacted',
    'contatado',
    'em contato',
  ]);

  private async maybeAwardContactedScore(
    lead: { id: string; client_id: string; assigned_vendor_id: string | null },
    toStage: { name: string },
    changedByUserId: string,
  ) {
    if (!this.CONTACTED_STAGE_NAMES.has((toStage.name ?? '').toLowerCase())) return;

    const vendorId = lead.assigned_vendor_id ?? changedByUserId;

    try {
      await this.scoreEvents.award({
        client_id: lead.client_id,
        vendor_id: vendorId,
        lead_id: lead.id,
        kind: 'contacted' as const,
      });
      this.logger.debug('Score de contato registrado');
    } catch (err) {
      this.logger.warn(`Nao foi possivel registrar score contacted: ${(err as Error).message}`);
    }
  }

  /**
   * Ponte automação de etapa → appointment + score. Mantém os dashboards do
   * evento (que leem `appointments`/`score_events`, não `confirmation_status`)
   * consistentes com o status definido pela automação de etapa do CRM.
   *
   * Escreve DIRETO na transação do move — NÃO chama AppointmentsService — para
   * evitar dependência circular (AppointmentsModule importa CrmModule) e evitar
   * loop (AppointmentsService.syncCrmStage moveria a etapa de novo).
   *
   * Idempotente: reaproveita o appointment ativo (lead, event) se já existir.
   * Sem evento vinculado (`event_interest_id`) não há como criar appointment → no-op.
   * Score só é creditado quando há vendedor atribuído (`assigned_vendor_id`).
   */
  private async reconcileAppointmentForStatus(
    tx: Prisma.TransactionClient,
    lead: {
      id: string;
      client_id: string;
      event_interest_id: string | null;
      assigned_vendor_id: string | null;
    },
    status: ConfirmationStatus | null,
  ): Promise<void> {
    if (!status || status === ConfirmationStatus.pending) return;

    const eventId = lead.event_interest_id;
    if (!eventId) return;

    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { id: true, event_date: true },
    });
    if (!event) return;

    const ACTIVE_STATUSES: AppointmentStatus[] = [
      AppointmentStatus.proposed,
      AppointmentStatus.scheduled,
      AppointmentStatus.confirmed,
      AppointmentStatus.completed,
    ];
    const existing = await tx.appointment.findFirst({
      where: { lead_id: lead.id, event_id: eventId, status: { in: ACTIVE_STATUSES } },
      orderBy: { created_at: 'desc' },
    });

    const now = new Date();

    if (status === ConfirmationStatus.cancelled) {
      if (existing) {
        await tx.appointment.update({
          where: { id: existing.id },
          data: { status: AppointmentStatus.cancelled, cancelled_at: now },
        });
      }
      return;
    }

    let appointment = existing;
    if (!appointment) {
      appointment = await tx.appointment.create({
        data: {
          client_id: lead.client_id,
          lead_id: lead.id,
          event_id: eventId,
          scheduled_at: event.event_date,
          status: AppointmentStatus.scheduled,
          channel: AppointmentChannel.internal,
          source: AppointmentSource.system,
          created_by_type: AppointmentActorType.system,
          notes: 'Criado automaticamente pela automação de etapa do CRM',
        },
      });
    }

    if (status === ConfirmationStatus.confirmed) {
      if (
        appointment.status !== AppointmentStatus.confirmed &&
        appointment.status !== AppointmentStatus.completed
      ) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: AppointmentStatus.confirmed,
            confirmed_at: appointment.confirmed_at ?? now,
          },
        });
      }
    } else if (status === ConfirmationStatus.checked_in) {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.completed,
          completed_at: appointment.completed_at ?? now,
          confirmed_at: appointment.confirmed_at ?? now,
        },
      });
    }

    const vendorId = lead.assigned_vendor_id;
    if (!vendorId) return;

    // 'scheduled' (2pts) vale para qualquer status que implique agendamento.
    await this.scoreEvents.awardWithTx(tx, {
      client_id: lead.client_id,
      vendor_id: vendorId,
      lead_id: lead.id,
      appointment_id: appointment.id,
      kind: 'scheduled',
    });
    if (status === ConfirmationStatus.checked_in) {
      await this.scoreEvents.awardWithTx(tx, {
        client_id: lead.client_id,
        vendor_id: vendorId,
        lead_id: lead.id,
        appointment_id: appointment.id,
        kind: 'checked_in',
      });
    }
  }

  private assertValidStageTransition(
    fromStage: { is_final_stage: boolean; display_order: number; code: string } | null,
    toStage: { is_final_stage: boolean; display_order: number; code: string },
    force?: boolean,
  ) {
    if (!fromStage) return;

    if (fromStage.is_final_stage && !force) {
      throw new BadRequestException(
        `Lead esta em etapa final (${fromStage.code}) e nao pode ser movido. Use force: true para reabrir.`,
      );
    }

    if (toStage.display_order < fromStage.display_order) {
      this.logger.warn(
        `Movimento retrogrado: ${fromStage.code} (ordem ${fromStage.display_order}) → ${toStage.code} (ordem ${toStage.display_order})`,
      );
    }
  }

  private handlePrismaConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Conflito de unicidade ao salvar pipeline/etapa CRM');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Registro nao encontrado ao tentar salvar pipeline/etapa CRM');
      }
    }

    throw error;
  }
}
