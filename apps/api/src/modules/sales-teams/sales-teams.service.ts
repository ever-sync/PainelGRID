import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { AddTeamMemberDto } from "./dto/add-member.dto";
import { CreateSalesTeamDto } from "./dto/create-sales-team.dto";
import { UpdateSalesTeamDto } from "./dto/update-sales-team.dto";
import { ReorderMembersDto } from "./dto/reorder-members.dto";

type EventTeamMetricsInput = {
  id: string;
  name: string;
  client_id: string;
  event_id: string | null;
  members: Array<{
    user_id: string;
    user: {
      id: string;
      name: string;
      client_id: string | null;
    };
  }>;
};

@Injectable()
export class SalesTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private getEventParticipantClientIds(event: {
    participants: Array<{ client_id: string }>;
  }) {
    return Array.from(
      new Set(
        event.participants
          .map((participant) => participant.client_id)
          .filter(Boolean),
      ),
    );
  }

  private emptyScoreBucket() {
    return {
      total_points: 0,
      assigned: 0,
      visits: 0,
      sales: 0,
      contacted: { points: 0, count: 0 },
      scheduled: { points: 0, count: 0 },
      checked_in: { points: 0, count: 0 },
      sold: { points: 0, count: 0 },
    };
  }

  /** Resolve client_id para a ação — gestor informa via query, cliente usa o próprio. */
  private resolveClientId(
    user: AuthenticatedUser,
    clientIdParam?: string,
  ): string {
    if (user.role === Role.GESTOR) {
      if (!clientIdParam)
        throw new BadRequestException("client_id obrigatório para gestor");
      return clientIdParam;
    }
    if (user.role === Role.CLIENTE) {
      if (!user.client_id)
        throw new ForbiddenException("Usuário sem empresa vinculada");
      return user.client_id;
    }
    throw new ForbiddenException("Sem permissão para gerenciar times");
  }

  /** Gestor é papel global: valida existência da empresa, não propriedade. */
  private async assertGestorOwns(_gestorId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
    });
    if (!client)
      throw new ForbiddenException("Empresa não encontrada ou sem permissão");
  }

  /** Garante que o cliente pertence à empresa. */
  private async assertClientBelongs(userId: string, clientId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, client_id: clientId },
    });
    if (!user) throw new ForbiddenException("Acesso negado a esta empresa");
  }

  private async assertAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR)
      await this.assertGestorOwns(user.sub, clientId);
    else if (user.role === Role.CLIENTE)
      await this.assertClientBelongs(user.sub, clientId);
    else throw new ForbiddenException("Sem permissão");
  }

  private async getEventForAccess(
    user: AuthenticatedUser,
    eventId: string,
    mode: "read" | "manage" = "manage",
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        client_id: true,
        participants: {
          select: { client_id: true },
        },
      },
    });
    if (!event) throw new NotFoundException("Evento não encontrado");
    if (mode === "read") {
      if (user.role === Role.GESTOR) {
        const participantIds = this.getEventParticipantClientIds(event);
        const owned = await this.prisma.client.count({
          where: { id: { in: participantIds } },
        });
        if (owned === 0) {
          throw new ForbiddenException("Acesso negado a este evento");
        }
      } else if (user.role === Role.CLIENTE || user.role === Role.RECEPCAO) {
        if (!user.client_id)
          throw new ForbiddenException("Usuário sem empresa vinculada");
        if (
          !this.getEventParticipantClientIds(event).includes(user.client_id)
        ) {
          throw new ForbiddenException("Acesso negado a este evento");
        }
      } else {
        throw new ForbiddenException("Sem permissão");
      }
    } else {
      if (user.role !== Role.GESTOR) {
        throw new ForbiddenException("Sem permissão");
      }
      const participantIds = this.getEventParticipantClientIds(event);
      const owned = await this.prisma.client.count({
        where: { id: { in: participantIds } },
      });
      if (owned !== participantIds.length) {
        throw new ForbiddenException(
          "Sem permissão para gerenciar este evento",
        );
      }
    }
    return event;
  }

  private async getTeamForAccess(user: AuthenticatedUser, teamId: string) {
    const team = await this.prisma.salesTeam.findUnique({
      where: { id: teamId },
      select: { id: true, client_id: true, event_id: true },
    });
    if (!team) throw new NotFoundException("Time não encontrado");

    if (team.event_id) {
      await this.getEventForAccess(user, team.event_id);
    } else {
      await this.assertAccess(user, team.client_id);
    }

    return team;
  }

  private async attachEventMetrics(
    eventId: string,
    teams: EventTeamMetricsInput[],
  ) {
    if (teams.length === 0) {
      return teams;
    }

    const teamIds = teams.map((team) => team.id);
    const memberIds = Array.from(
      new Set(
        teams.flatMap((team) => team.members.map((member) => member.user_id)),
      ),
    );

    const [assignedRows, scoreRows] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ["team_id", "assigned_vendor_id"],
        where: {
          deleted_at: null,
          event_interest_id: eventId,
          team_id: { in: teamIds },
          assigned_vendor_id: { in: memberIds },
        },
        _count: { _all: true },
      }),
      this.prisma.scoreEvent.findMany({
        where: {
          vendor_id: { in: memberIds },
          appointment: {
            event_id: eventId,
          },
        },
        select: {
          vendor_id: true,
          kind: true,
          points: true,
          appointment_id: true,
        },
      }),
    ]);

    const teamVendorAssigned = new Map<string, Map<string, number>>();
    assignedRows.forEach((row) => {
      if (!row.assigned_vendor_id || !row.team_id) return;
      const byVendor =
        teamVendorAssigned.get(row.team_id) ?? new Map<string, number>();
      byVendor.set(row.assigned_vendor_id, row._count._all);
      teamVendorAssigned.set(row.team_id, byVendor);
    });

    const scoreByVendor = new Map<
      string,
      ReturnType<SalesTeamsService["emptyScoreBucket"]>
    >();
    scoreRows.forEach((row) => {
      const current =
        scoreByVendor.get(row.vendor_id) ?? this.emptyScoreBucket();
      current[row.kind].count += 1;
      current[row.kind].points += Number(row.points ?? 0);
      current.total_points += Number(row.points ?? 0);
      current.visits = current.checked_in.count;
      current.sales = current.sold.count;
      scoreByVendor.set(row.vendor_id, current);
    });

    return teams.map((team) => {
      const teamScore = this.emptyScoreBucket();
      const vendorMetrics = team.members.map((member) => {
        const vendorScore =
          scoreByVendor.get(member.user_id) ?? this.emptyScoreBucket();
        const assigned =
          teamVendorAssigned.get(team.id)?.get(member.user_id) ?? 0;
        const metrics = {
          vendor_id: member.user.id,
          vendor_name: member.user.name,
          client_id: member.user.client_id,
          total_points: vendorScore.total_points,
          assigned,
          visits: vendorScore.visits,
          sales: vendorScore.sales,
          contacted: vendorScore.contacted,
          scheduled: vendorScore.scheduled,
          checked_in: vendorScore.checked_in,
          sold: vendorScore.sold,
        };

        teamScore.total_points += metrics.total_points;
        teamScore.assigned += metrics.assigned;
        teamScore.visits += metrics.visits;
        teamScore.sales += metrics.sales;
        teamScore.contacted.points += metrics.contacted.points;
        teamScore.contacted.count += metrics.contacted.count;
        teamScore.scheduled.points += metrics.scheduled.points;
        teamScore.scheduled.count += metrics.scheduled.count;
        teamScore.checked_in.points += metrics.checked_in.points;
        teamScore.checked_in.count += metrics.checked_in.count;
        teamScore.sold.points += metrics.sold.points;
        teamScore.sold.count += metrics.sold.count;

        return metrics;
      });

      return {
        ...team,
        metrics: teamScore,
        vendors: vendorMetrics.sort(
          (a, b) =>
            b.total_points - a.total_points ||
            b.sold.count - a.sold.count ||
            b.checked_in.count - a.checked_in.count ||
            a.vendor_name.localeCompare(b.vendor_name),
        ),
      };
    });
  }

  async findAll(
    user: AuthenticatedUser,
    eventIdParam?: string,
    clientIdParam?: string,
  ) {
    if (eventIdParam) {
      const event = await this.getEventForAccess(user, eventIdParam, "read");

      const teams = await this.prisma.salesTeam.findMany({
        where: { event_id: event.id },
        orderBy: { created_at: "asc" },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  client_id: true,
                  is_active: true,
                  avatar_url: true,
                  vendor_category: true,
                  vendor_categories: true,
                },
              },
            },
            orderBy: [
              { queue_position: { sort: "asc", nulls: "last" } },
              { added_at: "asc" },
            ],
          },
        },
      });

      return this.attachEventMetrics(event.id, teams);
    }

    const clientId = this.resolveClientId(user, clientIdParam);
    await this.assertAccess(user, clientId);

    return this.prisma.salesTeam.findMany({
      where: { client_id: clientId },
      orderBy: { created_at: "asc" },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                client_id: true,
                is_active: true,
                avatar_url: true,
                vendor_category: true,
                vendor_categories: true,
              },
            },
          },
          orderBy: [
            { queue_position: { sort: "asc", nulls: "last" } },
            { added_at: "asc" },
          ],
        },
      },
    });
  }

  async create(
    user: AuthenticatedUser,
    eventIdParam: string | undefined,
    clientIdParam: string | undefined,
    dto: CreateSalesTeamDto,
  ) {
    if (!eventIdParam) {
      if (clientIdParam) {
        throw new BadRequestException(
          "event_id obrigatório para criar time no evento",
        );
      }
      throw new BadRequestException("event_id obrigatório para criar time");
    }

    const event = await this.getEventForAccess(user, eventIdParam);

    return this.prisma.salesTeam.create({
      data: {
        client_id:
          this.getEventParticipantClientIds(event)[0] ?? event.client_id,
        event_id: event.id,
        name: dto.name.trim(),
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                client_id: true,
                is_active: true,
                avatar_url: true,
              },
            },
          },
        },
      },
    });
  }

  async update(
    user: AuthenticatedUser,
    teamId: string,
    dto: UpdateSalesTeamDto,
  ) {
    await this.getTeamForAccess(user, teamId);

    const data: { name?: string; logo_url?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.logo_url !== undefined)
      data.logo_url = dto.logo_url?.trim() || null;

    return this.prisma.salesTeam.update({
      where: { id: teamId },
      data,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                client_id: true,
                is_active: true,
                avatar_url: true,
              },
            },
          },
          orderBy: { added_at: "asc" },
        },
      },
    });
  }

  async remove(user: AuthenticatedUser, teamId: string) {
    await this.getTeamForAccess(user, teamId);
    await this.prisma.salesTeam.delete({ where: { id: teamId } });
    return { deleted: true };
  }

  async addMember(
    user: AuthenticatedUser,
    teamId: string,
    dto: AddTeamMemberDto,
  ) {
    const team = await this.getTeamForAccess(user, teamId);

    const member = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!member) throw new NotFoundException("Usuário não encontrado");
    if (member.role !== "vendedor") {
      throw new BadRequestException(
        "Apenas vendedores podem ser adicionados a um time",
      );
    }
    if (team.event_id && member.client_id) {
      const eventParticipant = await this.prisma.eventParticipant.findFirst({
        where: {
          event_id: team.event_id,
          client_id: member.client_id,
        },
        select: { id: true },
      });
      if (!eventParticipant) {
        throw new BadRequestException(
          "O cliente deste vendedor não participa deste evento",
        );
      }
    }

    const existingMembership = await this.prisma.salesTeamMember.findFirst({
      where: {
        user_id: dto.user_id,
        team: {
          event_id: team.event_id,
        },
      },
      select: {
        team_id: true,
      },
    });

    if (existingMembership && existingMembership.team_id !== teamId) {
      throw new BadRequestException(
        "Este vendedor já está em outro time deste evento",
      );
    }

    await this.prisma.salesTeamMember.upsert({
      where: { team_id_user_id: { team_id: teamId, user_id: dto.user_id } },
      create: { team_id: teamId, user_id: dto.user_id },
      update: {},
    });

    return this.prisma.salesTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                client_id: true,
                is_active: true,
                avatar_url: true,
              },
            },
          },
        },
      },
    });
  }

  async removeMember(user: AuthenticatedUser, teamId: string, userId: string) {
    await this.getTeamForAccess(user, teamId);

    await this.prisma.salesTeamMember.delete({
      where: { team_id_user_id: { team_id: teamId, user_id: userId } },
    });

    return this.prisma.salesTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                client_id: true,
                is_active: true,
                avatar_url: true,
              },
            },
          },
        },
      },
    });
  }

  async reorderMembers(
    user: AuthenticatedUser,
    teamId: string,
    dto: ReorderMembersDto,
  ) {
    const team = await this.getTeamForAccess(user, teamId);
    if (dto.category && team.event_id) {
      const eventMembers = await this.prisma.salesTeamMember.findMany({
        where: { team: { event_id: team.event_id } },
        select: {
          team_id: true,
          user_id: true,
          queue_positions: true,
          user: {
            select: { vendor_category: true, vendor_categories: true },
          },
        },
      });
      const categoryMembers = eventMembers.filter((member) => {
        const categories = member.user.vendor_categories.length
          ? member.user.vendor_categories
          : member.user.vendor_category
            ? [member.user.vendor_category]
            : [];
        return categories.includes(dto.category as never);
      });
      const memberById = new Map(
        categoryMembers.map((member) => [member.user_id, member]),
      );
      if (
        new Set(dto.user_ids).size !== dto.user_ids.length ||
        dto.user_ids.some((userId) => !memberById.has(userId))
      ) {
        throw new BadRequestException(
          "A fila contém vendedores inválidos ou repetidos nesta categoria",
        );
      }
      const orderedUserIds = [
        ...dto.user_ids,
        ...categoryMembers
          .filter((member) => !dto.user_ids.includes(member.user_id))
          .sort((left, right) => {
            const leftPositions = left.queue_positions;
            const rightPositions = right.queue_positions;
            const leftPosition =
              leftPositions && typeof leftPositions === "object"
                ? ((leftPositions as Record<string, unknown>)[dto.category!] as
                    number | undefined)
                : undefined;
            const rightPosition =
              rightPositions && typeof rightPositions === "object"
                ? ((rightPositions as Record<string, unknown>)[
                    dto.category!
                  ] as number | undefined)
                : undefined;
            return (
              (leftPosition ?? Number.MAX_SAFE_INTEGER) -
              (rightPosition ?? Number.MAX_SAFE_INTEGER)
            );
          })
          .map((member) => member.user_id),
      ];
      await this.prisma.$transaction(
        orderedUserIds.map((userId, position) => {
          const member = memberById.get(userId)!;
          const current = member.queue_positions;
          return this.prisma.salesTeamMember.update({
            where: {
              team_id_user_id: {
                team_id: member.team_id,
                user_id: member.user_id,
              },
            },
            data: {
              queue_positions: {
                ...(current &&
                typeof current === "object" &&
                !Array.isArray(current)
                  ? current
                  : {}),
                [dto.category!]: position,
              },
            },
          });
        }),
      );
      return { event_id: team.event_id, user_ids: orderedUserIds };
    }
    const members = await this.prisma.salesTeamMember.findMany({
      where: { team_id: teamId },
      select: { user_id: true, queue_positions: true },
    });
    const currentIds = new Set(members.map((member) => member.user_id));
    if (
      (!dto.category && dto.user_ids.length !== currentIds.size) ||
      dto.user_ids.some((userId) => !currentIds.has(userId))
    ) {
      throw new BadRequestException(
        "A fila deve conter exatamente os vendedores deste time",
      );
    }

    const memberById = new Map(
      members.map((member) => [member.user_id, member]),
    );
    await this.prisma.$transaction(
      dto.user_ids.map((userId, position) => {
        if (!dto.category) {
          return this.prisma.salesTeamMember.update({
            where: { team_id_user_id: { team_id: teamId, user_id: userId } },
            data: { queue_position: position },
          });
        }
        const current = memberById.get(userId)?.queue_positions;
        return this.prisma.salesTeamMember.update({
          where: { team_id_user_id: { team_id: teamId, user_id: userId } },
          data: {
            queue_positions: {
              ...(current &&
              typeof current === "object" &&
              !Array.isArray(current)
                ? current
                : {}),
              [dto.category]: position,
            },
          },
        });
      }),
    );

    return { team_id: teamId, user_ids: dto.user_ids };
  }
}
