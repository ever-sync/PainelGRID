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
  vendor_avatar_url: string | null;
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
        scheduled_target: true,
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
        where: {
          OR: [
            { appointment: { event_id: eventId } },
            { lead: { event_interest_id: eventId } },
            { sales_team: { event_id: eventId } },
          ],
        },
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
        select: { id: true, name: true, client_id: true, avatar_url: true },
      }),
      this.prisma.scoreEvent.findMany({
        where: {
          OR: [{ appointment: { event_id: eventId } }, { lead: { event_interest_id: eventId } }],
        },
        select: { vendor_id: true, points: true },
      }),
    ]);

    // Pontos por vendedor no evento
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
        vendorTeam.set(member.user_id, {
          team_id: team.id,
          team_name: team.name,
        });
      });
    });

    // Funnel ────────────────────────────────────────────────────────────────
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
          vendor_avatar_url: found?.avatar_url ?? null,
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

    // Pre-popula vendedores das equipes vinculadas ao evento
    teams.forEach((team) => {
      team.members.forEach((member) => {
        ensureVendor(member.user_id, member.user.name, member.user.client_id);
      });
    });

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
    const activeCalls: unknown[] = [];
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
      } catch {
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
        scheduled_target: event.scheduled_target,
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

    type Funnel = {
      leads: number;
      scheduled: number;
      confirmed: number;
      checked_in: number;
      sold: number;
    };
    const funnelByEvent = new Map<string, Funnel>();
    events.forEach((event) => {
      funnelByEvent.set(event.id, {
        leads: 0,
        scheduled: 0,
        confirmed: 0,
        checked_in: 0,
        sold: 0,
      });
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
      // Gestor e papel global: todas as empresas.
      const clients = await this.prisma.client.findMany({
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

  /**
   * Relatório executivo de um evento: atribuição real campanha→venda (via
   * MetaLeadImport), analytics do Rubinho e histórico dos eventos anteriores.
   * Substitui as heurísticas do front-end por dados de fato.
   */
  async getExecutiveReport(user: AuthenticatedUser, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        client_id: true,
        event_date: true,
        event_end_date: true,
        total_investment: true,
        paid_traffic_investment: true,
        participants: { select: { client_id: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }
    await this.assertEventRead(user, event);

    const clientIds = Array.from(
      new Set([event.client_id, ...event.participants.map((p) => p.client_id)]),
    );

    const [
      leads,
      sales,
      imports,
      metaCampaigns,
      metaAdSets,
      metaAds,
      appointments,
      campaignAssignments,
      ratingRows,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { event_interest_id: eventId, deleted_at: null },
        select: { id: true, confirmation_status: true },
      }),
      this.prisma.sale.findMany({
        where: { appointment: { event_id: eventId } },
        select: { lead_id: true, value: true },
      }),
      this.prisma.metaLeadImport.findMany({
        where: {
          client_id: { in: clientIds },
          lead_id: { not: null },
          lead: { deleted_at: null },
          OR: [{ event_id: eventId }, { event_id: null, lead: { event_interest_id: eventId } }],
        },
        select: {
          lead_id: true,
          meta_campaign_id: true,
          meta_campaign_name: true,
          meta_ad_set_id: true,
          meta_ad_set_name: true,
          meta_ad_id: true,
          meta_ad_name: true,
          source_created_at: true,
          imported_at: true,
          lead: { select: { confirmation_status: true } },
        },
      }),
      this.prisma.metaCampaign.findMany({
        where: { client_id: { in: clientIds } },
        select: { meta_campaign_id: true, name: true, start_time: true },
      }),
      this.prisma.metaAdSet.findMany({
        where: { client_id: { in: clientIds } },
        select: { meta_campaign_id: true, meta_ad_set_id: true, name: true },
      }),
      this.prisma.metaAd.findMany({
        where: { client_id: { in: clientIds } },
        select: {
          meta_campaign_id: true,
          meta_ad_set_id: true,
          meta_ad_id: true,
          name: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: { event_id: eventId },
        select: { lead_id: true, status: true },
      }),
      this.prisma.metaCampaignAssignment.findMany({
        where: { event_id: eventId, client_id: { in: clientIds } },
        select: { meta_campaign_id: true },
      }),
      this.prisma.serviceRating.groupBy({
        by: ['vendor_id'],
        where: { event_id: eventId },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);

    const eventLeadIds = new Set(leads.map((l) => l.id));
    const scheduledIds = new Set<string>();
    const checkedInIds = new Set<string>();
    for (const lead of leads) {
      const s = lead.confirmation_status;
      if (
        s === ConfirmationStatus.scheduled ||
        s === ConfirmationStatus.confirmed ||
        s === ConfirmationStatus.checked_in
      ) {
        scheduledIds.add(lead.id);
      }
      if (s === ConfirmationStatus.checked_in) checkedInIds.add(lead.id);
    }
    for (const appointment of appointments) {
      if (
        appointment.status === AppointmentStatus.scheduled ||
        appointment.status === AppointmentStatus.confirmed ||
        appointment.status === AppointmentStatus.completed ||
        appointment.status === AppointmentStatus.no_show
      ) {
        scheduledIds.add(appointment.lead_id);
      }
      if (appointment.status === AppointmentStatus.completed) {
        checkedInIds.add(appointment.lead_id);
      }
    }

    // Last-touch por evento: um mesmo telefone pode preencher mais de um
    // formulario. Cada resultado comercial pertence somente a ultima entrada
    // Meta daquele lead neste evento, evitando duplicar receita e vendas.
    const latestImportByLead = new Map<string, (typeof imports)[number]>();
    const attributionOccurredAt = (entry: (typeof imports)[number]) =>
      (entry.source_created_at ?? entry.imported_at).getTime();
    for (const entry of imports) {
      if (!entry.lead_id) continue;
      const current = latestImportByLead.get(entry.lead_id);
      if (!current || attributionOccurredAt(entry) > attributionOccurredAt(current)) {
        latestImportByLead.set(entry.lead_id, entry);
      }
    }
    for (const [leadId, entry] of latestImportByLead) {
      eventLeadIds.add(leadId);
      const status = entry.lead?.confirmation_status;
      if (
        status === ConfirmationStatus.scheduled ||
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
        scheduledIds.add(leadId);
      }
      if (status === ConfirmationStatus.checked_in) checkedInIds.add(leadId);
    }

    const campaignName = new Map<string, string>();
    for (const c of metaCampaigns) campaignName.set(c.meta_campaign_id, c.name);
    const adSetName = new Map<string, string>();
    for (const adSet of metaAdSets) adSetName.set(adSet.meta_ad_set_id, adSet.name);
    const adName = new Map<string, string>();
    for (const ad of metaAds) adName.set(ad.meta_ad_id, ad.name);

    const revenueByLead = new Map<string, number>();
    for (const sale of sales) {
      revenueByLead.set(sale.lead_id, (revenueByLead.get(sale.lead_id) ?? 0) + Number(sale.value));
    }
    const soldLeadIds = new Set(sales.map((s) => s.lead_id));

    type Attr = {
      level: 'campaign' | 'adset' | 'ad';
      entity_id: string;
      name: string;
      meta_campaign_id: string | null;
      meta_ad_set_id: string | null;
      leads: number;
      scheduled: number;
      checked_in: number;
      sold: number;
      revenue: number;
      spend: number;
      cpl: number;
      cost_per_scheduled: number;
      cost_per_sale: number;
      roas: number;
      roi_percent: number;
    };
    const attributionMaps = {
      campaign: new Map<string, Attr>(),
      adset: new Map<string, Attr>(),
      ad: new Map<string, Attr>(),
    };
    const ensureAttr = (
      level: Attr['level'],
      entityId: string,
      name: string,
      campaignId: string | null,
      adSetId: string | null,
    ): Attr => {
      const map = attributionMaps[level];
      let a = map.get(entityId);
      if (!a) {
        a = {
          level,
          entity_id: entityId,
          name,
          meta_campaign_id: campaignId,
          meta_ad_set_id: adSetId,
          leads: 0,
          scheduled: 0,
          checked_in: 0,
          sold: 0,
          revenue: 0,
          spend: 0,
          cpl: 0,
          cost_per_scheduled: 0,
          cost_per_sale: 0,
          roas: 0,
          roi_percent: 0,
        };
        map.set(entityId, a);
      }
      return a;
    };

    const reportCampaignIds = new Set(
      campaignAssignments.map((assignment) => assignment.meta_campaign_id),
    );
    for (const entry of latestImportByLead.values()) {
      if (entry.meta_campaign_id) reportCampaignIds.add(entry.meta_campaign_id);
    }
    for (const campaignId of reportCampaignIds) {
      ensureAttr(
        'campaign',
        campaignId,
        campaignName.get(campaignId) ?? 'Campanha sem nome',
        campaignId,
        null,
      );
    }
    for (const adSet of metaAdSets) {
      if (!adSet.meta_campaign_id || !reportCampaignIds.has(adSet.meta_campaign_id)) continue;
      ensureAttr(
        'adset',
        adSet.meta_ad_set_id,
        adSet.name,
        adSet.meta_campaign_id,
        adSet.meta_ad_set_id,
      );
    }
    for (const ad of metaAds) {
      if (!ad.meta_campaign_id || !reportCampaignIds.has(ad.meta_campaign_id)) continue;
      ensureAttr('ad', ad.meta_ad_id, ad.name, ad.meta_campaign_id, ad.meta_ad_set_id);
    }

    for (const [leadId, entry] of latestImportByLead) {
      const rows: Attr[] = [];
      if (entry.meta_campaign_id) {
        rows.push(
          ensureAttr(
            'campaign',
            entry.meta_campaign_id,
            entry.meta_campaign_name ??
              campaignName.get(entry.meta_campaign_id) ??
              'Campanha sem nome',
            entry.meta_campaign_id,
            null,
          ),
        );
      }
      if (entry.meta_ad_set_id) {
        rows.push(
          ensureAttr(
            'adset',
            entry.meta_ad_set_id,
            entry.meta_ad_set_name ?? adSetName.get(entry.meta_ad_set_id) ?? 'Conjunto sem nome',
            entry.meta_campaign_id,
            entry.meta_ad_set_id,
          ),
        );
      }
      if (entry.meta_ad_id) {
        rows.push(
          ensureAttr(
            'ad',
            entry.meta_ad_id,
            entry.meta_ad_name ?? adName.get(entry.meta_ad_id) ?? 'Anuncio sem nome',
            entry.meta_campaign_id,
            entry.meta_ad_set_id,
          ),
        );
      }
      for (const row of rows) {
        row.leads += 1;
        if (scheduledIds.has(leadId)) row.scheduled += 1;
        if (checkedInIds.has(leadId)) row.checked_in += 1;
        if (soldLeadIds.has(leadId)) {
          row.sold += 1;
          row.revenue += revenueByLead.get(leadId) ?? 0;
        }
      }
    }

    const campaignIds = [...attributionMaps.campaign.keys()];
    const adSetIds = [...attributionMaps.adset.keys()];
    const adIds = [...attributionMaps.ad.keys()];
    const campaignStarts = metaCampaigns
      .filter((campaign) => reportCampaignIds.has(campaign.meta_campaign_id))
      .map((campaign) => campaign.start_time)
      .filter((date): date is Date => Boolean(date));
    const attributionDates = [...latestImportByLead.values()].map(
      (entry) => entry.source_created_at ?? entry.imported_at,
    );
    const rangeCandidates = [...campaignStarts, ...attributionDates];
    const reportFrom =
      rangeCandidates.length > 0
        ? new Date(Math.min(...rangeCandidates.map((date) => date.getTime())))
        : new Date(event.event_date);
    reportFrom.setUTCHours(0, 0, 0, 0);
    const reportTo = new Date(event.event_end_date ?? event.event_date);
    reportTo.setUTCHours(23, 59, 59, 999);
    const insightEntityFilters: Prisma.MetaDailyInsightWhereInput[] = [];
    if (campaignIds.length > 0) {
      insightEntityFilters.push({
        level: 'campaign',
        entity_id: { in: campaignIds },
      });
    }
    if (adSetIds.length > 0) {
      insightEntityFilters.push({
        level: 'adset',
        entity_id: { in: adSetIds },
      });
    }
    if (adIds.length > 0) {
      insightEntityFilters.push({ level: 'ad', entity_id: { in: adIds } });
    }
    const insightRows =
      insightEntityFilters.length > 0
        ? await this.prisma.metaDailyInsight.findMany({
            where: {
              client_id: { in: clientIds },
              date: { gte: reportFrom, lte: reportTo },
              OR: insightEntityFilters,
            },
            select: { level: true, entity_id: true, spend: true },
          })
        : [];
    for (const insight of insightRows) {
      if (insight.level !== 'campaign' && insight.level !== 'adset' && insight.level !== 'ad') {
        continue;
      }
      const row = attributionMaps[insight.level].get(insight.entity_id);
      if (row) row.spend += Number(insight.spend ?? 0);
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const finalize = (rows: Map<string, Attr>) =>
      [...rows.values()]
        .map((row) => ({
          ...row,
          revenue: round2(row.revenue),
          spend: round2(row.spend),
          cpl: row.leads > 0 ? round2(row.spend / row.leads) : 0,
          cost_per_scheduled: row.scheduled > 0 ? round2(row.spend / row.scheduled) : 0,
          cost_per_sale: row.sold > 0 ? round2(row.spend / row.sold) : 0,
          roas: row.spend > 0 ? round2(row.revenue / row.spend) : 0,
          roi_percent: row.spend > 0 ? round2(((row.revenue - row.spend) / row.spend) * 100) : 0,
        }))
        .sort((left, right) =>
          right.revenue !== left.revenue
            ? right.revenue - left.revenue
            : right.scheduled !== left.scheduled
              ? right.scheduled - left.scheduled
              : right.leads - left.leads,
        );
    const campaignAttribution = finalize(attributionMaps.campaign);
    const adSetAttribution = finalize(attributionMaps.adset);
    const adAttribution = finalize(attributionMaps.ad);
    const attribution = campaignAttribution.map((row) => ({
      ...row,
      meta_campaign_id: row.entity_id,
    }));

    const attributedLeadCount = latestImportByLead.size;
    const attributedSold = new Set(
      [...latestImportByLead.keys()].filter((leadId) => soldLeadIds.has(leadId)),
    ).size;

    // ── Rubinho ──
    const [messageCount, conversations, agentLogCount, appointmentsAgent] = await Promise.all([
      this.prisma.message.count({
        where: { conversation: { lead: { event_interest_id: eventId } } },
      }),
      this.prisma.conversation.findMany({
        where: { lead: { event_interest_id: eventId }, channel: 'whatsapp' },
        select: { id: true },
      }),
      this.prisma.agentActionLog.count({
        where: { lead: { event_interest_id: eventId } },
      }),
      this.prisma.appointment.count({
        where: {
          event_id: eventId,
          OR: [{ source: 'n8n_ai_agent' }, { created_by_type: 'external_agent' }],
        },
      }),
    ]);

    const eventRevenue = sales.reduce((s, sale) => s + Number(sale.value), 0);
    const rubinho = {
      mensagens: messageCount,
      conversas_iniciadas: conversations.length,
      credenciamentos: scheduledIds.size,
      agendamentos: appointmentsAgent || scheduledIds.size,
      comparecimentos: checkedInIds.size,
      taxa_comparecimento:
        scheduledIds.size > 0 ? (checkedInIds.size / scheduledIds.size) * 100 : 0,
      vendas_originadas: soldLeadIds.size,
      receita_influenciada: Math.round(eventRevenue * 100) / 100,
      acoes_ia: agentLogCount,
    };

    // ── Histórico (últimos eventos do mesmo cliente) ──
    const historyEvents = await this.prisma.event.findMany({
      where: { client_id: event.client_id },
      orderBy: { event_date: 'desc' },
      take: 6,
      select: { id: true, name: true, event_date: true },
    });
    const history = await Promise.all(
      historyEvents.map(async (ev) => {
        const [hLeads, hSales] = await Promise.all([
          this.prisma.lead.findMany({
            where: { event_interest_id: ev.id, deleted_at: null },
            select: { confirmation_status: true },
          }),
          this.prisma.sale.findMany({
            where: { appointment: { event_id: ev.id } },
            select: { value: true },
          }),
        ]);
        let scheduled = 0;
        let confirmed = 0;
        let checkedIn = 0;
        for (const l of hLeads) {
          const s = l.confirmation_status;
          if (
            s === ConfirmationStatus.scheduled ||
            s === ConfirmationStatus.confirmed ||
            s === ConfirmationStatus.checked_in
          )
            scheduled += 1;
          if (s === ConfirmationStatus.confirmed || s === ConfirmationStatus.checked_in)
            confirmed += 1;
          if (s === ConfirmationStatus.checked_in) checkedIn += 1;
        }
        const revenue = hSales.reduce((sum, s) => sum + Number(s.value), 0);
        return {
          event_id: ev.id,
          name: ev.name,
          event_date: ev.event_date,
          leads: hLeads.length,
          scheduled,
          confirmed,
          checked_in: checkedIn,
          sold: hSales.length,
          revenue: Math.round(revenue * 100) / 100,
        };
      }),
    );
    history.reverse(); // cronológico ascendente

    // ── Avaliações dos clientes por vendedor ──
    const vendorRatings = ratingRows.map((r) => ({
      vendor_id: r.vendor_id,
      avg_score: r._avg.score != null ? Math.round(r._avg.score * 100) / 100 : 0,
      count: r._count._all,
    }));
    const totalRatings = vendorRatings.reduce((s, r) => s + r.count, 0);
    const overallAvg =
      totalRatings > 0
        ? Math.round(
            (vendorRatings.reduce((s, r) => s + r.avg_score * r.count, 0) / totalRatings) * 100,
          ) / 100
        : 0;

    return {
      event_id: eventId,
      investment: {
        total: event.total_investment != null ? Number(event.total_investment) : null,
        paid_traffic:
          event.paid_traffic_investment != null ? Number(event.paid_traffic_investment) : null,
      },
      ratings: {
        overall_avg: overallAvg,
        total: totalRatings,
        by_vendor: vendorRatings,
      },
      attribution,
      attribution_by_level: {
        campaigns: campaignAttribution,
        ad_sets: adSetAttribution,
        ads: adAttribution,
      },
      attribution_period: {
        from: reportFrom,
        to: reportTo,
      },
      attribution_coverage: {
        attributed_leads: attributedLeadCount,
        total_leads: eventLeadIds.size,
        attributed_sold: attributedSold,
        total_sold: soldLeadIds.size,
      },
      rubinho,
      history,
    };
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
        where: { id: { in: participantIds } },
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
