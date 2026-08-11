import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentSource,
  AppointmentStatus,
  ConfirmationStatus,
  LeadSource,
  Prisma,
  SaleType,
} from "@prisma/client";
import { Role } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { RedisService } from "../../config/redis.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { OperationalReportQueryDto } from "./dto/operational-report-query.dto";

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
  revenue: number;
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

const EVENT_TIMEZONE = "America/Sao_Paulo";

@Injectable()
export class EventDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOperationalReport(
    user: AuthenticatedUser,
    query: OperationalReportQueryDto,
  ) {
    let scopedClientId = query.client_id;
    if (user.role === Role.CLIENTE) {
      if (!user.client_id) throw new ForbiddenException("Sem permissao");
      if (scopedClientId && scopedClientId !== user.client_id) {
        throw new ForbiddenException("Cliente fora do escopo");
      }
      scopedClientId = user.client_id;
    }

    if (query.event_id) {
      const event = await this.prisma.event.findUnique({
        where: { id: query.event_id },
        select: {
          id: true,
          participants: { select: { client_id: true } },
        },
      });
      if (!event) throw new NotFoundException("Evento nao encontrado");
      await this.assertEventRead(user, event);
      if (
        scopedClientId &&
        !event.participants.some(
          (participant) => participant.client_id === scopedClientId,
        )
      ) {
        throw new ForbiddenException("Cliente nao participa do evento");
      }
    }

    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 25;
    const search = query.search?.trim();
    const where: Prisma.LeadWhereInput = {
      deleted_at: null,
      ...(scopedClientId ? { client_id: scopedClientId } : {}),
      ...(query.event_id ? { event_interest_id: query.event_id } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.crm_stage_id ? { crm_stage_id: query.crm_stage_id } : {}),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from ? { gte: new Date(query.date_from) } : {}),
              ...(query.date_to ? { lte: new Date(query.date_to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [
      total,
      statusRows,
      sourceRows,
      stageRows,
      items,
      appointments,
      sales,
      markedSoldLeads,
      checkinTimelineRows,
      markedScheduledWithoutAppointment,
    ] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({
        by: ["confirmation_status"],
        where,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ["source"],
        where,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ["crm_stage_id"],
        where,
        _count: { _all: true },
      }),
      this.prisma.lead.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          client_id: true,
          name: true,
          email: true,
          phone: true,
          source: true,
          confirmation_status: true,
          created_at: true,
          updated_at: true,
          crm_stage_id: true,
          event_interest_id: true,
          crm_stage: {
            select: { id: true, code: true, name: true, color: true },
          },
          event_interest: { select: { id: true, name: true } },
          client: { select: { id: true, company_name: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          lead: where,
          ...(query.event_id ? { event_id: query.event_id } : {}),
        },
        select: {
          id: true,
          lead_id: true,
          status: true,
          confirmed_at: true,
          completed_at: true,
        },
      }),
      this.prisma.sale.findMany({
        where: { lead: where },
        select: { id: true, lead_id: true, value: true },
      }),
      this.prisma.lead.findMany({
        where: { AND: [where, { sold_by_vendor_id: { not: null } }] },
        select: { id: true },
      }),
      this.prisma.leadTimeline.findMany({
        where: {
          event_type: "status_changed",
          to_value: ConfirmationStatus.checked_in,
          lead: where,
        },
        select: { lead_id: true },
      }),
      this.prisma.lead.count({
        where: {
          AND: [
            where,
            {
              confirmation_status: {
                in: [
                  ConfirmationStatus.scheduled,
                  ConfirmationStatus.confirmed,
                  ConfirmationStatus.checked_in,
                  ConfirmationStatus.closed,
                ],
              },
              appointments: {
                none: query.event_id ? { event_id: query.event_id } : {},
              },
            },
          ],
        },
      }),
    ]);

    const status = Object.fromEntries(
      statusRows.map((row) => [row.confirmation_status, row._count._all]),
    );
    const sources = sourceRows.map((row) => ({
      source: row.source,
      count: row._count._all,
    }));
    const stages = stageRows.map((row) => ({
      crm_stage_id: row.crm_stage_id,
      count: row._count._all,
    }));
    const activeAppointmentStatuses = new Set<AppointmentStatus>([
      AppointmentStatus.scheduled,
      AppointmentStatus.confirmed,
      AppointmentStatus.completed,
      AppointmentStatus.no_show,
      AppointmentStatus.rescheduled,
    ]);
    const scheduledLeadIds = new Set(
      appointments
        .filter((row) => activeAppointmentStatuses.has(row.status))
        .map((row) => row.lead_id),
    );
    const confirmedLeadIds = new Set(
      appointments
        .filter(
          (row) =>
            Boolean(row.confirmed_at) ||
            row.status === AppointmentStatus.confirmed ||
            row.status === AppointmentStatus.completed ||
            row.status === AppointmentStatus.no_show,
        )
        .map((row) => row.lead_id),
    );
    const checkedInLeadIds = new Set([
      ...appointments
        .filter(
          (row) =>
            Boolean(row.completed_at) ||
            row.status === AppointmentStatus.completed,
        )
        .map((row) => row.lead_id),
      ...checkinTimelineRows.map((row) => row.lead_id),
    ]);
    const soldLeadIds = new Set([
      ...sales.map((row) => row.lead_id),
      ...markedSoldLeads.map((row) => row.id),
    ]);
    const revenue = sales.reduce(
      (sum, row) => sum.plus(row.value),
      new Prisma.Decimal(0),
    );
    const rate = (value: number, base: number) =>
      base > 0 ? Math.round((value / base) * 10000) / 100 : 0;

    return {
      filters: {
        client_id: scopedClientId ?? null,
        event_id: query.event_id ?? null,
        date_from: query.date_from ?? null,
        date_to: query.date_to ?? null,
        source: query.source ?? null,
        crm_stage_id: query.crm_stage_id ?? null,
        search: search ?? null,
      },
      summary: {
        leads: total,
        funnel: {
          leads: total,
          scheduled: scheduledLeadIds.size,
          confirmed: confirmedLeadIds.size,
          checked_in: checkedInLeadIds.size,
          sold: soldLeadIds.size,
        },
        appointments: {
          records: appointments.length,
          leads: scheduledLeadIds.size,
          confirmed_leads: confirmedLeadIds.size,
          checked_in_leads: checkedInLeadIds.size,
        },
        sales: {
          records: sales.length,
          leads: soldLeadIds.size,
          revenue: revenue.toNumber(),
          average_ticket:
            sales.length > 0
              ? revenue.dividedBy(sales.length).toDecimalPlaces(2).toNumber()
              : 0,
        },
        rates: {
          lead_to_appointment: rate(scheduledLeadIds.size, total),
          appointment_to_checkin: rate(
            checkedInLeadIds.size,
            scheduledLeadIds.size,
          ),
          checkin_to_sale: rate(soldLeadIds.size, checkedInLeadIds.size),
          lead_to_sale: rate(soldLeadIds.size, total),
        },
        inconsistencies: {
          marked_scheduled_without_appointment:
            markedScheduledWithoutAppointment,
        },
        by_confirmation_status: status,
        by_source: sources,
        by_crm_stage: stages,
      },
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
      items,
      data_quality: {
        aggregation: "server",
        appointment_metrics: "real_appointment_records",
        checkin_metrics: "appointment_completion_or_checkin_timeline",
        sales_metrics: "real_sale_records",
        campaign_metrics: "event_executive_report",
      },
    };
  }

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
        participants: {
          select: {
            client_id: true,
            client: { select: { company_name: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException("Evento nao encontrado");
    }

    await this.assertEventRead(user, event);

    const participantClientIds = Array.from(
      new Set(event.participants.map((participant) => participant.client_id)),
    );

    const [
      leads,
      appointments,
      sales,
      teams,
      vendors,
      scoreRows,
      checkinTimelineRows,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { event_interest_id: eventId, deleted_at: null },
        select: {
          id: true,
          client_id: true,
          source: true,
          assigned_vendor_id: true,
          sold_by_vendor_id: true,
          team_id: true,
          created_at: true,
          confirmation_status: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: { event_id: eventId },
        select: {
          id: true,
          client_id: true,
          lead_id: true,
          status: true,
          source: true,
          created_by_id: true,
          created_at: true,
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
          role: "vendedor",
          client_id: { in: participantClientIds },
        },
        select: {
          id: true,
          name: true,
          client_id: true,
          avatar_url: true,
          vendor_category: true,
          vendor_categories: true,
        },
      }),
      this.prisma.scoreEvent.findMany({
        where: {
          OR: [
            { appointment: { event_id: eventId } },
            { lead: { event_interest_id: eventId } },
          ],
        },
        select: { vendor_id: true, points: true },
      }),
      this.prisma.leadTimeline.findMany({
        where: {
          event_type: "status_changed",
          to_value: ConfirmationStatus.checked_in,
          lead: { event_interest_id: eventId, deleted_at: null },
        },
        select: { lead_id: true, occurred_at: true },
        orderBy: { occurred_at: "asc" },
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
    const vendorTeam = new Map<
      string,
      { team_id: string; team_name: string }
    >();
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
    const noShowLeadIds = new Set<string>();
    leads.forEach((lead) => {
      const status = lead.confirmation_status;
      if (
        status === ConfirmationStatus.scheduled ||
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
        scheduledLeadIds.add(lead.id);
      }
      if (
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
        confirmedLeadIds.add(lead.id);
      }
      if (status === ConfirmationStatus.checked_in) {
        checkedInLeadIds.add(lead.id);
      }
    });
    appointments.forEach((appointment) => {
      if (appointment.status === AppointmentStatus.no_show) {
        noShowLeadIds.add(appointment.lead_id);
      }
    });
    const soldLeadIds = new Set([
      ...sales.map((sale) => sale.lead_id),
      ...leads.filter((lead) => lead.sold_by_vendor_id).map((lead) => lead.id),
    ]);

    const funnel = {
      leads: leads.length,
      scheduled: scheduledLeadIds.size,
      confirmed: confirmedLeadIds.size,
      checked_in: checkedInLeadIds.size,
      no_show: noShowLeadIds.size,
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
          vendor_name: found?.name ?? fallbackName ?? "Vendedor",
          vendor_avatar_url: found?.avatar_url ?? null,
          client_id: found?.client_id ?? fallbackClientId ?? null,
          team_id: teamInfo?.team_id ?? null,
          team_name: teamInfo?.team_name ?? null,
          leads: 0,
          scheduled: 0,
          confirmed: 0,
          checked_in: 0,
          sold: 0,
          revenue: 0,
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
      if (appointment.status !== AppointmentStatus.cancelled)
        bucket.scheduled += 1;
      if (appointment.confirmed_at) bucket.confirmed += 1;
      if (appointment.status === AppointmentStatus.completed)
        bucket.checked_in += 1;
    });

    sales.forEach((sale) => {
      const vendor = ensureVendor(sale.vendor_id);
      vendor.sold += 1;
      vendor.revenue += Number(sale.value);
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
        revenue: number;
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
        revenue: 0,
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
      teamBucket.revenue += vendor.revenue;
      teamBucket.points += vendor.points;
    });
    const teamRanking = Array.from(teamMap.values()).sort(
      (a, b) =>
        b.sold - a.sold ||
        b.checked_in - a.checked_in ||
        a.team_name.localeCompare(b.team_name),
    );

    // Fonte enxuta e autoritativa do Overview: somente agendamentos criados
    // por vendedores. Não depende do active_appointment do lead e não envia a
    // base inteira de leads ao navegador.
    const sellerAppointments = appointments
      .filter(
        (appointment) =>
          appointment.source === AppointmentSource.vendedor &&
          Boolean(appointment.created_by_id) &&
          appointment.status !== AppointmentStatus.cancelled &&
          appointment.status !== AppointmentStatus.rescheduled,
      )
      .map((appointment) => {
        const vendorId = appointment.created_by_id as string;
        const vendor = vendors.find((item) => item.id === vendorId);
        const team = vendorTeam.get(vendorId) ?? null;
        const vendorCategory =
          vendor?.vendor_category ?? vendor?.vendor_categories[0] ?? null;
        const segment = vendorCategory
          ? {
              novo: "Novo",
              semininovo: "Seminovo",
              pdc: "PCD",
              consorcio: "Consórcio",
              assinatura: "Assinatura",
            }[vendorCategory]
          : "Não informado";

        return {
          appointment_id: appointment.id,
          lead_id: appointment.lead_id,
          client_id: appointment.client_id,
          vendor_id: vendorId,
          vendor_name: vendor?.name ?? "Vendedor não identificado",
          team_id: team?.team_id ?? null,
          team_name: team?.team_name ?? null,
          created_at: appointment.created_at,
          scheduled_at: appointment.scheduled_at,
          segment,
        };
      });

    // Cars ──────────────────────────────────────────────────────────────────
    const segmentMap = new Map<SaleType, number>();
    const modelMap = new Map<string, number>();
    let totalValue = new Prisma.Decimal(0);
    sales.forEach((sale) => {
      segmentMap.set(sale.type, (segmentMap.get(sale.type) ?? 0) + 1);
      const modelKey = sale.model?.trim() || "Sem modelo";
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
    const daily = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

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

    // Chegadas reais: conclusão do agendamento é a fonte primária. Para
    // check-ins sem agendamento, usamos o status_changed registrado no instante
    // da leitura do voucher. Nunca usamos created_at/updated_at do lead.
    const arrivalByLead = new Map<
      string,
      { occurredAt: Date; source: "appointment" | "timeline" }
    >();
    for (const appointment of appointments) {
      if (!appointment.completed_at) continue;
      const current = arrivalByLead.get(appointment.lead_id);
      if (!current || appointment.completed_at < current.occurredAt) {
        arrivalByLead.set(appointment.lead_id, {
          occurredAt: appointment.completed_at,
          source: "appointment",
        });
      }
    }
    for (const row of checkinTimelineRows) {
      if (arrivalByLead.has(row.lead_id)) continue;
      arrivalByLead.set(row.lead_id, {
        occurredAt: row.occurred_at,
        source: "timeline",
      });
    }
    const arrivalHourMap = new Map<number, number>();
    const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: EVENT_TIMEZONE,
      hour: "2-digit",
      hourCycle: "h23",
    });
    arrivalByLead.forEach(({ occurredAt }) => {
      const hour = Number(hourFormatter.format(occurredAt));
      if (Number.isNaN(hour)) return;
      arrivalHourMap.set(hour, (arrivalHourMap.get(hour) ?? 0) + 1);
    });
    const arrivalsByHour = [...arrivalHourMap.entries()]
      .sort(([left], [right]) => left - right)
      .map(([hour, count]) => ({ hour, count }));

    const participantMetrics = event.participants.map((participant) => {
      const participantLeadIds = new Set(
        leads
          .filter((lead) => lead.client_id === participant.client_id)
          .map((lead) => lead.id),
      );
      const participantSales = sales.filter((sale) =>
        participantLeadIds.has(sale.lead_id),
      );
      const participantVendorIds = new Set(
        vendors
          .filter((vendor) => vendor.client_id === participant.client_id)
          .map((vendor) => vendor.id),
      );

      return {
        client_id: participant.client_id,
        company_name:
          participant.client?.company_name ?? "Empresa participante",
        vendors: participantVendorIds.size,
        teams: teams.filter((team) =>
          team.members.some((member) =>
            participantVendorIds.has(member.user_id),
          ),
        ).length,
        leads: participantLeadIds.size,
        scheduled: [...participantLeadIds].filter((id) =>
          scheduledLeadIds.has(id),
        ).length,
        confirmed: [...participantLeadIds].filter((id) =>
          confirmedLeadIds.has(id),
        ).length,
        checked_in: [...participantLeadIds].filter((id) =>
          checkedInLeadIds.has(id),
        ).length,
        sold: [...participantLeadIds].filter((id) => soldLeadIds.has(id))
          .length,
        revenue: participantSales.reduce(
          (total, sale) => total + Number(sale.value ?? 0),
          0,
        ),
      };
    });

    // Buscar chamadas de vendedores ativas no Redis
    const activeCalls: unknown[] = [];
    for (const clientId of participantClientIds) {
      try {
        const [, keys] = await this.redis.client.scan(
          "0",
          "MATCH",
          `vendor_call:${clientId}:*`,
          "COUNT",
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
        participants: participantMetrics,
      },
      funnel,
      vendors: vendorRanking,
      teams: teamRanking,
      seller_appointments: sellerAppointments,
      seller_appointments_rule: "appointment_source_vendor" as const,
      cars: {
        by_segment: carsBySegment,
        top_models: topModels,
        total_value: totalValue.toString(),
      },
      daily,
      checkin_by_source: checkinBySource,
      arrivals_by_hour: arrivalsByHour,
      arrival_data_quality: {
        checked_in_leads: checkedInLeadIds.size,
        with_real_timestamp: arrivalByLead.size,
        missing_timestamp: Math.max(
          checkedInLeadIds.size - arrivalByLead.size,
          0,
        ),
        coverage_percent:
          checkedInLeadIds.size > 0
            ? Math.round((arrivalByLead.size / checkedInLeadIds.size) * 10000) /
              100
            : 100,
        appointment_timestamps: [...arrivalByLead.values()].filter(
          (entry) => entry.source === "appointment",
        ).length,
        timeline_timestamps: [...arrivalByLead.values()].filter(
          (entry) => entry.source === "timeline",
        ).length,
      },
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
        status: "active",
        participants: { some: { client_id: { in: clientIds } } },
      },
      orderBy: { event_date: "asc" },
      select: { id: true, name: true, event_date: true, location: true },
    });

    if (events.length === 0) return [];

    const eventIds = events.map((event) => event.id);

    const [leadGroups, sales] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ["event_interest_id", "confirmation_status"],
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
      if (
        status === ConfirmationStatus.confirmed ||
        status === ConfirmationStatus.checked_in
      ) {
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

  private async resolveAccessibleClientIds(
    user: AuthenticatedUser,
  ): Promise<string[]> {
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

    throw new ForbiddenException("Sem permissao");
  }

  private toIsoDate(date: Date): string {
    // Bucket por dia no fuso de São Paulo (eventos sempre rodam em BR).
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: EVENT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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
        launch_date: true,
        event_date: true,
        event_end_date: true,
        total_investment: true,
        paid_traffic_investment: true,
        participants: { select: { client_id: true } },
      },
    });
    if (!event) {
      throw new NotFoundException("Evento nao encontrado");
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
      ratingDetailRows,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { event_interest_id: eventId, deleted_at: null },
        select: {
          id: true,
          confirmation_status: true,
          vehicle_plate: true,
          vehicle_brand: true,
          vehicle_model: true,
          vehicle_year: true,
          vehicle_fipe_value: true,
        },
      }),
      this.prisma.sale.findMany({
        where: { appointment: { event_id: eventId } },
        select: {
          id: true,
          lead_id: true,
          appointment_id: true,
          vendor_id: true,
          team_id: true,
          value: true,
          sold_at: true,
          model: true,
          type: true,
        },
      }),
      this.prisma.metaLeadImport.findMany({
        where: {
          client_id: { in: clientIds },
          lead_id: { not: null },
          lead: { deleted_at: null },
          OR: [
            { event_id: eventId },
            { event_id: null, lead: { event_interest_id: eventId } },
          ],
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
        select: {
          id: true,
          lead_id: true,
          status: true,
          source: true,
          created_by_type: true,
          completed_at: true,
          created_at: true,
        },
      }),
      this.prisma.metaCampaignAssignment.findMany({
        where: { event_id: eventId, client_id: { in: clientIds } },
        select: { meta_campaign_id: true },
      }),
      this.prisma.serviceRating.groupBy({
        by: ["vendor_id"],
        where: { event_id: eventId },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.serviceRating.findMany({
        where: { event_id: eventId },
        select: {
          event_score: true,
          nps_score: true,
          google_review_requested_at: true,
          google_review_clicked_at: true,
          google_review_verified_at: true,
        },
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
      if (
        !current ||
        attributionOccurredAt(entry) > attributionOccurredAt(current)
      ) {
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
    for (const adSet of metaAdSets)
      adSetName.set(adSet.meta_ad_set_id, adSet.name);
    const adName = new Map<string, string>();
    for (const ad of metaAds) adName.set(ad.meta_ad_id, ad.name);

    const revenueByLead = new Map<string, number>();
    for (const sale of sales) {
      revenueByLead.set(
        sale.lead_id,
        (revenueByLead.get(sale.lead_id) ?? 0) + Number(sale.value),
      );
    }
    const soldLeadIds = new Set(sales.map((s) => s.lead_id));

    type Attr = {
      level: "campaign" | "adset" | "ad";
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
      meta_leads: number;
      impressions: number;
      reach: number;
      conversations: number;
      cpl: number;
      cost_per_conversation: number;
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
      level: Attr["level"],
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
          meta_leads: 0,
          impressions: 0,
          reach: 0,
          conversations: 0,
          cpl: 0,
          cost_per_conversation: 0,
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
        "campaign",
        campaignId,
        campaignName.get(campaignId) ?? "Campanha sem nome",
        campaignId,
        null,
      );
    }
    for (const adSet of metaAdSets) {
      if (
        !adSet.meta_campaign_id ||
        !reportCampaignIds.has(adSet.meta_campaign_id)
      )
        continue;
      ensureAttr(
        "adset",
        adSet.meta_ad_set_id,
        adSet.name,
        adSet.meta_campaign_id,
        adSet.meta_ad_set_id,
      );
    }
    for (const ad of metaAds) {
      if (!ad.meta_campaign_id || !reportCampaignIds.has(ad.meta_campaign_id))
        continue;
      ensureAttr(
        "ad",
        ad.meta_ad_id,
        ad.name,
        ad.meta_campaign_id,
        ad.meta_ad_set_id,
      );
    }

    for (const [leadId, entry] of latestImportByLead) {
      const rows: Attr[] = [];
      if (entry.meta_campaign_id) {
        rows.push(
          ensureAttr(
            "campaign",
            entry.meta_campaign_id,
            entry.meta_campaign_name ??
              campaignName.get(entry.meta_campaign_id) ??
              "Campanha sem nome",
            entry.meta_campaign_id,
            null,
          ),
        );
      }
      if (entry.meta_ad_set_id) {
        rows.push(
          ensureAttr(
            "adset",
            entry.meta_ad_set_id,
            entry.meta_ad_set_name ??
              adSetName.get(entry.meta_ad_set_id) ??
              "Conjunto sem nome",
            entry.meta_campaign_id,
            entry.meta_ad_set_id,
          ),
        );
      }
      if (entry.meta_ad_id) {
        rows.push(
          ensureAttr(
            "ad",
            entry.meta_ad_id,
            entry.meta_ad_name ??
              adName.get(entry.meta_ad_id) ??
              "Anuncio sem nome",
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
    const defaultLookbackDays = 30;
    const reportFrom = event.launch_date
      ? new Date(event.launch_date)
      : new Date(
          event.event_date.getTime() -
            defaultLookbackDays * 24 * 60 * 60 * 1000,
        );
    reportFrom.setUTCHours(0, 0, 0, 0);
    const reportTo = new Date(event.event_end_date ?? event.event_date);
    reportTo.setUTCHours(23, 59, 59, 999);
    const insightEntityFilters: Prisma.MetaDailyInsightWhereInput[] = [];
    if (campaignIds.length > 0) {
      insightEntityFilters.push({
        level: "campaign",
        entity_id: { in: campaignIds },
      });
    }
    if (adSetIds.length > 0) {
      insightEntityFilters.push({
        level: "adset",
        entity_id: { in: adSetIds },
      });
    }
    if (adIds.length > 0) {
      insightEntityFilters.push({ level: "ad", entity_id: { in: adIds } });
    }
    const insightRows =
      insightEntityFilters.length > 0
        ? await this.prisma.metaDailyInsight.findMany({
            where: {
              client_id: { in: clientIds },
              date: { gte: reportFrom, lte: reportTo },
              OR: insightEntityFilters,
            },
            select: {
              level: true,
              entity_id: true,
              spend: true,
              leads: true,
              impressions: true,
              reach: true,
              raw_payload: true,
            },
          })
        : [];
    for (const insight of insightRows) {
      if (
        insight.level !== "campaign" &&
        insight.level !== "adset" &&
        insight.level !== "ad"
      ) {
        continue;
      }
      const row = attributionMaps[insight.level].get(insight.entity_id);
      if (row) {
        row.spend += Number(insight.spend ?? 0);
        row.meta_leads += insight.leads ?? 0;
        row.impressions += insight.impressions ?? 0;
        row.reach += insight.reach ?? 0;
        const actions = (
          insight.raw_payload as {
            actions?: Array<{ action_type?: string; value?: string }>;
          } | null
        )?.actions;
        const conversationAction = actions?.find(
          ({ action_type }) =>
            action_type ===
              "onsite_conversion.messaging_conversation_started_7d" ||
            action_type === "messaging_conversation_started_7d",
        );
        const conversationCount = Number(conversationAction?.value ?? 0);
        if (Number.isFinite(conversationCount) && conversationCount >= 0) {
          row.conversations += conversationCount;
        }
      }
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const finalize = (rows: Map<string, Attr>) =>
      [...rows.values()]
        .map((row) => ({
          ...row,
          revenue: round2(row.revenue),
          spend: round2(row.spend),
          meta_leads: row.meta_leads,
          impressions: row.impressions,
          reach: row.reach,
          conversations: row.conversations,
          cpl: row.leads > 0 ? round2(row.spend / row.leads) : 0,
          cost_per_conversation:
            row.conversations > 0 ? round2(row.spend / row.conversations) : 0,
          cost_per_scheduled:
            row.scheduled > 0 ? round2(row.spend / row.scheduled) : 0,
          cost_per_sale: row.sold > 0 ? round2(row.spend / row.sold) : 0,
          roas: row.spend > 0 ? round2(row.revenue / row.spend) : 0,
          roi_percent:
            row.spend > 0
              ? round2(((row.revenue - row.spend) / row.spend) * 100)
              : 0,
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
      [...latestImportByLead.keys()].filter((leadId) =>
        soldLeadIds.has(leadId),
      ),
    ).size;

    // ── Rubinho e atribuicao operacional ──
    // As categorias abaixo sao mutuamente exclusivas. A precedencia evita
    // atribuir a mesma jornada mais de uma vez:
    // recuperado > originado > influenciado > humano/manual.
    const agentAppointments = appointments.filter(
      (appointment) =>
        appointment.source === "n8n_ai_agent" ||
        appointment.created_by_type === "external_agent",
    );
    const agentAppointmentLeadIds = new Set(
      agentAppointments.map((appointment) => appointment.lead_id),
    );
    const agentCompletedLeadIds = new Set(
      agentAppointments
        .filter(
          (appointment) =>
            appointment.status === AppointmentStatus.completed ||
            Boolean(appointment.completed_at),
        )
        .map((appointment) => appointment.lead_id),
    );
    const agentSales = sales.filter((sale) =>
      agentAppointmentLeadIds.has(sale.lead_id),
    );
    const agentSoldLeadIds = new Set(agentSales.map((sale) => sale.lead_id));

    const [rubinhoMessages, dispatches, agentLogCount] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          author_type: "rubinho",
          conversation: {
            lead: { event_interest_id: eventId },
          },
        },
        select: {
          conversation_id: true,
          created_at: true,
          conversation: { select: { lead_id: true } },
        },
      }),
      this.prisma.dispatchEvent.findMany({
        where: {
          OR: [
            { event_id: eventId },
            { event_id: null, lead: { event_interest_id: eventId } },
          ],
        },
        select: {
          lead_id: true,
          appointment_id: true,
          sale_id: true,
          workflow_key: true,
          dispatch_type: true,
          sent_at: true,
          replied_at: true,
          converted_at: true,
        },
      }),
      this.prisma.agentActionLog.count({
        where: { lead: { event_interest_id: eventId } },
      }),
    ]);

    const firstRubinhoMessageByLead = new Map<string, Date>();
    for (const message of rubinhoMessages) {
      const leadId = message.conversation.lead_id;
      const current = firstRubinhoMessageByLead.get(leadId);
      if (!current || message.created_at < current) {
        firstRubinhoMessageByLead.set(leadId, message.created_at);
      }
    }

    const recoveryPattern =
      /follow[\s_-]?up|reativa|recuper|no[\s_-]?show|lembrete/i;
    const recoveryDispatches = dispatches.filter((dispatch) => {
      const recoveryFlow = recoveryPattern.test(
        `${dispatch.workflow_key} ${dispatch.dispatch_type}`,
      );
      const producedOutcome = Boolean(
        dispatch.replied_at ||
        dispatch.converted_at ||
        dispatch.appointment_id ||
        dispatch.sale_id,
      );
      return recoveryFlow && producedOutcome;
    });
    const recoveredAppointmentIds = new Set(
      recoveryDispatches
        .map((dispatch) => dispatch.appointment_id)
        .filter((id): id is string => Boolean(id)),
    );
    const recoveredSaleIds = new Set(
      recoveryDispatches
        .map((dispatch) => dispatch.sale_id)
        .filter((id): id is string => Boolean(id)),
    );
    const recoveryByLead = new Map<string, Date>();
    for (const dispatch of recoveryDispatches) {
      const occurredAt =
        dispatch.converted_at ?? dispatch.replied_at ?? dispatch.sent_at;
      if (!occurredAt) continue;
      const current = recoveryByLead.get(dispatch.lead_id);
      if (!current || occurredAt < current) {
        recoveryByLead.set(dispatch.lead_id, occurredAt);
      }
    }

    type AttributionBucket =
      "originated" | "influenced" | "recovered" | "manual";
    const appointmentBucketById = new Map<string, AttributionBucket>();
    const classifyAppointment = (
      appointment: (typeof appointments)[number],
    ): AttributionBucket => {
      const recoveredAt = recoveryByLead.get(appointment.lead_id);
      if (
        recoveredAppointmentIds.has(appointment.id) ||
        (recoveredAt && recoveredAt <= appointment.created_at)
      ) {
        return "recovered";
      }
      if (
        appointment.source === "n8n_ai_agent" ||
        appointment.created_by_type === "external_agent"
      ) {
        return "originated";
      }
      const firstRubinhoMessage = firstRubinhoMessageByLead.get(
        appointment.lead_id,
      );
      if (
        firstRubinhoMessage &&
        firstRubinhoMessage <= appointment.created_at
      ) {
        return "influenced";
      }
      return "manual";
    };

    const bucketStats = () => ({
      leadIds: new Set<string>(),
      appointments: 0,
      checkedIn: 0,
      sales: 0,
      revenue: 0,
    });
    const buckets: Record<AttributionBucket, ReturnType<typeof bucketStats>> = {
      originated: bucketStats(),
      influenced: bucketStats(),
      recovered: bucketStats(),
      manual: bucketStats(),
    };
    for (const appointment of appointments) {
      const bucket = classifyAppointment(appointment);
      appointmentBucketById.set(appointment.id, bucket);
      const stats = buckets[bucket];
      stats.leadIds.add(appointment.lead_id);
      stats.appointments += 1;
      if (
        appointment.status === AppointmentStatus.completed ||
        appointment.completed_at
      ) {
        stats.checkedIn += 1;
      }
    }
    for (const sale of sales) {
      let bucket = appointmentBucketById.get(sale.appointment_id);
      if (!bucket && recoveredSaleIds.has(sale.id)) bucket = "recovered";
      if (!bucket) {
        const firstRubinhoMessage = firstRubinhoMessageByLead.get(sale.lead_id);
        bucket =
          firstRubinhoMessage && firstRubinhoMessage <= sale.sold_at
            ? "influenced"
            : "manual";
      }
      const stats = buckets[bucket];
      stats.leadIds.add(sale.lead_id);
      stats.sales += 1;
      stats.revenue += Number(sale.value);
    }
    const presentBucket = (stats: ReturnType<typeof bucketStats>) => ({
      leads: stats.leadIds.size,
      appointments: stats.appointments,
      checked_in: stats.checkedIn,
      sales: stats.sales,
      revenue: round2(stats.revenue),
    });
    const attributionBreakdown = {
      originated: presentBucket(buckets.originated),
      influenced: presentBucket(buckets.influenced),
      recovered: presentBucket(buckets.recovered),
      manual: presentBucket(buckets.manual),
      precedence: ["recovered", "originated", "influenced", "manual"],
    };

    // A propriedade do agendamento é independente da influência da jornada.
    // Um contato anterior do Rubinho não transfere para a IA o crédito de um
    // agendamento efetivamente criado pelo vendedor ou por outra pessoa.
    type AppointmentOwner = "rubinho" | "seller" | "human_manual";
    const ownerByAppointmentId = new Map<string, AppointmentOwner>();
    const ownerBuckets: Record<
      AppointmentOwner,
      ReturnType<typeof bucketStats>
    > = {
      rubinho: bucketStats(),
      seller: bucketStats(),
      human_manual: bucketStats(),
    };
    for (const appointment of appointments) {
      const owner: AppointmentOwner =
        appointment.source === "n8n_ai_agent" ||
        appointment.created_by_type === "external_agent"
          ? "rubinho"
          : appointment.source === "vendedor"
            ? "seller"
            : "human_manual";
      ownerByAppointmentId.set(appointment.id, owner);
      const stats = ownerBuckets[owner];
      stats.leadIds.add(appointment.lead_id);
      stats.appointments += 1;
      if (
        appointment.status === AppointmentStatus.completed ||
        appointment.completed_at
      ) {
        stats.checkedIn += 1;
      }
    }
    for (const sale of sales) {
      const owner =
        ownerByAppointmentId.get(sale.appointment_id) ?? "human_manual";
      const stats = ownerBuckets[owner];
      stats.leadIds.add(sale.lead_id);
      stats.sales += 1;
      stats.revenue += Number(sale.value);
    }
    const appointmentOwnership = {
      rubinho: presentBucket(ownerBuckets.rubinho),
      seller: presentBucket(ownerBuckets.seller),
      human_manual: presentBucket(ownerBuckets.human_manual),
      rule: "appointment_creator" as const,
    };

    const agentRevenue = agentSales.reduce(
      (sum, sale) => sum + Number(sale.value),
      0,
    );
    const rubinho = {
      mensagens: rubinhoMessages.length,
      conversas_iniciadas: new Set(
        rubinhoMessages.map((message) => message.conversation_id),
      ).size,
      credenciamentos: agentAppointmentLeadIds.size,
      agendamentos: agentAppointments.length,
      comparecimentos: agentCompletedLeadIds.size,
      taxa_comparecimento:
        agentAppointmentLeadIds.size > 0
          ? (agentCompletedLeadIds.size / agentAppointmentLeadIds.size) * 100
          : 0,
      vendas_originadas: agentSoldLeadIds.size,
      receita_influenciada: Math.round(agentRevenue * 100) / 100,
      acoes_ia: agentLogCount,
      attribution_method: "agent_created_appointment" as const,
      attribution_breakdown: attributionBreakdown,
      appointment_ownership: appointmentOwnership,
    };

    // ── Histórico (últimos eventos do mesmo cliente) ──
    const historyEvents = await this.prisma.event.findMany({
      where: { client_id: event.client_id },
      orderBy: { event_date: "desc" },
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
          if (
            s === ConfirmationStatus.confirmed ||
            s === ConfirmationStatus.checked_in
          )
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
      avg_score:
        r._avg.score != null ? Math.round(r._avg.score * 100) / 100 : 0,
      count: r._count._all,
    }));
    const totalRatings = vendorRatings.reduce((s, r) => s + r.count, 0);
    const overallAvg =
      totalRatings > 0
        ? Math.round(
            (vendorRatings.reduce((s, r) => s + r.avg_score * r.count, 0) /
              totalRatings) *
              100,
          ) / 100
        : 0;
    const eventScores = ratingDetailRows
      .map((row) => row.event_score)
      .filter((score): score is number => score !== null);
    const npsScores = ratingDetailRows
      .map((row) => row.nps_score)
      .filter((score): score is number => score !== null);
    const promoters = npsScores.filter((score) => score >= 9).length;
    const passives = npsScores.filter(
      (score) => score >= 7 && score <= 8,
    ).length;
    const detractors = npsScores.filter((score) => score <= 6).length;
    const eventFeedback = {
      event_rating: {
        average:
          eventScores.length > 0
            ? round2(
                eventScores.reduce((sum, score) => sum + score, 0) /
                  eventScores.length,
              )
            : 0,
        responses: eventScores.length,
      },
      nps: {
        score:
          npsScores.length > 0
            ? round2(((promoters - detractors) / npsScores.length) * 100)
            : 0,
        responses: npsScores.length,
        promoters,
        passives,
        detractors,
      },
      google: {
        requested: ratingDetailRows.filter(
          (row) => row.google_review_requested_at,
        ).length,
        clicked: ratingDetailRows.filter((row) => row.google_review_clicked_at)
          .length,
        verified_published: ratingDetailRows.filter(
          (row) => row.google_review_verified_at,
        ).length,
      },
    };

    const parseFipeValue = (raw: string | null): number | null => {
      if (!raw?.trim()) return null;
      const normalized = raw
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/[^0-9,.-]/g, "");
      if (!/[0-9]/.test(normalized)) return null;
      const numeric = normalized.includes(",")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized;
      const parsed = Number(numeric);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const identifiedVehicles = leads.filter(
      (lead) =>
        lead.vehicle_plate ||
        lead.vehicle_brand ||
        lead.vehicle_model ||
        lead.vehicle_year ||
        lead.vehicle_fipe_value,
    );
    const fipeByLead = new Map<string, number>();
    for (const lead of identifiedVehicles) {
      const value = parseFipeValue(lead.vehicle_fipe_value);
      if (value !== null) fipeByLead.set(lead.id, value);
    }
    const countVehicleField = (
      read: (lead: (typeof leads)[number]) => string | null,
    ) => {
      const counts = new Map<string, number>();
      for (const lead of identifiedVehicles) {
        const value = read(lead)?.trim();
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.name.localeCompare(right.name),
        )
        .slice(0, 15);
    };
    const ranges = [
      { key: "up_to_30k", label: "Até R$ 30 mil", min: 0, max: 30000 },
      {
        key: "30k_to_60k",
        label: "R$ 30 mil a R$ 60 mil",
        min: 30000,
        max: 60000,
      },
      {
        key: "60k_to_100k",
        label: "R$ 60 mil a R$ 100 mil",
        min: 60000,
        max: 100000,
      },
      {
        key: "above_100k",
        label: "Acima de R$ 100 mil",
        min: 100000,
        max: Number.POSITIVE_INFINITY,
      },
    ];
    const fipeRanges = ranges.map((range) => {
      const leadIds = [...fipeByLead.entries()]
        .filter(([, value]) => value >= range.min && value < range.max)
        .map(([leadId]) => leadId);
      const sold = leadIds.filter((leadId) => soldLeadIds.has(leadId)).length;
      return {
        key: range.key,
        label: range.label,
        leads: leadIds.length,
        sold,
        conversion_percent:
          leadIds.length > 0 ? round2((sold / leadIds.length) * 100) : 0,
      };
    });
    const fipeValues = [...fipeByLead.values()];
    const soldWithVehicle = identifiedVehicles.filter((lead) =>
      soldLeadIds.has(lead.id),
    ).length;
    const soldModelCounts = new Map<string, number>();
    for (const sale of sales) {
      const model = sale.model?.trim() || "Sem modelo";
      soldModelCounts.set(model, (soldModelCounts.get(model) ?? 0) + 1);
    }
    const vehicleIntelligence = {
      coverage: {
        total_leads: leads.length,
        identified_vehicles: identifiedVehicles.length,
        with_fipe_value: fipeByLead.size,
        vehicle_percent:
          leads.length > 0
            ? round2((identifiedVehicles.length / leads.length) * 100)
            : 0,
        fipe_percent:
          identifiedVehicles.length > 0
            ? round2((fipeByLead.size / identifiedVehicles.length) * 100)
            : 0,
      },
      trade_in_fleet: {
        total_fipe: round2(fipeValues.reduce((sum, value) => sum + value, 0)),
        average_fipe:
          fipeValues.length > 0
            ? round2(
                fipeValues.reduce((sum, value) => sum + value, 0) /
                  fipeValues.length,
              )
            : 0,
        by_brand: countVehicleField((lead) => lead.vehicle_brand),
        by_model: countVehicleField((lead) => lead.vehicle_model),
        by_year: countVehicleField((lead) => lead.vehicle_year),
        by_fipe_range: fipeRanges,
      },
      conversion: {
        identified_vehicle_leads: identifiedVehicles.length,
        sold_with_vehicle: soldWithVehicle,
        conversion_percent:
          identifiedVehicles.length > 0
            ? round2((soldWithVehicle / identifiedVehicles.length) * 100)
            : 0,
        identified_not_sold: identifiedVehicles.length - soldWithVehicle,
      },
      sold_vehicles: [...soldModelCounts.entries()]
        .map(([model, count]) => ({ model, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.model.localeCompare(right.model),
        ),
      desired_vehicle: {
        available: false,
        reason: "Modelo desejado ainda não é coletado em campo estruturado.",
      },
    };

    const revenueByVendor = new Map<
      string,
      { sales: number; revenue: number }
    >();
    const revenueByTeam = new Map<string, { sales: number; revenue: number }>();
    let unassignedTeamSales = 0;
    let unassignedTeamRevenue = 0;
    for (const sale of sales) {
      const value = Number(sale.value);
      const vendor = revenueByVendor.get(sale.vendor_id) ?? {
        sales: 0,
        revenue: 0,
      };
      vendor.sales += 1;
      vendor.revenue += value;
      revenueByVendor.set(sale.vendor_id, vendor);

      if (sale.team_id) {
        const team = revenueByTeam.get(sale.team_id) ?? {
          sales: 0,
          revenue: 0,
        };
        team.sales += 1;
        team.revenue += value;
        revenueByTeam.set(sale.team_id, team);
      } else {
        unassignedTeamSales += 1;
        unassignedTeamRevenue += value;
      }
    }
    const totalCommercialRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.value),
      0,
    );

    return {
      event_id: eventId,
      investment: {
        total:
          event.total_investment != null
            ? Number(event.total_investment)
            : null,
        paid_traffic:
          event.paid_traffic_investment != null
            ? Number(event.paid_traffic_investment)
            : null,
      },
      ratings: {
        overall_avg: overallAvg,
        total: totalRatings,
        by_vendor: vendorRatings,
      },
      event_feedback: eventFeedback,
      vehicle_intelligence: vehicleIntelligence,
      attribution,
      attribution_by_level: {
        campaigns: campaignAttribution,
        ad_sets: adSetAttribution,
        ads: adAttribution,
      },
      attribution_period: {
        from: reportFrom,
        to: reportTo,
        source: event.launch_date ? "event_launch_date" : "default_30_days",
        timezone: EVENT_TIMEZONE,
        default_lookback_days: event.launch_date ? null : defaultLookbackDays,
        campaigns_started_before_window: campaignStarts.filter(
          (start) => start < reportFrom,
        ).length,
      },
      attribution_coverage: {
        attributed_leads: attributedLeadCount,
        total_leads: eventLeadIds.size,
        attributed_sold: attributedSold,
        total_sold: soldLeadIds.size,
      },
      rubinho,
      commercial_revenue: {
        total_sales: sales.length,
        total_revenue: round2(totalCommercialRevenue),
        by_vendor: [...revenueByVendor.entries()].map(([vendorId, totals]) => ({
          vendor_id: vendorId,
          sales: totals.sales,
          revenue: round2(totals.revenue),
          average_ticket:
            totals.sales > 0 ? round2(totals.revenue / totals.sales) : 0,
        })),
        by_team: [...revenueByTeam.entries()].map(([teamId, totals]) => ({
          team_id: teamId,
          sales: totals.sales,
          revenue: round2(totals.revenue),
          average_ticket:
            totals.sales > 0 ? round2(totals.revenue / totals.sales) : 0,
        })),
        coverage: {
          vendor_sales: sales.length,
          vendor_percent: 100,
          team_sales: sales.length - unassignedTeamSales,
          team_percent:
            sales.length > 0
              ? round2(
                  ((sales.length - unassignedTeamSales) / sales.length) * 100,
                )
              : 100,
          unassigned_team_sales: unassignedTeamSales,
          unassigned_team_revenue: round2(unassignedTeamRevenue),
        },
      },
      data_quality: {
        real: [
          "funnel",
          "revenue",
          "sales_by_vendor",
          "sales_by_team",
          "ratings",
        ],
        attributed: ["meta_last_touch", "rubinho_agent_created_appointment"],
        estimated: ["profit_by_segment_margin", "grand_prix_score"],
        warnings: [
          ...(event.launch_date
            ? []
            : [
                "Janela Meta usa 30 dias antes do evento porque a data de lançamento não foi informada.",
              ]),
          ...(campaignStarts.some((start) => start < reportFrom)
            ? [
                "Há campanhas iniciadas antes da janela; o gasto anterior não foi incluído.",
              ]
            : []),
        ],
      },
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
        throw new ForbiddenException("Sem permissao");
      }
      return;
    }

    if (
      (user.role === Role.CLIENTE ||
        user.role === Role.VENDEDOR ||
        user.role === Role.RECEPCAO) &&
      user.client_id &&
      participantIds.includes(user.client_id)
    ) {
      return;
    }

    throw new ForbiddenException("Sem permissao");
  }
}
