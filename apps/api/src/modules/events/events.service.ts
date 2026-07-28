import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, EventStatus, Prisma } from '@prisma/client';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { CreateEventDto } from './dto/create-event.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

type EventRow = {
  id: string;
  client_id: string;
  name: string;
  event_type: string | null;
  description: string | null;
  launch_date: Date | null;
  event_date: Date;
  event_end_date: Date | null;
  event_days: Prisma.JsonValue;
  location: string | null;
  capacity: number | null;
  sales_target: number | null;
  scheduled_target: number | null;
  require_wristband: boolean;
  allow_vendor_checkin: boolean;
  allow_vendor_fipe: boolean;
  total_investment: Prisma.Decimal | null;
  paid_traffic_investment: Prisma.Decimal | null;
  status: EventStatus;
  cover_image_url: string | null;
  image_urls: string[];
  created_at: Date;
  updated_at: Date;
  participants: Array<{ client_id: string }>;
  _count: { interested_leads: number };
  appointments: Array<{ status: AppointmentStatus }>;
};

export function computeDynamicEventStatus(row: {
  status: EventStatus | string;
  launch_date?: Date | string | null;
  event_date: Date | string;
  event_end_date?: Date | string | null;
}): EventStatus {
  if (row.status === EventStatus.cancelled || row.status === 'cancelled') {
    return EventStatus.cancelled;
  }

  const now = new Date();

  // Data de início da ativação (Lançamento ou Data do Evento)
  const startDate = row.launch_date
    ? new Date(row.launch_date)
    : new Date(row.event_date);

  // Data de término (Término ou fim do dia da data do evento)
  let endDate: Date;
  if (row.event_end_date) {
    endDate = new Date(row.event_end_date);
  } else {
    const eDate = new Date(row.event_date);
    eDate.setHours(23, 59, 59, 999);
    endDate = eDate;
  }

  if (now < startDate) {
    return EventStatus.draft;
  } else if (now > endDate) {
    return EventStatus.completed;
  } else {
    return EventStatus.active;
  }
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private normalizeParticipantIds(
    dto: Pick<CreateEventDto | UpdateEventDto, 'participant_client_ids'>,
  ) {
    const ids = (dto.participant_client_ids ?? []).map((id) => id.trim()).filter(Boolean);

    return Array.from(new Set(ids));
  }

  private async assertParticipantAccess(user: AuthenticatedUser, participantIds: string[]) {
    if (participantIds.length === 0) {
      throw new ForbiddenException('Informe ao menos um cliente participante');
    }

    if (user.role === Role.GESTOR) {
      await Promise.all(
        participantIds.map((clientId) =>
          this.clientsService.assertGestorOwnsClient(user.sub, clientId),
        ),
      );
      return;
    }

    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) {
      if (!user.client_id || participantIds.some((clientId) => clientId !== user.client_id)) {
        throw new ForbiddenException('Sem permissao');
      }
      return;
    }

    throw new ForbiddenException('Sem permissao');
  }

  private eventHasParticipant(
    event: { participants: Array<{ client_id: string }> },
    clientId: string,
  ) {
    return this.getParticipantClientIds(event).includes(clientId);
  }

  private getParticipantClientIds(event: { participants: Array<{ client_id: string }> }) {
    return Array.from(
      new Set(event.participants.map((participant) => participant.client_id).filter(Boolean)),
    );
  }

  private async assertEventRead(
    user: AuthenticatedUser,
    event: { participants: Array<{ client_id: string }> },
  ) {
    if (user.role === Role.GESTOR) {
      const participantIds = this.getParticipantClientIds(event);
      const owned = await this.prisma.client.count({
        where: { gestor_id: user.sub, id: { in: participantIds } },
      });
      if (owned === 0) {
        throw new ForbiddenException('Sem permissao');
      }
      return;
    }

    if (
      (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) &&
      user.client_id &&
      this.eventHasParticipant(event, user.client_id)
    ) {
      return;
    }

    throw new ForbiddenException('Sem permissao');
  }

  private async resolveAccessibleEventClientIds(
    user: AuthenticatedUser,
    query: FindEventsQueryDto,
  ) {
    if (query.client_id) {
      if (user.role === Role.GESTOR) {
        await this.clientsService.assertGestorOwnsClient(user.sub, query.client_id);
      } else if (
        (user.role === Role.CLIENTE ||
          user.role === Role.VENDEDOR ||
          user.role === Role.RECEPCAO) &&
        user.client_id !== query.client_id
      ) {
        throw new ForbiddenException('Sem permissao');
      }

      return [query.client_id];
    }

    if (user.role === Role.GESTOR) {
      const clients = await this.clientsService.findAllForUser(user);
      return clients.map((client) => client.id);
    }

    if (user.client_id) {
      return [user.client_id];
    }

    throw new ForbiddenException('Sem permissao');
  }

  private serializeEvent(row: EventRow) {
    const confirmedCount = row.appointments.filter(
      (appointment) =>
        appointment.status === AppointmentStatus.confirmed ||
        appointment.status === AppointmentStatus.completed,
    ).length;
    const checkinCount = row.appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.completed,
    ).length;
    const participantClientIds = this.getParticipantClientIds(row);
    const dynamicStatus = computeDynamicEventStatus(row);

    if (row.id && row.status !== dynamicStatus) {
      void this.prisma.event
        .update({
          where: { id: row.id },
          data: { status: dynamicStatus },
        })
        .catch(() => {});
    }

    return {
      id: row.id,
      client_id: row.client_id,
      participant_client_ids: participantClientIds,
      name: row.name,
      event_type: row.event_type,
      description: row.description,
      launch_date: row.launch_date,
      event_date: row.event_date,
      event_end_date: row.event_end_date,
      event_days: row.event_days,
      location: row.location,
      capacity: row.capacity,
      sales_target: row.sales_target,
      scheduled_target: row.scheduled_target,
      require_wristband: row.require_wristband ?? false,
      allow_vendor_checkin: row.allow_vendor_checkin ?? true,
      allow_vendor_fipe: row.allow_vendor_fipe ?? true,
      total_investment:
        row.total_investment != null ? Number(row.total_investment) : null,
      paid_traffic_investment:
        row.paid_traffic_investment != null ? Number(row.paid_traffic_investment) : null,
      status: dynamicStatus,
      cover_image_url: row.cover_image_url,
      image_urls: row.image_urls,
      created_at: row.created_at,
      updated_at: row.updated_at,
      leads_count: row._count.interested_leads,
      confirmed_count: confirmedCount,
      checkin_count: checkinCount,
      _count: { interested_leads: row._count.interested_leads },
    };
  }

  async findAll(user: AuthenticatedUser, query: FindEventsQueryDto) {
    const clientIds = await this.resolveAccessibleEventClientIds(user, query);

    const rows = await this.prisma.event.findMany({
      where: {
        participants: {
          some: { client_id: { in: clientIds } },
        },
      },
      orderBy: { event_date: 'desc' },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    const serialized = rows.map((row) => this.serializeEvent(row));
    if (query.status) {
      return serialized.filter((item) => item.status === query.status);
    }
    return serialized;
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Evento nao encontrado');
    }

    await this.assertEventRead(user, row);
    return this.serializeEvent(row);
  }

  /**
   * Busca evento por id sem exigir contexto JWT — autenticação já validada
   * pelo IntegrationKeyGuard. Quando `clientId` é informado, valida que o
   * evento pertence (é participante) a esse cliente, retornando 404 caso
   * contrário (evita vazar eventos de outras empresas).
   */
  async findOneForIntegration(id: string, clientId?: string) {
    const row = await this.prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (clientId && !this.eventHasParticipant(row, clientId)) {
      throw new NotFoundException('Evento nao encontrado para este cliente');
    }

    return this.serializeEvent(row);
  }

  /**
   * Lista eventos de um cliente dentro de uma janela de datas.
   * Autenticação via IntegrationKeyGuard (API Key) — sem JWT.
   */
  async findForIntegration(args: {
    clientId: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }) {
    const rows = await this.prisma.event.findMany({
      where: {
        participants: {
          some: { client_id: args.clientId },
        },
        ...(args.status ? { status: args.status as never } : {}),
        ...(args.dateFrom || args.dateTo
          ? {
              event_date: {
                ...(args.dateFrom ? { gte: new Date(args.dateFrom) } : {}),
                ...(args.dateTo ? { lte: new Date(args.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { event_date: 'asc' },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    return rows.map((row) => this.serializeEvent(row));
  }

  async create(user: AuthenticatedUser, dto: CreateEventDto) {
    const participantIds = this.normalizeParticipantIds(dto);
    await this.assertParticipantAccess(user, participantIds);

    const primaryClientId = participantIds[0];
    const row = await this.prisma.event.create({
      data: {
        client_id: primaryClientId,
        name: dto.name.trim(),
        event_type: dto.event_type?.trim() || null,
        description: dto.description?.trim() || null,
        launch_date: dto.launch_date ? new Date(dto.launch_date) : null,
        event_date: new Date(dto.event_date),
        event_end_date: dto.event_end_date ? new Date(dto.event_end_date) : null,
        event_days: dto.event_days ? (dto.event_days as unknown as Prisma.InputJsonValue) : undefined,
        location: dto.location?.trim() || null,
        capacity: dto.capacity ?? null,
        sales_target: dto.sales_target ?? null,
        scheduled_target: dto.scheduled_target ?? null,
        require_wristband: dto.require_wristband ?? false,
        allow_vendor_checkin: dto.allow_vendor_checkin ?? true,
        allow_vendor_fipe: dto.allow_vendor_fipe ?? true,
        total_investment: dto.total_investment ?? null,
        paid_traffic_investment: dto.paid_traffic_investment ?? null,
        status: dto.status ?? EventStatus.draft,
        cover_image_url: dto.cover_image_url?.trim() || null,
        image_urls: dto.image_urls ?? [],
        participants: {
          create: participantIds.map((clientId) => ({ client_id: clientId })),
        },
      },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    return this.serializeEvent(row);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const participantIds =
      dto.participant_client_ids !== undefined
        ? this.normalizeParticipantIds(dto)
        : this.getParticipantClientIds(existing);

    await this.assertParticipantAccess(user, participantIds);

    const primaryClientId = participantIds[0];
    const row = await this.prisma.event.update({
      where: { id },
      data: {
        client_id: primaryClientId,
        name: dto.name?.trim(),
        event_type: dto.event_type !== undefined ? dto.event_type.trim() || null : undefined,
        description: dto.description !== undefined ? dto.description.trim() || null : undefined,
        launch_date:
          dto.launch_date !== undefined
            ? dto.launch_date
              ? new Date(dto.launch_date)
              : null
            : undefined,
        event_date: dto.event_date ? new Date(dto.event_date) : undefined,
        event_end_date:
          dto.event_end_date !== undefined
            ? dto.event_end_date
              ? new Date(dto.event_end_date)
              : null
            : undefined,
        event_days:
          dto.event_days !== undefined
            ? (dto.event_days as unknown as Prisma.InputJsonValue)
            : undefined,
        location: dto.location !== undefined ? dto.location.trim() || null : undefined,
        capacity: dto.capacity ?? undefined,
        sales_target: dto.sales_target !== undefined ? dto.sales_target : undefined,
        scheduled_target: dto.scheduled_target !== undefined ? dto.scheduled_target : undefined,
        require_wristband: dto.require_wristband !== undefined ? dto.require_wristband : undefined,
        allow_vendor_checkin:
          dto.allow_vendor_checkin !== undefined ? dto.allow_vendor_checkin : undefined,
        allow_vendor_fipe:
          dto.allow_vendor_fipe !== undefined ? dto.allow_vendor_fipe : undefined,
        total_investment:
          dto.total_investment !== undefined ? dto.total_investment : undefined,
        paid_traffic_investment:
          dto.paid_traffic_investment !== undefined ? dto.paid_traffic_investment : undefined,
        status: dto.status ?? undefined,
        cover_image_url:
          dto.cover_image_url !== undefined ? dto.cover_image_url.trim() || null : undefined,
        image_urls: dto.image_urls ?? undefined,
        participants:
          dto.participant_client_ids !== undefined
            ? {
                deleteMany: {},
                create: participantIds.map((clientId) => ({ client_id: clientId })),
              }
            : undefined,
      },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { interested_leads: { where: { deleted_at: null } } } },
        appointments: {
          select: { status: true },
        },
      },
    });

    return this.serializeEvent(row);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          select: { client_id: true },
          orderBy: { created_at: 'asc' },
        },
        _count: {
          select: { interested_leads: { where: { deleted_at: null } }, appointments: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evento nao encontrado');
    }

    await this.assertParticipantAccess(user, this.getParticipantClientIds(existing));

    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({
        where: { event_id: id },
      });

      await tx.lead.updateMany({
        where: { event_interest_id: id },
        data: { event_interest_id: null },
      });

      await tx.event.delete({ where: { id } });
    });

    return { id };
  }
}
