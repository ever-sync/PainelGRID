import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { ScoreEventsService } from '../score-events/score-events.service';

@Injectable()
export class ServiceRatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreEvents: ScoreEventsService,
  ) {}

  async summaryForVendor(vendorId: string) {
    const aggregate = await this.prisma.serviceRating.aggregate({
      where: { vendor_id: vendorId },
      _avg: { score: true },
      _count: { score: true },
    });

    const count = aggregate._count.score;
    const average = count > 0 ? Math.round((aggregate._avg.score ?? 0) * 10) / 10 : 0;

    return { average, count };
  }

  async findVendorBasicInfo(vendorId: string) {
    return this.prisma.user.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        client_id: true,
        vendor_categories: true,
        is_active: true,
        created_at: true,
      },
    });
  }

  async vendorProfileForGestor(vendorId: string) {
    const vendor = await this.findVendorBasicInfo(vendorId);
    if (!vendor || vendor.role !== Role.VENDEDOR) {
      throw new NotFoundException('Vendedor nao encontrado');
    }

    const [summary, ratingRows, metrics, ranking] = await Promise.all([
      this.summaryForVendor(vendorId),
      this.prisma.serviceRating.findMany({
        where: { vendor_id: vendorId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          score: true,
          comment: true,
          customer_name: true,
          created_at: true,
          event: { select: { id: true, name: true } },
        },
      }),
      vendor.client_id
        ? this.scoreEvents.summaryForVendor(vendorId, vendor.client_id)
        : Promise.resolve(null),
      vendor.client_id
        ? this.scoreEvents.rankingForClient({ clientId: vendor.client_id })
        : Promise.resolve([]),
    ]);

    const rankIndex = ranking.findIndex((row) => row.vendor_id === vendorId);

    return {
      vendor,
      metrics,
      rank: rankIndex >= 0 ? { position: rankIndex + 1, total: ranking.length } : null,
      ratings: {
        average: summary.average,
        count: summary.count,
        items: ratingRows.map((row) => ({
          id: row.id,
          score: row.score,
          comment: row.comment,
          customer_name: row.customer_name,
          event_name: row.event?.name ?? null,
          created_at: row.created_at,
        })),
      },
    };
  }
}
