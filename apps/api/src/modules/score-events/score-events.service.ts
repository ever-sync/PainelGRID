import { Injectable } from "@nestjs/common";
import { ScoreEventKind } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";

const DEFAULT_SCORE_POINTS: Record<ScoreEventKind, number> = {
  contacted: 0,
  scheduled: 2,
  checked_in: 3,
  sold: 7,
};

type ScoreTx = {
  scoreEvent: PrismaService["scoreEvent"];
  client: PrismaService["client"];
};

export type ScoreEventInput = {
  client_id: string;
  vendor_id: string;
  lead_id: string;
  appointment_id?: string | null;
  sale_id?: string | null;
  kind: ScoreEventKind;
  earned_at?: Date;
};

export type VendorScoreRankingItem = {
  vendor_id: string;
  vendor_name: string;
  total_points: number;
  assigned: number;
  visits: number;
  sales: number;
  contacted: { points: number; count: number };
  scheduled: { points: number; count: number };
  checked_in: { points: number; count: number };
  sold: { points: number; count: number };
};

@Injectable()
export class ScoreEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async award(input: ScoreEventInput) {
    return this.awardWithTx(this.prisma, input);
  }

  async awardWithTx(tx: ScoreTx, input: ScoreEventInput) {
    const client = await tx.client.findUnique({
      where: { id: input.client_id },
      select: { settings: true },
    });
    const settings =
      client?.settings &&
      typeof client.settings === "object" &&
      !Array.isArray(client.settings)
        ? (client.settings as Record<string, unknown>)
        : {};
    const rules =
      settings.score_rules &&
      typeof settings.score_rules === "object" &&
      !Array.isArray(settings.score_rules)
        ? (settings.score_rules as Record<string, unknown>)
        : {};
    const configuredPoints =
      input.kind === "scheduled"
        ? rules.scheduled_points
        : input.kind === "checked_in"
          ? rules.checkin_points
          : input.kind === "sold"
            ? rules.sold_points
            : undefined;
    const points =
      typeof configuredPoints === "number" &&
      Number.isInteger(configuredPoints) &&
      configuredPoints >= 0
        ? configuredPoints
        : DEFAULT_SCORE_POINTS[input.kind];

    return tx.scoreEvent.upsert({
      where: {
        client_id_vendor_id_lead_id_kind: {
          client_id: input.client_id,
          vendor_id: input.vendor_id,
          lead_id: input.lead_id,
          kind: input.kind,
        },
      },
      create: {
        client_id: input.client_id,
        vendor_id: input.vendor_id,
        lead_id: input.lead_id,
        appointment_id: input.appointment_id ?? null,
        sale_id: input.sale_id ?? null,
        kind: input.kind,
        points,
        earned_at: input.earned_at ?? new Date(),
      },
      update: {
        appointment_id: input.appointment_id ?? undefined,
        sale_id: input.sale_id ?? undefined,
      },
    });
  }

  async summaryForVendor(vendorId: string, clientId: string) {
    const rows = await this.prisma.scoreEvent.groupBy({
      by: ["kind"],
      where: {
        vendor_id: vendorId,
        client_id: clientId,
        lead: {
          assigned_vendor_id: vendorId,
          deleted_at: null,
        },
      },
      _sum: { points: true },
      _count: { _all: true },
    });

    const byKind = {
      contacted: { points: 0, count: 0 },
      scheduled: { points: 0, count: 0 },
      checked_in: { points: 0, count: 0 },
      sold: { points: 0, count: 0 },
    };

    rows.forEach((row) => {
      byKind[row.kind] = {
        points: row._sum.points ?? 0,
        count: row._count._all,
      };
    });

    return {
      vendor_id: vendorId,
      client_id: clientId,
      total_points:
        byKind.scheduled.points + byKind.checked_in.points + byKind.sold.points,
      contacted: byKind.contacted,
      scheduled: byKind.scheduled,
      checked_in: byKind.checked_in,
      sold: byKind.sold,
    };
  }

  async rankingForClient(params: {
    clientId: string;
    eventId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<VendorScoreRankingItem[]> {
    const groupedRows = await this.prisma.scoreEvent.groupBy({
      by: ["vendor_id", "kind"],
      where: {
        client_id: params.clientId,
        lead: {
          deleted_at: null,
        },
        ...(params.eventId
          ? {
              appointment: {
                event_id: params.eventId,
              },
            }
          : {}),
        earned_at: {
          gte: params.from,
          lte: params.to,
        },
      },
      _sum: { points: true },
      _count: { _all: true },
    });

    const allClientVendors = await this.prisma.user.findMany({
      where: {
        client_id: params.clientId,
        role: "vendedor",
        is_active: true,
      },
      select: { id: true, name: true },
    });

    const vendorIds = Array.from(
      new Set([
        ...allClientVendors.map((v) => v.id),
        ...groupedRows.map((row) => row.vendor_id),
      ]),
    );

    const [assignedCounts] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ["assigned_vendor_id"],
        where: {
          client_id: params.clientId,
          deleted_at: null,
          ...(params.eventId ? { event_interest_id: params.eventId } : {}),
          assigned_vendor_id: { in: vendorIds },
        },
        _count: { _all: true },
      }),
    ]);

    const vendorNameById = new Map(
      allClientVendors.map((vendor) => [vendor.id, vendor.name] as const),
    );
    const assignedByVendorId = new Map(
      assignedCounts
        .filter((row) => !!row.assigned_vendor_id)
        .map(
          (row) => [row.assigned_vendor_id as string, row._count._all] as const,
        ),
    );

    const byVendor = new Map<string, VendorScoreRankingItem>();

    // Inicializa todos os vendedores da empresa
    allClientVendors.forEach((v) => {
      byVendor.set(v.id, {
        vendor_id: v.id,
        vendor_name: v.name,
        total_points: 0,
        assigned: assignedByVendorId.get(v.id) ?? 0,
        visits: 0,
        sales: 0,
        contacted: { points: 0, count: 0 },
        scheduled: { points: 0, count: 0 },
        checked_in: { points: 0, count: 0 },
        sold: { points: 0, count: 0 },
      });
    });

    groupedRows.forEach((row) => {
      const current = byVendor.get(row.vendor_id) ?? {
        vendor_id: row.vendor_id,
        vendor_name: vendorNameById.get(row.vendor_id) ?? "Vendedor",
        total_points: 0,
        assigned: assignedByVendorId.get(row.vendor_id) ?? 0,
        visits: 0,
        sales: 0,
        contacted: { points: 0, count: 0 },
        scheduled: { points: 0, count: 0 },
        checked_in: { points: 0, count: 0 },
        sold: { points: 0, count: 0 },
      };
      const points = row._sum.points ?? 0;
      const count = row._count._all;
      current[row.kind].points = points;
      current[row.kind].count = count;
      current.total_points += points;
      current.visits = current.checked_in.count;
      current.sales = current.sold.count;
      byVendor.set(row.vendor_id, current);
    });

    const ranking = Array.from(byVendor.values()).sort(
      (a, b) =>
        b.total_points - a.total_points ||
        b.sold.count - a.sold.count ||
        b.checked_in.count - a.checked_in.count ||
        a.vendor_name.localeCompare(b.vendor_name),
    );

    const limit = params.limit ?? 20;
    return ranking.slice(0, limit);
  }
}
