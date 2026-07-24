import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ConfirmationStatus,
  LeadSource,
  Prisma,
  SaleType,
} from '@prisma/client';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';
import { AuthenticatedUser } from '../auth/auth.types';

type VendorBucket = {
  vendor_id: string;
  vendor_name: string;
  client_id: string | null;
  team_id: string | null;
  team_name: string | null;
  leads: number;
  scheduled: number;
  confirmed: number;
  checked_in: number;
  sold: number;
  points: number;
};

type DailyBucket = {
  date: string; // YYYY-MM-DD
  leads: number;
  scheduled: number;
  confirmed: number;
  checked_in: number;
  sold: number;
};

const EVENT_TIMEZONE = 'America/Sao_Paulo';

@Injectable()
export class EventDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getTvDashboard(user: AuthenticatedUser, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        event_date: true,
        event_end_date: true,
        location: true,
        capacity: true,
        sales_target: true,
        status: true,
        participants: { select: { client_id: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    await this.assertEventRead(user, event);

    const participantClientIds = Array.from(
      new Set(event.participants.map((participant) => participant.client_id)),
    );

    const [leads, appointments, sales, teams, vendors, scoreRows] = await Promise.all([
      this.prisma.lead.findMany({
        where: { event_interest_id: eventId, deleted_at: null },
        select: {
          id: true,
          source: true,
          assigned_vendor_id: true,
          team_id: true,
          created_at: true,
          confirmation_status: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: { event_id: eventId },
        select: {
          id: true,
          lead_id: true,
          status: true,
          scheduled_at: true,
          confirmed_at: true,
          completed_at: true,
        },
      }),
      this.prisma.sale.findMany({
        where: { appointment: { event_id: eventId } },
        select: {
          id: true,
          lead_id: true,
          vendor_id: true,
          team_id: true,
          type: true,
          model: true,
          value: true,
          sold_at: true,
        },
      }),
      this.prisma.salesTeam.findMany({
        where: { event_id: eventId },
        select: {
          id: true,
          name: true,
          logo_url: true,
          members: {
            select: {
              user_id: true,
              user: { select: { id: true, name: true, client_id: true } },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: {
          role: 'vendedor',
          client_id: { in: participantClientIds },
          is_active: true,
        },
        select: { id: true, name: true, client_id: true },
      }),
      this.prisma.scoreEvent.findMany({
        where: { appointment: { event_id: eventId } },
        select: { vendor_id: true, points: true },
      }),
    ]);

    // Pontos por vendedor (kinds: contacted, scheduled, checked_in, sold)
    const pointsByVendor = new Map<string, number>();
    scoreRows.forEach((row) => {
      const current = pointsByVendor.get(row.vendor_id) ?? 0;
      pointsByVendor.set(row.vendor_id, current + Number(row.points ?? 0));
    });

    // Index helpers ────────────────────────────────────────────────────────
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const vendorTeam = new Map<string, { team_id: string; team_name: string }>();
    teams.forEach((team) => {
      team.members.forEach((member) => {
        vendorTeam.set(member.user_id, { team_id: team.id, team_name: team.name });
      });
    });

    // Funnel ────────────────────────────────────────────────────────────────
    // Fonte de verdade: confirmation_status do lead (abrange todos os clientes
    // participantes do evento e reflete a automacao de etapa do CRM). Cumulativo:
    // quem chegou a um estagio conta nos anteriores.
    const scheduledLeadIds = new Set<string>();
    const confirmedLeadIds = new Set<string>();
    const checkedInLeadIds = new Set<string>();
    leads.forEach((lead) => {
      const status = lead.confirmation_status;
      if (
        status === ConfirmationStatus.scheduled ||
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
        scheduledLeadIds.add(lead.id);
      }
      if (status === ConfirmationStatus.confirmed || status === ConfirmationStatus.checked_in) {
        confirmedLeadIds.add(lead.id);
      }
      if (status === ConfirmationStatus.checked_in) {
        checkedInLeadIds.add(lead.id);
      }
    });
    const soldLeadIds = new Set(sales.map((sale) => sale.lead_id));

    const funnel = {
      leads: leads.length,
      scheduled: scheduledLeadIds.size,
      confirmed: confirmedLeadIds.size,
      checked_in: checkedInLeadIds.size,
      sold: soldLeadIds.size,
    };

    // Vendor ranking ────────────────────────────────────────────────────────
    const vendorMap = new Map<string, VendorBucket>();
    const ensureVendor = (
      vendorId: string,
      fallbackName?: string,
      fallbackClientId?: string | null,
    ): VendorBucket => {
      let bucket = vendorMap.get(vendorId);
      if (!bucket) {
        const found = vendors.find((vendor) => vendor.id === vendorId);
        const teamInfo = vendorTeam.get(vendorId) ?? null;
        bucket = {
          vendor_id: vendorId,
          vendor_name: found?.name ?? fallbackName ?? 'Vendedor',
          client_id: found?.client_id ?? fallbackClientId ?? null,
          team_id: teamInfo?.team_id ?? null,
          team_name: teamInfo?.team_name ?? null,
          leads: 0,
          scheduled: 0,
          confirmed: 0,
          checked_in: 0,
          sold: 0,
          points: pointsByVendor.get(vendorId) ?? 0,
        };
        vendorMap.set(vendorId, bucket);
      }
      return bucket;
    };

    // Pre-popula vendedores conhecidos (mesmo zerados) pra aparecer no ranking
    vendors.forEach((vendor) => ensureVendor(vendor.id));

    leads.forEach((lead) => {
      if (lead.assigned_vendor_id) {
        ensureVendor(lead.assigned_vendor_id).leads += 1;
      }
    });

    appointments.forEach((appointment) => {
      const lead = leadById.get(appointment.lead_id);
      const vendorId = lead?.assigned_vendor_id;
      if (!vendorId) return;
      const bucket = ensureVendor(vendorId);
      if (appointment.status !== AppointmentStatus.cancelled) bucket.scheduled += 1;
      if (appointment.confirmed_at) bucket.confirmed += 1;
      if (appointment.status === AppointmentStatus.completed) bucket.checked_in += 1;
    });

    sales.forEach((sale) => {
      ensureVendor(sale.vendor_id).sold += 1;
    });

    const vendorRanking = Array.from(vendorMap.values()).sort(
      (a, b) =>
        b.sold - a.sold ||
        b.checked_in - a.checked_in ||
        b.confirmed - a.confirmed ||
        a.vendor_name.localeCompare(b.vendor_name),
    );

    // Team ranking (soma dos vendedores do time) ────────────────────────────
    const teamMap = new Map<
      string,
      {
        team_id: string;
        team_name: string;
        logo_url: string | null;
        leads: number;
        scheduled: number;
        confirmed: number;
        checked_in: number;
        sold: number;
        points: number;
      }
    >();
    teams.forEach((team) => {
      teamMap.set(team.id, {
        team_id: team.id,
        team_name: team.name,
        logo_url: team.logo_url,
        leads: 0,
        scheduled: 0,
        confirmed: 0,
        checked_in: 0,
        sold: 0,
        points: 0,
      });
    });
    vendorRanking.forEach((vendor) => {
      if (!vendor.team_id) return;
      const teamBucket = teamMap.get(vendor.team_id);
      if (!teamBucket) return;
      teamBucket.leads += vendor.leads;
      teamBucket.scheduled += vendor.scheduled;
      teamBucket.confirmed += vendor.confirmed;
      teamBucket.checked_in += vendor.checked_in;
      teamBucket.sold += vendor.sold;
      teamBucket.points += vendor.points;
    });
    const teamRanking = Array.from(teamMap.values()).sort(
      (a, b) =>
        b.sold - a.sold || b.checked_in - a.checked_in || a.team_name.localeCompare(b.team_name),
    );

    // Cars ──────────────────────────────────────────────────────────────────
    const segmentMap = new Map<SaleType, number>();
    const modelMap = new Map<string, number>();
    let totalValue = new Prisma.Decimal(0);
    sales.forEach((sale) => {
      segmentMap.set(sale.type, (segmentMap.get(sale.type) ?? 0) + 1);
      const modelKey = sale.model?.trim() || 'Sem modelo';
      modelMap.set(modelKey, (modelMap.get(modelKey) ?? 0) + 1);
      totalValue = totalValue.plus(sale.value);
    });
    const carsBySegment = Array.from(segmentMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    const topModels = Array.from(modelMap.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model))
      .slice(0, 15);

    // Daily series ──────────────────────────────────────────────────────────
    const dailyMap = new Map<string, DailyBucket>();
    const ensureDay = (date: Date | null): DailyBucket | null => {
      if (!date) return null;
      const key = this.toIsoDate(date);
      let bucket = dailyMap.get(key);
      if (!bucket) {
        bucket = {
          date: key,
          leads: 0,
          scheduled: 0,
          confirmed: 0,
          checked_in: 0,
          sold: 0,
        };
        dailyMap.set(key, bucket);
      }
      return bucket;
    };
    leads.forEach((lead) => {
      const bucket = ensureDay(lead.created_at);
      if (bucket) bucket.leads += 1;
    });
    appointments.forEach((appointment) => {
      if (appointment.status !== AppointmentStatus.cancelled) {
        const scheduledBucket = ensureDay(appointment.scheduled_at);
        if (scheduledBucket) scheduledBucket.scheduled += 1;
      }
      if (appointment.confirmed_at) {
        const confirmedBucket = ensureDay(appointment.confirmed_at);
        if (confirmedBucket) confirmedBucket.confirmed += 1;
      }
      if (appointment.completed_at) {
        const completedBucket = ensureDay(appointment.completed_at);
        if (completedBucket) completedBucket.checked_in += 1;
      }
    });
    sales.forEach((sale) => {
      const bucket = ensureDay(sale.sold_at);
      if (bucket) bucket.sold += 1;
    });
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Check-in by source ────────────────────────────────────────────────────
    const sourceMap = new Map<LeadSource, number>();
    checkedInLeadIds.forEach((leadId) => {
      const lead = leadById.get(leadId);
      if (!lead) return;
      sourceMap.set(lead.source, (sourceMap.get(lead.source) ?? 0) + 1);
    });
    const checkinBySource = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Buscar chamadas de vendedores ativas no Redis
    const activeCalls: any[] = [];
    for (const clientId of participantClientIds) {
      try {
        const [_, keys] = await this.redis.client.scan(
          '0',
          'MATCH',
          `vendor_call:${clientId}:*`,
          'COUNT',
          100,
        );
        if (keys && keys.length > 0) {
          for (const key of keys) {
            const val = await this.redis.client.get(key);
            if (val) {
              activeCalls.push(JSON.parse(val));
            }
          }
        }
      } catch (err: any) {
        // Silently swallow Redis errors
      }
    }

    return {
      event: {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        event_end_date: event.event_end_date,
        location: event.location,
        capacity: event.capacity,
        sales_target: event.sales_target,
        status: event.status,
        participant_client_ids: participantClientIds,
      },
      funnel,
      vendors: vendorRanking,
      teams: teamRanking,
      cars: {
        by_segment: carsBySegment,
        top_models: topModels,
        total_value: totalValue.toString(),
      },
      daily,
      checkin_by_source: checkinBySource,
      activeCalls,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Funil compacto (leads/agendados/confirmados/check-in/vendidos) de todos os
   * eventos ativos acessiveis ao usuario, para o card "Eventos ativos" do
   * dashboard geral. Mesma logica de funil do getTvDashboard, mas em lote
   * (groupBy) em vez de buscar todos os leads/vendas por evento.
   */
  async getActiveEventsSummary(user: AuthenticatedUser) {
    const clientIds = await this.resolveAccessibleClientIds(user);
    if (clientIds.length === 0) return [];

    const events = await this.prisma.event.findMany({
      where: {
        status: 'active',
        participants: { some: { client_id: { in: clientIds } } },
      },
      orderBy: { event_date: 'asc' },
      select: { id: true, name: true, event_date: true, location: true },
    });

    if (events.length === 0) return [];

    const eventIds = events.map((event) => event.id);

    const [leadGroups, sales] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['event_interest_id', 'confirmation_status'],
        where: { event_interest_id: { in: eventIds }, deleted_at: null },
        _count: { _all: true },
      }),
      this.prisma.sale.findMany({
        where: { appointment: { event_id: { in: eventIds } } },
        select: { appointment: { select: { event_id: true } } },
      }),
    ]);

    type Funnel = { leads: number; scheduled: number; confirmed: number; checked_in: number; sold: number };
    const funnelByEvent = new Map<string, Funnel>();
    events.forEach((event) => {
      funnelByEvent.set(event.id, { leads: 0, scheduled: 0, confirmed: 0, checked_in: 0, sold: 0 });
    });

    leadGroups.forEach((row) => {
      if (!row.event_interest_id) return;
      const bucket = funnelByEvent.get(row.event_interest_id);
      if (!bucket) return;
      const count = row._count._all;
      bucket.leads += count;
      const status = row.confirmation_status;
      if (
        status === ConfirmationStatus.scheduled ||
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
        bucket.scheduled += count;
      }
      if (status === ConfirmationStatus.confirmed || status === ConfirmationStatus.checked_in) {
        bucket.confirmed += count;
      }
      if (status === ConfirmationStatus.checked_in) {
        bucket.checked_in += count;
      }
    });

    sales.forEach((sale) => {
      const eventId = sale.appointment?.event_id;
      if (!eventId) return;
      const bucket = funnelByEvent.get(eventId);
      if (bucket) bucket.sold += 1;
    });

    return events.map((event) => ({
      id: event.id,
      name: event.name,
      event_date: event.event_date,
      location: event.location,
      funnel: funnelByEvent.get(event.id)!,
    }));
  }

  private async resolveAccessibleClientIds(user: AuthenticatedUser): Promise<string[]> {
    if (user.role === Role.GESTOR) {
      const clients = await this.prisma.client.findMany({
        where: { gestor_id: user.sub },
        select: { id: true },
      });
      return clients.map((client) => client.id);
    }

    if (user.client_id) {
      return [user.client_id];
    }

    throw new ForbiddenException('Sem permissao');
  }

  private toIsoDate(date: Date): string {
    // Bucket por dia no fuso de São Paulo (eventos sempre rodam em BR).
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: EVENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  private async assertEventRead(
    user: AuthenticatedUser,
    event: { participants: Array<{ client_id: string }> },
  ) {
    const participantIds = Array.from(
      new Set(event.participants.map((participant) => participant.client_id)),
    );

    if (user.role === Role.GESTOR) {
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
      participantIds.includes(user.client_id)
    ) {
      return;
    }

    throw new ForbiddenException('Sem permissao');
  }
}
